import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { listarHabitos, listarRegistros } from '@/db/habitos'
import { avaliarLote, desfazerLote, executarLote } from '@/lib/jarvis/executor'
import type { AcaoDaIA } from '@/lib/jarvis/ia'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-acoes-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

const acao = (tipo: AcaoDaIA['tipo'], dados: Record<string, unknown>): AcaoDaIA => ({
	tipo,
	dados,
	motivo: 'teste',
})

describe('vocabulário de ações', () => {
	it('cria um projeto', async () => {
		const r = await executarLote([acao('criar_projeto', { nome: 'Curso de cerâmica', prazo: '2026-12-01' })], banco)
		expect(r.executadas).toBe(1)

		const projetos = await banco.projects.toArray()
		expect(projetos).toHaveLength(1)
		expect(projetos[0]!.name).toBe('Curso de cerâmica')
		expect(projetos[0]!.prazo).toBe('2026-12-01')
	})

	it('cria um hábito com dias e meta', async () => {
		const r = await executarLote(
			[acao('criar_habito', { titulo: 'Ler', dias: [1, 3, 5], meta: 20, unidade: 'páginas' })],
			banco,
		)
		expect(r.executadas).toBe(1)

		const habitos = await listarHabitos(banco)
		expect(habitos[0]!.title).toBe('Ler')
		expect(habitos[0]!.dias).toEqual([1, 3, 5])
		expect(habitos[0]!.targetValue).toBe(20)
	})

	it('registra um hábito e desfaz o registro', async () => {
		await executarLote([acao('criar_habito', { titulo: 'Ler' })], banco)
		const habito = (await listarHabitos(banco))[0]!

		const r = await executarLote([acao('registrar_habito', { id: habito.id, dia: '2026-11-12' })], banco)
		expect(r.executadas).toBe(1)
		expect(await listarRegistros(banco)).toHaveLength(1)

		await desfazerLote(r.loteId!, banco)
		expect(await listarRegistros(banco)).toHaveLength(0)
	})

	it('cria lembrete', async () => {
		const r = await executarLote(
			[
				acao('criar_lembrete', { texto: 'Ligar para o fornecedor' }),
			],
			banco,
		)

		expect(r.executadas).toBe(1)
		expect(await banco.reminders.count()).toBe(1)
	})

	it('conclui marco e desfaz voltando ao estado anterior', async () => {
		await banco.projects.add({
			id: 'p1',
			name: 'Reforma',
			archived: false,
			order: 0,
			marcos: [{ id: 'm1', titulo: 'Piso', feito: false, feitoEm: null }],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})

		const r = await executarLote([acao('concluir_marco', { projetoId: 'p1', marcoId: 'm1' })], banco)
		expect(r.executadas).toBe(1)
		expect((await banco.projects.get('p1'))?.marcos?.[0]?.feito).toBe(true)

		await desfazerLote(r.loteId!, banco)
		expect((await banco.projects.get('p1'))?.marcos?.[0]?.feito).toBe(false)
	})

	it('conclui evento sem apagar de verdade e desfaz', async () => {
		await banco.events.add({
			id: 'e1',
			title: 'Reunião',
			startAt: Date.now(),
			endAt: Date.now() + 3600000,
			diaInteiro: false,
			cor: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})

		const r = await executarLote([acao('concluir_evento', { id: 'e1' })], banco)
		expect(r.executadas).toBe(1)
		expect((await banco.events.get('e1'))?.deletedAt).toBeTypeOf('number')

		await desfazerLote(r.loteId!, banco)
		expect((await banco.events.get('e1'))?.deletedAt).toBeNull()
	})

	it('anota no projeto com marcador da IA', async () => {
		await banco.projects.add({
			id: 'p1',
			name: 'Reforma',
			archived: false,
			order: 0,
			notas: 'Decisão: piso de madeira',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})

		const r = await executarLote([acao('anotar_em_projeto', { id: 'p1', texto: 'Cotar acústico' })], banco)
		expect(r.executadas).toBe(1)

		const notas = (await banco.projects.get('p1'))?.notas
		expect(notas).toContain('piso de madeira')
		expect(notas).toContain('· Cotar acústico')
	})

	it('desfaz criação de projeto, hábito e lembrete', async () => {
		const r = await executarLote(
			[
				acao('criar_projeto', { nome: 'Temp' }),
				acao('criar_habito', { titulo: 'Temp' }),
				acao('criar_lembrete', { texto: 'Temp' }),
			],
			banco,
		)
		expect(r.executadas).toBe(3)

		await desfazerLote(r.loteId!, banco)

		// Exclusão suave: o registro continua, marcado como excluído.
		expect((await banco.projects.get((await banco.projects.toArray())[0]!.id))?.deletedAt).toBeTypeOf('number')
		expect((await banco.habits.toArray())[0]!.deletedAt).toBeTypeOf('number')
		expect((await banco.reminders.toArray())[0]!.deletedAt).toBeTypeOf('number')
	})
})

describe('risco dos tipos novos', () => {
	it('hábito sempre pede confirmação, mesmo no confiante', () => {
		const { avaliacoes } = avaliarLote([acao('criar_habito', { titulo: 'Ler' })], 'confiante')
		expect(avaliacoes[0]!.risco).toBe('confirmar')
	})

	it('conservador pede confirmação para projeto e lembrete', () => {
		const { avaliacoes } = avaliarLote(
			[
				acao('criar_projeto', { nome: 'X' }),
				acao('criar_lembrete', { texto: 'X' }),
			],
			'conservador',
		)
		for (const avaliacao of avaliacoes) expect(avaliacao.risco).toBe('confirmar')
	})

	it('anotar em projeto sempre confirma', () => {
		const { avaliacoes } = avaliarLote(
			[acao('anotar_em_projeto', { id: 'p1', texto: 'oi' })],
			'confiante',
		)
		expect(avaliacoes[0]!.risco).toBe('confirmar')
	})

	it('recusa ação sem dados obrigatórios', () => {
		const { avaliacoes } = avaliarLote([acao('criar_projeto', {})], 'confiante')
		expect(avaliacoes[0]!.risco).toBe('proibido')
	})

	it('não há tipo de exclusão no vocabulário', () => {
		const tipos: string[] = [
			'criar_tarefa', 'editar_tarefa', 'concluir_tarefa', 'criar_projeto',
			'editar_projeto', 'criar_marco', 'concluir_marco', 'criar_evento',
			'concluir_evento', 'criar_lembrete', 'criar_habito', 'registrar_habito',
			'anotar_em_projeto',
		]
		for (const tipo of tipos) {
			expect(tipo).not.toMatch(/excluir|apagar|delete|remover/)
		}
	})
})
