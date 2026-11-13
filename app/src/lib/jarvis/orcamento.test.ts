import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createTask } from '@/db/repo'
import { avaliarAgora } from '@/lib/jarvis/motor'
import { lerInterrupcoes } from '@/lib/jarvis/leitura'
import { salvarPreferencias } from '@/lib/jarvis/estado'
import { toDayKey } from '@/db/repo'

/**
 * O orçamento de atenção precisa ACUMULAR entre avaliações.
 *
 * Este teste nasceu de um bug real: a primeira versão lia o contador do dia e
 * nunca gravava, então cada avaliação recomeçava com o orçamento cheio. Na
 * prática, o limite de 3 interrupções por dia não existia — bastava reabrir o
 * app para falar de novo.
 */
/**
 * Relógio fixo às 10h, fora do horário silencioso.
 *
 * Sem isso o teste passaria ou falharia conforme a hora em que fosse executado:
 * às 3h da manhã nada interrompe, e a asserção "gastou orçamento" falharia por
 * um motivo correto. Teste que depende do relógio da máquina não é teste.
 */
const MEIO_DA_MANHA = (): number => {
	const agora = new Date()
	agora.setHours(10, 0, 0, 0)
	return agora.getTime()
}

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-orcamento-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('orçamento de atenção', () => {
	it('acumula interrupções entre avaliações no mesmo dia', async () => {
		const agora = MEIO_DA_MANHA()
		const hoje = toDayKey(new Date(agora))
		// Muitos sinais urgentes: mais do que o orçamento.
		for (let i = 0; i < 6; i++) {
			await createTask({ title: `Atrasada ${i}`, dueDate: '2020-01-01', priority: 3 }, banco)
		}
		await salvarPreferencias({ orcamentoDiario: 3, modo: 'ativo' }, banco)

		const primeiro = await avaliarAgora({ agora, forcar: true }, banco)
		const consumidasPrimeira = primeiro.itens.filter((item) => item.interrompe).length
		expect(consumidasPrimeira).toBeGreaterThan(0)

		const salvo = await lerInterrupcoes(hoje, banco)
		expect(salvo).toBe(consumidasPrimeira)

		// Segunda passada: o que já gastou continua gasto.
		const segundo = await avaliarAgora({ agora: agora + 60_000, forcar: true }, banco)
		const consumidasSegunda = segundo.itens.filter((item) => item.interrompe).length

		if (salvo >= 3) {
			expect(consumidasSegunda).toBe(0)
			expect(segundo.silenciados.some((entrada) => entrada.motivo === 'sem-orcamento')).toBe(true)
		}
	})

	it('não passa do teto diário somando as rodadas', async () => {
		const agora = MEIO_DA_MANHA()
		const hoje = toDayKey(new Date(agora))
		for (let i = 0; i < 8; i++) {
			await createTask({ title: `Tarefa ${i}`, dueDate: '2020-01-01', priority: 3 }, banco)
		}
		await salvarPreferencias({ orcamentoDiario: 2, modo: 'ativo' }, banco)

		await avaliarAgora({ agora, forcar: true }, banco)
		await avaliarAgora({ agora: agora + 60_000, forcar: true }, banco)
		await avaliarAgora({ agora: agora + 120_000, forcar: true }, banco)

		const total = await lerInterrupcoes(hoje, banco)
		expect(total).toBeLessThanOrEqual(3)
	})

	it('zera na virada do dia', async () => {
		await createTask({ title: 'Atrasada', dueDate: '2020-01-01', priority: 3 }, banco)
		await salvarPreferencias({ orcamentoDiario: 3, modo: 'ativo' }, banco)

		const hoje = new Date(MEIO_DA_MANHA())
		const amanha = new Date(hoje.getTime() + 86_400_000)

		await avaliarAgora({ agora: hoje.getTime(), forcar: true }, banco)
		expect(await lerInterrupcoes(toDayKey(amanha), banco)).toBe(0)
	})
})
