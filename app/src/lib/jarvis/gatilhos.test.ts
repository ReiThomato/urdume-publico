import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createTask } from '@/db/repo'
import { criarGatilho, listarGatilhos, proximoGatilho, removerGatilho, rodarGatilhos } from '@/lib/jarvis/gatilhos'
import { salvarPreferencias } from '@/lib/jarvis/estado'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-gatilhos-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

/** Data fixa numa terça-feira, às 10h. */
const terca = (hora = 10): number => {
	const data = new Date(2026, 10, 10, hora, 0, 0)
	return data.getTime()
}

describe('gatilhos', () => {
	it('cria e lista em ordem de hora', async () => {
		await criarGatilho({ hora: 18, dias: [], titulo: 'Fim do dia', comIA: false }, banco)
		await criarGatilho({ hora: 8, dias: [], titulo: 'Começo', comIA: false }, banco)

		const gatilhos = await listarGatilhos(banco)
		expect(gatilhos.map((g) => g.payload.hora)).toEqual([8, 18])
	})

	it('não duplica hora e dias iguais', async () => {
		await criarGatilho({ hora: 9, dias: [1], titulo: 'A', comIA: false }, banco)
		const segundo = await criarGatilho({ hora: 9, dias: [1], titulo: 'B', comIA: false }, banco)
		expect(segundo).toBeNull()
		expect(await listarGatilhos(banco)).toHaveLength(1)
	})

	it('recusa hora inválida e título vazio', async () => {
		expect(await criarGatilho({ hora: 25, dias: [], titulo: 'X', comIA: false }, banco)).toBeNull()
		expect(await criarGatilho({ hora: 10, dias: [], titulo: '  ', comIA: false }, banco)).toBeNull()
	})

	it('roda só depois da hora', async () => {
		await criarGatilho({ hora: 18, dias: [], titulo: 'Fim do dia', comIA: false }, banco)

		// 10h: ainda não.
		expect((await rodarGatilhos({ agora: terca(10) }, banco)).rodados).toBe(0)

		// 19h: rodou.
		expect((await rodarGatilhos({ agora: terca(19) }, banco)).rodados).toBe(1)
	})

	it('roda uma vez por dia', async () => {
		await criarGatilho({ hora: 8, dias: [], titulo: 'Manhã', comIA: false }, banco)

		expect((await rodarGatilhos({ agora: terca(9) }, banco)).rodados).toBe(1)
		expect((await rodarGatilhos({ agora: terca(10) }, banco)).rodados).toBe(0)
		expect((await rodarGatilhos({ agora: terca(11) }, banco)).rodados).toBe(0)
	})

	it('respeita os dias da semana', async () => {
		// Só sábado.
		await criarGatilho({ hora: 8, dias: [6], titulo: 'Sábado', comIA: false }, banco)

		// terça: não roda.
		expect((await rodarGatilhos({ agora: terca(12) }, banco)).rodados).toBe(0)

		// sábado: roda.
		const sabado = new Date(2026, 10, 14, 12, 0, 0).getTime()
		expect((await rodarGatilhos({ agora: sabado }, banco)).rodados).toBe(1)
	})

	it('não roda com o Jarvis pausado', async () => {
		await criarGatilho({ hora: 8, dias: [], titulo: 'Manhã', comIA: false }, banco)
		await salvarPreferencias({ modo: 'pausado' }, banco)

		expect((await rodarGatilhos({ agora: terca(12) }, banco)).rodados).toBe(0)
	})

	it('avalia e detecta sinais', async () => {
		await createTask({ title: 'Atrasada', dueDate: '2020-01-01' }, banco)
		await salvarPreferencias({ modo: 'ativo', orcamentoDiario: 5 }, banco)
		await criarGatilho({ hora: 8, dias: [], titulo: 'Manhã', comIA: false }, banco)

		const resultado = await rodarGatilhos({ agora: terca(9) }, banco)
		expect(resultado.rodados).toBe(1)
		// `interrompe` depende do orçamento e do horário; o que importa aqui é
		// que a avaliação rodou e enxergou o sinal de atraso.
		const { lerPainel } = await import('@/lib/jarvis/motor')
		const painel = await lerPainel('2026-11-10', banco)
		expect(painel?.itens.some((item) => item.sinal.id === 'tarefa_atrasada')).toBe(true)
	})

	it('remove um gatilho', async () => {
		const gatilho = await criarGatilho({ hora: 8, dias: [], titulo: 'X', comIA: false }, banco)
		await removerGatilho(gatilho!.id, banco)
		expect(await listarGatilhos(banco)).toHaveLength(0)
	})

	it('calcula o próximo gatilho', async () => {
		await criarGatilho({ hora: 8, dias: [], titulo: 'Manhã', comIA: false }, banco)
		await criarGatilho({ hora: 18, dias: [], titulo: 'Noite', comIA: false }, banco)

		const gatilhos = await listarGatilhos(banco)
		const proximo = proximoGatilho(gatilhos, terca(10))

		expect(proximo?.gatilho.payload.titulo).toBe('Noite')
		expect(proximo?.gatilho.payload.hora).toBe(18)
	})
})
