import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import {
	alternarDiaHabito,
	atualizarHabito,
	calcularHabito,
	criarHabito,
	ehMensuravel,
	excluirHabito,
	listarHabitos,
	listarRegistros,
	registrarValor,
	valeNoDia,
} from '@/db/habitos'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`nexo-habitos-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

function diaAtras(dias: number): string {
	const d = new Date()
	d.setDate(d.getDate() - dias)
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('hábitos', () => {
	it('cria com meta, unidade e dias da semana', async () => {
		const habito = await criarHabito(
			{ title: '  Ler  ', targetValue: 20, targetUnit: 'páginas', dias: [1, 3, 5] },
			banco,
		)

		expect(habito.title).toBe('Ler')
		expect(habito.targetValue).toBe(20)
		expect(habito.targetUnit).toBe('páginas')
		expect(habito.dias).toEqual([1, 3, 5])
		expect(ehMensuravel(habito)).toBe(true)

		const lista = await listarHabitos(banco)
		expect(lista).toHaveLength(1)
	})

	it('recusa hábito sem nome', async () => {
		await expect(criarHabito({ title: '   ' }, banco)).rejects.toThrow(/obrigatório/)
	})

	it('alterna o dia: registra o valor da meta e remove no segundo toque', async () => {
		const habito = await criarHabito({ title: 'Beber água', targetValue: 2, targetUnit: 'L' }, banco)
		const dia = diaAtras(0)

		const marcou = await alternarDiaHabito(habito, dia, banco)
		expect(marcou).toBe(true)

		let registros = await listarRegistros(banco)
		expect(registros).toHaveLength(1)
		expect(registros[0]!.value).toBe(2)

		// O mesmo toque corrige um engano: o segundo remove o dia.
		const desmarcou = await alternarDiaHabito(habito, dia, banco)
		expect(desmarcou).toBe(false)

		registros = await listarRegistros(banco)
		expect(registros).toHaveLength(0)
	})

	it('registra valor parcial sem concluir o dia', async () => {
		const habito = await criarHabito({ title: 'Ler', targetValue: 20 }, banco)
		const dia = diaAtras(0)

		await registrarValor(habito, dia, 12, banco)

		const registros = await listarRegistros(banco)
		expect(registros[0]!.value).toBe(12)

		const calculado = calcularHabito(habito, registros, dia)
		expect(calculado.hoje?.value).toBe(12)
		// Qualquer valor conta como dia cumprido (mesma regra do Grit).
		expect(calculado.concluidoHoje).toBe(true)
	})

	it('grava zero como "sem registro" em vez de linha zerada', async () => {
		const habito = await criarHabito({ title: 'Ler', targetValue: 20 }, banco)
		await registrarValor(habito, diaAtras(0), 5, banco)
		await registrarValor(habito, diaAtras(0), 0, banco)

		expect(await listarRegistros(banco)).toHaveLength(0)
	})

	it('conta sequência de dias e ignora dias fora da rotina', async () => {
		// Hábito só aos domingos: dois domingos seguidos não podem "quebrar" por
		// causa dos dias úteis no meio.
		const domingo = new Date()
		domingo.setDate(domingo.getDate() - domingo.getDay())
		const domingoPassado = new Date(domingo)
		domingoPassado.setDate(domingoPassado.getDate() - 7)

		const chave = (d: Date) =>
			`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

		const habito = await criarHabito({ title: 'Feira', dias: [0] }, banco)
		await registrarValor(habito, chave(domingoPassado), 1, banco)
		await registrarValor(habito, chave(domingo), 1, banco)

		const registros = await listarRegistros(banco)
		const calculado = calcularHabito(habito, registros, chave(domingo))
		expect(calculado.sequencia).toBe(2)
	})

	it('conta sequência sem quebrar quando hoje ainda não foi marcado', async () => {
		const habito = await criarHabito({ title: 'Correr' }, banco)
		await registrarValor(habito, diaAtras(1), 1, banco)
		await registrarValor(habito, diaAtras(2), 1, banco)

		const registros = await listarRegistros(banco)
		const calculado = calcularHabito(habito, registros, diaAtras(0))
		expect(calculado.sequencia).toBe(2)
		expect(calculado.concluidoHoje).toBe(false)
	})

	it('consistência de 30 dias compara com os dias válidos', async () => {
		const habito = await criarHabito({ title: 'Alongar' }, banco)
		for (let i = 0; i < 15; i++) await registrarValor(habito, diaAtras(i), 1, banco)

		const registros = await listarRegistros(banco)
		const calculado = calcularHabito(habito, registros, diaAtras(0))
		expect(calculado.consistencia).toBe(50)
		expect(calculado.concluidos30).toBe(15)
	})

	it('valeNoDia respeita os dias marcados; vazio vale todos', async () => {
		const todos = await criarHabito({ title: 'Todos' }, banco)
		const soSegunda = await criarHabito({ title: 'Segunda', dias: [1] }, banco)

		const segunda = new Date(2026, 10, 9) // 9/11/2026 é segunda
		const terca = new Date(2026, 10, 10)

		expect(valeNoDia(todos, segunda)).toBe(true)
		expect(valeNoDia(todos, terca)).toBe(true)
		expect(valeNoDia(soSegunda, segunda)).toBe(true)
		expect(valeNoDia(soSegunda, terca)).toBe(false)
	})

	it('edita e exclui com exclusão suave', async () => {
		const habito = await criarHabito({ title: 'Antes' }, banco)
		await atualizarHabito(habito.id, { title: 'Depois', targetValue: 5 }, banco)

		const atualizado = await banco.habits.get(habito.id)
		expect(atualizado?.title).toBe('Depois')
		expect(atualizado?.targetValue).toBe(5)

		await excluirHabito(habito.id, banco)
		expect(await listarHabitos(banco)).toHaveLength(0)
		expect((await banco.habits.get(habito.id))?.deletedAt).toBeTypeOf('number')
	})
})
