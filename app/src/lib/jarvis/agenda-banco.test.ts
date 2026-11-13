import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createTask } from '@/db/repo'
import { criarEvento } from '@/db/eventos'
import { criarHabito, alternarDiaHabito } from '@/db/habitos'
import { montarAgendaDoBanco, sincronizarSegundoPlano } from '@/lib/jarvis/segundo-plano'
import { salvarPreferencias } from '@/lib/jarvis/estado'
import { toDayKey } from '@/db/repo'

/**
 * Integração da agenda com o banco.
 *
 * Os testes de `agenda.test.ts` provam a aritmética com dados sintéticos.
 * Estes provam que a leitura do banco entrega os campos certos — que foi onde
 * o defeito morava antes: `montarAvisos` só olhava o painel do Jarvis, que não
 * tem hora de tarefa nem ocorrência de evento.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-agenda-${crypto.randomUUID()}`)
	await banco.open()
	// Faixa silenciosa desligada: os testes usam horas dentro da noite.
	await salvarPreferencias({ silencio: { inicio: 22, fim: 7, ligado: false } }, banco)
})

afterEach(async () => {
	await banco.delete()
})

/** Amanhã às 15h30, no fuso local. */
function amanhaAs(horas: number, minutos = 0): { dia: string; instante: number } {
	const data = new Date()
	data.setDate(data.getDate() + 1)
	data.setHours(horas, minutos, 0, 0)
	return { dia: toDayKey(data), instante: data.getTime() }
}

describe('agenda lendo o banco', () => {
	it('tarefa com hora vira aviso naquele minuto', async () => {
		const alvo = amanhaAs(15, 30)
		await createTask(
			{ title: 'Enviar proposta', dueDate: alvo.dia, startMin: 15 * 60 + 30 },
			banco,
		)

		const avisos = await montarAgendaDoBanco(Date.now(), banco)
		const daTarefa = avisos.find((aviso) => aviso.chave?.startsWith('agenda:tarefa:'))

		expect(daTarefa).toBeDefined()
		expect(daTarefa!.em).toBe(alvo.instante)
		expect(daTarefa!.titulo).toBe('Enviar proposta')
	})

	it('concluir a tarefa remove o aviso da lista', async () => {
		const alvo = amanhaAs(15, 30)
		const tarefa = await createTask(
			{ title: 'Enviar proposta', dueDate: alvo.dia, startMin: 15 * 60 + 30 },
			banco,
		)

		const antes = await montarAgendaDoBanco(Date.now(), banco)
		expect(antes.some((aviso) => aviso.chave?.includes(tarefa.id))).toBe(true)

		await banco.tasks.update(tarefa.id, { done: true, doneAt: Date.now() })

		const depois = await montarAgendaDoBanco(Date.now(), banco)
		expect(depois.some((aviso) => aviso.chave?.includes(tarefa.id))).toBe(false)
	})

	it('prazo final separado do dia marcado', async () => {
		const alvo = amanhaAs(16)
		await createTask({ title: 'Contrato', deadline: alvo.dia }, banco)

		// Relógio fixo às 9h: depois das 18h, a véspera já passou e o aviso
		// corretamente não existe. O teste dependia da hora em que rodava —
		// passava de manhã e falhava à noite, sem defeito nenhum no app.
		const agora = new Date()
		agora.setHours(9, 0, 0, 0)

		const avisos = await montarAgendaDoBanco(agora.getTime(), banco)
		// Prazo de amanhã: aviso às 18h de hoje (véspera).
		const vespera = avisos.find((aviso) => aviso.chave?.startsWith('agenda:vespera:'))
		expect(vespera).toBeDefined()
		expect(new Date(vespera!.em).getHours()).toBe(18)
	})

	it('hábito feito hoje não avisa hoje', async () => {
		const habito = await criarHabito(
			{ title: 'Alongar', startMin: 20 * 60, reminder: true },
			banco,
		)

		// Relógio fixo às 7h. Este teste marcava o hábito para as 20h e usava
		// `Date.now()`: passava de manhã e falhava depois das 20h, porque o
		// horário já tinha passado e não havia mais o que agendar. Defeito do
		// teste, não do app — o mesmo que já foi corrigido no teste de prazo.
		const agora = new Date()
		agora.setHours(7, 0, 0, 0)

		const antes = await montarAgendaDoBanco(agora.getTime(), banco)
		expect(
			antes.some((aviso) => aviso.chave === `agenda:habito:${habito.id}:${toDayKey(new Date())}`),
		).toBe(true)

		await alternarDiaHabito(habito, toDayKey(new Date()), banco)

		const depois = await montarAgendaDoBanco(agora.getTime(), banco)
		expect(
			depois.some((aviso) => aviso.chave === `agenda:habito:${habito.id}:${toDayKey(new Date())}`),
		).toBe(false)
	})

	it('evento de amanhã avisa com a antecedência padrão', async () => {
		const alvo = amanhaAs(10)
		await criarEvento(
			{ title: 'Dentista', startAt: alvo.instante, endAt: alvo.instante + 3_600_000 },
			banco,
		)

		const avisos = await montarAgendaDoBanco(Date.now(), banco)
		const doEvento = avisos.find((aviso) => aviso.chave?.startsWith('agenda:evento:'))
		expect(doEvento).toBeDefined()
		// 15 min antes, padrão.
		expect(doEvento!.em).toBe(alvo.instante - 15 * 60_000)
	})

	it('desligar a agenda nas preferências zera tudo', async () => {
		const alvo = amanhaAs(15, 30)
		await createTask({ title: 'X', dueDate: alvo.dia, startMin: 15 * 60 }, banco)
		await salvarPreferencias({ agendaDeAvisos: false }, banco)

		expect(await montarAgendaDoBanco(Date.now(), banco)).toHaveLength(0)
	})
})

describe('sincronização', () => {
	it('grava retrato e devolve resumo mesmo sem plataforma nativa', async () => {
		const alvo = amanhaAs(15, 30)
		await createTask({ title: 'Enviar', dueDate: alvo.dia, startMin: 15 * 60 + 30 }, banco)

		const resultado = await sincronizarSegundoPlano(Date.now(), banco)

		expect(resultado.retratoGravado).toBe(true)
		expect(resultado.planoGravado).toBe(true)
		// No Node não há Capacitor nativo: nada é agendado, mas o resumo
		// descreve o que SERIA agendado — é o que a tela mostra.
		expect(resultado.resumoDaAgenda).toContain('aviso')
		expect(resultado.agendadasNaAgenda).toBe(0)
	})

	it('pausado não agenda e não deixa ids pendentes', async () => {
		await salvarPreferencias({ modo: 'pausado' }, banco)
		const resultado = await sincronizarSegundoPlano(Date.now(), banco)

		expect(resultado.agendadas).toBe(0)
		expect(resultado.agendadasNaAgenda).toBe(0)
		expect(resultado.resumoDaAgenda).toBe('Pausado.')
	})
})
