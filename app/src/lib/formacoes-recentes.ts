import { getSetting, setSetting } from '@/db/repo'
import type { Deslocamentos, Harmonia, TipoDeRoda } from '@/app/motor-cromatico'

/**
 * Formações de cor recentes.
 *
 * Guarda a FORMAÇÃO — semente + tipo de roda + harmonia + deslocamentos —, e
 * não as cores já calculadas. Um punhado de hex só serve no tema em que foi
 * gerado; a formação é reaplicável no claro, no escuro e no AMOLED, porque o
 * que ela define são ângulos e forças, e os tons saem do `tema.ts`.
 *
 * Fica em `settings` pelo mesmo motivo das cores recentes: o usuário espera
 * encontrá-las amanhã, e elas viajam no backup junto das preferências visuais.
 *
 * O formato é uma string com campos separados por `|`:
 * `#semente|tipo|harmonia|deslocamentoSecundaria|deslocamentoTerciaria`
 */
const CHAVE = 'tema.formacoes'
export const LIMITE_FORMACOES = 4

export interface FormacaoSalva {
	semente: string
	tipo: TipoDeRoda
	harmonia: Harmonia
	deslocamentos: Deslocamentos
}

/** Monta a assinatura estável de uma formação. */
export function assinaturaDaFormacao(formacao: FormacaoSalva): string {
	return [
		formacao.semente.toLowerCase(),
		formacao.tipo,
		formacao.harmonia,
		formacao.deslocamentos?.secundaria ?? '',
		formacao.deslocamentos?.terciaria ?? '',
	].join('|')
}

/** Lê uma assinatura de volta para dados. Valores estranhos são ignorados. */
export function formacaoDaAssinatura(assinatura: string): FormacaoSalva | null {
	const [semente, tipo, harmonia, secundaria, terciaria] = assinatura.split('|')
	if (!semente || !tipo || !harmonia) return null
	return {
		semente,
		tipo: tipo as TipoDeRoda,
		harmonia: harmonia as Harmonia,
		deslocamentos: {
			secundaria: secundaria ? Number(secundaria) : undefined,
			terciaria: terciaria ? Number(terciaria) : undefined,
		},
	}
}

export async function lerFormacoes(): Promise<string[]> {
	const salvas = await getSetting<unknown>(CHAVE, [])
	if (!Array.isArray(salvas)) return []
	return salvas.filter((valor): valor is string => typeof valor === 'string').slice(0, LIMITE_FORMACOES)
}

/**
 * Guarda uma formação no topo.
 *
 * Reaplicar uma formação que já estava na lista a move para o topo — o que
 * acabou de ser usado é o palpite mais útil da próxima vez.
 */
export async function registrarFormacao(assinatura: string): Promise<string[]> {
	const atuais = await lerFormacoes()
	const proxima = [assinatura, ...atuais.filter((item) => item !== assinatura)].slice(0, LIMITE_FORMACOES)
	await setSetting(CHAVE, proxima)
	return proxima
}

export async function limparFormacoes(): Promise<void> {
	await setSetting(CHAVE, [])
}
