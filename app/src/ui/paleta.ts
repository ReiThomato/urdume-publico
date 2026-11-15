/**
 * Paleta de listas, hábitos e eventos — e cor livre.
 *
 * ## As duas formas de cor
 *
 * 1. **Índice** (0..23) — a paleta fixa. É o que os registros antigos guardam,
 *    e continua válido: a cor é determinística e legível em qualquer tema. Os
 *    doze primeiros índices NUNCA mudam de valor; os novos entram no fim.
 * 2. **Hex** (`#RRGGBB`) — escolhido pelo usuário. Existe porque a paleta de
 *    doze cores acaba: com mais de doze projetos, dois ficam iguais e a cor
 *    deixa de identificar.
 *
 * ## Por que a paleta cresceu
 *
 * A lista antiga tinha doze cores, todas cromáticas e todas de saturação alta.
 * Faltavam justamente as que servem para identificar sem competir: preto,
 * cinza, gesso, bege. E faltavam famílias inteiras (laranja, ciano, menta,
 * vinho). São 24 agora, em oito famílias de matiz mais os neutros.
 *
 * ## Por que não virou "só hex"
 *
 * Trocar tudo por hex obrigaria a migrar cada registro e cada tela que lê
 * `cor`, e o índice continua tendo uma vantagem real: ele é **determinístico
 * pelo id**, então um projeto sem cor escolhida nunca fica sem tom. As duas
 * formas convivem, e quem lê usa `corDe` — não precisa saber qual é.
 */

export interface CorPaleta {
	indice: number
	nome: string
	rotulo: string
	/** Tom base. Saturado o bastante para aparecer sobre qualquer superfície. */
	hex: string
}

export const PALETA: CorPaleta[] = [
	// --- as doze originais: valores congelados, registros antigos dependem deles
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

	// --- os doze novos (a partir daqui a ordem pode crescer)
	{ indice: 12, nome: 'laranja', rotulo: 'Laranja', hex: '#ef8b2f' },
	{ indice: 13, nome: 'lima', rotulo: 'Lima', hex: '#8fbc32' },
	{ indice: 14, nome: 'menta', rotulo: 'Menta', hex: '#3fae90' },
	{ indice: 15, nome: 'ciano', rotulo: 'Ciano', hex: '#2f9cc4' },
	{ indice: 16, nome: 'oceano', rotulo: 'Oceano', hex: '#2f6f96' },
	{ indice: 17, nome: 'lavanda', rotulo: 'Lavanda', hex: '#9a86cc' },
	{ indice: 18, nome: 'magenta', rotulo: 'Magenta', hex: '#bd4f92' },
	{ indice: 19, nome: 'salmao', rotulo: 'Salmão', hex: '#e07c5f' },
	{ indice: 20, nome: 'floresta', rotulo: 'Floresta', hex: '#35704c' },
	{ indice: 21, nome: 'vinho', rotulo: 'Vinho', hex: '#8b3a4e' },
	{ indice: 22, nome: 'gesso', rotulo: 'Gesso', hex: '#ded6c6' },
	{ indice: 23, nome: 'carvao', rotulo: 'Carvão', hex: '#3d3a37' },
]

/** Hex de seis dígitos, com ou sem `#`. */
export function ehHex(valor: unknown): valor is string {
	return typeof valor === 'string' && /^#?[0-9a-f]{6}$/i.test(valor.trim())
}

/** Normaliza para `#rrggbb` minúsculo; devolve `null` se não for hex. */
export function normalizarHex(valor: string): string | null {
	if (!ehHex(valor)) return null
	const limpo = valor.trim().replace('#', '').toLowerCase()
	return `#${limpo}`
}

export function corDoIndice(indice: number | null | undefined): CorPaleta {
	const i = typeof indice === 'number' && Number.isFinite(indice) ? indice : 0
	return PALETA[((i % PALETA.length) + PALETA.length) % PALETA.length]!
}

/** Escolha determinística pelo id: o mesmo projeto tem sempre a mesma cor. */
export function indicePorId(id: string | null | undefined): number {
	if (!id) return 11
	let soma = 0
	for (let i = 0; i < id.length; i++) soma = (soma * 31 + id.charCodeAt(i)) % 100000
	return soma % PALETA.length
}

/**
 * Resolve QUALQUER cor guardada em um tom concreto.
 *
 * Aceita número, string numérica (registros antigos), hex e vazio. Devolve
 * sempre `{ hex, rotulo }` — quem desenha não precisa saber a forma de origem.
 */
export function corDe(valor: string | number | null | undefined, idParaDerivar?: string | null): CorPaleta {
	if (typeof valor === 'number' && Number.isFinite(valor)) return corDoIndice(valor)

	if (typeof valor === 'string') {
		const texto = valor.trim()
		if (texto) {
			const hex = normalizarHex(texto)
			if (hex) return { indice: -1, nome: 'personalizada', rotulo: 'Personalizada', hex }

			const numero = Number(texto)
			if (Number.isFinite(numero)) return corDoIndice(numero)
		}
	}

	return corDoIndice(indicePorId(idParaDerivar))
}

/** Canais linearizados da WCAG, a partir de um hex normalizado. */
function luminanciaDe(hex: string): number {
	const canal = (i: number): number => {
		const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

/**
 * A cor é clara o bastante para precisar de texto escuro por cima?
 *
 * Mantido para quem só precisa de um sinal binário (ex.: escolher a variante
 * de um gráfico). Para TEXTO, use `tintaSobre`, que decide por contraste real.
 */
export function ehCorClara(hex: string): boolean {
	const normalizado = normalizarHex(hex)
	if (!normalizado) return false
	return luminanciaDe(normalizado) > 0.5
}

/**
 * Contraste WCAG entre dois hex (1 a 21).
 *
 * Existe aqui para o resolvedor de cor poder provar o que promete: cada cor da
 * paleta tem de alcançar 4,5:1 com a tinta que recebe.
 */
export function contrasteEntre(a: string, b: string): number {
	const na = normalizarHex(a)
	const nb = normalizarHex(b)
	if (!na || !nb) return 1
	const la = luminanciaDe(na)
	const lb = luminanciaDe(nb)
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Tinta que se lê sobre uma cor de fundo arbitrária.
 *
 * `ehCorClara` responde "esta cor é clara?" por um limiar de luminância, e o
 * limiar erra justamente no meio da escala: o âmbar `#e0a02a` tem luminância
 * 0,41, então recebia texto branco — 2,3:1, ilegível. Aqui a decisão é a
 * única que importa: qual das duas tintas contrasta mais com o fundo.
 *
 * A tinta escura é `#1c1b1f`, não preto puro: preto sobre cor média é duro de
 * ler, e a diferença de contraste é pequena.
 */
export function tintaSobre(hex: string): string {
	const normalizado = normalizarHex(hex)
	if (!normalizado) return '#ffffff'

	const luminancia = luminanciaDe(normalizado)
	const comBranco = 1.05 / (luminancia + 0.05)
	const comPreto = (luminancia + 0.05) / 0.05
	return comPreto >= comBranco ? '#1c1b1f' : '#ffffff'
}

/**
 * Mistura dois hex em sRGB, com o MESMO caminho do `color-mix(in srgb, …)`:
 * interpolação simples de canal, no espaço gamma.
 *
 * Serve para o React publicar a cor EFETIVA de um fundo que o CSS escurece
 * (a faixa do cartão de projeto é a categoria a 55% sobre quase-preto) e assim
 * escolher a tinta do texto pela cor que de fato aparece — não pela cor pura.
 */
export function misturar(topo: string, base: string, pesoTopo: number): string {
	const a = normalizarHex(topo)
	const b = normalizarHex(base)
	if (!a || !b) return a ?? b ?? '#000000'
	const peso = Math.min(Math.max(pesoTopo, 0), 1)

	const canal = (i: number): number =>
		Math.round(
			Number.parseInt(a.slice(i, i + 2), 16) * peso +
				Number.parseInt(b.slice(i, i + 2), 16) * (1 - peso),
		)

	return `#${[1, 3, 5].map((i) => canal(i).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Últimas cores escolhidas à mão, guardadas para reuso rápido.
 *
 * Quatro é o número pedido e também o que cabe numa linha sem rolar.
 */
export const LIMITE_RECENTES = 4
