import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import {
	criarAnotacao,
	createProject,
	editarAnotacao,
	excluirAnotacao,
	listarAnotacoes,
	listarCategorias,
	organizarProjeto,
	exportBackup,
	importBackup,
	updateProject,
} from '@/db/repo'

/**
 * Anotações de projeto, categorias e prioridade (v5).
 *
 * Integração com banco real: as funções puras já têm teste próprio; aqui o que
 * importa é o que fica gravado e o que chega ao backup. Um recurso que some no
 * export é pior que um recurso que não existe — o usuário só descobre quando
 * troca de aparelho.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`nexo-anotacoes-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('anotações de projeto', () => {
	it('cria, lista e mantém a ordem da mais recente', async () => {
		const projeto = await createProject({ name: 'Reforma' }, banco)
		const agora = Date.now()

		await criarAnotacao(
			{ projectId: projeto.id, body: 'Primeira', em: agora - 3_600_000 },
			banco,
		)
		await criarAnotacao(
			{ projectId: projeto.id, body: 'Segunda', title: 'Reunião', em: agora },
			banco,
		)

		const lista = await listarAnotacoes(projeto.id, banco)
		expect(lista).toHaveLength(2)
		expect(lista[0]!.body).toBe('Segunda')
		expect(lista[0]!.title).toBe('Reunião')
		expect(lista[1]!.body).toBe('Primeira')
	})

	it('edita uma sem tocar na outra', async () => {
		const projeto = await createProject({ name: 'X' }, banco)
		const a = await criarAnotacao({ projectId: projeto.id, body: 'A' }, banco)
		const b = await criarAnotacao({ projectId: projeto.id, body: 'B' }, banco)

		await editarAnotacao(a.id, { body: 'A editada', title: 'Título' }, banco)

		const lista = await listarAnotacoes(projeto.id, banco)
		const notaA = lista.find((nota) => nota.id === a.id)!
		const notaB = lista.find((nota) => nota.id === b.id)!
		expect(notaA.body).toBe('A editada')
		expect(notaA.title).toBe('Título')
		expect(notaB.body).toBe('B')
		expect(notaB.title ?? null).toBeNull()
	})

	it('anotação sem corpo é recusada', async () => {
		const projeto = await createProject({ name: 'X' }, banco)
		await expect(
			criarAnotacao({ projectId: projeto.id, body: '   ' }, banco),
		).rejects.toThrow()
	})

	it('excluir é suave e some da lista', async () => {
		const projeto = await createProject({ name: 'X' }, banco)
		const nota = await criarAnotacao({ projectId: projeto.id, body: 'Some' }, banco)

		await excluirAnotacao(nota.id, banco)

		expect(await listarAnotacoes(projeto.id, banco)).toHaveLength(0)
		// Mas continua no banco, para o desfazer.
		const cru = await banco.projectNotes.get(nota.id)
		expect(cru?.deletedAt).toBeTruthy()
	})

	it('data retroativa é respeitada', async () => {
		const projeto = await createProject({ name: 'X' }, banco)
		const ontem = Date.now() - 86_400_000
		await criarAnotacao({ projectId: projeto.id, body: 'Sobre ontem', em: ontem }, banco)

		const [nota] = await listarAnotacoes(projeto.id, banco)
		expect(nota!.em).toBe(ontem)
	})
})

describe('categorias e prioridade', () => {
	it('lista categorias em uso, sem repetir e ordenadas', async () => {
		const a = await createProject({ name: 'A' }, banco)
		const b = await createProject({ name: 'B' }, banco)
		const c = await createProject({ name: 'C' }, banco)

		await organizarProjeto(a.id, { categoria: 'Trabalho' }, banco)
		await organizarProjeto(b.id, { categoria: 'Casa' }, banco)
		await organizarProjeto(c.id, { categoria: 'Trabalho' }, banco)

		expect(await listarCategorias(banco)).toEqual(['Casa', 'Trabalho'])
	})

	it('categoria vazia não entra na lista', async () => {
		const projeto = await createProject({ name: 'A' }, banco)
		await organizarProjeto(projeto.id, { categoria: '   ' }, banco)

		expect(await listarCategorias(banco)).toHaveLength(0)
	})

	it('grava prioridade e permite limpá-la', async () => {
		const projeto = await createProject({ name: 'A' }, banco)

		await organizarProjeto(projeto.id, { priority: 3 }, banco)
		expect((await banco.projects.get(projeto.id))?.priority).toBe(3)

		await organizarProjeto(projeto.id, { priority: 0 }, banco)
		expect((await banco.projects.get(projeto.id))?.priority).toBe(0)
	})

	it('updateProject também aceita os campos novos', async () => {
		const projeto = await createProject({ name: 'A' }, banco)
		await updateProject(projeto.id, { categoria: 'Estudos', priority: 2 }, banco)

		const salvo = await banco.projects.get(projeto.id)
		expect(salvo?.categoria).toBe('Estudos')
		expect(salvo?.priority).toBe(2)
	})
})

describe('backup', () => {
	it('leva as anotações e as traz de volta', async () => {
		const projeto = await createProject({ name: 'Vai e volta' }, banco)
		await organizarProjeto(projeto.id, { categoria: 'Trabalho', priority: 2 }, banco)
		await criarAnotacao(
			{ projectId: projeto.id, body: 'Não pode se perder', title: 'Importante' },
			banco,
		)

		const backup = await exportBackup(banco)
		expect(backup.projectNotes).toHaveLength(1)
		expect(backup.projectNotes![0]!.body).toBe('Não pode se perder')

		// Num aparelho novo, o import traz tudo.
		const outro = new NexoDatabase(`nexo-restore-${crypto.randomUUID()}`)
		await outro.open()
		await importBackup(backup, outro)

		const anotacoes = await listarAnotacoes(projeto.id, outro)
		expect(anotacoes).toHaveLength(1)
		expect(anotacoes[0]!.title).toBe('Importante')

		const restaurado = await outro.projects.get(projeto.id)
		expect(restaurado?.categoria).toBe('Trabalho')
		expect(restaurado?.priority).toBe(2)

		outro.close()
		await outro.delete()
	})

	it('backup antigo, sem anotações, ainda é aceito', async () => {
		const projeto = await createProject({ name: 'Antigo' }, banco)
		const backup = await exportBackup(banco)

		// Simula um arquivo gerado antes da v5: a chave não existe.
		const antigo = { ...backup } as Record<string, unknown>
		delete antigo.projectNotes
		antigo.projects = [
			{
				id: projeto.id,
				name: 'Antigo',
				archived: false,
				order: 1,
				createdAt: 0,
				updatedAt: 0,
			},
		]

		const outro = new NexoDatabase(`nexo-antigo-${crypto.randomUUID()}`)
		await outro.open()
		await importBackup(antigo, outro)

		expect(await outro.projects.count()).toBe(1)
		expect(await outro.projectNotes.count()).toBe(0)

		outro.close()
		await outro.delete()
	})
})
