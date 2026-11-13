import {
	Hct,
	SchemeContent,
	SchemeExpressive,
	SchemeFidelity,
	SchemeFruitSalad,
	SchemeMonochrome,
	SchemeNeutral,
	SchemeRainbow,
	SchemeTonalSpot,
	SchemeVibrant,
	TonalPalette,
} from '@material/material-color-utilities'
import type { DynamicScheme } from '@material/material-color-utilities'
import { useEffect, useMemo, useState } from 'react'
import { setSetting, useSetting } from '@/db/repo'

/**
 * Tema do app — mesma engenharia do Grit.
 *
 * A paleta inteira (superfícies, containers, texto, contorno, erro) é derivada
 * de UMA cor-semente com o algoritmo Material 3. Trocar a semente muda o produto
 * inteiro de forma coerente; nada de cores soltas escolhidas à mão que brigam
 * entre si. O modo claro/escuro é um esquema diferente da mesma semente, não uma
 * lista de exceções.
 */
export type ModoTema = 'system' | 'light' | 'dark'

export type EstiloPaleta =
	| 'tonal'
	| 'neutro'
	| 'vibrante'
	| 'expressivo'
	| 'arco-iris'
	| 'frutas'
	| 'monocromatico'
	| 'fidelidade'
	| 'conteudo'

export type FonteApp = 'figtree' | 'archivo' | 'inter' | 'manrope' | 'sistema'

/**
 * Tema do quadro (tldraw). Independente do tema do app: dá para manter o app
 * escuro e o quadro claro, ou o contrário. `app` acompanha o app.
 */
export interface PreferenciasTema {
	modo: ModoTema
	/** Preto puro nos fundos (economiza bateria em OLED). */
	amoled: boolean
	/** Cor-semente em hex, ex. "#d96c47". */
	semente: string
	estilo: EstiloPaleta
	fonte: FonteApp
	/** Tema do quadro, escolhido à parte do app. */
}

export const TEMA_PADRAO: PreferenciasTema = {
	modo: 'system',
	amoled: false,
	semente: '#d96c47',
	estilo: 'tonal',
	fonte: 'figtree',
}

/** Sementes oferecidas em Ajustes: nomes em português, cor fixa. */
export const SEMENTES: Array<{ hex: string; nome: string }> = [
	{ hex: '#d96c47', nome: 'Terracota' },
	{ hex: '#e8623f', nome: 'Coral' },
	{ hex: '#e9a13b', nome: 'Âmbar' },
	{ hex: '#7a9e52', nome: 'Oliva' },
	{ hex: '#3f9e8b', nome: 'Esmeralda' },
	{ hex: '#4a7fd4', nome: 'Azul' },
	{ hex: '#7d5cc6', nome: 'Violeta' },
	{ hex: '#c2557f', nome: 'Rosa' },
	{ hex: '#6f6a63', nome: 'Pedra' },
]

export const FONTES: Array<{ valor: FonteApp; nome: string; pilha: string }> = [
	{ valor: 'figtree', nome: 'Figtree', pilha: "'Figtree', system-ui, sans-serif" },
	{ valor: 'archivo', nome: 'Archivo', pilha: "'Archivo', system-ui, sans-serif" },
	{ valor: 'inter', nome: 'Inter', pilha: "'Inter', system-ui, sans-serif" },
	{ valor: 'manrope', nome: 'Manrope', pilha: "'Manrope', system-ui, sans-serif" },
	{ valor: 'sistema', nome: 'Do aparelho', pilha: 'system-ui, -apple-system, Roboto, sans-serif' },
]

const ESQUEMAS = {
	tonal: SchemeTonalSpot,
	neutro: SchemeNeutral,
	vibrante: SchemeVibrant,
	expressivo: SchemeExpressive,
	'arco-iris': SchemeRainbow,
	frutas: SchemeFruitSalad,
	monocromatico: SchemeMonochrome,
	fidelidade: SchemeFidelity,
	conteudo: SchemeContent,
} as const

/** Paletas do esquema que viram variáveis CSS (nome Material → nome da var). */
const CORES = [
	'primary',
	'onPrimary',
	'primaryContainer',
	'onPrimaryContainer',
	'primaryFixed',
	'primaryFixedDim',
	'onPrimaryFixed',
	'inversePrimary',
	'secondary',
	'onSecondary',
	'secondaryContainer',
	'onSecondaryContainer',
	'tertiary',
	'onTertiary',
	'tertiaryContainer',
	'onTertiaryContainer',
	'error',
	'onError',
	'errorContainer',
	'onErrorContainer',
	'background',
	'onBackground',
	'surface',
	'onSurface',
	'surfaceVariant',
	'onSurfaceVariant',
	'surfaceTint',
	'surfaceDim',
	'surfaceBright',
	'surfaceContainerLowest',
	'surfaceContainerLow',
	'surfaceContainer',
	'surfaceContainerHigh',
	'surfaceContainerHighest',
	'outline',
	'outlineVariant',
	'inverseSurface',
	'inverseOnSurface',
	'scrim',
	'shadow',
] as const

/**
 * Cores do esquema já resolvidas em ARGB.
 *
 * As propriedades do `DynamicScheme` são getters calculados, não campos
 * graváveis: por isso o AMOLED é aplicado numa cópia, e não mutando o objeto.
 */
export function coresDoEsquema(prefs: PreferenciasTema, escuro: boolean): Record<string, number> {
	const Construtor = ESQUEMAS[prefs.estilo] ?? SchemeTonalSpot
	const semente = Hct.fromInt(Number.parseInt(prefs.semente.replace('#', ''), 16) | 0xff000000)
	const esquema: DynamicScheme = new Construtor(semente, escuro, 0)
	const cores: Record<string, number> = {}

	for (const chave of CORES) {
		const valor = esquema[chave as keyof DynamicScheme]
		if (typeof valor === 'number') cores[chave] = valor
	}

	// O acento principal mantém a cor que o usuário escolheu.
	//
	// Todos os esquemas Material constroem o primário num croma fixo (~36). Numa
	// semente forte isso apagava a escolha: #FF00FF (magenta) saía #F1B3E6, um
	// rosa pálido quase igual ao da paleta pronta — a "nova cor" parecia não ter
	// efeito nenhum. Aqui o primário nasce da MESMA matiz, mas com o croma da
	// semente (limitado ao que aquele tom consegue exibir).
	//
	// O tom também acompanha a semente. Antes era fixo (40 no claro, 80 no
	// escuro): uma cor clara ou viva — amarelo, verde-limão, ciano — saía sempre
	// num tom escuro, e o usuário via "outra cor" em vez da que digitou. Agora o
	// tom é o da própria cor, preso a uma faixa em que texto branco ou preto
	// atinge 4,5:1; quando o tom exato não alcança, anda o mínimo necessário.
	const acento = TonalPalette.fromHueAndChroma(
		semente.hue,
		// Semente já colorida: mantém a força dela. Semente cinza ("Pedra"): fica
		// cinza mesmo — elevar o croma de 4 para 12 transformava o cinza num bege
		// que o usuário não pediu.
		semente.chroma < 12 ? semente.chroma : Math.max(semente.chroma, 16),
	)

	const claro = tomDoAcento(acento, semente.tone, escuro ? [74, 86] : [40, 62])
	const tomDoContainer: [number, number] = escuro ? [24, 36] : [86, 94]
	const container = tomDoContainerDoAcento(acento, tomDoContainer)

	cores.primary = claro.cor
	cores.onPrimary = claro.texto
	cores.primaryContainer = container.cor
	cores.onPrimaryContainer = container.texto
	cores.primaryFixed = acento.tone(90)
	cores.primaryFixedDim = acento.tone(80)
	cores.onPrimaryFixed = acento.tone(10)
	cores.inversePrimary = acento.tone(escuro ? 40 : 80)

	// Secundário e terciário partem da mesma semente, com croma baixo. Sem isso
	// o "estilo da paleta" (Tonal, Vibrante, Frutas…) era a única coisa que
	// mexia neles, e trocar a cor parecia mudar só os botões.
	cores.secondary = acento.tone(escuro ? 80 : 40)
	cores.onSecondary = acento.tone(escuro ? 20 : 100)
	cores.secondaryContainer = acento.tone(escuro ? 30 : 90)
	cores.onSecondaryContainer = acento.tone(escuro ? 90 : 10)
	cores.tertiary = acento.tone(escuro ? 80 : 40)
	cores.onTertiary = acento.tone(escuro ? 20 : 100)
	cores.tertiaryContainer = acento.tone(escuro ? 30 : 90)
	cores.onTertiaryContainer = acento.tone(escuro ? 90 : 10)

	// Superfícies e texto vêm dos neutros suaves (ver `neutrosSuaves`), para o
	// app não virar um bloco único da cor-semente.
	Object.assign(cores, neutrosSuaves(semente, escuro))

	if (prefs.amoled && escuro) {
		// AMOLED: fundo preto de verdade. Os containers sobem em degraus de cinza
		// (6%, 11%, 15%) para a hierarquia de camadas continuar legível.
		cores.background = 0xff000000
		cores.surface = 0xff000000
		cores.surfaceDim = 0xff000000
		cores.surfaceContainerLowest = 0xff000000
		cores.surfaceContainerLow = 0xff0a0a0a
		cores.surfaceContainer = 0xff111111
		cores.surfaceContainerHigh = 0xff1a1a1a
		cores.surfaceContainerHighest = 0xff242424
		cores.surfaceVariant = 0xff262626
		cores.outlineVariant = 0xff2e2e2e
		cores.outline = 0xff8d8d8d
	}

	return cores
}

function hex(argb: number): string {
	return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`
}

/** Luminância relativa WCAG de uma cor ARGB. */
function luminancia(argb: number): number {
	const canal = (v: number): number => {
		const c = v / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * canal((argb >> 16) & 255) + 0.7152 * canal((argb >> 8) & 255) + 0.0722 * canal(argb & 255)
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contraste(a: number, b: number): number {
	const la = luminancia(a)
	const lb = luminancia(b)
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const PRETO = 0xff000000
const BRANCO = 0xffffffff

/**
 * Tom do acento fiel à semente, dentro de uma faixa legível.
 *
 * O tom da cor escolhida é o ponto de partida; a faixa garante que o acento
 * continue sendo fundo de botão legível. Se o tom exato não alcança 4,5:1 com
 * branco nem com preto, sobe ou desce o mínimo necessário — não cai num valor
 * fixo, que é o que fazia um amarelo virar marrom.
 */
function tomDoAcento(
	paleta: TonalPalette,
	tomDaSemente: number,
	[faixaMin, faixaMax]: [number, number],
): { cor: number; texto: number } {
	const alvo = Math.round(Math.min(Math.max(tomDaSemente, faixaMin), faixaMax))

	for (let passo = 0; passo <= 24; passo++) {
		for (const tom of [alvo - passo, alvo + passo]) {
			if (tom < faixaMin || tom > faixaMax) continue
			const cor = paleta.tone(tom)
			// Preto sobre o acento é o caso normal (tons 40–60); branco entra
			// quando o tom é escuro o bastante.
			const branco = contraste(cor, BRANCO) >= 4.5
			const preto = contraste(cor, PRETO) >= 4.5
			if (branco || preto) {
				return { cor, texto: branco && contraste(cor, BRANCO) >= contraste(cor, PRETO) ? BRANCO : PRETO }
			}
		}
	}

	// Fallback impossível de atingir com as faixas atuais; mantém a cor pedida.
	const cor = paleta.tone(alvo)
	return { cor, texto: contraste(cor, BRANCO) >= contraste(cor, PRETO) ? BRANCO : PRETO }
}

/** Container do acento: fundo suave com texto que contrasta com ele. */
function tomDoContainerDoAcento(
	paleta: TonalPalette,
	[faixaMin, faixaMax]: [number, number],
): { cor: number; texto: number } {
	const cor = paleta.tone(faixaMax)
	// O texto do container é o tom oposto: escuro no container claro, claro no
	// container escuro. A faixa de 10–90 já garante contraste alto.
	const texto = paleta.tone(faixaMax > 50 ? Math.max(faixaMin - 60, 10) : Math.min(faixaMax + 60, 90))
	return { cor, texto }
}

/**
 * Tons neutros com pouco croma.
 *
 * O esquema Material padrão tinge TODAS as superfícies com a cor-semente. Num
 * tema quente isso faz o app inteiro virar pêssego e as camadas (cartão, campo,
 * chip) param de se distinguir. Aqui os neutros são recalculados com croma 3–7:
 * o papel continua levemente tingido, mas cada camada tem degrau próprio — e o
 * acento segue saturado, que é o que dá personalidade.
 */function neutrosSuaves(semente: Hct, escuro: boolean): Record<string, number> {
	const neutro = TonalPalette.fromHueAndChroma(semente.hue, 3.5)
	const variante = TonalPalette.fromHueAndChroma(semente.hue, 7)

	const tom = (paleta: TonalPalette, t: number): number => paleta.tone(t)

	return escuro
		? {
				background: tom(neutro, 6),
				onBackground: tom(neutro, 90),
				surface: tom(neutro, 6),
				onSurface: tom(neutro, 90),
				surfaceDim: tom(neutro, 6),
				surfaceBright: tom(neutro, 24),
				surfaceContainerLowest: tom(neutro, 4),
				surfaceContainerLow: tom(neutro, 10),
				surfaceContainer: tom(neutro, 13),
				surfaceContainerHigh: tom(neutro, 18),
				surfaceContainerHighest: tom(neutro, 23),
				surfaceVariant: tom(variante, 30),
				onSurfaceVariant: tom(variante, 80),
				outline: tom(variante, 60),
				outlineVariant: tom(variante, 30),
				inverseSurface: tom(neutro, 90),
				inverseOnSurface: tom(neutro, 20),
			}
		: {
				// Degraus de 4–5 tons entre camadas: sem isso o fundo, o cartão e o
				// campo ficam todos no mesmo branco e a hierarquia desaparece.
				background: tom(neutro, 97),
				onBackground: tom(neutro, 11),
				surface: tom(neutro, 98),
				onSurface: tom(neutro, 11),
				surfaceDim: tom(neutro, 85),
				surfaceBright: tom(neutro, 99),
				surfaceContainerLowest: tom(neutro, 100),
				surfaceContainerLow: tom(neutro, 96),
				surfaceContainer: tom(neutro, 93),
				surfaceContainerHigh: tom(neutro, 90),
				surfaceContainerHighest: tom(neutro, 87),
				surfaceVariant: tom(variante, 89),
				onSurfaceVariant: tom(variante, 32),
				outline: tom(variante, 52),
				outlineVariant: tom(variante, 80),
				inverseSurface: tom(neutro, 20),
				inverseOnSurface: tom(neutro, 95),
			}
}

/** Converte camelCase do Material em nome de variável CSS: onPrimaryContainer → on-primary-container. */
function nomeDaVar(chave: string): string {
	return `--${chave.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`)}`
}

/** Modo visível agora: 'light' | 'dark' resolvido contra o sistema. */
export function temaResolvido(modo?: ModoTema): 'light' | 'dark' {
	const escolha = modo ?? (document.documentElement.dataset.modo as ModoTema | undefined) ?? 'system'
	if (escolha === 'light' || escolha === 'dark') return escolha
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Tema do app já resolvido, como estado reativo.
 *
 * `useTema` aplica o tema no DOM, mas não re-renderiza quem depende do valor
 * quando o aparelho troca sozinho (modo Sistema). O quadro precisa disso para
 * repintar junto. `useSyncExternalStore` evitaria o estado, mas o tema também
 * depende do banco, então um estado sincronizado com `matchMedia` é mais direto.
 */
export function useTemaResolvido(prefs: PreferenciasTema): 'light' | 'dark' {
	const [resolvido, setResolvido] = useState<'light' | 'dark'>(() => temaResolvido(prefs.modo))

	useEffect(() => {
		const consulta = window.matchMedia('(prefers-color-scheme: dark)')
		const atualizar = (): void => setResolvido(temaResolvido(prefs.modo))

		atualizar()
		consulta.addEventListener('change', atualizar)
		return () => consulta.removeEventListener('change', atualizar)
	}, [prefs.modo])

	return resolvido
}

/** Escreve as variáveis do esquema no elemento raiz. */
export function aplicarTema(prefs: PreferenciasTema): void {
	const raiz = document.documentElement

	// Espelho síncrono do tema: o banco (IndexedDB) abre depois do primeiro
	// desenho — sem espelho, o app nascia na cor antiga/padrão e "piscava"
	// para o tema certo logo em seguida. localStorage é lido antes do render.
	// Grava as variáveis JÁ RESOLVIDAS: o script inline do index.html as aplica
	// antes da primeira pintura, sem esperar React nem banco.
	try {
		localStorage.setItem(CHAVE_ESPELHO, JSON.stringify(prefs))
	} catch {
		// Sem localStorage (modo privado): segue sem espelho.
	}

	const escuro = temaResolvido(prefs.modo) === 'dark'
	const esquema = coresDoEsquema(prefs, escuro)

	const cores: Record<string, string> = {}
	for (const [chave, valor] of Object.entries(esquema)) {
		cores[nomeDaVar(chave)] = hex(valor)
	}

	try {
		localStorage.setItem(
			CHAVE_CORES,
			JSON.stringify({
				...cores,
				'--font': (FONTES.find((f) => f.valor === prefs.fonte) ?? FONTES[0]!).pilha,
				modo: prefs.modo,
				escuro: escuro ? 'dark' : 'light',
			}),
		)
		// Migração: a chave antiga é lida pelo script do index.html na primeira
		// abertura após a troca de nome, e depois pode sair do aparelho.
		localStorage.removeItem(CHAVE_CORES_ANTIGA)
	} catch {
		// Sem localStorage: o tema ainda é aplicado no DOM abaixo.
	}

	// Transições de cor em dezenas de elementos disparavam juntas na troca de
	// tema e viravam "bugs visuais". Uma moldura sem transições troca limpo.
	raiz.classList.add('tema-trocando')
	requestAnimationFrame(() => {
		requestAnimationFrame(() => raiz.classList.remove('tema-trocando'))
	})

	for (const [chave, valor] of Object.entries(cores)) {
		raiz.style.setProperty(chave, valor)
	}

	const fonte = FONTES.find((f) => f.valor === prefs.fonte) ?? FONTES[0]!
	raiz.style.setProperty('--font', fonte.pilha)

	raiz.dataset.modo = prefs.modo
	raiz.dataset.tema = escuro ? 'dark' : 'light'
	raiz.dataset.amoled = prefs.amoled ? 'sim' : 'nao'
	raiz.style.colorScheme = escuro ? 'dark' : 'light'

	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', hex(esquema.surface ?? 0xffffffff))
}

/**
 * Lê as preferências do banco, aplica e mantém em dia.
 *
 * O tema é aplicado antes do primeiro desenho de propósito: se esperasse o
 * IndexedDB no efeito normal, a tela nasceria clara e piscaria para o escuro.
 */
export function useTema(): PreferenciasTema {
	const salvo = useSetting<PreferenciasTema>('tema.v3', TEMA_PADRAO)

	// O banco (IndexedDB) responde depois do primeiro render: `salvo` chega
	// `undefined` e o tema cairia no PADRÃO, sobrescrevendo o espelho que já
	// pintou a tela — era exatamente a "cor antiga que aparece e depois
	// corrige". Enquanto o banco não responde, vale o espelho síncrono.
	const prefs = useMemo(
		() => (salvo ? { ...TEMA_PADRAO, ...salvo } : lerEspelho()),
		[salvo],
	)

	useEffect(() => {
		aplicarTema(prefs)

		// Modo sistema: acompanha a troca do aparelho sem reabrir o app.
		if (prefs.modo !== 'system') return
		const consulta = window.matchMedia('(prefers-color-scheme: dark)')
		const aoMudar = (): void => aplicarTema(prefs)
		consulta.addEventListener('change', aoMudar)
		return () => consulta.removeEventListener('change', aoMudar)
		// A lista de campos evita reaplicar o tema por identidade do objeto.
	}, [prefs.modo, prefs.amoled, prefs.semente, prefs.estilo, prefs.fonte])

	return prefs
}

export async function salvarTema(patch: Partial<PreferenciasTema>): Promise<void> {
	const atual = await import('@/db/repo').then((m) => m.getSetting<PreferenciasTema>('tema.v3', TEMA_PADRAO))
	await setSetting('tema.v3', { ...TEMA_PADRAO, ...atual, ...patch })
}

/** Chave do espelho síncrono do tema em localStorage. */
const CHAVE_ESPELHO = 'nexo.tema'

/** Chave das variáveis CSS já resolvidas, lidas pelo script do index.html. */
const CHAVE_CORES = 'urdume.tema.cores'

/**
 * Chave antiga das variáveis resolvidas, de quando o app se chamava Rabisco.
 *
 * O script do index.html lê as duas: sem isso, a primeira abertura depois da
 * troca de nome não acharia o espelho e pintaria na cor padrão antes de
 * corrigir — exatamente a piscada que o tema síncrono existe para evitar.
 */
const CHAVE_CORES_ANTIGA = 'rabisco.tema.cores'

/** Preferências do espelho, mescladas com o padrão. Síncrono, sem banco. */
function lerEspelho(): PreferenciasTema {
	try {
		const bruto = localStorage.getItem(CHAVE_ESPELHO)
		if (!bruto) return TEMA_PADRAO
		return { ...TEMA_PADRAO, ...(JSON.parse(bruto) as Partial<PreferenciasTema>) }
	} catch {
		return TEMA_PADRAO
	}
}

/**
 * Aplica o último tema conhecido ANTES do React montar.
 *
 * Lê o espelho em localStorage (síncrono). Sem espelho gravado (primeira
 * visita), fica o padrão — e o `useTema` corrige quando o banco abrir.
 */
export function aplicarTemaInicial(): void {
	aplicarTema(lerEspelho())
}
