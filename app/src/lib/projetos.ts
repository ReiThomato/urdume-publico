import type { Marco, Project, Task } from '@/db/db'
import { chaveDoDia, diaDeHoje } from '@/lib/date'

/**
 * Leitura de um projeto para a central de gerenciamento.
 *
 * A regra é simples de propósito: progresso = tarefas concluídas / total. Não
 * existe peso, estimativa nem ponto de história — o app organiza a vida de uma
 * pessoa, não um time, e um número que ninguém mantém vira ruído.
 */
export interface ResumoDoProjeto {
	projeto: Project
	total: number
	concluidas: number
	abertas: number
	atrasadas: number
	/** 0..100, arredondado. Sem tarefas, é 0. */
	progresso: number
	/** Dias até o prazo: negativo = atrasado, null = sem prazo. */
	diasAtePrazo: number | null
	prazoVencido: boolean
	/** Tarefa aberta com o prazo mais próximo, para mostrar o "próximo passo". */
	proxima: Task | null
	/** O projeto tem corpo de projeto (prazo, descrição, etapa) ou é lista? */
	eProjeto: boolean
	/** Marcos e quantos já foram atingidos. */
	marcos: Marco[]
	marcosFeitos: number
	/** Próximo marco não atingido, ordenado por data. */
	proximoMarco: Marco | null
	/** Tarefas abertas com prioridade alta ou média. */
	urgentes: number
}

function diferencaEmDias(ate: string, de: string = chaveDoDia(diaDeHoje())): number {
	const [a1, m1, d1] = ate.split('-').map(Number)
	const [a2, m2, d2] = de.split('-').map(Number)
	const um = new Date(a1!, (m1 ?? 1) - 1, d1!).getTime()
	const outro = new Date(a2!, (m2 ?? 1) - 1, d2!).getTime()
	return Math.round((um - outro) / 86_400_000)
}

/** Ordena marcos: os não atingidos primeiro, por data; feitos no fim. */
export function ordenarMarcos(marcos: Marco[]): Marco[] {
	return [...marcos].sort((a, b) => {
		if (a.feito !== b.feito) return a.feito ? 1 : -1
		const dataA = a.data ?? '9999-12-31'
		const dataB = b.data ?? '9999-12-31'
		return dataA.localeCompare(dataB)
	})
}

export function resumirProjeto(projeto: Project, tarefas: Task[]): ResumoDoProjeto {
	const visiveis = tarefas.filter((t) => !t.deletedAt)
	const concluidas = visiveis.filter((t) => t.done).length
	const abertas = visiveis.length - concluidas
	const hoje = chaveDoDia(diaDeHoje())

	// "Atrasada" = tarefa aberta cujo dia ou prazo já passou.
	const atrasadas = visiveis.filter(
		(t) => !t.done && ((t.dueDate && t.dueDate < hoje) || (t.deadline && t.deadline < hoje)),
	).length

	const proxima =
		visiveis
			.filter((t) => !t.done && (t.dueDate || t.deadline))
			.sort((a, b) => (a.dueDate ?? a.deadline ?? '').localeCompare(b.dueDate ?? b.deadline ?? ''))[0] ??
		visiveis.filter((t) => !t.done)[0] ??
		null

	const diasAtePrazo = projeto.prazo ? diferencaEmDias(projeto.prazo) : null

	const marcos = ordenarMarcos(projeto.marcos ?? [])
	const marcosFeitos = marcos.filter((m) => m.feito).length
	const proximoMarco = marcos.find((m) => !m.feito) ?? null
	const urgentes = visiveis.filter((t) => !t.done && (t.priority ?? 0) >= 2).length

	return {
		projeto,
		total: visiveis.length,
		concluidas,
		abertas,
		atrasadas,
		progresso: visiveis.length === 0 ? 0 : Math.round((concluidas / visiveis.length) * 100),
		diasAtePrazo,
		prazoVencido: diasAtePrazo !== null && diasAtePrazo < 0 && projeto.status !== 'concluido',
		proxima,
		eProjeto: Boolean(projeto.prazo || projeto.descricao || projeto.etapa || projeto.status),
		marcos,
		marcosFeitos,
		proximoMarco,
		urgentes,
	}
}

/** Texto curto do prazo: "vence hoje", "3 dias", "atrasado 5 dias", "12 mar". */
export function textoDoPrazo(resumo: ResumoDoProjeto): string | null {
	const { diasAtePrazo, projeto } = resumo
	if (diasAtePrazo === null) return null
	if (projeto.status === 'concluido') return 'concluído'
	if (diasAtePrazo === 0) return 'vence hoje'
	if (diasAtePrazo === 1) return 'vence amanhã'
	if (diasAtePrazo < 0) return `atrasado ${Math.abs(diasAtePrazo)} ${Math.abs(diasAtePrazo) === 1 ? 'dia' : 'dias'}`
	return `${diasAtePrazo} dias`
}

/** Texto curto da data de um marco: "12 mar" ou "hoje". */
export function textoDaData(dia?: string | null): string | null {
	if (!dia) return null
	const hoje = chaveDoDia(diaDeHoje())
	const diferenca = diferencaEmDias(dia, hoje)
	if (diferenca === 0) return 'hoje'
	if (diferenca === 1) return 'amanhã'
	if (diferenca === -1) return 'ontem'
	const [, mes, d] = dia.split('-')
	const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
	return `${Number(d)} ${meses[Number(mes) - 1] ?? ''}`.trim()
}

/** Agrupa por urgência, que é como alguém olha uma carteira de projetos. */
export type FaixaDeProjeto = 'atrasados' | 'semana' | 'depois' | 'sem-prazo' | 'concluidos'

export function faixaDoProjeto(resumo: ResumoDoProjeto): FaixaDeProjeto {
	if (resumo.projeto.status === 'concluido') return 'concluidos'
	if (resumo.diasAtePrazo === null) return 'sem-prazo'
	if (resumo.diasAtePrazo < 0) return 'atrasados'
	if (resumo.diasAtePrazo <= 7) return 'semana'
	return 'depois'
}

export const ROTULO_DA_FAIXA: Record<FaixaDeProjeto, string> = {
	atrasados: 'Atrasados',
	semana: 'Esta semana',
	depois: 'Mais adiante',
	'sem-prazo': 'Sem prazo',
	concluidos: 'Concluídos',
}

/* --------------------------------------------------------------------------
   Ordenação e agrupamento (v5)

   A lista tem duas dimensões independentes, e confundi-las faz o usuário
   perder trabalho:

   - `order`   é a posição manual, que ele arrasta e espera que fique;
   - `priority` é o peso do projeto, que ele define no formulário.

   Por isso a ordenação é escolhida, não imposta: "prioridade" ordena pelo peso
   (e usa `order` como desempate), "manual" respeita o arrasto, e as outras
   ordenam por dado objetivo (prazo, atividade, quantidade de tarefas).
   -------------------------------------------------------------------------- */

export type OrdemDeProjetos = 'prazo' | 'prioridade' | 'manual' | 'atividade' | 'tarefas'

export const ROTULO_DA_ORDEM: Record<OrdemDeProjetos, string> = {
	prazo: 'Prazo',
	prioridade: 'Prioridade',
	manual: 'Manual',
	atividade: 'Atividade',
	tarefas: 'Tarefas',
}

/** Ordena uma faixa de projetos segundo o critério escolhido. */
export function ordenarResumos(
	resumos: ResumoDoProjeto[],
	ordem: OrdemDeProjetos,
): ResumoDoProjeto[] {
	const copia = [...resumos]

	switch (ordem) {
		case 'prioridade':
			// Prioridade alta primeiro; empate cai na ordem manual, para o
			// arrasto continuar valendo dentro do mesmo peso.
			return copia.sort(
				(a, b) =>
					(b.projeto.priority ?? 0) - (a.projeto.priority ?? 0) ||
					a.projeto.order - b.projeto.order,
			)

		case 'manual':
			return copia.sort((a, b) => a.projeto.order - b.projeto.order)

		case 'atividade':
			// Menos dias sem mexer primeiro. Sem data, vai para o fim.
			return copia.sort((a, b) => {
				const da = a.projeto.updatedAt ?? 0
				const db = b.projeto.updatedAt ?? 0
				return db - da
			})

		case 'tarefas':
			// Mais abertas primeiro: é a pergunta "onde tem mais trabalho?"
			return copia.sort((a, b) => b.abertas - a.abertas || a.projeto.order - b.projeto.order)

		case 'prazo':
		default:
			// É o padrão da tela: sem prazo no fim, depois por data.
			return copia.sort((a, b) => {
				if (a.diasAtePrazo == null && b.diasAtePrazo == null) {
					return b.projeto.priority! - a.projeto.priority! || a.projeto.order - b.projeto.order
				}
				if (a.diasAtePrazo == null) return 1
				if (b.diasAtePrazo == null) return -1
				return a.diasAtePrazo - b.diasAtePrazo
			})
	}
}
