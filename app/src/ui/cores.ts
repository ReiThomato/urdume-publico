import type { CSSProperties } from 'react'
import { corDoIndice, indicePorId } from '@/ui/paleta'
import type { CorPaleta } from '@/ui/paleta'

/**
 * Cor por lista (projeto).
 *
 * Usa primeiro a cor ESCOLHIDA no projeto; sem escolha, deriva do id para o
 * mesmo projeto ter sempre o mesmo tom. A cor nunca é o único sinal: ela vem
 * junto do nome da lista e do ícone, para quem não distingue cores.
 */
export interface CorCategoria extends CorPaleta {
	/** Variável CSS com o tom, para usar em `border-color`/`color`. */
	variavel: string
}

function montar(indice: number): CorCategoria {
	const cor = corDoIndice(indice)
	return {
		...cor,
		// Nome antigo mantido porque várias telas usam `cor.bg` como token.
		nome: cor.nome,
		variavel: 'var(--cor-cat)',
	}
}

export function corDoProjeto(id: string | null | undefined, escolhida?: string | number | null): CorCategoria {
	if (typeof escolhida === 'number') return montar(escolhida)
	if (typeof escolhida === 'string' && escolhida.trim()) {
		// Guardamos o índice como string em registros antigos; se for hex, procura.
		const numero = Number(escolhida)
		if (Number.isFinite(numero)) return montar(numero)
		const achada = corDoIndice(0)
		if (/^#[0-9a-f]{6}$/i.test(escolhida)) {
			return { ...achada, hex: escolhida, nome: 'projeto', variavel: 'var(--cor-cat)' }
		}
	}
	return montar(indicePorId(id))
}

/** Estilo inline que publica o tom para o CSS do elemento e dos filhos. */
export function estiloCor(indice: number | string | null | undefined): CSSProperties {
	const numero = typeof indice === 'string' ? Number(indice) : indice
	return { ['--cor-cat' as string]: corDoIndice(Number.isFinite(numero as number) ? (numero as number) : 0).hex }
}
