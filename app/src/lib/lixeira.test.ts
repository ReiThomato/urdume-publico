import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import {
	createProject,
	createReminder,
	createTask,
	restaurarProject,
	softDeleteProject,
	softDeleteReminder,
	softDeleteTask,
} from '@/db/repo'
import { apagarDeVez, contarLixeira, listarLixeira, restaurarDaLixeira } from '@/lib/lixeira'

/**
 * A lixeira fecha um buraco real: a exclusão sempre foi suave (o registro
 * fica no banco com `deletedAt`), mas nenhuma tela mostrava o excluído. Depois
 * dos 4 s de desfazer, o item era definitivo na prática e continuava ocupando
 * espaço. Estes testes garantem os dois caminhos: voltar e apagar de vez.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`lixeira-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('lixeira', () => {
	it('lista o que foi excluído, do mais recente para o mais antigo', async () => {
		const a = await createTask({ title: 'Antiga' }, banco)
		const b = await createTask({ title: 'Recente' }, banco)
		await softDeleteTask(a.id, banco)
		await new Promise((r) => setTimeout(r, 5))
		await softDeleteTask(b.id, banco)

		const itens = await listarLixeira(banco)

		expect(itens.map((i) => i.titulo)).toEqual(['Recente', 'Antiga'])
		expect(itens[0]!.tipo).toBe('tarefa')
	})

	it('não lista o que está vivo', async () => {
		const viva = await createTask({ title: 'Viva' }, banco)
		await createTask({ title: 'Outra' }, banco)
		const excluida = await createTask({ title: 'Excluída' }, banco)
		await softDeleteTask(excluida.id, banco)

		const itens = await listarLixeira(banco)

		expect(itens).toHaveLength(1)
		expect(itens[0]!.id).toBe(excluida.id)
		expect(itens.map((i) => i.id)).not.toContain(viva.id)
	})

	it('mistura tipos, cada um com o seu rótulo', async () => {
		const tarefa = await createTask({ title: 'Tarefa' }, banco)
		const projeto = await createProject({ name: 'Projeto' }, banco)
		const lembrete = await createReminder({ text: 'Lembrete', dueAt: Date.now() }, banco)

		await softDeleteTask(tarefa.id, banco)
		await softDeleteProject(projeto.id, banco)
		await softDeleteReminder(lembrete.id, banco)

		const itens = await listarLixeira(banco)
		const tipos = itens.map((i) => i.tipo).sort()

		expect(tipos).toEqual(['lembrete', 'projeto', 'tarefa'])
	})

	it('restaurar devolve o item à lista de origem', async () => {
		const tarefa = await createTask({ title: 'Volta' }, banco)
		await softDeleteTask(tarefa.id, banco)
		expect(await banco.tasks.get(tarefa.id)).toMatchObject({ deletedAt: expect.any(Number) })

		await restaurarDaLixeira('tarefa', tarefa.id, banco)

		expect((await banco.tasks.get(tarefa.id))?.deletedAt).toBeNull()
		expect(await listarLixeira(banco)).toHaveLength(0)
	})

	it('restaurar um projeto devolve também as anotações dele', async () => {
		const projeto = await createProject({ name: 'Com notas' }, banco)
		await softDeleteProject(projeto.id, banco)

		await restaurarProject(projeto.id, banco)

		expect((await banco.projects.get(projeto.id))?.deletedAt).toBeNull()
	})

	it('apagar de vez some com o registro e não tem volta', async () => {
		const tarefa = await createTask({ title: 'Fim' }, banco)
		await softDeleteTask(tarefa.id, banco)

		await apagarDeVez('tarefa', tarefa.id, banco)

		expect(await banco.tasks.get(tarefa.id)).toBeUndefined()
		expect(await listarLixeira(banco)).toHaveLength(0)
	})

	it('apagar um projeto de vez leva as tarefas dele', async () => {
		const projeto = await createProject({ name: 'Some' }, banco)
		const tarefa = await createTask({ title: 'Filha', projectId: projeto.id }, banco)

		await apagarDeVez('projeto', projeto.id, banco)

		expect(await banco.projects.get(projeto.id)).toBeUndefined()
		expect(await banco.tasks.get(tarefa.id)).toBeUndefined()
	})

	it('contar devolve o total da lixeira', async () => {
		const a = await createTask({ title: 'A' }, banco)
		const b = await createTask({ title: 'B' }, banco)
		await softDeleteTask(a.id, banco)
		await softDeleteTask(b.id, banco)

		expect(await contarLixeira(banco)).toBe(2)
	})
})
