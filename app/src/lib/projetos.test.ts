import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import type { Project, Task } from '@/db/db'
import { ordenarMarcos, ordenarResumos, resumirProjeto, textoDaData } from '@/lib/projetos'
import type { ResumoDoProjeto } from '@/lib/projetos'
import type { Marco } from '@/db/db'

/**
 * Testes da leitura de projeto e das cores de tema.
 *
 * Estes dois pontos quebraram em silêncio antes: o contador do projeto somava
 * tarefas erradas e o seletor de cor dizia "aplicado" sem aplicar. Os testes
 * travam o comportamento que o usuário vê.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`urdume-projetos-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

function projeto(extra: Partial<Project> = {}): Project {
	return {
		id: 'p1',
		name: 'Reforma',
		archived: false,
		order: 1,
		createdAt: 0,
		updatedAt: 0,
		...extra,
	}
}

function tarefa(extra: Partial<Task> = {}): Task {
	return {
		id: crypto.randomUUID(),
		title: 'Tarefa',
		done: false,
		priority: 0,
		order: 0,
		createdAt: 0,
		updatedAt: 0,
		...extra,
	}
}

describe('resumirProjeto', () => {
	it('conta abertas, concluídas e o progresso', () => {
		const resumo = resumirProjeto(projeto(), [
			tarefa({ done: true }),
			tarefa({ done: false }),
			tarefa({ done: false }),
			tarefa({ done: false }),
		])

		expect(resumo.total).toBe(4)
		expect(resumo.concluidas).toBe(1)
		expect(resumo.abertas).toBe(3)
		expect(resumo.progresso).toBe(25)
	})

	it('ignora tarefas excluídas, inclusive no total', () => {
		const resumo = resumirProjeto(projeto(), [
			tarefa({ done: true }),
			tarefa({ deletedAt: Date.now() }),
		])

		expect(resumo.total).toBe(1)
		expect(resumo.progresso).toBe(100)
	})

	it('conta como urgente apenas tarefa aberta de prioridade média ou alta', () => {
		const resumo = resumirProjeto(projeto(), [
			tarefa({ priority: 3 }),
			tarefa({ priority: 2 }),
			tarefa({ priority: 1 }),
			tarefa({ priority: 3, done: true }),
		])

		expect(resumo.urgentes).toBe(2)
	})

	it('resume os marcos: quantos feitos e qual é o próximo', () => {
		const marcos: Marco[] = [
			{ id: 'b', titulo: 'Segundo', data: '2026-12-01', feito: false },
			{ id: 'a', titulo: 'Primeiro', data: '2026-11-20', feito: false },
			{ id: 'c', titulo: 'Feito', data: '2026-11-01', feito: true },
		]
		const resumo = resumirProjeto(projeto({ marcos }), [])

		expect(resumo.marcosFeitos).toBe(1)
		expect(resumo.marcos).toHaveLength(3)
		// O próximo é o não feito com a data mais próxima, não o primeiro do array.
		expect(resumo.proximoMarco?.titulo).toBe('Primeiro')
	})

	it('sem marcos, o próximo é nulo — não inventa entrega', () => {
		const resumo = resumirProjeto(projeto(), [])
		expect(resumo.marcos).toEqual([])
		expect(resumo.marcosFeitos).toBe(0)
		expect(resumo.proximoMarco).toBeNull()
	})
})

describe('ordenarMarcos', () => {
	it('deixa pendentes primeiro, por data, e feitos no fim', () => {
		const ordenados = ordenarMarcos([
			{ id: '3', titulo: 'Feito', feito: true },
			{ id: '2', titulo: 'Dezembro', data: '2026-12-31', feito: false },
			{ id: '1', titulo: 'Novembro', data: '2026-11-10', feito: false },
			{ id: '4', titulo: 'Sem data', feito: false },
		])

		expect(ordenados.map((m) => m.titulo)).toEqual(['Novembro', 'Dezembro', 'Sem data', 'Feito'])
	})
})

describe('textoDaData', () => {
	it('usa palavras para hoje e amanhã e data curta para o resto', () => {
		const hoje = new Date()
		const dia = (d: Date): string =>
			`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

		const amanha = new Date(hoje)
		amanha.setDate(amanha.getDate() + 1)

		expect(textoDaData(dia(hoje))).toBe('hoje')
		expect(textoDaData(dia(amanha))).toBe('amanhã')
		expect(textoDaData(null)).toBeNull()
	})
})

/* --------------------------------------------------------------------------
   Ordenação e agrupamento (v5)
   -------------------------------------------------------------------------- */

describe('ordenação de projetos', () => {
	function resumo(patch: {
		id: string
		priority?: number
		order?: number
		diasAtePrazo?: number | null
		abertas?: number
		updatedAt?: number
	}): ResumoDoProjeto {
		return {
			projeto: {
				id: patch.id,
				name: patch.id,
				archived: false,
				order: patch.order ?? 1,
				priority: (patch.priority ?? 0) as 0 | 1 | 2 | 3,
				createdAt: 0,
				updatedAt: patch.updatedAt ?? 0,
			},
			total: 0,
			concluidas: 0,
			abertas: patch.abertas ?? 0,
			atrasadas: 0,
			progresso: 0,
			diasAtePrazo: patch.diasAtePrazo ?? null,
			prazoVencido: false,
			proxima: null,
			eProjeto: true,
			marcos: [],
			marcosFeitos: 0,
			proximoMarco: null,
		} as unknown as ResumoDoProjeto
	}

	const ids = (lista: ResumoDoProjeto[]): string[] => lista.map((item) => item.projeto.id)

	it('por prioridade: alta primeiro, empate na ordem manual', () => {
		const lista = [
			resumo({ id: 'baixa', priority: 1, order: 1 }),
			resumo({ id: 'alta', priority: 3, order: 9 }),
			resumo({ id: 'media-a', priority: 2, order: 2 }),
			resumo({ id: 'media-b', priority: 2, order: 5 }),
		]
		expect(ids(ordenarResumos(lista, 'prioridade'))).toEqual([
			'alta',
			'media-a',
			'media-b',
			'baixa',
		])
	})

	it('manual respeita o arrasto e ignora a prioridade', () => {
		const lista = [
			resumo({ id: 'b', priority: 3, order: 2 }),
			resumo({ id: 'a', priority: 0, order: 1 }),
		]
		expect(ids(ordenarResumos(lista, 'manual'))).toEqual(['a', 'b'])
	})

	it('prazo coloca o mais próximo primeiro e sem-prazo no fim', () => {
		const lista = [
			resumo({ id: 'sem-prazo', diasAtePrazo: null }),
			resumo({ id: 'longe', diasAtePrazo: 30 }),
			resumo({ id: 'perto', diasAtePrazo: 2 }),
			resumo({ id: 'atrasado', diasAtePrazo: -3 }),
		]
		expect(ids(ordenarResumos(lista, 'prazo'))).toEqual([
			'atrasado',
			'perto',
			'longe',
			'sem-prazo',
		])
	})

	it('tarefas: quem tem mais trabalho aberto primeiro', () => {
		const lista = [
			resumo({ id: 'poucas', abertas: 2 }),
			resumo({ id: 'muitas', abertas: 15 }),
			resumo({ id: 'algumas', abertas: 6 }),
		]
		expect(ids(ordenarResumos(lista, 'tarefas'))).toEqual(['muitas', 'algumas', 'poucas'])
	})

	it('atividade: mexido mais recentemente primeiro', () => {
		const lista = [
			resumo({ id: 'velho', updatedAt: 1_000 }),
			resumo({ id: 'novo', updatedAt: 9_000 }),
		]
		expect(ids(ordenarResumos(lista, 'atividade'))).toEqual(['novo', 'velho'])
	})

	it('não altera a lista original', () => {
		const lista = [resumo({ id: 'a', priority: 0 }), resumo({ id: 'b', priority: 3 })]
		const antes = ids(lista)
		ordenarResumos(lista, 'prioridade')
		expect(ids(lista)).toEqual(antes)
	})
})
