import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createTask, toggleTask } from '@/db/repo'
import { criarHabito, alternarDiaHabito } from '@/db/habitos'
import { chaveDoDia } from '@/lib/date'

/**
 * Progresso: tarefas e hábitos no mesmo gráfico.
 *
 * O defeito relatado: o bloco contava só tarefas. Hábitos existem em tabela
 * própria (`habitLogs`) e nunca entravam na conta — o gráfico mostrava metade
 * do dia.
 *
 * Estes testes usam o banco real e verificam os fatos que o gráfico consome: o
 * registro do hábito e o `doneAt` da tarefa.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`progresso-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('contagem de hábitos', () => {
	it('marcar um hábito grava registro com valor no dia de hoje', async () => {
		const habito = await criarHabito({ title: 'Ler' }, banco)
		const marcou = await alternarDiaHabito(habito, chaveDoDia(new Date()), banco)

		expect(marcou).toBe(true)

		const registros = (await banco.habitLogs.toArray()).filter((r) => !r.deletedAt && r.value > 0)
		expect(registros).toHaveLength(1)
		expect(registros[0]!.day).toBe(chaveDoDia(new Date()))
	})

	it('desmarcar apaga o registro, e ele para de contar', async () => {
		const habito = await criarHabito({ title: 'Ler' }, banco)
		const hoje = chaveDoDia(new Date())

		await alternarDiaHabito(habito, hoje, banco)
		const desmarcou = await alternarDiaHabito(habito, hoje, banco)

		expect(desmarcou).toBe(false)

		const registros = (await banco.habitLogs.toArray()).filter((r) => !r.deletedAt && r.value > 0)
		expect(registros).toHaveLength(0)
	})

	it('dois hábitos no mesmo dia contam dois', async () => {
		const a = await criarHabito({ title: 'Ler' }, banco)
		const b = await criarHabito({ title: 'Correr' }, banco)
		const hoje = chaveDoDia(new Date())

		await alternarDiaHabito(a, hoje, banco)
		await alternarDiaHabito(b, hoje, banco)

		const registros = (await banco.habitLogs.toArray()).filter((r) => !r.deletedAt && r.value > 0)
		expect(new Set(registros.map((r) => r.habitId)).size).toBe(2)
	})

	it('hábito com meta grava o valor da meta, não 1', async () => {
		const habito = await criarHabito({ title: 'Ler', targetValue: 20 }, banco)
		await alternarDiaHabito(habito, chaveDoDia(new Date()), banco)

		const registros = (await banco.habitLogs.toArray()).filter((r) => !r.deletedAt)
		expect(registros[0]!.value).toBe(20)
	})
})

describe('tarefas continuam contando', () => {
	it('concluir grava doneAt hoje', async () => {
		const tarefa = await createTask({ title: 'Enviar nota' }, banco)
		await toggleTask(tarefa.id, undefined, banco)

		const depois = await banco.tasks.get(tarefa.id)
		expect(depois?.done).toBe(true)
		expect(depois?.doneAt).toBeTruthy()
		expect(chaveDoDia(new Date(depois!.doneAt!))).toBe(chaveDoDia(new Date()))
	})
})
