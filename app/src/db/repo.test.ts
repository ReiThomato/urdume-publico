import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import {
	createProject,
	createTask,
	listPages,
	createPage,
	listTasksByDay,
	softDeleteProject,
	softDeleteTask,
	toggleTask,
	updateTask,
} from '@/db/repo'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`nexo-teste-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('tarefas', () => {
	it('cria tarefa com data, vínculo de projeto e valores padrão', async () => {
		const projeto = await createProject({ name: 'Estudo' }, banco)
		const tarefa = await createTask(
			{ title: '  Revisar anotações ', dueDate: '2026-11-10', projectId: projeto.id },
			banco,
		)

		expect(tarefa.id).toBeTruthy()
		expect(tarefa.title).toBe('Revisar anotações')
		expect(tarefa.done).toBe(false)
		expect(tarefa.doneAt).toBeNull()
		expect(tarefa.priority).toBe(0)
		expect(tarefa.projectId).toBe(projeto.id)

		const doDia = await listTasksByDay('2026-11-10', banco)
		expect(doDia).toHaveLength(1)
		expect(doDia[0]!.id).toBe(tarefa.id)
	})

	it('recusa tarefa sem título', async () => {
		await expect(createTask({ title: '   ' }, banco)).rejects.toThrow(/obrigatório/)
	})

	it('conclui e reabre, mantendo doneAt coerente com o estado', async () => {
		const tarefa = await createTask({ title: 'Pagar conta' }, banco)

		await toggleTask(tarefa.id, undefined, banco)
		const concluida = await banco.tasks.get(tarefa.id)
		expect(concluida?.done).toBe(true)
		expect(concluida?.doneAt).toBeTypeOf('number')

		await toggleTask(tarefa.id, false, banco)
		const reaberta = await banco.tasks.get(tarefa.id)
		expect(reaberta?.done).toBe(false)
		expect(reaberta?.doneAt).toBeNull()
	})

	it('remove da lista com exclusão suave, sem apagar a linha do banco', async () => {
		const tarefa = await createTask({ title: 'Descartável' }, banco)
		await softDeleteTask(tarefa.id, banco)

		expect(await listTasksByDay('2026-11-10', banco)).toHaveLength(0)

		const linha = await banco.tasks.get(tarefa.id)
		expect(linha).toBeDefined()
		expect(linha?.deletedAt).toBeTypeOf('number')
	})

	it('atualiza campos com updatedAt novo', async () => {
		const tarefa = await createTask({ title: 'Antes' }, banco)
		await new Promise((resolver) => setTimeout(resolver, 2))
		await updateTask(tarefa.id, { title: 'Depois' }, banco)

		const atualizada = await banco.tasks.get(tarefa.id)
		expect(atualizada?.title).toBe('Depois')
		expect(atualizada!.updatedAt).toBeGreaterThanOrEqual(tarefa.updatedAt)
	})
})

describe('projetos', () => {
	it('exclui o projeto em cascata para tarefas e páginas', async () => {
		const projeto = await createProject({ name: 'Casa' }, banco)
		const tarefa = await createTask({ title: 'Comprar tinta', projectId: projeto.id }, banco)
		const pagina = await createPage({ title: 'Planta', projectId: projeto.id }, banco)

		await softDeleteProject(projeto.id, banco)

		expect((await banco.tasks.get(tarefa.id))?.deletedAt).toBeTypeOf('number')
		expect((await banco.pages.get(pagina.id))?.deletedAt).toBeTypeOf('number')
		expect(await listPages(banco)).toHaveLength(0)
	})
})
