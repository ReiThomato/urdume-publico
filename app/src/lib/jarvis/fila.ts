import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { createId } from '@/db/id'
import { gravarMemoria, lerMemoria } from './estado'

/**
 * Fila do que não pôde ser feito por falta de internet.
 *
 * A pergunta original era "ela se auto-professa para agir quando a internet
 * voltar?". A resposta honesta: ela **não aprende sozinha**, e isso é
 * deliberado — um sistema que decide sozinho o que "aprender" é o caminho mais
 * curto para alucinação virar regra. O que existe é mais modesto e mais útil:
 *
 * - a pergunta ou a análise que falhou fica **guardada**, com o contexto do
 *   momento (o retrato);
 * - quando há rede de novo e o app abre, a fila é **oferecida** ao usuário —
 *   não executada em silêncio;
 * - ao ser aceita, a IA responde com o contexto ANTIGO e diz que é antigo.
 *
 * Isso evita o pior dos dois mundos: perder o pedido (o que irrita) ou agir
 * horas depois com dados velhos sem avisar (o que engana).
 */

export interface PedidoNaFila {
	id: string
	criadoEm: number
	/** O que o usuário pediu, ou o motivo da análise automática. */
	pedido: string
	/** Contexto congelado no momento da falha. */
	retratoEm: number
	dia: string
	origem: 'usuario' | 'analise'
	/** Última tentativa, para não insistir em loop. */
	tentativas: number
}

const CHAVE = 'fila.ia'
export const LIMITE_FILA = 10

export async function listarFila(database: NexoDatabase = db): Promise<PedidoNaFila[]> {
	const fila = await lerMemoria<PedidoNaFila[]>(CHAVE, [], database)
	return fila.sort((a, b) => a.criadoEm - b.criadoEm)
}

export async function enfileirar(
	pedido: string,
	dados: { dia: string; retratoEm: number; origem: PedidoNaFila['origem'] },
	database: NexoDatabase = db,
): Promise<PedidoNaFila | null> {
	const texto = pedido.trim()
	if (!texto) return null

	const fila = await lerMemoria<PedidoNaFila[]>(CHAVE, [], database)

	// O mesmo pedido não entra duas vezes enquanto estiver pendente: sem isso,
	// insistir no botão com a rede fora criava dez cópias da mesma pergunta.
	if (fila.some((item) => item.pedido === texto && item.origem === dados.origem)) {
		return null
	}

	if (fila.length >= LIMITE_FILA) {
		// Descarta o mais antigo: a fila é uma ajuda, não um arquivo.
		fila.sort((a, b) => a.criadoEm - b.criadoEm)
		fila.shift()
	}

	const novo: PedidoNaFila = {
		id: createId(),
		criadoEm: Date.now(),
		pedido: texto,
		retratoEm: dados.retratoEm,
		dia: dados.dia,
		origem: dados.origem,
		tentativas: 0,
	}

	await gravarMemoria(CHAVE, [...fila, novo], database)
	return novo
}

export async function removerDaFila(id: string, database: NexoDatabase = db): Promise<void> {
	const fila = await lerMemoria<PedidoNaFila[]>(CHAVE, [], database)
	await gravarMemoria(CHAVE, fila.filter((item) => item.id !== id), database)
}

export async function limparFila(database: NexoDatabase = db): Promise<void> {
	await gravarMemoria(CHAVE, [], database)
}

/**
 * Marca uma tentativa que também falhou.
 *
 * Depois de 3 tentativas o item sai da fila: insistir com a rede instável só
 * gasta bateria e enche o app de aviso de falha.
 */
export async function registrarFalha(id: string, database: NexoDatabase = db): Promise<void> {
	const fila = await lerMemoria<PedidoNaFila[]>(CHAVE, [], database)
	const atualizado = fila
		.map((item) => (item.id === id ? { ...item, tentativas: item.tentativas + 1 } : item))
		.filter((item) => item.tentativas < 3)

	await gravarMemoria(CHAVE, atualizado, database)
}

/** A idade do contexto congelado, para a resposta ser honesta. */
export function idadeDoContexto(item: PedidoNaFila, agora = Date.now()): string {
	const horas = Math.floor((agora - item.retratoEm) / 3_600_000)
	if (horas < 1) return 'de menos de uma hora atrás'
	if (horas < 24) return `de ${horas} h atrás`
	const dias = Math.floor(horas / 24)
	return dias === 1 ? 'de ontem' : `de ${dias} dias atrás`
}
