import type { ComponentType } from 'react'
import {
	IconeCalendario,
	IconeConcluido,
	IconeDescricao,
	IconeFogo,
	IconeGrafico,
	IconeHorario,
	IconePasta,
	IconeRaio,
} from '@/ui/icones'

/**
 * Blocos do Início.
 *
 * O Início não tem seções fixas: o Hyago escolhe o que aparece e em que ordem.
 * Cada bloco é um tipo com sua própria leitura de dados, e a configuração vive
 * em `settings['inicio.blocos']` (array de blocos, na ordem da tela). O bloco
 * de tarefas é o único que interpreta o dia selecionado.
 */
export type TipoBloco =
	| 'resumo'
	| 'tarefas'
	| 'projetos'
	| 'agenda'
	| 'lembretes'
	| 'habitos'
	| 'progresso'
	| 'texto'
	| 'algum-dia'

export interface Bloco {
	/** id local do bloco (permite repetir o mesmo tipo com filtros diferentes) */
	id: string
	tipo: TipoBloco
	/** título próprio; vazio usa o título padrão do tipo */
	titulo?: string
	/** filtro opcional: só tarefas de uma lista */
	projetoId?: string | null
	/** filtro opcional: quantos itens mostrar (0 = todos) */
	limite?: number
	/** texto livre (bloco 'texto') */
	texto?: string
}

export interface DefinicaoBloco {
	tipo: TipoBloco
	nome: string
	descricao: string
	icone: ComponentType<{ size?: number | string }>
	tituloPadrao: string
}

export const BLOCOS: DefinicaoBloco[] = [
	{
		tipo: 'resumo',
		nome: 'Resumo do dia',
		descricao: 'Quantas tarefas faltam e como está o dia',
		icone: IconeRaio,
		tituloPadrao: 'Resumo',
	},
	{
		tipo: 'tarefas',
		nome: 'Tarefas do dia',
		descricao: 'O que fazer hoje, com atrasadas e concluídas',
		icone: IconeConcluido,
		tituloPadrao: 'Hoje',
	},
	{
		tipo: 'habitos',
		nome: 'Hábitos',
		descricao: 'Marcar os hábitos do dia direto no Início',
		icone: IconeFogo,
		tituloPadrao: 'Hábitos',
	},
	{
		tipo: 'agenda',
		nome: 'Agenda',
		descricao: 'Compromissos de hoje',
		icone: IconeCalendario,
		tituloPadrao: 'Agenda',
	},
	{
		tipo: 'projetos',
		nome: 'Listas',
		descricao: 'Suas listas de tarefas',
		icone: IconePasta,
		tituloPadrao: 'Listas',
	},
	{
		tipo: 'lembretes',
		nome: 'Lembretes',
		descricao: 'Avisos curtos, com ou sem data',
		icone: IconeHorario,
		tituloPadrao: 'Lembretes',
	},
	{
		tipo: 'progresso',
		nome: 'Progresso',
		descricao: 'Concluídas na semana e sequência',
		icone: IconeGrafico,
		tituloPadrao: 'Progresso',
	},
	{
		tipo: 'algum-dia',
		nome: 'Algum dia',
		descricao: 'Ideias sem data, sem cobrança',
		icone: IconeCalendario,
		tituloPadrao: 'Algum dia',
	},
	{
		tipo: 'texto',
		nome: 'Texto livre',
		descricao: 'Um quadro de recados e informações',
		icone: IconeDescricao,
		tituloPadrao: 'Recados',
	},
]

export function definicao(tipo: TipoBloco): DefinicaoBloco {
	return BLOCOS.find((b) => b.tipo === tipo) ?? BLOCOS[0]!
}

/** Configuração inicial: o mínimo útil, na ordem que faz sentido no dia. */
export const BLOCOS_PADRAO: Bloco[] = [
	{ id: 'b-resumo', tipo: 'resumo' },
	{ id: 'b-tarefas', tipo: 'tarefas', limite: 0 },
	{ id: 'b-habitos', tipo: 'habitos' },
	{ id: 'b-agenda', tipo: 'agenda' },
]

export function novIdBloco(): string {
	return `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
