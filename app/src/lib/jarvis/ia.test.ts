import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createTask, listTasks } from '@/db/repo'
import { interpretar, montarResumo, estimarCusto } from '@/lib/jarvis/ia'
import type { AcaoDaIA } from '@/lib/jarvis/ia'
import { avaliarLote, desfazerLote, executarLote } from '@/lib/jarvis/executor'
import { montarRetrato } from '@/lib/jarvis/retrato'
import { avaliarSinais } from '@/lib/jarvis/sinais'

const HOJE = '2026-11-12'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-ia-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('interpretação da resposta do modelo', () => {
	it('lê JSON puro', () => {
		const resposta = interpretar(
			JSON.stringify({
				mensagem: 'Dá para fechar duas tarefas hoje.',
				acoes: [{ tipo: 'concluir_tarefa', dados: { id: 't1' }, motivo: 'Aberta há 9 dias' }],
			}),
		)

		expect(resposta?.mensagem).toContain('fechar')
		expect(resposta?.acoes).toHaveLength(1)
		expect(resposta?.acoes[0]!.tipo).toBe('concluir_tarefa')
	})

	it('aceita JSON embrulhado em markdown', () => {
		const resposta = interpretar('```json\n{"mensagem":"ok","acoes":[]}\n```')
		expect(resposta?.mensagem).toBe('ok')
	})

	it('devolve null para texto que não é JSON', () => {
		expect(interpretar('Claro! Aqui está o plano…')).toBeNull()
	})

	it('descarta ação de tipo proibido e mantém as válidas', () => {
		const resposta = interpretar(
			JSON.stringify({
				mensagem: 'x',
				acoes: [
					{ tipo: 'excluir_projeto', dados: { id: 'p1' }, motivo: 'limpeza' },
					{ tipo: 'criar_tarefa', dados: { titulo: 'Revisar' }, motivo: 'prazo' },
				],
			}),
		)

		expect(resposta?.acoes).toHaveLength(1)
		expect(resposta?.acoes[0]!.tipo).toBe('criar_tarefa')
	})

	it('corta lote acima de 5', () => {
		const acoes = Array.from({ length: 12 }, () => ({ tipo: 'criar_tarefa', dados: { titulo: 'x' }, motivo: '' }))
		const resposta = interpretar(JSON.stringify({ mensagem: '', acoes }))
		expect(resposta?.acoes).toHaveLength(5)
	})
})

describe('classificação de risco', () => {
	const acao = (tipo: AcaoDaIA['tipo'], dados: Record<string, unknown>): AcaoDaIA => ({
		tipo,
		dados,
		motivo: '',
	})

	it('conservador pede confirmação até para criar tarefa', () => {
		const { avaliacoes } = avaliarLote([acao('criar_tarefa', { titulo: 'X' })], 'conservador')
		expect(avaliacoes[0]!.risco).toBe('confirmar')
	})

	it('equilibrado cria tarefa simples sem confirmar', () => {
		const { avaliacoes } = avaliarLote([acao('criar_tarefa', { titulo: 'X' })], 'equilibrado')
		expect(avaliacoes[0]!.risco).toBe('livre')
	})

	it('editar tarefa exige confirmação em qualquer nível', () => {
		for (const nivel of ['conservador', 'equilibrado', 'confiante'] as const) {
			const { avaliacoes } = avaliarLote([acao('editar_tarefa', { id: 't1', dia: HOJE })], nivel)
			expect(avaliacoes[0]!.risco).toBe('confirmar')
		}
	})

	it('recusa ação sem os dados obrigatórios', () => {
		const { avaliacoes } = avaliarLote([acao('criar_tarefa', {})], 'confiante')
		expect(avaliacoes[0]!.risco).toBe('proibido')
		expect(avaliacoes[0]!.recusa).toBeTruthy()
	})

	it('recusa lote que passa de 5 itens', () => {
		const acoes = Array.from({ length: 6 }, () => acao('criar_tarefa', { titulo: 'x' }))
		const { erroDoLote, avaliacoes } = avaliarLote(acoes, 'confiante')
		expect(erroDoLote).toBeTruthy()
		expect(avaliacoes).toHaveLength(0)
	})

	it('a prévia é montada do payload, não do texto da IA', () => {
		const { avaliacoes } = avaliarLote(
			[{ tipo: 'editar_projeto', dados: { id: 'p1', status: 'concluido' }, motivo: 'Vou fazer outra coisa' }],
			'confiante',
		)
		expect(avaliacoes[0]!.previa).toContain('status → concluido')
		expect(avaliacoes[0]!.previa).not.toContain('outra coisa')
	})
})

describe('execução e desfazer', () => {
	it('executa criação e desfaz removendo o que foi criado', async () => {
		const resultado = await executarLote(
			[{ tipo: 'criar_tarefa', dados: { titulo: 'Criada pela IA', dia: HOJE }, motivo: 'teste' }],
			banco,
		)

		expect(resultado.executadas).toBe(1)
		expect(resultado.loteId).toBeTruthy()
		expect((await listTasks(banco)).some((t) => t.title === 'Criada pela IA')).toBe(true)

		const desfeito = await desfazerLote(resultado.loteId!, banco)
		expect(desfeito.ok).toBe(true)
		expect((await listTasks(banco)).some((t) => t.title === 'Criada pela IA')).toBe(false)
	})

	it('executa edição e desfaz restaurando o estado anterior', async () => {
		const tarefa = await createTask({ title: 'Original', dueDate: HOJE }, banco)

		const resultado = await executarLote(
			[{ tipo: 'editar_tarefa', dados: { id: tarefa.id, dia: '2026-12-01' }, motivo: 'reagendar' }],
			banco,
		)
		expect((await banco.tasks.get(tarefa.id))?.dueDate).toBe('2026-12-01')

		await desfazerLote(resultado.loteId!, banco)
		expect((await banco.tasks.get(tarefa.id))?.dueDate).toBe(HOJE)
	})

	it('não conclui tarefa que já estava concluída', async () => {
		const tarefa = await createTask({ title: 'Feita' }, banco)
		await banco.tasks.update(tarefa.id, { done: true })

		const resultado = await executarLote(
			[{ tipo: 'concluir_tarefa', dados: { id: tarefa.id }, motivo: 'x' }],
			banco,
		)
		expect(resultado.executadas).toBe(0)
	})

	it('recusa desfazer depois do prazo', async () => {
		const resultado = await executarLote(
			[{ tipo: 'criar_tarefa', dados: { titulo: 'Temp', dia: HOJE }, motivo: '' }],
			banco,
		)

		await banco.aiActions.update(resultado.loteId!, { desfazerAte: Date.now() - 1000 })
		const desfeito = await desfazerLote(resultado.loteId!, banco)
		expect(desfeito.ok).toBe(false)
		expect(desfeito.erro).toContain('24 h')
	})

	it('grava o diário com origem ia', async () => {
		const tarefa = await criarTarefaComIA()
		const fatos = await banco.aiJournal.where('entidade').equals(tarefa).toArray()
		expect(fatos.some((fato) => fato.origem === 'ia')).toBe(true)
	})

	async function criarTarefaComIA(): Promise<string> {
		await executarLote(
			[{ tipo: 'criar_tarefa', dados: { titulo: 'Da IA', dia: HOJE }, motivo: '' }],
			banco,
		)
		const tarefa = (await listTasks(banco)).find((t) => t.title === 'Da IA')
		return tarefa!.id
	}
})

describe('prompt e custo', () => {
	it('o resumo não leva notas nem conteúdo de quadro', () => {
		const retrato = montarRetrato({
			tasks: [
				{
					id: 't1',
					title: 'Revisar contrato',
					notes: 'SENHA-DO-CLIENTE: 1234',
					projectId: null,
					done: false,
					dueDate: HOJE,
					priority: 2,
					order: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					subtasks: [],
					tags: [],
					someday: false,
					deletedAt: null,
					doneAt: null,
					deadline: null,
					startMin: null,
					durationMin: null,
					recurrence: null,
				},
			],
			projects: [],
			events: [],
			habits: [],
			habitLogs: [],
			reminders: [],
			hoje: HOJE,
			agora: Date.now(),
		})

		const resumo = montarResumo({ retrato, sinais: avaliarSinais(retrato), nomesDeProjeto: {} })
		expect(resumo).toContain('Revisar contrato')
		expect(resumo).not.toContain('SENHA-DO-CLIENTE')
	})

	it('estima custo coerente com a tabela', () => {
		// 1M de entrada + 1M de saída = 0,15 + 0,60.
		expect(estimarCusto(1_000_000, 1_000_000)).toBeCloseTo(0.75, 5)
		expect(estimarCusto(0, 0)).toBe(0)
	})
})

describe('o resumo diz a verdade sobre lembretes, hábitos e páginas', () => {
	it('inclui os itens reais, não só contagens', () => {
		const retrato = montarRetrato({
			tasks: [], projects: [], pages: [
				{ id: 'pg1', title: 'Rascunho do layout', projectId: null, order: 0, createdAt: 1, updatedAt: 2 } as never,
			],
			events: [], habits: [
				{ id: 'h1', title: 'Ler', order: 0, dias: [], targetValue: 0, targetUnit: '', createdAt: 1, updatedAt: 1 } as never,
			],
			habitLogs: [], reminders: [
				{ id: 'r1', text: 'Ligar para o fornecedor', done: false, order: 0, createdAt: 1, updatedAt: 1 } as never,
			],
			hoje: HOJE, agora: Date.now(),
		})

		const resumo = montarResumo({ retrato, sinais: [], nomesDeProjeto: {} })

		expect(resumo).toContain('[r1] Ligar para o fornecedor')
		expect(resumo).toContain('[h1] Ler')
		expect(resumo).toContain('[pg1] Rascunho do layout')
	})
})
