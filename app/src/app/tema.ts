import { Hct, SchemeTonalSpot, TonalPalette } from '@material/material-color-utilities'
import type { DynamicScheme } from '@material/material-color-utilities'
import { useEffect, useMemo, useState } from 'react'
import {
	cromaDoAcento,
	cromaDaFamilia,
	ehIntima,
	formacaoEmHex,
	matizDaFamilia,
	perfilDe,
	raioDoCroma,
	raioDoTom,
} from '@/app/motor-cromatico'
import type { Deslocamentos, Harmonia, TipoDeRoda } from '@/app/motor-cromatico'
import { setSetting, useSetting } from '@/db/repo'
import { CHAVES, gravarChave, lerChave } from '@/lib/chaves'

/**
 * Tema do app — mesma engenharia do Grit.
 *
 * A paleta inteira (superfícies, containers, texto, contorno, erro) é derivada
 * de UMA cor-semente com o algoritmo Material 3. Trocar a semente muda o produto
 * inteiro de forma coerente; nada de cores soltas escolhidas à mão que brigam
 * entre si. O modo claro/escuro é um esquema diferente da mesma semente, não uma
 * lista de exceções.
 *
 * ## O que mudou na rodada 18
 *
 * O "estilo da paleta" (oito esquemas Material) saiu: ele prometia oito
 * resultados e entregava um. No lugar entraram três controles que fazem
 * trabalho visível e testável:
 *
 * - **tipo de roda** (`tipo`): a força e o tom da paleta — cromática, viva,
 *   suave, pastel, sóbria ou neutra;
 * - **harmonia** (`harmonia`): a relação de matiz entre acento, secundária e
 *   terciária;
 * - **deslocamentos**: o ajuste fino de cada pino derivado, arrastado à mão.
 *
 * `estilo` continua no tipo, como campo legado: registros antigos têm o valor e
 * ele é lido sem quebrar — mas não influencia mais nada. Migrar dado de usuário
 * para "apagar" uma preferência é risco desnecessário.
 */
export type ModoTema = 'system' | 'light' | 'dark'

/** Esquema Material legado. Lido em registros antigos; não é mais aplicado. */
export type EstiloPaleta = 'tonal' | 'neutro' | 'vibrante' | 'expressivo' | 'frutas' | 'monocromatico' | 'fidelidade' | 'conteudo'

export type FonteApp = 'figtree' | 'archivo' | 'inter' | 'manrope' | 'sistema'

export interface PreferenciasTema {
	modo: ModoTema
	/** Preto puro nos fundos (economiza bateria em OLED). */
	amoled: boolean
	/** Cor-semente em hex, ex. "#d96c47". */
	semente: string
	/** Tipo de roda: define a força e o tom da paleta inteira. */
	tipo: TipoDeRoda
	/** Harmonia entre as famílias. `intima` = as do esquema Material. */
	harmonia: Harmonia
	/** Ajuste fino de cada pino derivado, em graus. */
	deslocamentos: Deslocamentos
	/**
	 * Esquema Material legado. Existe só para ler `tema.v3` de versões
	 * anteriores sem perder o registro; não é aplicado em lugar nenhum.
	 */
	estilo?: EstiloPaleta
	fonte: FonteApp
}

export const TEMA_PADRAO: PreferenciasTema = {
	modo: 'system',
	amoled: false,
	semente: '#d96c47',
	tipo: 'cromatica',
	harmonia: 'intima',
	deslocamentos: {},
	estilo: 'tonal',
	fonte: 'figtree',
}

/**
 * Sementes oferecidas em Ajustes.
 *
 * Entraram o cinza, o carvão e o gesso: com a roda neutra e os tipos suaves, o
 * ponto de partida sem cor é uma escolha legítima, não um acidente.
 */
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
	{ hex: '#3a3a3c', nome: 'Carvão' },
	{ hex: '#cfc9bd', nome: 'Gesso' },
]

export const FONTES: Array<{ valor: FonteApp; nome: string; pilha: string }> = [
	{ valor: 'figtree', nome: 'Figtree', pilha: "'Figtree', system-ui, sans-serif" },
	{ valor: 'archivo', nome: 'Archivo', pilha: "'Archivo', system-ui, sans-serif" },
	{ valor: 'inter', nome: 'Inter', pilha: "'Inter', system-ui, sans-serif" },
	{ valor: 'manrope', nome: 'Manrope', pilha: "'Manrope', system-ui, sans-serif" },
	{ valor: 'sistema', nome: 'Do aparelho', pilha: 'system-ui, -apple-system, Roboto, sans-serif' },
]


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
	/*
	 * `onAccent` não vem do esquema: é calculado no fim, depois que as
	 * superfícies existem. Entra na lista para virar `--on-accent` como os
	 * outros — o CSS lê esse nome há várias rodadas.
	 */
	'onAccent',
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
 *
 * ## Ordem das decisões (importa para não haver conflito)
 *
 * 1. O ESQUEMA Material (sempre Tonal Spot) fornece o esqueleto inteiro:
 *    superfícies, contornos, erro e os pares de contraste.
 * 2. O MOTOR define matiz e croma de cada família — tipo de roda e harmonia.
 * 3. Os PORTÕES deste arquivo (`tomDoAcento`, `tomDaFamilia`) decidem o tom e
 *    garantem 4,5:1. Nenhuma etapa anterior pode pular esta.
 *
 * É por isso que uma harmonia exótica ou uma roda pastel não conseguem gerar
 * botão ilegível: elas não escolhem tom.
 */
export function coresDoEsquema(prefs: PreferenciasTema, escuro: boolean): Record<string, number> {
	// Cache de uma posição: o arraste da roda chama isto a cada dedo movido, e
	// cada cálculo completo custa ~7,5 ms no aparelho. Com o cache, a mesma
	// semente não é recalculada duas vezes seguidas (o React às vezes reavalia
	// `useMemo` por identidade de objeto sem que o valor tenha mudado).
	const chaveCache = [
		prefs.semente,
		prefs.tipo,
		prefs.harmonia,
		prefs.deslocamentos?.secundaria ?? '',
		prefs.deslocamentos?.terciaria ?? '',
		prefs.amoled ? 'a' : '',
		escuro ? 'e' : 'c',
	].join('|')

	if (cacheCores && cacheChave === chaveCache) return cacheCores

	const semente = Hct.fromInt(Number.parseInt(prefs.semente.replace('#', ''), 16) | 0xff000000)
	const esquema: DynamicScheme = new SchemeTonalSpot(semente, escuro, 0)
	const cores: Record<string, number> = {}

	// O esquema entrega o esqueleto. Só as chaves abaixo são sobrescritas.
	for (const chave of CORES) {
		const valor = esquema[chave as keyof DynamicScheme]
		if (typeof valor === 'number') cores[chave] = valor
	}

	const perfil = perfilDe(prefs.tipo)

	/*
	 * Acento (família primária).
	 *
	 * Todos os esquemas Material constroem o primário num croma fixo (~36). Numa
	 * semente forte isso apagava a escolha: #FF00FF (magenta) saía #F1B3E6, um
	 * rosa pálido quase igual ao da paleta pronta — a "nova cor" parecia não ter
	 * efeito nenhum.
	 *
	 * Agora o croma vem do TIPO de roda (é ele que decide "viva" x "suave" x
	 * "neutra") e o tom vem da própria semente, preso a uma faixa legível.
	 */
	const cromaAcento = cromaDoAcento(prefs.tipo, semente.chroma)
	const acento = TonalPalette.fromHueAndChroma(semente.hue, cromaAcento)
	const claro = tomDoAcento(acento, semente.tone, escuro ? [74, 86] : [40, 62])
	const container = tomDoContainerDoAcento(acento, escuro ? [24, 36] : [86, 94])

	cores.primary = claro.cor
	cores.onPrimary = claro.texto
	cores.primaryContainer = container.cor
	cores.onPrimaryContainer = container.texto
	cores.primaryFixed = acento.tone(90)
	cores.primaryFixedDim = acento.tone(80)
	cores.onPrimaryFixed = acento.tone(10)
	cores.inversePrimary = acento.tone(escuro ? 40 : 80)

	/*
	 * Secundária e terciária.
	 *
	 * `intima` mantém o comportamento histórico: as famílias vêm do esquema
	 * Material, e a paleta de quem nunca abriu esta tela não muda.
	 *
	 * Com uma harmonia explícita, a matiz de cada família vem do MOTOR e o tom é
	 * resolvido aqui, na mesma faixa do acento, com o texto tirado por contraste
	 * real. Antes o código sobrescrevia as duas famílias com a matiz da semente:
	 * era a origem do "estilo que não faz nada".
	 */
	if (ehIntima(prefs.harmonia)) {
		cores.secondary = esquema.secondary
		cores.onSecondary = esquema.onSecondary
		cores.secondaryContainer = esquema.secondaryContainer
		cores.onSecondaryContainer = esquema.onSecondaryContainer
		cores.tertiary = esquema.tertiary
		cores.onTertiary = esquema.onTertiary
		cores.tertiaryContainer = esquema.tertiaryContainer
		cores.onTertiaryContainer = esquema.onTertiaryContainer
	} else {
		const cromaApoio = cromaDaFamilia(prefs.tipo, semente.chroma, prefs.harmonia)
		const familia = (
			matiz: number,
			tomContorno: [number, number],
			tomContainer: [number, number],
		): {
			cor: number
			texto: number
			container: number
			textoDoContainer: number
		} => {
			const paleta = TonalPalette.fromHueAndChroma(matiz, cromaApoio)
			const acentoDaFamilia = tomDoAcento(paleta, perfil.tomDoDisco, tomContorno)
			const caixa = tomDoContainerDoAcento(paleta, tomContainer)
			return {
				cor: acentoDaFamilia.cor,
				texto: acentoDaFamilia.texto,
				container: caixa.cor,
				textoDoContainer: caixa.texto,
			}
		}

		const secundaria = familia(
			matizDaFamilia('secundaria', semente.hue, prefs.harmonia, prefs.deslocamentos),
			escuro ? [70, 86] : [34, 50],
			escuro ? [22, 34] : [88, 94],
		)
		cores.secondary = secundaria.cor
		cores.onSecondary = secundaria.texto
		cores.secondaryContainer = secundaria.container
		cores.onSecondaryContainer = secundaria.textoDoContainer

		const terciaria = familia(
			matizDaFamilia('terciaria', semente.hue, prefs.harmonia, prefs.deslocamentos),
			escuro ? [70, 86] : [34, 50],
			escuro ? [22, 34] : [88, 94],
		)
		cores.tertiary = terciaria.cor
		cores.onTertiary = terciaria.texto
		cores.tertiaryContainer = terciaria.container
		cores.onTertiaryContainer = terciaria.textoDoContainer
	}

	// Superfícies e texto vêm dos neutros suaves (ver `neutrosSuaves`), para o
	// app não virar um bloco único da cor-semente.
	Object.assign(cores, neutrosSuaves(semente, escuro, prefs.tipo))

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
		// Contornos acima do tom 30 são o mínimo para a borda existir sobre o
		// preto puro: em 0x2e2e2e ela media 1,4:1 e os cartões perdiam a
		// delimitação justamente no modo que promete a melhor tela.
		cores.outlineVariant = 0xff3a3a3a
		cores.outline = 0xff9a9a9a
	}

	/*
	 * Tinta de texto do acento (`--on-accent`).
	 *
	 * `--primary` como LETRA sobre superfície reprova (2,6–3,2:1): ele foi
	 * desenhado para ser FUNDO de botão. O token antigo era uma mistura fixa
	 * de 50% do acento com a tinta do tema, e funcionava nas nove sementes
	 * daquela época. Com os tipos de roda e a harmonia, o acento pode ser
	 * muito mais claro ou mais escuro, e uma mistura fixa deixou de garantir
	 * o mínimo — a roda "Viva" em escuro dava 4,41:1 num dos cards.
	 *
	 * Aqui a mistura ANDA até passar: parte do acento e vai na direção da
	 * tinta do tema, em passos de 5%, até que TODAS as superfícies de texto
	 * alcancem 4,5:1. Nenhuma combinação de tipo, harmonia ou semente
	 * consegue furar esse portão, porque ele não depende de escolha.
	 */
	cores.onAccent = tintaDoAcento(
		cores.primary!,
		escuro ? 0xffece0dd : 0xff221c1b,
		[
			cores.background!,
			cores.surfaceContainer!,
			cores.surfaceContainerHigh!,
			cores.surfaceContainerHighest!,
			cores.primaryContainer!,
		],
		4.5,
	)

	cacheChave = chaveCache
	cacheCores = cores
	return cores
}

/**
 * Tinta legível do acento: a mesma matiz, um degrau na direção da tinta do
 * tema, até passar 4,5:1 sobre todas as superfícies informadas.
 *
 * Devolve o primeiro passo que passa; se nenhum passar (impossível com essas
 * superfícies), devolve a tinta do tema — que, por definição, é legível.
 */
function tintaDoAcento(
	acento: number,
	tinta: number,
	superficies: number[],
	minimo: number,
): number {
	for (let passo = 0; passo <= 20; passo++) {
		const peso = passo / 20
		const mistura = misturarArgb(acento, tinta, 0.5 + peso * 0.5)
		if (superficies.every((superficie) => contraste(mistura, superficie) >= minimo)) {
			return mistura
		}
	}
	return tinta
}

/** Mistura dois ARGB em sRGB, como `color-mix(in srgb, a p%, b)`. */
function misturarArgb(a: number, b: number, peso: number): number {
	const canal = (deslocamento: number): number => {
		const va = (a >> deslocamento) & 255
		const vb = (b >> deslocamento) & 255
		return Math.round(va * peso + vb * (1 - peso))
	}
	return 0xff000000 | (canal(16) << 16) | (canal(8) << 8) | canal(0)
}

/**
 * Cache de uma posição do esquema.
 *
 * Existe por medição: um cálculo completo custa ~7,5 ms no aparelho. A roda
 * chama isto a cada movimento do dedo; 60 quadros por segundo dam-se em 16 ms,
 * então o cálculo sozinho comia metade do quadro e o arraste parecia "travado".
 * Com o cache, só há cálculo quando algum parâmetro realmente mudou.
 */
let cacheChave = ''
let cacheCores: Record<string, number> | null = null

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
 *
 * O TIPO de roda manda no tingimento: numa roda neutra (preto e branco) as
 * superfícies ficam cinza de verdade, sem nenhum resto de cor. Sem isso, "sem
 * cor" ainda saía com um bege rosado nas bordas — o tipo não cumpria o nome.
 */
function neutrosSuaves(semente: Hct, escuro: boolean, tipo?: TipoDeRoda | null): Record<string, number> {
	const perfil = perfilDe(tipo)
	const cromaNeutro = (perfil.cromaNeutro ?? 3.5) * 1
	const cromaVariante = cromaNeutro * 2
	const neutro = TonalPalette.fromHueAndChroma(semente.hue, cromaNeutro)
	const variante = TonalPalette.fromHueAndChroma(semente.hue, cromaVariante)

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
/**
 * Escreve as variáveis do esquema no elemento raiz.
 *
 * `leve` existe por causa do arraste da roda: durante o gesto, o app inteiro é
 * repintado a cada movimento. Gravar o espelho em `localStorage` e mexer em
 * classes a cada dedo movido custava mais que o próprio cálculo, e o arraste
 * ficava a 20–30 quadros por segundo. No modo leve só as variáveis são
 * escritas — o espelho e as classes ficam para o fim do gesto.
 *
 * `alvo` restringe a pintura a UM elemento. É o que torna o arraste fluido: em
 * vez de invalidar 60 variáveis no `<html>` (e obrigar o navegador a recalcular
 * estilo e pintar o documento inteiro, ~58 ms por quadro), a prévia se aplica
 * só na folha que está na frente. O app por trás está coberto pela folha; ele
 * recebe o tema final quando o dedo sai.
 */
export function aplicarTema(
	prefs: PreferenciasTema,
	opcoes?: { leve?: boolean; alvo?: HTMLElement | null },
): void {
	const raiz = document.documentElement
	const leve = opcoes?.leve === true
	const alvo = opcoes?.alvo ?? raiz

	// Espelho síncrono do tema: o banco (IndexedDB) abre depois do primeiro
	// desenho — sem espelho, o app nascia na cor antiga/padrão e "piscava"
	// para o tema certo logo em seguida. localStorage é lido antes do render.
	// Grava as variáveis JÁ RESOLVIDAS: o script inline do index.html as aplica
	// antes da primeira pintura, sem esperar React nem banco.
	if (!leve) gravarChave(CHAVE_ESPELHO, JSON.stringify(prefs))

	const escuro = temaResolvido(prefs.modo) === 'dark'
	const esquema = coresDoEsquema(prefs, escuro)

	const cores: Record<string, string> = {}
	for (const [chave, valor] of Object.entries(esquema)) {
		cores[nomeDaVar(chave)] = hex(valor)
	}

	Object.assign(cores, variaveisDoMotor(prefs))

	if (!leve) {
		gravarChave(
			CHAVE_CORES,
			JSON.stringify({
				...cores,
				'--font': (FONTES.find((f) => f.valor === prefs.fonte) ?? FONTES[0]!).pilha,
				modo: prefs.modo,
				escuro: escuro ? 'dark' : 'light',
			}),
		)

		// Transições de cor em dezenas de elementos disparavam juntas na troca de
		// tema e viravam "bugs visuais". Uma moldura sem transições troca limpo.
		raiz.classList.add('tema-trocando')
		requestAnimationFrame(() => {
			requestAnimationFrame(() => raiz.classList.remove('tema-trocando'))
		})
	}

	for (const [chave, valor] of Object.entries(cores)) {
		alvo.style.setProperty(chave, valor)
	}

	if (!leve) {
		const fonte = FONTES.find((f) => f.valor === prefs.fonte) ?? FONTES[0]!
		raiz.style.setProperty('--font', fonte.pilha)
	}

	// Os atributos de tema são do documento: com um `alvo` escopado, quem manda
	// neles é a aplicação global, que acontece no fim do gesto.
	if (alvo === raiz) {
		raiz.dataset.modo = prefs.modo
		raiz.dataset.tema = escuro ? 'dark' : 'light'
		raiz.dataset.amoled = prefs.amoled ? 'sim' : 'nao'
		raiz.style.colorScheme = escuro ? 'dark' : 'light'

		if (!leve) {
			document
				.querySelector('meta[name="theme-color"]')
				?.setAttribute('content', hex(esquema.surface ?? 0xffffffff))
		}
	}
}

/**
 * Variáveis do motor cromático, para a roda e para os chips.
 *
 * A roda precisa saber onde cada pino fica; ela lê daqui em vez de repetir a
 * conta. Ficam em variáveis CSS (e não em props) porque quem desenha é o CSS,
 * e assim a roda continua sendo um componente só, sem estado duplicado.
 */
function variaveisDoMotor(prefs: PreferenciasTema): Record<string, string> {
	const perfil = perfilDe(prefs.tipo)
	const semente = Hct.fromInt(Number.parseInt(prefs.semente.replace('#', ''), 16) | 0xff000000)
	const cromaAcento = cromaDoAcento(prefs.tipo, semente.chroma)
	const cromaApoio = cromaDaFamilia(prefs.tipo, semente.chroma, prefs.harmonia)
	const pontos = formacaoEmHex(
		semente.hue,
		semente.chroma,
		prefs.tipo,
		prefs.harmonia,
		prefs.deslocamentos,
	)

	const raio = perfil.eixo === 'tom' ? raioDoTom(prefs.tipo, semente.tone) : raioDoCroma(prefs.tipo, cromaAcento)
	const raioApoio = perfil.eixo === 'tom' ? 0.72 : raioDoCroma(prefs.tipo, cromaApoio)

	return {
		'--motor-primaria': pontos.primaria,
		'--motor-secundaria': pontos.secundaria,
		'--motor-terciaria': pontos.terciaria,
		'--motor-hue-semente': String(Math.round(semente.hue)),
		'--motor-hue-secundaria': String(
			Math.round(matizDaFamilia('secundaria', semente.hue, prefs.harmonia, prefs.deslocamentos)),
		),
		'--motor-hue-terciaria': String(
			Math.round(matizDaFamilia('terciaria', semente.hue, prefs.harmonia, prefs.deslocamentos)),
		),
		'--motor-raio-semente': String(Number(raio.toFixed(3))),
		'--motor-raio-apoio': String(Number(raioApoio.toFixed(3))),
		'--motor-croma-max': String(perfil.cromaMax),
	}
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
	const prefs = useMemo(() => normalizarPreferencias(salvo), [salvo])

	useEffect(() => {
		aplicarTema(prefs)

		// Modo sistema: acompanha a troca do aparelho sem reabrir o app.
		if (prefs.modo !== 'system') return
		const consulta = window.matchMedia('(prefers-color-scheme: dark)')
		const aoMudar = (): void => aplicarTema(prefs)
		consulta.addEventListener('change', aoMudar)
		return () => consulta.removeEventListener('change', aoMudar)
		// A lista de campos evita reaplicar o tema por identidade do objeto.
	}, [
		prefs.modo,
		prefs.amoled,
		prefs.semente,
		prefs.tipo,
		prefs.harmonia,
		prefs.deslocamentos.secundaria,
		prefs.deslocamentos.terciaria,
		prefs.fonte,
	])

	return prefs
}

/**
 * Preferências sempre completas.
 *
 * `tema.v3` de versões anteriores não tem `tipo`, `harmonia` nem
 * `deslocamentos`. Mesclar com o padrão devolve um objeto utilizável, e o valor
 * ausente vira exatamente o comportamento antigo — sem migração de banco, sem
 * reescrever o registro do usuário.
 */
function normalizarPreferencias(salvo: Partial<PreferenciasTema> | undefined | null): PreferenciasTema {
	if (!salvo) return lerEspelho()
	return {
		...TEMA_PADRAO,
		...salvo,
		deslocamentos: salvo.deslocamentos ?? {},
	}
}

export async function salvarTema(patch: Partial<PreferenciasTema>): Promise<void> {
	const atual = await import('@/db/repo').then((m) => m.getSetting<PreferenciasTema>('tema.v3', TEMA_PADRAO))
	await setSetting('tema.v3', normalizarPreferencias({ ...atual, ...patch }))
}

/** Chave do espelho síncrono do tema em localStorage (ver `lib/chaves`). */
const CHAVE_ESPELHO = CHAVES.espelhoDoTema

/** Chave das variáveis CSS já resolvidas, lidas pelo script do index.html. */
const CHAVE_CORES = CHAVES.coresDoTema


/** Preferências do espelho, mescladas com o padrão. Síncrono, sem banco. */
function lerEspelho(): PreferenciasTema {
	try {
		const bruto = lerChave(CHAVE_ESPELHO)
		if (!bruto) return TEMA_PADRAO
		const salvo = JSON.parse(bruto) as Partial<PreferenciasTema>
		return { ...TEMA_PADRAO, ...salvo, deslocamentos: salvo.deslocamentos ?? {} }
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
