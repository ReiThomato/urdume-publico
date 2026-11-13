import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { toDayKey } from '@/db/repo'
import { lerPainel } from './motor'
import { lerPreferencias } from './estado'
import type { ModoJarvis } from './relevancia'

/**
 * Resumo do Jarvis para o atalho do Início.
 *
 * Fica fora da tela para o Início não carregar a tela inteira do Jarvis só para
 * ler dois números. Reativo: quando o painel é recalculado, a contagem muda
 * sozinha.
 */
export function useResumoJarvis():
	| { total: number; urgentes: number; modo: ModoJarvis }
	| undefined {
	return useLiveQuery(async () => {
		const dia = toDayKey(new Date())
		const [painel, prefs] = await Promise.all([lerPainel(dia, db), lerPreferencias(db)])
		const abertos = painel?.itens.filter((item) => item.estado === 'novo') ?? []
		return {
			total: abertos.length,
			urgentes: abertos.filter((item) => item.sinal.nivel === 'urgente').length,
			modo: prefs.modo,
		}
	}, [])
}
