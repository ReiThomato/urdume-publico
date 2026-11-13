/**
 * Paleta de listas, hábitos e eventos.
 *
 * Cor única por categoria, como no Grit: cada lista tem um tom fixo e o item
 * herda esse tom no ícone, no chip e na barra. O tom é aplicado por
 * `color-mix` sobre a superfície do tema, então a MESMA cor funciona no claro e
 * no escuro sem uma segunda tabela de exceções — e nunca fica ilegível, porque
 * o texto é misturado com a cor de tinta do tema.
 */
export interface CorPaleta {
	indice: number
	nome: string
	rotulo: string
	/** Tom base. Saturado o bastante para aparecer sobre qualquer superfície. */
	hex: string
}

export const PALETA: CorPaleta[] = [
	{ indice: 0, nome: 'coral', rotulo: 'Coral', hex: '#e8623f' },
	{ indice: 1, nome: 'ambar', rotulo: 'Âmbar', hex: '#e0a02a' },
	{ indice: 2, nome: 'oliva', rotulo: 'Oliva', hex: '#7d9a3f' },
	{ indice: 3, nome: 'esmeralda', rotulo: 'Esmeralda', hex: '#3a9d7d' },
	{ indice: 4, nome: 'turquesa', rotulo: 'Turquesa', hex: '#3299a8' },
	{ indice: 5, nome: 'azul', rotulo: 'Azul', hex: '#4878c8' },
	{ indice: 6, nome: 'indigo', rotulo: 'Índigo', hex: '#5f63c4' },
	{ indice: 7, nome: 'violeta', rotulo: 'Violeta', hex: '#8a5cc4' },
	{ indice: 8, nome: 'rosa', rotulo: 'Rosa', hex: '#bf5588' },
	{ indice: 9, nome: 'vermelho', rotulo: 'Vermelho', hex: '#c74a4a' },
	{ indice: 10, nome: 'marrom', rotulo: 'Marrom', hex: '#9a6a4e' },
	{ indice: 11, nome: 'pedra', rotulo: 'Pedra', hex: '#7b7a76' },
]

export function corDoIndice(indice: number | null | undefined): CorPaleta {
	const i = typeof indice === 'number' && Number.isFinite(indice) ? indice : 0
	return PALETA[((i % PALETA.length) + PALETA.length) % PALETA.length]!
}

export function nomeDoIndice(indice: number | null | undefined): string {
	return corDoIndice(indice).nome
}

export function rotuloDoIndice(indice: number | null | undefined): string {
	return corDoIndice(indice).rotulo
}

/** Escolha determinística pelo id: o mesmo projeto tem sempre a mesma cor. */
export function indicePorId(id: string | null | undefined): number {
	if (!id) return 11
	let soma = 0
	for (let i = 0; i < id.length; i++) soma = (soma * 31 + id.charCodeAt(i)) % 100000
	return soma % PALETA.length
}

/** Propriedades inline que pintam um elemento com o tom da paleta. */
export function estiloDaCor(indice: number | null | undefined): React.CSSProperties {
	return { ['--cor-cat' as string]: corDoIndice(indice).hex }
}
