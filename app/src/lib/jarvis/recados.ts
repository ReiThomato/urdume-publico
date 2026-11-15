import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { gravarMemoria } from './estado'
import type { AcaoDaIA } from './ia'
import { lerMemoria } from './motor'

/**
 * Fila de recados da ilha.
 *
 * A ilha flutuante mostra o que o Jarvis tem a dizer. Esta fila é o que
 * sobrevive entre leituras: o painel do dia tem ciclo de vida próprio
 * (cooldown, orçamento de atenção) e, sem uma cópia, o recado sumia da tela na
 * releitura seguinte — sem o usuário ter tocado em nada.
 *
 * A fila guarda o TEXTO e as AÇÕES propostas. Ela não decide nada: quem
 * escolhe o que entra aqui é a tela do Jarvis, e quem consome é a ilha.
 */

export interface SugestaoPensada {
	em: number
	/** Chave do sinal de origem. */
	sinal: string
	titulo: string
	mensagem: string
	/** Nível do sinal, para a ilha escolher a cor e o ícone. */
	nivel: 'informativo' | 'oportunidade' | 'atencao' | 'urgente'
	acoes: AcaoDaIA[]
}

/**
 * Quantos recados ficam esperando.
 *
 * Se o app não é aberto por uma semana, não faz sentido despejar 42 cartões na
 * primeira abertura. Os 8 mais recentes bastam.
 */
export const LIMITE_DA_FILA = 8

export const CHAVE_FILA = 'ilha:fila'

function chaveDoRecado(sugestao: SugestaoPensada): string {
	return `${sugestao.em}:${sugestao.sinal}`
}

/** Acrescenta um recado à fila, sem duplicar. */
export async function enfileirarRecado(
	sugestao: SugestaoPensada,
	database: NexoDatabase = db,
): Promise<SugestaoPensada[]> {
	const atual = await lerMemoria<SugestaoPensada[]>(CHAVE_FILA, [], database)
	const id = chaveDoRecado(sugestao)

	if (atual.some((recado) => chaveDoRecado(recado) === id)) return atual

	const proxima = [...atual, sugestao].slice(-LIMITE_DA_FILA)
	await gravarMemoria(CHAVE_FILA, proxima, database)
	return proxima
}

/** Fila pendente, do mais antigo para o mais novo. */
export async function lerFilaDeRecados(database: NexoDatabase = db): Promise<SugestaoPensada[]> {
	const fila = await lerMemoria<SugestaoPensada[]>(CHAVE_FILA, [], database)
	return Array.isArray(fila) ? fila : []
}

/** Remove um recado já mostrado ou descartado. */
export async function consumirRecado(
	id: string,
	database: NexoDatabase = db,
): Promise<SugestaoPensada[]> {
	const atual = await lerFilaDeRecados(database)
	const proxima = atual.filter((recado) => chaveDoRecado(recado) !== id)
	await gravarMemoria(CHAVE_FILA, proxima, database)
	return proxima
}

/** Identificador estável de um recado, para a tela controlar a animação. */
export function idDoRecado(sugestao: SugestaoPensada): string {
	return chaveDoRecado(sugestao)
}
