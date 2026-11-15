import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import {
	addSubtask,
	createTask,
	progressoDeSubtarefas,
	removeSubtask,
	toggleSubtask,
} from '@/db/repo'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`nexo-subtarefas-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('subtarefas', () => {
	it('acrescenta no fim e calcula o progresso "2/5"', async () => {
		const tarefa = await createTask({ title: 'Estudar' }, banco)
		await addSubtask(tarefa.id, 'Ler capítulo 1', banco)
		await addSubtask(tarefa.id, 'Fazer exercícios', banco)

		const atual = await banco.tasks.get(tarefa.id)
		expect(atual?.subtasks).toHaveLength(2)
		expect(atual?.subtasks?.[0]?.title).toBe('Ler capítulo 1')
		expect(progressoDeSubtarefas(atual!)).toBe('0/2')

		await toggleSubtask(tarefa.id, atual!.subtasks![0]!.id, banco)
		const depois = await banco.tasks.get(tarefa.id)
		expect(progressoDeSubtarefas(depois!)).toBe('1/2')
	})

	it('concluir todas as subtarefas NÃO conclui a tarefa-mãe (RF-14)', async () => {
		const tarefa = await createTask({ title: 'Mãe' }, banco)
		await addSubtask(tarefa.id, 'A', banco)
		await addSubtask(tarefa.id, 'B', banco)

		const comDuas = await banco.tasks.get(tarefa.id)
		for (const sub of comDuas!.subtasks!) {
			await toggleSubtask(tarefa.id, sub.id, banco)
		}

		const final = await banco.tasks.get(tarefa.id)
		expect(final?.subtasks?.every((s) => s.done)).toBe(true)
		expect(final?.done).toBe(false)
		expect(final?.doneAt).toBeNull()
	})

	it('reabrir uma subtarefa limpa o doneAt dela', async () => {
		const tarefa = await createTask({ title: 'Com uma' }, banco)
		await addSubtask(tarefa.id, 'Sub', banco)
		const comSub = await banco.tasks.get(tarefa.id)
		const subId = comSub!.subtasks![0]!.id

		await toggleSubtask(tarefa.id, subId, banco)
		expect((await banco.tasks.get(tarefa.id))!.subtasks![0]!.doneAt).toBeTypeOf('number')

		await toggleSubtask(tarefa.id, subId, banco)
		const reaberta = (await banco.tasks.get(tarefa.id))!.subtasks![0]!
		expect(reaberta.done).toBe(false)
		expect(reaberta.doneAt).toBeNull()
	})

	it('edita o título no lugar e remove por id, sem tocar nas outras', async () => {
		const tarefa = await createTask({ title: 'Lista' }, banco)
		await addSubtask(tarefa.id, 'Primeira', banco)
		await addSubtask(tarefa.id, 'Segunda', banco)

		const lista = (await banco.tasks.get(tarefa.id))!.subtasks!
		// A UI edita o título pelo mesmo caminho da tarefa (update da lista).
		await banco.tasks.update(tarefa.id, {
			subtasks: lista.map((s) => (s.id === lista[0]!.id ? { ...s, title: 'Primeira (revisada)' } : s)),
		})
		await removeSubtask(tarefa.id, lista[1]!.id, banco)

		const final = (await banco.tasks.get(tarefa.id))!.subtasks!
		expect(final).toHaveLength(1)
		expect(final[0]!.title).toBe('Primeira (revisada)')
	})

	it('recusa subtarefa sem título', async () => {
		const tarefa = await createTask({ title: 'X' }, banco)
		await expect(addSubtask(tarefa.id, '   ', banco)).rejects.toThrow(/obrigatório/)
	})

	it('cada alteração de subtarefa é registrada como mudança da tarefa', async () => {
		const tarefa = await createTask({ title: 'Sincroniza' }, banco)
		await addSubtask(tarefa.id, 'Filha', banco)

		// O anúncio de escrita virou o diário do Jarvis; é ele que o motor de
		// sincronização consome. A chave antiga 'mut:' não existe mais.
		const fatos = await banco.aiJournal.where('entidade').equals(tarefa.id).toArray()
		expect(fatos.length).toBeGreaterThan(0)
		expect(fatos.some((f) => (f.depois as { subtasks?: unknown[] } | null)?.subtasks?.length === 1)).toBe(true)
	})
})
