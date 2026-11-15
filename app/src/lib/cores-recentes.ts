import { getSetting, setSetting } from '@/db/repo'
import { LIMITE_RECENTES, normalizarHex } from '@/ui/paleta'

/**
 * As últimas cores escolhidas à mão.
 *
 * Ficam em `settings` (e não na memória do componente) por dois motivos: o
 * usuário espera encontrá-las amanhã, e elas viajam no backup junto com as
 * preferências visuais — sem isso, trocar de aparelho apagava o histórico.
 *
 * A chave é `paleta.recentes`; a lista é ordenada do mais recente para o mais
 * antigo e não tem repetidos.
 */
const CHAVE = 'paleta.recentes'

export async function lerRecentes(): Promise<string[]> {
	const salvas = await getSetting<unknown>(CHAVE, [])
	if (!Array.isArray(salvas)) return []

	return salvas
		.filter((valor): valor is string => typeof valor === 'string')
		.map((valor) => normalizarHex(valor))
		.filter((valor): valor is string => valor !== null)
		.slice(0, LIMITE_RECENTES)
}

/**
 * Guarda uma cor no topo da lista.
 *
 * Reinserir uma cor que já estava lá a move para o topo — é o comportamento de
 * "recentes" de qualquer app: o que acabou de ser usado é o mais provável.
 */
export async function registrarCorRecente(hex: string): Promise<string[]> {
	const normalizada = normalizarHex(hex)
	if (!normalizada) return lerRecentes()

	const atuais = await lerRecentes()
	const proxima = [normalizada, ...atuais.filter((cor) => cor !== normalizada)].slice(0, LIMITE_RECENTES)
	await setSetting(CHAVE, proxima)
	return proxima
}

export async function limparRecentes(): Promise<void> {
	await setSetting(CHAVE, [])
}
