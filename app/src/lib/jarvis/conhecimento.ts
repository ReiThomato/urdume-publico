import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { gravarMemoria, lerMemoria } from './estado'
import { createId } from '@/db/id'

/**
 * Conhecimento ensinado pelo usuário.
 *
 * São frases curtas que o Jarvis deve levar em conta: "não marco nada aos
 * domingos", "o cliente do site só responde de manhã", "prefiro tarefa sem
 * hora". Ficam em `aiMemory` com prefixo `fato:`, separadas do diário (que é
 * automático) e das regras (que agem).
 *
 * Três limites, de propósito:
 *
 * 1. **Lista curta.** Máximo de 30 fatos e 240 caracteres cada. Um "manual da
 *    empresa" no prompt quebraria o orçamento de token e afogaria o modelo.
 * 2. **Não vira permissão.** Um fato nunca autoriza ação. "Pode arquivar o que
 *    eu não uso" continua sendo uma sugestão, não uma licença.
 * 3. **O usuário vê e apaga.** É conhecimento dele, não um segredo do modelo.
 */

export interface Fato {
	id: string
	texto: string
	criadoEm: number
}

export const LIMITE_FATOS = 30
export const LIMITE_CARACTERES = 240

export async function listarConhecimento(database: NexoDatabase = db): Promise<Fato[]> {
	const mapa = await lerMemoria<Record<string, Fato>>('fatos', {}, database)
	return Object.values(mapa).sort((a, b) => a.criadoEm - b.criadoEm)
}

export async function textosDeConhecimento(database: NexoDatabase = db): Promise<string[]> {
	return (await listarConhecimento(database)).map((fato) => fato.texto)
}

export async function ensinar(
	texto: string,
	database: NexoDatabase = db,
): Promise<{ ok: boolean; erro: string | null }> {
	const limpo = texto.trim().replace(/\s+/g, ' ')
	if (!limpo) return { ok: false, erro: 'Escreva alguma coisa para eu lembrar.' }
	if (limpo.length > LIMITE_CARACTERES) {
		return { ok: false, erro: `Máximo de ${LIMITE_CARACTERES} caracteres.` }
	}

	const mapa = await lerMemoria<Record<string, Fato>>('fatos', {}, database)
	if (Object.keys(mapa).length >= LIMITE_FATOS) {
		return {
			ok: false,
			erro: `Já são ${LIMITE_FATOS} fatos. Apague um para acrescentar outro.`,
		}
	}

	// Repetição não entra duas vezes: comparar sem caixa e sem acento evita
	// "Não marco domingo" e "nao marco domingo" como coisas distintas.
	const normalizar = (valor: string): string =>
		valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

	if (Object.values(mapa).some((fato) => normalizar(fato.texto) === normalizar(limpo))) {
		return { ok: false, erro: 'Eu já tinha isso anotado.' }
	}

	// `Date.now()` sozinho colide: dois fatos ensinados no mesmo milissegundo
	// (ou 30 num teste) sobrescreviam um ao outro, e o usuário perdia o que
	// tinha acabado de escrever. `createId` tem entropia própria.
	const id = createId()
	mapa[id] = { id, texto: limpo, criadoEm: Date.now() }
	await gravarMemoria('fatos', mapa, database)

	return { ok: true, erro: null }
}

export async function esquecer(id: string, database: NexoDatabase = db): Promise<void> {
	const mapa = await lerMemoria<Record<string, Fato>>('fatos', {}, database)
	delete mapa[id]
	await gravarMemoria('fatos', mapa, database)
}
