import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createTask } from '@/db/repo'
import { HORAS_DE_AVISO, montarAvisos } from '@/lib/jarvis/segundo-plano'
import { idDeNotificacao } from '@/lib/jarvis/ponte'
import type { PainelDoDia } from '@/lib/jarvis/motor'
import { salvarPreferencias } from '@/lib/jarvis/estado'
import { avaliarAgora, lerPainel } from '@/lib/jarvis/motor'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-plano-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

function painel(itens: Array<{ chave: string; interrompe: boolean; nivel?: string }>): {
	itens: PainelDoDia['itens']
} {
	return {
		itens: itens.map((item) => ({
			sinal: {
				id: item.chave.split(':')[0]!,
				familia: 'tarefas',
				nivel: (item.nivel ?? 'atencao') as 'atencao',
				titulo: 'Título',
				detalhe: 'Detalhe',
				magnitude: 1,
				urgencia: 1,
				entidades: [],
				precisaIA: false,
				chave: item.chave,
			},
			relevancia: 0.9,
			interrompe: item.interrompe,
			motivo: item.interrompe ? null : 'cooldown',
			estado: 'novo',
			em: Date.now(),
		})),
	}
}

describe('plano de segundo plano', () => {
	const manha = new Date(2026, 10, 12, 7, 0, 0).getTime()

	it('agenda só o que interrompe', () => {
		const avisos = montarAvisos(
			painel([
				{ chave: 'a:1', interrompe: true },
				{ chave: 'b:1', interrompe: false },
			]),
			manha,
		)

		expect(avisos).toHaveLength(1)
		expect(avisos[0]!.chave).toBe('a:1')
	})

	it('cai na janela de 8h quando é cedo', () => {
		const [aviso] = montarAvisos(painel([{ chave: 'a:1', interrompe: true }]), manha)
		const hora = new Date(aviso!.em).getHours()
		expect(hora).toBe(HORAS_DE_AVISO[0])
	})

	it('pula janelas que já passaram', () => {
		const tarde = new Date(2026, 10, 12, 14, 0, 0).getTime()
		const [aviso] = montarAvisos(painel([{ chave: 'a:1', interrompe: true }]), tarde)
		expect(new Date(aviso!.em).getHours()).toBe(18)
	})

	it('depois da última janela, agenda para as 8h do dia seguinte', () => {
		const noite = new Date(2026, 10, 12, 21, 0, 0).getTime()
		const [aviso] = montarAvisos(painel([{ chave: 'a:1', interrompe: true }]), noite)

		expect(new Date(aviso!.em).getDate()).toBe(13)
		expect(new Date(aviso!.em).getHours()).toBe(8)
	})

	it('limita a 3 avisos por vez', () => {
		const avisos = montarAvisos(
			painel(
				Array.from({ length: 6 }, (_, i) => ({ chave: `s${i}:1`, interrompe: true })),
			),
			manha,
		)
		expect(avisos).toHaveLength(3)
	})

	it('o id da notificação é estável e cabe em 32 bits', () => {
		const a = idDeNotificacao('projeto_sem_atividade:p1:2')
		const b = idDeNotificacao('projeto_sem_atividade:p1:2')
		const c = idDeNotificacao('projeto_sem_atividade:p2:2')

		expect(a).toBe(b)
		expect(a).not.toBe(c)
		expect(a).toBeGreaterThan(0)
		expect(a).toBeLessThan(2_147_483_648)
	})
})

describe('pausa e retrato', () => {
	it('pausado zera o painel persistido', async () => {
		await createTask({ title: 'Atrasada', dueDate: '2020-01-01' }, banco)
		const ativo = await avaliarAgora({ forcar: true }, banco)
		expect(ativo.itens.length).toBeGreaterThan(0)

		await salvarPreferencias({ modo: 'pausado' }, banco)
		await avaliarAgora({}, banco)

		expect(await lerPainel(ativo.dia, banco)).toBeNull()
	})

	it('o retrato não carrega conteúdo de nota', async () => {
		await createTask({ title: 'Revisar', notes: 'SENHA: 1234' }, banco)
		const painel = await avaliarAgora({ forcar: true }, banco)
		expect(JSON.stringify(painel)).not.toContain('SENHA')
	})
})
