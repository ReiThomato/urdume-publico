import type { ReactNode } from 'react'
import {
	IconeAdicionar,
	IconeEvento,
	IconeFogo,
	IconeHorario,
	IconePasta,
} from '@/ui/icones'

/**
 * As opções do menu de criação, e a ordem escolhida pelo usuário.
 *
 * Antes a ordem era fixa no arquivo: tarefa, evento, hábito, lembrete, lista.
 * Quem cria lembrete todo dia três vezes por dia abria a folha e descia a cada
 * vez. Aqui cada opção tem uma chave estável (que vai para
 * `settings`) e a ordem é lida de lá — sem tocar no banco do usuário.
 *
 * O que é salvo são as CHAVES, não os índices: renomear ou reordenar o catálogo
 * no código não invalida a escolha dele. Chave desconhecida no banco é
 * descartada em silêncio, e o que faltar entra no fim na ordem padrão.
 */

export type TipoDeCriacao = 'tarefa' | 'evento' | 'habito' | 'lembrete' | 'lista'

export interface OpcaoDeCriacao {
	id: TipoDeCriacao
	titulo: string
	descricao: string
	icone: (props: { size?: number | string }) => ReactNode
}

export const OPCOES_DE_CRIACAO: OpcaoDeCriacao[] = [
	{
		id: 'tarefa',
		titulo: 'Tarefa',
		descricao: 'Para hoje, com dia e hora',
		icone: IconeAdicionar,
	},
	{
		id: 'evento',
		titulo: 'Evento',
		descricao: 'Compromisso com hora e duração',
		icone: IconeEvento,
	},
	{
		id: 'habito',
		titulo: 'Hábito',
		descricao: 'Algo que se repete e tem sequência',
		icone: IconeFogo,
	},
	{
		id: 'lembrete',
		titulo: 'Lembrete',
		descricao: 'Um aviso curto, com ou sem hora',
		icone: IconeHorario,
	},
	{
		id: 'lista',
		titulo: 'Projeto',
		// A chave continua `lista` porque ela é o contrato com a ordem salva
		// em `settings['criacao.ordem']`; trocá-la devolveria a ordem do menu
		// ao padrão sem avisar. O que o usuário lê é o novo nome.
		descricao: 'Reúne tarefas, prazos, marcos e anotações',
		icone: IconePasta,
	},
]

/** Chave em `settings`. */
export const CHAVE_DA_ORDEM_DE_CRIACAO = 'criacao.ordem'

/** A ordem padrão, como o catálogo está escrito. */
export const ORDEM_PADRAO: TipoDeCriacao[] = OPCOES_DE_CRIACAO.map((opcao) => opcao.id)

/**
 * Resolve a ordem salva em uma lista de opções pronta para renderizar.
 *
 * Toda entrada passa por aqui, inclusive a do banco. Uma ordem antiga, com
 * chave que não existe mais, não pode esconder uma opção nem quebrar a folha.
 */
export function ordenarOpcoes(valor: unknown): OpcaoDeCriacao[] {
	const conhecidas = new Set(OPCOES_DE_CRIACAO.map((opcao) => opcao.id))
	const pedidas: TipoDeCriacao[] = []

	if (Array.isArray(valor)) {
		for (const item of valor) {
			if (typeof item !== 'string') continue
			if (!conhecidas.has(item as TipoDeCriacao)) continue
			if (pedidas.includes(item as TipoDeCriacao)) continue
			pedidas.push(item as TipoDeCriacao)
		}
	}

	// O que não estava na ordem salva entra no fim, na ordem do catálogo.
	const faltando = ORDEM_PADRAO.filter((id) => !pedidas.includes(id))
	const final = [...pedidas, ...faltando]

	return final
		.map((id) => OPCOES_DE_CRIACAO.find((opcao) => opcao.id === id))
		.filter((opcao): opcao is OpcaoDeCriacao => Boolean(opcao))
}

/**
 * Move uma opção uma posição, devolvendo a nova lista de ids.
 *
 * Usado pelos botões ↑/↓ da folha "Ordenar". Trocar vizinhos é o gesto certo
 * aqui: arrastar um item de 88 px num celular, dentro de uma folha que rola, é
 * impreciso e disputa com o gesto de fechar.
 */
export function moverOpcao(
	ordem: TipoDeCriacao[],
	id: TipoDeCriacao,
	direcao: -1 | 1,
): TipoDeCriacao[] {
	const indice = ordem.indexOf(id)
	if (indice < 0) return ordem
	const destino = indice + direcao
	if (destino < 0 || destino >= ordem.length) return ordem

	const copia = [...ordem]
	const [item] = copia.splice(indice, 1)
	if (item) copia.splice(destino, 0, item)
	return copia
}
