import { Capacitor } from '@capacitor/core'
import type { Retrato } from './retrato'

/**
 * Ponte "retrato + plano" para o segundo plano.
 *
 * O runner do Android roda fora do WebView e **não enxerga o IndexedDB**
 * (auditoria 21, seção 0). A solução não é duplicar o banco: é gravar um JSON
 * pequeno num armazenamento chave-valor que os dois lados acessam.
 *
 * Aqui usamos `@capacitor/preferences`, que no Android grava em
 * `SharedPreferences`. O runner lê a mesma chave via `CapacitorKV`.
 *
 * **O grupo é o elo que liga os dois.** Sem ele, o contrato não funciona e a
 * falha é silenciosa:
 *
 * - `@capacitor/preferences` grava por padrão num arquivo chamado
 *   `CapacitorStorage`;
 * - `CapacitorKV` do runner grava num arquivo com o NOME DO `label` do runner
 *   (aqui, `app.urdume.publico.jarvis`).
 *
 * Arquivos diferentes = o runner nunca encontraria o retrato, sem erro nenhum
 * aparecendo. Por isso `GRUPO_DO_RUNNER` é usado nas DUAS pontas: aqui, no
 * `group` do Preferences, e no `label` do `BackgroundRunner` em
 * `capacitor.config.ts`. Trocar um sem o outro quebra a ponte em silêncio —
 * é a primeira coisa a conferir se o resumo das 8h nunca chegar.
 *
 * Se o app estiver rodando como site (sem Capacitor), tudo vira no-op: a
 * versão web não tem segundo plano, mas continua funcionando.
 */

/** Nome do SharedPreferences compartilhado com o runner. Contrato com o label. */
export const GRUPO_DO_RUNNER = 'app.urdume.publico.jarvis'

export const CHAVE_RETRATO = 'jarvis.retrato'
export const CHAVE_PLANO = 'jarvis.plano'
/** Ids que o app agendou na última sincronização, para cancelar só o que saiu. */
export const CHAVE_AGENDA = 'jarvis.agenda'

export interface PlanoDeHoje {
	geradoEm: number
	/** Notificações que o app decidiu que farão sentido hoje. */
	itens: Array<{
		/** Id numérico de 32 bits para o Android. */
		id: number
		/** Epoch ms do disparo. */
		em: number
		titulo: string
		corpo: string
		/** Nível, para o runner decidir se ainda vale a pena. */
		nivel: 'informativo' | 'oportunidade' | 'atencao' | 'urgente'
		/** Chave do sinal, para deduplicar também no runner. */
		chave: string
	}>
	/** Até quando este plano vale. Depois disso, o runner avisa que envelheceu. */
	validoAte: number
}

const ehNativo = (): boolean => Capacitor.isNativePlatform()

/** Gravação best-effort: falhar aqui nunca pode interromper a UI. */
/**
 * O grupo é configurado UMA vez no plugin (a API não aceita `group` por
 * chamada). A promessa fica em cache para não reconfigurar a cada gravação.
 */
let configurado: Promise<void> | null = null

async function comPreferences<T>(acao: (prefs: typeof import('@capacitor/preferences')['Preferences']) => Promise<T>): Promise<T | null> {
	try {
		const { Preferences } = await import('@capacitor/preferences')
		if (!configurado) {
			configurado = Preferences.configure({ group: GRUPO_DO_RUNNER })
		}
		await configurado
		return await acao(Preferences)
	} catch (causa) {
		console.warn('Jarvis: falha ao acessar as preferências do runner.', causa)
		return null
	}
}

async function gravar(chave: string, valor: unknown): Promise<void> {
	if (!ehNativo()) return
	await comPreferences((prefs) => prefs.set({ key: chave, value: JSON.stringify(valor) }))
}

async function ler<T>(chave: string): Promise<T | null> {
	if (!ehNativo()) return null
	const bruto = await comPreferences(async (prefs) => (await prefs.get({ key: chave })).value)
	return bruto ? (JSON.parse(bruto) as T) : null
}

/** A pausa também precisa chegar ao runner, no mesmo grupo. */
export async function gravarPausaParaRunner(pausado: boolean): Promise<void> {
	if (!ehNativo()) return
	await gravar('jarvis.config', { pausado })
}

export async function gravarRetrato(retrato: Retrato): Promise<void> {
	await gravar(CHAVE_RETRATO, retrato)
}

export async function lerRetratoGravado(): Promise<Retrato | null> {
	return ler<Retrato>(CHAVE_RETRATO)
}

export async function gravarPlano(plano: PlanoDeHoje): Promise<void> {
	await gravar(CHAVE_PLANO, plano)
}

export async function lerPlano(): Promise<PlanoDeHoje | null> {
	return ler<PlanoDeHoje>(CHAVE_PLANO)
}

/**
 * Ids da agenda agendados na última sincronização.
 *
 * Guardar a lista é o que permite cancelar exatamente o que saiu do plano —
 * uma tarefa concluída, um prazo adiantado — sem tocar nos avisos que
 * continuam válidos. Sem isso, a única opção seria cancelar tudo a cada
 * sincronização, que é justamente o que fazia o aviso de uma tarefa de amanhã
 * desaparecer quando o app reabria hoje.
 */
export async function gravarIdsDaAgenda(ids: number[]): Promise<void> {
	await gravar(CHAVE_AGENDA, ids)
}

export async function lerIdsDaAgenda(): Promise<number[]> {
	return (await ler<number[]>(CHAVE_AGENDA)) ?? []
}

/**
 * Batimento do runner.
 *
 * No Android, `BackgroundRunner` e `Preferences` podem apontar para o MESMO
 * arquivo de SharedPreferences — é o contrato de `GRUPO_DO_RUNNER`. Isso vale
 * nos dois sentidos: o app lê o que o runner escreveu.
 *
 * O runner grava `jarvis.runner.estado` a cada tique. É a única evidência real
 * de que o Android executou o trabalho com o app fechado. Sem isso, "roda em
 * segundo plano" era uma afirmação sobre a documentação, não sobre o aparelho.
 */
export interface BatimentoDoRunner {
	/** Epoch ms do último tique. */
	em: number
	pausado: boolean
	versao: number
}

export async function lerBatimentoDoRunner(): Promise<BatimentoDoRunner | null> {
	const bruto = await ler<BatimentoDoRunner>('jarvis.runner.estado')
	if (!bruto || typeof bruto.em !== 'number') return null
	return bruto
}

/**
 * Id numérico de 32 bits, estável para a mesma chave.
 *
 * As notificações do Android são identificadas por int; reusar o id da mesma
 * chave faz uma notificação substituir a anterior em vez de empilhar duas.
 */
export function idDeNotificacao(chave: string): number {
	let hash = 2166136261
	for (let i = 0; i < chave.length; i++) {
		hash ^= chave.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	// Faixa positiva de 31 bits, como o Android espera.
	return Math.abs(hash) % 2_147_483_647
}
