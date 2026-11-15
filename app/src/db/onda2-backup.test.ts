import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { exportBackup, importBackup, setSetting } from '@/db/repo'
import type { NexoBackup } from '@/db/repo'

/**
 * Backup: as chaves reais e o Jarvis (R-06).
 *
 * O teste antigo validava a mecânica da lista de permissão (uma chave
 * desconhecida não vaza). Nenhum teste afirmava que as preferências REAIS
 * saem — e duas delas estavam na lista com o nome errado (`blocos.v1`,
 * `acessibilidade`), então layout do Início e acessibilidade nunca iam para o
 * arquivo. O usuário com baixa visão restaurava e o app voltava ao tamanho
 * padrão.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`onda2-backup-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('chaves de preferência reais saem no backup', () => {
	it('inicio.blocos (e não blocos.v1)', async () => {
		const blocos = [{ id: 'b1', tipo: 'tarefas', titulo: 'Hoje' }]
		await setSetting('inicio.blocos', blocos, banco)

		const backup = await exportBackup(banco)
		const chaves = backup.settings.map((linha) => linha.key)

		expect(chaves).toContain('inicio.blocos')
		expect(chaves).not.toContain('blocos.v1')
		expect(backup.settings.find((linha) => linha.key === 'inicio.blocos')?.value).toEqual(blocos)
	})

	it('as três a11y.* (e não "acessibilidade")', async () => {
		await setSetting('a11y.tamanho', 'grande', banco)
		await setSetting('a11y.altoContraste', true, banco)
		await setSetting('a11y.reduzirMovimento', true, banco)

		const backup = await exportBackup(banco)
		const chaves = new Set(backup.settings.map((linha) => linha.key))

		expect(chaves.has('a11y.tamanho')).toBe(true)
		expect(chaves.has('a11y.altoContraste')).toBe(true)
		expect(chaves.has('a11y.reduzirMovimento')).toBe(true)
		expect(chaves.has('acessibilidade')).toBe(false)
	})

	it('exportar e importar num banco limpo devolve as preferências iguais', async () => {
		await setSetting('tema.v3', { modo: 'escuro' }, banco)
		await setSetting('inicio.blocos', [{ id: 'b1', tipo: 'agenda' }], banco)
		await setSetting('a11y.tamanho', 'grande', banco)

		const backup = await exportBackup(banco)

		const outro = new NexoDatabase(`onda2-backup-destino-${crypto.randomUUID()}`)
		await outro.open()
		try {
			await importBackup(JSON.parse(JSON.stringify(backup)) as NexoBackup, outro)

			const relido = await exportBackup(outro)
			expect(relido.settings.find((l) => l.key === 'inicio.blocos')?.value).toEqual([
				{ id: 'b1', tipo: 'agenda' },
			])
			expect(relido.settings.find((l) => l.key === 'a11y.tamanho')?.value).toBe('grande')
		} finally {
			await outro.delete()
		}
	})
})

describe('o Jarvis vai no backup', () => {
	it('memória, conversa, gatilhos, ações e diário entram no arquivo', async () => {
		await banco.aiMemory.put({ id: 'm1', chave: 'fato:reforma', valor: 'Orçamento aprovado', atualizadoEm: 1 })
		await banco.aiChat.put({ id: 'c1', em: 1, papel: 'usuario', texto: 'Como está o dia?' })
		await banco.aiJobs.put({ id: 'j1', criadoEm: 1, quando: 2, tipo: 'avaliar', estado: 'pendente' })
		await banco.aiActions.put({
			id: 'a1',
			em: 1,
			tipo: 'criar_tarefa',
			resumo: 'Criou uma tarefa',
			antes: [],
			executado: true,
			desfazerAte: 99,
		})
		// No futuro o diário entra podado; agora basta estar recente.
		await banco.aiJournal.add({
			id: 'e1',
			em: Date.now(),
			dia: '2026-11-13',
			tipo: 'task',
			entidade: 't1',
			acao: 'criar',
			origem: 'usuario',
		})

		const backup = await exportBackup(banco)

		expect(backup.aiMemory).toHaveLength(1)
		expect(backup.aiChat).toHaveLength(1)
		expect(backup.aiJobs).toHaveLength(1)
		expect(backup.aiActions).toHaveLength(1)
		expect(backup.aiJournal).toHaveLength(1)
	})

	it('a chave da API continua FORA do arquivo', async () => {
		await banco.aiSecrets.put({ chave: 'api:deploy', valor: 'sk-segredo-1234', atualizadoEm: 1 })

		const backup = await exportBackup(banco)
		expect(JSON.stringify(backup)).not.toContain('sk-segredo-1234')
	})

	it('diário antigo (mais de 30 dias) fica de fora, para o arquivo não crescer sem fim', async () => {
		const velho = Date.now() - 40 * 86_400_000
		await banco.aiJournal.add({
			id: 'e-velho',
			em: velho,
			dia: '2026-10-01',
			tipo: 'task',
			entidade: 't0',
			acao: 'criar',
			origem: 'usuario',
		})
		await banco.aiJournal.add({
			id: 'e-novo',
			em: Date.now(),
			dia: '2026-11-13',
			tipo: 'task',
			entidade: 't1',
			acao: 'criar',
			origem: 'usuario',
		})

		const backup = await exportBackup(banco)
		expect(backup.aiJournal?.map((linha) => linha.id)).toEqual(['e-novo'])
	})

	it('restaurar o backup devolve a memória do Jarvis ao aparelho novo', async () => {
		await banco.aiMemory.put({ id: 'm1', chave: 'fato:reforma', valor: 'Aprovado', atualizadoEm: 1 })
		const backup = JSON.parse(JSON.stringify(await exportBackup(banco))) as NexoBackup

		const outro = new NexoDatabase(`onda2-backup-jarvis-${crypto.randomUUID()}`)
		await outro.open()
		try {
			await importBackup(backup, outro)
			expect((await outro.aiMemory.toArray()).map((linha) => linha.chave)).toEqual(['fato:reforma'])
		} finally {
			await outro.delete()
		}
	})

	it('retrato de sincronização (sem as chaves do Jarvis) NÃO apaga a memória local', async () => {
		await banco.aiMemory.put({ id: 'm1', chave: 'fato:casa', valor: 'IPTU pago', atualizadoEm: 1 })

		const retrato: NexoBackup = {
			app: 'urdume',
			version: 1,
			exportedAt: 1,
			projects: [],
			tasks: [],
			reminders: [],
			events: [],
			habits: [],
			habitLogs: [],
			settings: [],
			projectNotes: [],
		}

		await importBackup(retrato, banco)

		expect((await banco.aiMemory.toArray()).map((linha) => linha.chave)).toEqual(['fato:casa'])
	})

	it('o retrato da sincronização NÃO leva a conversa para o servidor', async () => {
		await banco.aiChat.put({ id: 'c1', em: 1, papel: 'usuario', texto: 'assunto pessoal' })
		await banco.aiMemory.put({ id: 'm1', chave: 'fato:casa', valor: 'IPTU pago', atualizadoEm: 1 })

		const doArquivo = await exportBackup(banco, { incluirJarvis: false })

		expect(doArquivo.aiChat).toBeUndefined()
		expect(doArquivo.aiMemory).toBeUndefined()
		expect(JSON.stringify(doArquivo)).not.toContain('assunto pessoal')

		// E o backup da tela de Dados continua levando tudo.
		const daTela = await exportBackup(banco)
		expect(daTela.aiChat).toHaveLength(1)
		expect(daTela.aiMemory).toHaveLength(1)
	})
})
