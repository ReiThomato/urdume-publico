import { Hct } from '@material/material-color-utilities'

/**
 * Motor cromático do Urdume.
 *
 * ## O que este arquivo decide — e o que ele NÃO decide
 *
 * Aqui só se escolhe **matiz** (o ângulo) e **croma** (a força da cor) de cada
 * família do tema: primária (o acento, que é a cor-semente), secundária e
 * terciária. Tons, textos por cima e contraste são resolvidos no `tema.ts`,
 * com o portão de 4,5:1. Isso é o que garante que nenhuma formação — nem a mais
 * improvável — consiga produzir um botão ilegível.
 *
 * ## Por que "tipos de roda"
 *
 * Uma roda só de matiz entrega sempre a mesma coisa: cor saturada. Quem gosta
 * de app calmo, pastel, terroso ou preto-e-branco não tinha para onde ir. Cada
 * TIPO é um perfil de croma e de tom, e ele vale para a roda inteira E para as
 * famílias do tema — trocar o tipo muda o app, não só o desenho do disco.
 *
 * ## Como estender (regra de casa, para não haver conflito)
 *
 * 1. Um tipo novo entra em `PERFIS` com: croma máximo, eixo do raio
 *    ('croma' ou 'tom') e o tom do disco. Nada mais.
 * 2. Uma harmonia nova entra em `ANGULOS` (par de ângulos) e em `HARMONIAS`.
 * 3. **Nunca** devolva cor fixa daqui, e **nunca** decida tom aqui. Quem lê é
 *    o `tema.ts`.
 * 4. A semente é sempre a família primária e nunca muda de matiz por causa da
 *    regra: quem escolhe a cor escolhe o acento.
 */

/* --------------------------------------------------------------------------
   Tipos de roda
   -------------------------------------------------------------------------- */

export type TipoDeRoda = 'cromatica' | 'viva' | 'suave' | 'pastel' | 'sobria' | 'neutra'

export interface PerfilDeRoda {
	valor: TipoDeRoda
	rotulo: string
	/** Uma linha explicando o resultado no app. */
	descricao: string
	/**
	 * O que o raio do disco controla:
	 * - `croma`: do cinza (centro) à cor mais forte do tipo (borda);
	 * - `tom`: do claro (centro) ao escuro (borda), sem cor nenhuma.
	 */
	eixo: 'croma' | 'tom'
	/** Croma no aro externo (0–120). */
	cromaMax: number
	/**
	 * Piso de croma do acento: abaixo disto o tipo puxa a cor para cima.
	 * É o que separa "viva" de "cromática" numa semente já forte — sem piso,
	 * as duas devolviam exatamente a mesma paleta.
	 */
	cromaPiso: number
	/** Croma das superfícies (o tingimento do papel). 0 = cinza puro. */
	cromaNeutro: number
	/** Tom em que o disco (e os pinos) são desenhados. */
	tomDoDisco: number
	/** Faixa de tom do eixo `tom`. */
	tonsDoDisco: [number, number]
}

/**
 * Os seis tipos.
 *
 * Os limites de croma não são estética solta: 120 é o máximo que o HCT entrega
 * em qualquer matiz; 30 e menos é o território em que a cor para de "gritar" e
 * vira apoio (é onde ficam as referências de app calmo). A ordem vai do mais
 * forte ao mais neutro, que é também a ordem de leitura na tela.
 */
export const PERFIS: PerfilDeRoda[] = [
	{
		valor: 'cromatica',
		rotulo: 'Cromática',
		descricao: 'A roda clássica: cor cheia em todos os matizes.',
		eixo: 'croma',
		cromaMax: 90,
		cromaPiso: 16,
		cromaNeutro: 3.5,
		tomDoDisco: 55,
		tonsDoDisco: [15, 95],
	},
	{
		valor: 'viva',
		rotulo: 'Viva',
		descricao: 'Cores fortes e contrastadas, para quem quer personalidade.',
		eixo: 'croma',
		cromaMax: 120,
		cromaPiso: 64,
		cromaNeutro: 5,
		tomDoDisco: 50,
		tonsDoDisco: [15, 95],
	},
	{
		valor: 'suave',
		rotulo: 'Suave',
		descricao: 'Cores calmas, sem saturação. O app respira.',
		eixo: 'croma',
		cromaMax: 32,
		cromaPiso: 12,
		cromaNeutro: 2.5,
		tomDoDisco: 55,
		tonsDoDisco: [15, 95],
	},
	{
		valor: 'pastel',
		rotulo: 'Pastel',
		descricao: 'Tons claros e levemente coloridos.',
		eixo: 'croma',
		cromaMax: 28,
		cromaPiso: 12,
		cromaNeutro: 3,
		tomDoDisco: 82,
		tonsDoDisco: [15, 95],
	},
	{
		valor: 'sobria',
		rotulo: 'Sóbria',
		descricao: 'Terrosos e acinzentados, como papel e pedra.',
		eixo: 'croma',
		cromaMax: 18,
		cromaPiso: 9,
		cromaNeutro: 2,
		tomDoDisco: 45,
		tonsDoDisco: [15, 95],
	},
	{
		valor: 'neutra',
		rotulo: 'Neutra',
		descricao: 'Sem cor: preto, cinza e branco. Hierarquia só por contraste.',
		eixo: 'tom',
		cromaMax: 0,
		cromaPiso: 0,
		cromaNeutro: 0,
		tomDoDisco: 50,
		// Claro no centro, escuro no aro: a mesma leitura das outras rodas, em
		// que "para fora" significa "mais". Aqui, mais tinta.
		tonsDoDisco: [96, 16],
	},
]

const POR_VALOR = new Map(PERFIS.map((perfil) => [perfil.valor, perfil]))

/** Perfil do tipo, com a roda cromática como padrão. Registro antigo cai aqui. */
export function perfilDe(tipo: TipoDeRoda | null | undefined): PerfilDeRoda {
	return POR_VALOR.get(tipo ?? 'cromatica') ?? PERFIS[0]!
}

/* --------------------------------------------------------------------------
   Geometria do disco
   -------------------------------------------------------------------------- */

/** Ângulo (0–359) da matiz num ponto normalizado; 0 = leste, sentido horário. */
export function matizDoRaio(x: number, y: number): number {
	const graus = (Math.atan2(y, x) * 180) / Math.PI
	return (graus + 360) % 360
}

/** Croma de um raio normalizado (0 = centro, 1 = borda). */
export function cromaDoRaio(tipo: TipoDeRoda | null | undefined, raio: number): number {
	const perfil = perfilDe(tipo)
	const r = clamp01(raio)
	if (perfil.eixo === 'tom') return 0
	return r * perfil.cromaMax
}

/** Tom de um raio normalizado, no eixo `tom`. Nos outros tipos é o do disco. */
export function tomDoRaio(tipo: TipoDeRoda | null | undefined, raio: number): number {
	const perfil = perfilDe(tipo)
	if (perfil.eixo !== 'tom') return perfil.tomDoDisco
	const [claro, escuro] = perfil.tonsDoDisco
	return claro + clamp01(raio) * (escuro - claro)
}

/**
 * Raio normalizado de um croma (o caminho de volta: onde o pino fica).
 *
 * No eixo `tom` o raio representa o tom, então croma não posiciona pino — o
 * que posiciona é o tom, em `raioDoTom`.
 */
export function raioDoCroma(tipo: TipoDeRoda | null | undefined, croma: number): number {
	const perfil = perfilDe(tipo)
	if (perfil.eixo === 'tom' || perfil.cromaMax === 0) return 0
	return clamp01(croma / perfil.cromaMax)
}

/** Raio normalizado de um tom, no eixo `tom`. */
export function raioDoTom(tipo: TipoDeRoda | null | undefined, tom: number): number {
	const perfil = perfilDe(tipo)
	const [claro, escuro] = perfil.tonsDoDisco
	if (perfil.eixo !== 'tom' || claro === escuro) return 0
	return clamp01((tom - claro) / (escuro - claro))
}

function clamp01(valor: number): number {
	return Math.min(Math.max(valor, 0), 1)
}

/* --------------------------------------------------------------------------
   Cor de um ponto do disco
   -------------------------------------------------------------------------- */

function paraHex(argb: number): string {
	return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`
}

export interface CorDoPonto {
	hex: string
	hue: number
	chroma: number
	tone: number
}

/**
 * Cor exata de um ponto do disco, em HCT.
 *
 * É a MESMA conta que posiciona o pino: o que o dedo vê sob o disco é o que
 * entra no tema. Nada de pintar o disco em HSV e converter depois — era isso
 * que fazia a amostra escolhida "não sair na tonalidade pedida".
 */
export function corDoPonto(
	tipo: TipoDeRoda | null | undefined,
	matiz: number,
	raio: number,
): CorDoPonto {
	const chroma = cromaDoRaio(tipo, raio)
	const tone = tomDoRaio(tipo, raio)
	const cor = Hct.from((matiz + 360) % 360, chroma, tone)
	return { hex: paraHex(cor.toInt()), hue: cor.hue, chroma: cor.chroma, tone: cor.tone }
}

/* --------------------------------------------------------------------------
   Harmonia entre as famílias
   -------------------------------------------------------------------------- */

/**
 * `intima` é a ausência de formação explícita: as famílias vêm do esquema
 * Material, exatamente como nas versões anteriores. É o padrão dos registros
 * antigos e o que garante que nada mude para quem nunca abriu esta tela.
 */
export type Harmonia =
	| 'intima'
	| 'analoga'
	| 'complementar'
	| 'dividida'
	| 'triade'
	| 'tetrade'
	| 'duotone'

export type HarmoniaExplicita = Exclude<Harmonia, 'intima'>

/** Ângulos das famílias derivadas, em graus relativos à semente. */
const ANGULOS: Record<HarmoniaExplicita, { secundaria: number; terciaria: number }> = {
	// Vizinhas da semente: calmo, quase monocromático.
	analoga: { secundaria: 30, terciaria: -30 },
	// Oposto direto: máxima distinção entre acento e apoio.
	complementar: { secundaria: 180, terciaria: 180 },
	// Os vizinhos do oposto: contraste forte sem o choque do direto.
	dividida: { secundaria: 150, terciaria: -150 },
	// Três matizes equidistantes.
	triade: { secundaria: 120, terciaria: -120 },
	// Quatro matizes em cruz (a semente fecha o quadrado).
	tetrade: { secundaria: 90, terciaria: 180 },
	// Cinzas + um acento: as derivadas perdem quase toda a cor.
	duotone: { secundaria: 0, terciaria: 0 },
}

export const HARMONIAS: Array<{ valor: HarmoniaExplicita; rotulo: string; descricao: string }> = [
	{ valor: 'analoga', rotulo: 'Análoga', descricao: 'Matizes vizinhas — o conjunto mais calmo' },
	{ valor: 'complementar', rotulo: 'Complementar', descricao: 'O oposto da semente nos apoios' },
	{ valor: 'dividida', rotulo: 'Dividida', descricao: 'Os vizinhos do oposto' },
	{ valor: 'triade', rotulo: 'Tríade', descricao: 'Três matizes equidistantes' },
	{ valor: 'tetrade', rotulo: 'Tétrade', descricao: 'Quatro matizes em cruz' },
	{ valor: 'duotone', rotulo: 'Duotone', descricao: 'Cinzas e um acento' },
]

/** A harmonia salva, com o padrão dos registros antigos. */
export function harmoniaDe(valor: Harmonia | null | undefined): Harmonia {
	return valor ?? 'intima'
}

export function ehIntima(valor: Harmonia | null | undefined): boolean {
	return harmoniaDe(valor) === 'intima'
}

/** Deslocamento manual de um pino derivado, em graus absolutos (0–359). */
export interface Deslocamentos {
	secundaria?: number
	terciaria?: number
}

function normalizarGraus(graus: number): number {
	return ((graus % 360) + 360) % 360
}

/** Ângulos resolvidos das derivadas, para desenhar a formação. */
export function angulosDa(
	harmonia: Harmonia | null | undefined,
	deslocamentos?: Deslocamentos | null,
): { secundaria: number; terciaria: number } {
	if (ehIntima(harmonia)) return { secundaria: 0, terciaria: 0 }
	const ativa = harmoniaDe(harmonia) as HarmoniaExplicita
	return {
		secundaria: deslocamentos?.secundaria ?? ANGULOS[ativa].secundaria,
		terciaria: deslocamentos?.terciaria ?? ANGULOS[ativa].terciaria,
	}
}

/** Matiz de uma família derivada. A primária é sempre a semente. */
export function matizDaFamilia(
	familia: 'secundaria' | 'terciaria',
	matizSemente: number,
	harmonia: Harmonia | null | undefined,
	deslocamentos?: Deslocamentos | null,
): number {
	return normalizarGraus(matizSemente + angulosDa(harmonia, deslocamentos)[familia])
}

/* --------------------------------------------------------------------------
   Croma por tipo
   -------------------------------------------------------------------------- */

/**
 * Croma do acento.
 *
 * O tipo manda: em "suave" o acento não pode continuar gritando, senão o tipo
 * não muda nada. Semente já acinzentada continua acinzentada — elevar o croma
 * de um cinza o transforma num bege que o usuário não pediu.
 */
export function cromaDoAcento(tipo: TipoDeRoda | null | undefined, cromaDaSemente: number): number {
	const perfil = perfilDe(tipo)
	if (perfil.eixo === 'tom') return 0
	// Semente acinzentada (croma < 8: "Pedra", "Carvão", "Gesso") fica cinza em
	// QUALQUER tipo: elevar o croma de um cinza o transforma num bege que o
	// usuário não pediu. O tipo decide a força; ele não inventa cor.
	if (cromaDaSemente < 8) return Math.min(cromaDaSemente, perfil.cromaPiso)
	return Math.min(Math.max(cromaDaSemente, perfil.cromaPiso), perfil.cromaMax)
}

/**
 * Croma das famílias derivadas.
 *
 * Um degrau abaixo do acento nos tipos suaves (apoio de apoio), e quase zero
 * no duotone, que existe justamente para ser "cinzas + um acento".
 */
export function cromaDaFamilia(
	tipo: TipoDeRoda | null | undefined,
	cromaDaSemente: number,
	harmonia?: Harmonia | null,
): number {
	const perfil = perfilDe(tipo)
	if (perfil.eixo === 'tom') return 0
	if (harmoniaDe(harmonia) === 'duotone') return 4

	const acento = cromaDoAcento(tipo, cromaDaSemente)
	if (perfil.cromaMax <= 32) return Math.min(acento, perfil.cromaMax - 6)
	return acento
}

/* --------------------------------------------------------------------------
   Formação pronta (para prévia e para os chips)
   -------------------------------------------------------------------------- */

export interface FormacaoEmHex {
	primaria: string
	secundaria: string
	terciaria: string
}

/**
 * Três amostras da formação, no tom do disco.
 *
 * Serve para a prévia e para os "recentes". O tom final de cada família é
 * decidido no `tema.ts` (faixa de legibilidade), não aqui.
 */
export function formacaoEmHex(
	matizSemente: number,
	cromaDaSemente: number,
	tipo: TipoDeRoda | null | undefined,
	harmonia: Harmonia | null | undefined,
	deslocamentos?: Deslocamentos | null,
): FormacaoEmHex {
	const perfil = perfilDe(tipo)
	const tom = perfil.tomDoDisco
	const cromaAcento = cromaDoAcento(tipo, cromaDaSemente)
	const cromaApoio = cromaDaFamilia(tipo, cromaDaSemente, harmonia)

	const cor = (matiz: number, croma: number): string =>
		paraHex(Hct.from(normalizarGraus(matiz), Math.min(croma, 120), tom).toInt())

	return {
		primaria: cor(matizSemente, cromaAcento),
		secundaria: ehIntima(harmonia)
			? cor(normalizarGraus(matizSemente + 8), cromaApoio)
			: cor(matizDaFamilia('secundaria', matizSemente, harmonia, deslocamentos), cromaApoio),
		terciaria: ehIntima(harmonia)
			? cor(normalizarGraus(matizSemente - 8), cromaApoio)
			: cor(matizDaFamilia('terciaria', matizSemente, harmonia, deslocamentos), cromaApoio),
	}
}

/** Uma formação completa, do jeito que é guardada. */
export interface Formacao {
	semente: string
	tipo: TipoDeRoda
	harmonia: Harmonia
	deslocamentos: Deslocamentos
}

/** O padrão do app: a mesma terracota da primeira versão, roda cromática. */
export const FORMACAO_PADRAO: Formacao = {
	semente: '#d96c47',
	tipo: 'cromatica',
	harmonia: 'intima',
	deslocamentos: {},
}
