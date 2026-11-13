import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import 'fake-indexeddb/auto'
import { NexoDatabase } from '@/db/db'

/**
 * Migração v3 → v4 com dados dentro.
 *
 * O risco real de uma migração não é ela rodar num banco vazio (isso o app faz
 * sozinho na primeira instalação): é rodar num banco que já tem anos de tarefas,
 * hábitos e projetos. Aqui o banco é criado na versão ANTIGA, populado, e só
 * então aberto pela versão nova — como acontece quando o usuário instala o APK
 * novo por cima do antigo.
 */
describe('migração v3 → v4', () => {
	it('preserva os dados e cria as tabelas do Jarvis', async () => {
		const nome = `nexo-migracao-${crypto.randomUUID()}`

		// 1. Banco na versão 3, exatamente como o APK anterior deixou.
		const antigo = new Dexie(nome)
		antigo.version(3).stores({
			projects: 'id, name, archived, order, updatedAt, deletedAt',
			tasks:
				'id, projectId, dueDate, deadline, startMin, done, someday, priority, order, createdAt, updatedAt, deletedAt, *tags',
			reminders: 'id, dueAt, done, order, updatedAt, deletedAt',
			pages: 'id, projectId, title, updatedAt, deletedAt',
			events: 'id, projectId, startAt, diaInteiro, updatedAt, deletedAt',
			habits: 'id, title, order, projectId, updatedAt, deletedAt',
			habitLogs: 'id, habitId, day, updatedAt, deletedAt, [habitId+day]',
			settings: 'key',
		})
		await antigo.open()

		const agora = Date.now()
		await antigo.table('projects').add({
			id: 'p1',
			name: 'Reforma',
			archived: false,
			order: 1,
			createdAt: agora,
			updatedAt: agora,
		})
		await antigo.table('tasks').add({
			id: 't1',
			title: 'Pedir orçamento',
			projectId: 'p1',
			done: false,
			dueDate: '2026-11-10',
			priority: 3,
			order: 1,
			tags: ['casa'],
			someday: false,
			createdAt: agora,
			updatedAt: agora,
			subtasks: [],
		})
		await antigo.table('habits').add({
			id: 'h1',
			title: 'Ler',
			order: 1,
			dias: [],
			createdAt: agora,
			updatedAt: agora,
		})
		await antigo.table('habitLogs').add({
			id: 'l1',
			habitId: 'h1',
			day: '2026-11-11',
			value: 1,
			createdAt: agora,
			updatedAt: agora,
		})
		await antigo.table('settings').put({ key: 'tema.v3', value: { modo: 'dark' } })
		antigo.close()

		// 2. O APK novo abre o mesmo banco.
		const novo = new NexoDatabase(nome)
		await novo.open()

		// 3. Nada sumiu.
		expect(await novo.projects.count()).toBe(1)
		expect((await novo.tasks.get('t1'))?.title).toBe('Pedir orçamento')
		expect((await novo.tasks.get('t1'))?.tags).toEqual(['casa'])
		expect(await novo.habits.count()).toBe(1)
		expect(await novo.habitLogs.count()).toBe(1)
		expect((await novo.settings.get('tema.v3'))?.value).toEqual({ modo: 'dark' })

		// 4. As tabelas do Jarvis existem e estão vazias.
		expect(await novo.aiJournal.count()).toBe(0)
		expect(await novo.aiMemory.count()).toBe(0)
		expect(await novo.aiSecrets.count()).toBe(0)

		// 5. E o diário aceita escrever já na primeira tarefa.
		await novo.tasks.update('t1', { done: true, doneAt: agora })
		await novo.aiJournal.add({
			id: 'j1',
			em: agora,
			dia: '2026-11-12',
			tipo: 'task',
			entidade: 't1',
			acao: 'concluir',
			origem: 'usuario',
			antes: { done: false },
			depois: { done: true },
			fingerprint: null,
		})
		expect(await novo.aiJournal.count()).toBe(1)

		novo.close()
		await Dexie.delete(nome)
	})
})

/**
 * Migração v4 → v5 com dados dentro.
 *
 * A v5 trouxe duas mudanças que mexem no que já existe:
 *
 * 1. índices novos em `projects` (`priority`, `categoria`, `status`);
 * 2. a tabela `projectNotes`.
 *
 * Índice novo em tabela populada é onde migração costuma falhar: se um
 * registro não tiver o campo, o Dexie pode recusar a criação do índice. Aqui o
 * projeto antigo NÃO tem `priority` nem `categoria` — é o caso real de quem
 * instalou a versão anterior.
 */
describe('migração v4 → v5', () => {
	it('preserva projetos antigos sem os campos novos e cria as anotações', async () => {
		const nome = `nexo-migracao-v5-${crypto.randomUUID()}`

		const antigo = new Dexie(nome)
		antigo.version(4).stores({
			projects: 'id, name, archived, order, updatedAt, deletedAt',
			tasks:
				'id, projectId, dueDate, deadline, startMin, done, someday, priority, order, createdAt, updatedAt, deletedAt, *tags',
			reminders: 'id, dueAt, done, order, updatedAt, deletedAt',
			pages: 'id, projectId, title, updatedAt, deletedAt',
			events: 'id, projectId, startAt, diaInteiro, updatedAt, deletedAt',
			habits: 'id, title, order, projectId, updatedAt, deletedAt',
			habitLogs: 'id, habitId, day, updatedAt, deletedAt, [habitId+day]',
			settings: 'key',
			aiJournal: '++seq, id, em, dia, tipo, entidade, fingerprint',
			aiMemory: 'id, chave, atualizadoEm',
			aiJobs: 'id, quando, estado, tipo',
			aiRuns: 'id, em, dia',
			aiActions: 'id, em, desfazerAte',
			aiChat: 'id, em',
			aiSecrets: 'chave',
		})
		await antigo.open()

		const agora = Date.now()
		// Projeto no formato ANTIGO: sem priority, sem categoria, com notas de
		// texto único — exatamente o que a versão anterior gravava.
		await antigo.table('projects').add({
			id: 'p-antigo',
			name: 'Site do cliente',
			archived: false,
			order: 1,
			notas: 'Briefing: tom sóbrio. Reunião toda terça.',
			createdAt: agora,
			updatedAt: agora,
		})
		await antigo.table('aiMemory').add({
			id: 'm1',
			chave: 'fato:cliente',
			valor: { id: 'f1', texto: 'O cliente responde de manhã', criadoEm: agora },
			atualizadoEm: agora,
		})
		antigo.close()

		const novo = new NexoDatabase(nome)
		await novo.open()

		// O projeto continua lá, com o texto antigo intacto.
		const projeto = await novo.projects.get('p-antigo')
		expect(projeto?.name).toBe('Site do cliente')
		expect(projeto?.notas).toBe('Briefing: tom sóbrio. Reunião toda terça.')
		// E sem os campos novos, que é válido: significam "sem categoria" e
		// "prioridade nenhuma".
		expect(projeto?.priority).toBeUndefined()
		expect(projeto?.categoria).toBeUndefined()

		// A memória antiga continua legível pelo índice novo.
		const memorias = await novo.aiMemory.where('chave').startsWith('fato:').toArray()
		expect(memorias).toHaveLength(1)
		expect(memorias[0]!.chave).toBe('fato:cliente')

		// A tabela nova existe, vazia, e aceita escrita.
		expect(await novo.projectNotes.count()).toBe(0)
		await novo.projectNotes.add({
			id: 'n1',
			projectId: 'p-antigo',
			title: 'Reunião',
			body: 'Cliente pediu prazo maior.',
			em: agora,
			createdAt: agora,
			updatedAt: agora,
		})
		expect(await novo.projectNotes.count()).toBe(1)

		// Os índices novos funcionam em projeto antigo (que não os tinha).
		await novo.projects.update('p-antigo', { priority: 3, categoria: 'Trabalho' })
		const porCategoria = await novo.projects.where('categoria').equals('Trabalho').toArray()
		expect(porCategoria).toHaveLength(1)

		novo.close()
		await Dexie.delete(nome)
	})
})
