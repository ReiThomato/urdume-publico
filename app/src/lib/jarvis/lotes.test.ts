import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createProject, createTask } from '@/db/repo'
import {
	aplicarLote,
	desfazerLoteDeTarefas,
	preverLote,
	riscoPorVolume,
	selecionarTarefas,
} from '@/lib/jarvis/lotes'
import { avaliarAcao, executarLote, desfazerLote } from '@/lib/jarvis/executor'

/**
 * Lotes são o pedido mais perigoso do sistema: um toque altera dezenas de
 * registros. As travas aqui precisam ser provadas, não argumentadas.
 *
 * A regra central: a IA propõe FILTRO, o app resolve contra o banco, o volume
 * define o risco, e exclusão em lote não existe em nenhum volume.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`lotes-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

async function cenario() {
	const projeto = await createProject({ name: 'Reforma' }, banco)
	const outro = await createProject({ name: 'Estudos' }, banco)

	const criadas = []
	// 30 atrasadas na Reforma, 5 atrasadas em Estudos, 10 futuras.
	for (let i = 0; i < 30; i++) {
		criadas.push(
			await createTask(
				{ title: `Reforma ${i}`, projectId: projeto.id, dueDate: '2026-11-01', priority: 2 },
				banco,
			),
		)
	}
	for (let i = 0; i < 5; i++) {
		criadas.push(
			await createTask(
				{ title: `Estudos ${i}`, projectId: outro.id, dueDate: '2026-11-02' },
				banco,
			),
		)
	}
	for (let i = 0; i < 10; i++) {
		criadas.push(
			await createTask(
				{ title: `Futura ${i}`, projectId: projeto.id, dueDate: '2026-12-01' },
				banco,
			),
		)
	}

	return { projeto, outro, criadas }
}

describe('filtro declarativo', () => {
	it('seleciona por projeto e estado, combinando', async () => {
		const { projeto } = await cenario()
		const tarefas = await banco.tasks.toArray()

		const atrasadasDaReforma = selecionarTarefas(
			tarefas,
			{ projetoId: projeto.id, estado: 'atrasada' },
			'2026-11-14',
		)

		expect(atrasadasDaReforma).toHaveLength(30)
		expect(atrasadasDaReforma.every((t) => t.title.startsWith('Reforma'))).toBe(true)
	})

	it('não mistura projetos diferentes', async () => {
		const { outro } = await cenario()
		const tarefas = await banco.tasks.toArray()

		const deEstudos = selecionarTarefas(tarefas, { projetoId: outro.id }, '2026-11-14')
		expect(deEstudos).toHaveLength(5)
		expect(deEstudos.every((t) => t.title.startsWith('Estudos'))).toBe(true)
	})

	it('ignora excluídas', async () => {
		const { criadas } = await cenario()
		const alvo = criadas[0]!
		await banco.tasks.update(alvo.id, { deletedAt: Date.now() })

		const tarefas = await banco.tasks.toArray()
		const todas = selecionarTarefas(tarefas, {}, '2026-11-14')
		expect(todas.some((t) => t.id === alvo.id)).toBe(false)
	})
})

describe('escada de risco por volume', () => {
	it('1–5 livre, 6–20 confirma, 21–100 forte, >100 proibido', () => {
		expect(riscoPorVolume(0)).toBe('livre')
		expect(riscoPorVolume(5)).toBe('livre')
		expect(riscoPorVolume(6)).toBe('confirmar')
		expect(riscoPorVolume(20)).toBe('confirmar')
		expect(riscoPorVolume(21)).toBe('confirmar-forte')
		expect(riscoPorVolume(100)).toBe('confirmar-forte')
		expect(riscoPorVolume(101)).toBe('proibido')
	})

	it('a prévia informa o número e exemplos', async () => {
		const { projeto } = await cenario()
		const tarefas = await banco.tasks.toArray()

		const previa = preverLote(tarefas, { projetoId: projeto.id, estado: 'atrasada' }, '2026-11-14')

		expect(previa.total).toBe(30)
		expect(previa.risco).toBe('confirmar-forte')
		expect(previa.exemplos).toHaveLength(3)
		expect(previa.exigencia).toContain('30')
	})

	it('a avaliação recusa acima de 100, antes de confirmar', () => {
		const avaliacao = avaliarAcao(
			{
				tipo: 'lote_tarefas',
				dados: {
					filtro: { estado: 'aberta' },
					operacao: { tipo: 'concluir' },
					totalDoLote: 150,
				},
				motivo: 'x',
			},
			'confiante',
		)

		expect(avaliacao.risco).toBe('proibido')
		expect(avaliacao.recusa).toContain('100')
	})

	it('sem contagem, o risco é confirmar — nunca livre por omissão', () => {
		const avaliacao = avaliarAcao(
			{
				tipo: 'lote_tarefas',
				dados: { filtro: { estado: 'aberta' }, operacao: { tipo: 'concluir' } },
				motivo: 'x',
			},
			'confiante',
		)

		expect(avaliacao.risco).toBe('confirmar')
	})

	it('exclusão não existe como operação de lote', () => {
		const avaliacao = avaliarAcao(
			{
				tipo: 'lote_tarefas',
				dados: {
					filtro: { estado: 'aberta' },
					operacao: { tipo: 'excluir' },
					totalDoLote: 3,
				},
				motivo: 'x',
			},
			'confiante',
		)

		expect(avaliacao.risco).toBe('proibido')
	})
})

describe('execução', () => {
	it('move aplica a data em todos e reporta o resultado', async () => {
		const { projeto } = await cenario()
		const tarefas = await banco.tasks.toArray()
		const ids = selecionarTarefas(tarefas, { projetoId: projeto.id, estado: 'atrasada' }, '2026-11-14').map(
			(t) => t.id,
		)

		const resultado = await aplicarLote(ids, { tipo: 'mover', para: '2026-11-18' }, banco)

		expect(resultado.aplicadas).toBe(30)
		expect(resultado.recusadas).toHaveLength(0)

		const depois = await banco.tasks.toArray()
		const movidas = depois.filter((t) => ids.includes(t.id))
		expect(movidas.every((t) => t.dueDate === '2026-11-18')).toBe(true)
	})

	it('concluir não sobrescreve quem já estava concluída — recusa e explica', async () => {
		const { criadas } = await cenario()
		await banco.tasks.update(criadas[0]!.id, { done: true, doneAt: Date.now() })

		const resultado = await aplicarLote(
			[criadas[0]!.id, criadas[1]!.id],
			{ tipo: 'concluir' },
			banco,
		)

		expect(resultado.aplicadas).toBe(1)
		expect(resultado.recusadas).toHaveLength(1)
		expect(resultado.recusadas[0]!.motivo).toContain('Já estava')
	})

	it('data inválida é recusada item a item, sem parar o lote', async () => {
		const { criadas } = await cenario()

		const resultado = await aplicarLote(
			[criadas[0]!.id, criadas[1]!.id],
			{ tipo: 'mover', para: 'segunda' },
			banco,
		)

		expect(resultado.aplicadas).toBe(0)
		expect(resultado.recusadas).toHaveLength(2)
		expect(resultado.recusadas[0]!.motivo).toContain('Data inválida')
	})

	it('etiquetar não duplica etiqueta existente', async () => {
		const { criadas } = await cenario()
		await banco.tasks.update(criadas[0]!.id, { tags: ['urgente'] })

		const resultado = await aplicarLote(
			[criadas[0]!.id, criadas[1]!.id],
			{ tipo: 'etiquetar', etiqueta: 'urgente' },
			banco,
		)

		expect(resultado.aplicadas).toBe(1)
		expect(resultado.recusadas[0]!.motivo).toContain('Já tinha')

		const comEtiqueta = (await banco.tasks.get(criadas[1]!.id))!
		expect(comEtiqueta.tags).toContain('urgente')
	})

	it('arquivar tira do dia sem apagar', async () => {
		const { criadas } = await cenario()
		await aplicarLote([criadas[0]!.id], { tipo: 'arquivar' }, banco)

		const tarefa = await banco.tasks.get(criadas[0]!.id)
		expect(tarefa!.someday).toBe(true)
		expect(tarefa!.deletedAt ?? null).toBeNull()
	})
})

describe('integração com a IA', () => {
	it('a ação lote_tarefas executa pelo executor e desfaz tudo de uma vez', async () => {
		const { projeto } = await cenario()

		const resultado = await executarLote(
			[
				{
					tipo: 'lote_tarefas',
					dados: {
						filtro: { projetoId: projeto.id, estado: 'atrasada' },
						operacao: { tipo: 'mover', para: '2026-11-20' },
						totalDoLote: 30,
					},
					motivo: 'Pedido do usuário',
				},
			],
			banco,
		)

		expect(resultado.executadas).toBe(1)

		const movidas = (await banco.tasks.toArray()).filter((t) => t.dueDate === '2026-11-20')
		expect(movidas).toHaveLength(30)

		const desfeito = await desfazerLote(resultado.loteId!, banco)
		expect(desfeito.ok).toBe(true)

		const depois = await banco.tasks.toArray()
		const reforma = depois.filter((t) => t.title.startsWith('Reforma') && t.dueDate === '2026-11-01')
		expect(reforma).toHaveLength(30)
	})

	it('filtro que não casa nada não executa nem mente', async () => {
		await cenario()

		const resultado = await executarLote(
			[
				{
					tipo: 'lote_tarefas',
					dados: {
						filtro: { contem: 'inexistente' },
						operacao: { tipo: 'concluir' },
						totalDoLote: 0,
					},
					motivo: 'x',
				},
			],
			banco,
		)

		expect(resultado.executadas).toBe(0)
		expect(resultado.erro).toBeTruthy()
	})
})

describe('desfazer independente', () => {
	it('restaura o estado anterior de cada tarefa', async () => {
		const { criadas } = await cenario()
		const antes = await Promise.all(
			criadas.slice(0, 3).map(async (t) => ({ id: t.id, tarefa: (await banco.tasks.get(t.id))! })),
		)

		await aplicarLote(antes.map((a) => a.id), { tipo: 'concluir' }, banco)
		expect((await banco.tasks.get(antes[0]!.id))!.done).toBe(true)

		await desfazerLoteDeTarefas(antes, banco)
		expect((await banco.tasks.get(antes[0]!.id))!.done).toBe(false)
	})
})
