import { useMemo } from 'react'
import type { Bloco } from '@/app/blocos'
import { BLOCOS_PADRAO } from '@/app/blocos'
import { useSetting } from '@/db/repo'

/**
 * Lista de blocos do Início, na ordem da tela.
 *
 * Fica separado do editor para as telas poderem ler a configuração sem carregar
 * o formulário. `undefined` = ainda lendo; `null` no storage = nunca editado
 * (usa o padrão).
 */
export function useBlocos(): Bloco[] | undefined {
	const valor = useSetting<Bloco[] | null>('inicio.blocos', null)

	// O padrão vive em `blocos.ts` para não existirem duas listas diferentes —
	// antes o Início desenhava uma e o editor mostrava outra.
	const padrao = useMemo<Bloco[]>(() => BLOCOS_PADRAO, [])

	if (valor === undefined) return undefined
	if (!valor) return padrao
	return valor
}
