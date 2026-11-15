import type { ComponentType } from 'react'
import type { Route } from '@/app/router'
import {
	IconeAjustes,
	IconeCalendario,
	IconeFogo,
	IconeMais,

	IconePainel,
	IconePasta,
	IconeRaio,
	IconeTarefaFeita,
} from '@/ui/icones'

/**
 * Navegação principal.
 *
 * O padrão é o dos aplicativos grandes no celular: **cinco lugares**, sempre na
 * mesma ordem, com o penúltimo abrindo o resto.
 *
 *   Hoje · Tarefas · Projetos · Mais · Ajustes
 *
 * "Hoje", "Mais" e "Ajustes" são FIXOS. Eles são a espinha: o começo do dia, o
 * índice de tudo e a configuração. Os outros dois são escolhidos pelo usuário
 * entre os destinos disponíveis, e o que não cabe vai para "Mais" — nunca
 * desaparece.
 *
 * O usuário pode pôr até 6 itens. O limite não é estético: a barra precisa
 * caber o rótulo de "Projetos" numa tela de 360 dp sem cortar nem encolher a
 * fonte. Acima disso, vira uma fita de ícones ilegíveis.
 *
 * REGRA DE OURO: item fixo e item escolhido têm o MESMO desenho. Se um pode ser
 * reordenado e outro não, a barra não pode denunciar isso no layout — só a
 * tela de personalização diz o que é fixo.
 */

export type IdDeDestino =
	| 'inicio'
	| 'tarefas'
	| 'projetos'
	| 'habitos'
	| 'agenda'
	| 'jarvis'
	| 'ajustes'

export interface Destino {
	id: IdDeDestino
	rotulo: string
	rota: Route
	icone: ComponentType<{ size?: number | string }>
	/** A rota atual pertence a este destino? */
	correspondencia: (rota: Route) => boolean
	/** Não pode sair da barra nem ser reordenado. */
	fixo?: boolean
}

export const DESTINOS: Record<IdDeDestino, Destino> = {
	inicio: {
		id: 'inicio',
		rotulo: 'Hoje',
		rota: { name: 'inicio' },
		icone: IconePainel,
		correspondencia: (rota) => rota.name === 'inicio',
		fixo: true,
	},
	tarefas: {
		id: 'tarefas',
		rotulo: 'Tarefas',
		rota: { name: 'tarefas' },
		icone: IconeTarefaFeita,
		correspondencia: (rota) => rota.name === 'tarefas',
	},
	projetos: {
		id: 'projetos',
		rotulo: 'Projetos',
		rota: { name: 'projetos' },
		icone: IconePasta,
		correspondencia: (rota) => rota.name === 'projetos' || rota.name === 'projeto',
	},
	habitos: {
		id: 'habitos',
		rotulo: 'Hábitos',
		rota: { name: 'habitos' },
		icone: IconeFogo,
		correspondencia: (rota) => rota.name === 'habitos' || rota.name === 'habito',
	},
	agenda: {
		id: 'agenda',
		rotulo: 'Agenda',
		rota: { name: 'calendario' },
		icone: IconeCalendario,
		correspondencia: (rota) => rota.name === 'calendario',
	},
	jarvis: {
		id: 'jarvis',
		rotulo: 'Jarvis',
		rota: { name: 'jarvis' },
		icone: IconeRaio,
		correspondencia: (rota) => rota.name === 'jarvis' || rota.name === 'conversa',
	},
	ajustes: {
		id: 'ajustes',
		rotulo: 'Ajustes',
		rota: { name: 'ajustes' },
		icone: IconeAjustes,
		correspondencia: (rota) => rota.name === 'ajustes' || rota.name.startsWith('ajustes-'),
		fixo: true,
	},
}

/** A entrada "Mais": não é destino, é o índice do resto. */
export const MAIS = {
	id: 'mais' as const,
	rotulo: 'Mais',
	icone: IconeMais,
}

/** Chave em `settings` com a barra escolhida pelo usuário. */
export const CHAVE_DA_BARRA = 'nav.barra'

/**
 * Itens fixos. Eles não podem ser removidos nem substituídos.
 *
 * "Mais" não é um destino de tela: é o índice do que não cabe na barra. Mesmo
 * assim entra na lista de fixos, porque a regra é a mesma: ninguém o tira.
 * Antes ele era OMITIDO quando havia quatro escolhas — a barra ficava sem o
 * acesso ao que sobrou, e o usuário perdia telas.
 */
export const FIXOS: IdDeDestino[] = ['inicio', 'ajustes']
export const MAIS_FIXO = true

/** Máximo de itens na barra (o padrão são 5; 6 é o teto). */
export const MAXIMO_NA_BARRA = 6

/**
 * Vagas para destinos escolhidos.
 *
 * A barra tem sempre três lugares fixos: Hoje, Mais e Ajustes. No padrão de 5
 * sobram 2 vagas; no teto de 6 sobram 3. Nada substitui um fixo.
 */
export const VAGAS_ESCOLHIVEIS = 3
export const VAGAS_PADRAO = 2

/** A barra padrão: cinco lugares. Hábitos, Agenda, Páginas e Jarvis em "Mais". */
export const BARRA_PADRAO: IdDeDestino[] = ['inicio', 'tarefas', 'projetos', 'ajustes']

/**
 * Lê a escolha do usuário e devolve uma barra válida.
 *
 * Tudo passa por aqui, inclusive o que veio do banco: uma lista antiga, editada
 * à mão ou com id desconhecido não pode deixar a barra sem "Hoje" nem com oito
 * itens. O que não faz sentido é descartado em silêncio — a barra sempre abre.
 */
export function normalizarBarra(valor: unknown): IdDeDestino[] {
	const escolhidos: IdDeDestino[] = []
	const vistos = new Set<string>()

	if (Array.isArray(valor)) {
		for (const item of valor) {
			if (typeof item !== 'string') continue
			if (!(item in DESTINOS)) continue
			if (FIXOS.includes(item as IdDeDestino)) continue
			if (vistos.has(item)) continue
			escolhidos.push(item as IdDeDestino)
			vistos.add(item)
		}
	}

	// Sem escolha registrada, o padrão é a barra padrão.
	if (escolhidos.length === 0) return [...BARRA_PADRAO]

	// O teto é 6 com os três fixos: três escolhidos no máximo.
	return ['inicio', ...escolhidos.slice(0, VAGAS_ESCOLHIVEIS), 'ajustes']
}

/** Barra atual do usuário, já normalizada (inclui os fixos nas pontas). */
export function barraAtual(valor: unknown): IdDeDestino[] {
	return normalizarBarra(valor)
}

/**
 * A barra completa, na ordem final: Hoje, escolhidos, "Mais", Ajustes.
 *
 * Devolve também o que sobra para a folha "Mais": todo destino que não está na
 * barra. A folha inclui ainda a conversa do Jarvis como atalho próprio, porque
 * ela é uma tela e não um destino com lugar na barra.
 */
export function montarBarra(escolhidos: IdDeDestino[]): {
	barra: Array<Destino | typeof MAIS>
	restantes: Destino[]
} {
	const naBarra = new Set(escolhidos)
	const meio = escolhidos.filter((id) => !FIXOS.includes(id))

	/*
	 * O "Mais" fica SEMPRE na barra, na penúltima posição.
	 *
	 * Já houve aqui uma regra que o removia quando havia escolhas demais para
	 * "fazer caber". O efeito era o oposto do pedido: a barra perdia o único
	 * acesso ao que não estava nela. Fixo é fixo; o que cede é o número de
	 * escolhidos, não o índice.
	 */
	const barra: Array<Destino | typeof MAIS> = [
		DESTINOS.inicio,
		...meio.map((id) => DESTINOS[id]).filter(Boolean),
		MAIS,
		DESTINOS.ajustes,
	]

	const restantes = Object.values(DESTINOS)
		.filter((destino) => !FIXOS.includes(destino.id) && !naBarra.has(destino.id))
		.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

	return { barra, restantes }
}
