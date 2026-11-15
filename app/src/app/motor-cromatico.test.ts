import { describe, expect, it } from 'vitest'
import { Hct } from '@material/material-color-utilities'
import { coresDoEsquema, contraste } from '@/app/tema'
import {
	HARMONIAS,
	PERFIS,
	cromaDoAcento,
	cromaDaFamilia,
	formacaoEmHex,
	matizDaFamilia,
	perfilDe,
	raioDoCroma,
} from '@/app/motor-cromatico'
import type { Harmonia, TipoDeRoda } from '@/app/motor-cromatico'

/**
 * Contrato do motor cromático.
 *
 * O que ele promete, e que estes testes travam:
 *
 * 1. Cada TIPO de roda muda o app de verdade (era o defeito do "estilo da
 *    paleta": oito nomes, um resultado).
 * 2. Cada HARMONIA afasta as famílias da semente em ângulos reais.
 * 3. Nenhuma combinação de tipo, harmonia e semente quebra o contraste 4,5:1
 *    do acento nem do container — o portão do `tema.ts` manda, sempre.
 * 4. A roda NEUTRA não tem cor nenhuma: nem no acento, nem nas superfícies.
 * 5. Registro antigo (sem tipo nem harmonia) cai no comportamento histórico.
 */

const BASE = {
	modo: 'light' as const,
	amoled: false,
	semente: '#d96c47',
	tipo: 'cromatica' as TipoDeRoda,
	harmonia: 'intima' as Harmonia,
	deslocamentos: {},
	fonte: 'figtree' as const,
}

function cores(tipo: TipoDeRoda, harmonia: Harmonia, semente = '#d96c47', escuro = false): Record<string, number> {
	return coresDoEsquema({ ...BASE, tipo, harmonia, semente }, escuro)
}

function matiz(argb: number): number {
	return Hct.fromInt(argb).hue
}

function diferencaDeMatiz(a: number, b: number): number {
	const bruta = Math.abs(a - b) % 360
	return bruta > 180 ? 360 - bruta : bruta
}

const TIPOS = PERFIS.map((perfil) => perfil.valor)

describe('tipos de roda', () => {
	it('cada tipo produz um acento diferente', () => {
		const acentos = TIPOS.map((tipo) => cores(tipo, 'intima').primary)
		expect(new Set(acentos).size).toBe(TIPOS.length)
	})

	it('cada tipo tinge as superfícies de um jeito (suave não é igual a viva)', () => {
		// `surface` é quase branco nos dois (tom 98) e arredonda igual em 8 bits;
		// o degrau onde o tingimento aparece é o container.
		const suave = cores('suave', 'intima')
		const viva = cores('viva', 'intima')
		expect(suave.surfaceContainerHigh).not.toBe(viva.surfaceContainerHigh)
	})
	it('a roda neutra não tem cor: acento e superfícies com croma zero', () => {
		for (const escuro of [false, true]) {
			const c = cores('neutra', 'intima', '#d96c47', escuro)
			// Resíduo mínimo de HCT→sRGB é aceitável; qualquer matiz visível não.
			expect(Hct.fromInt(c.primary!).chroma).toBeLessThan(3)
			expect(Hct.fromInt(c.surface!).chroma).toBeLessThan(3)
			expect(Hct.fromInt(c.surfaceContainerHigh!).chroma).toBeLessThan(3)
		}
	})

	it('roda suave entrega menos croma que a viva, na mesma semente', () => {
		const suave = Hct.fromInt(cores('suave', 'intima').primary!).chroma
		const viva = Hct.fromInt(cores('viva', 'intima').primary!).chroma
		expect(suave).toBeLessThan(viva)
	})

	it('semente acinzentada continua cinza em qualquer tipo colorido', () => {
		for (const tipo of TIPOS) {
			const c = Hct.fromInt(cores(tipo, 'intima', '#6f6a63').primary!)
			// Neutra zera, os outros mantêm o cinza da semente (croma ~4).
			expect(c.chroma).toBeLessThan(10)
		}
	})

	it('perfil desconhecido (registro estranho) cai na roda cromática', () => {
		expect(perfilDe(undefined).valor).toBe('cromatica')
		expect(perfilDe('inexistente' as TipoDeRoda).valor).toBe('cromatica')
	})
})

describe('harmonia entre famílias', () => {
	it('cada harmonia dá uma secundária diferente', () => {
		const secundarias = HARMONIAS.map((h) => cores('cromatica', h.valor).secondary)
		expect(new Set(secundarias).size).toBe(HARMONIAS.length)
	})

	it('a matiz da família respeita o ângulo da regra', () => {
		const semente = Hct.fromInt(0xffd96c47).hue
		expect(diferencaDeMatiz(matizDaFamilia('secundaria', semente, 'complementar'), semente)).toBeCloseTo(180, 0)
		expect(diferencaDeMatiz(matizDaFamilia('secundaria', semente, 'triade'), semente)).toBeCloseTo(120, 0)
		expect(diferencaDeMatiz(matizDaFamilia('terciaria', semente, 'triade'), semente)).toBeCloseTo(120, 0)
	})

	it('no app, a secundária sai longe da semente (o defeito antigo eram 12°)', () => {
		const c = cores('cromatica', 'complementar')
		// O tom e o croma mudam na paleta, mas a matiz não pode voltar para a
		// família da semente: é isso que faz a harmonia ser visível.
		expect(diferencaDeMatiz(matiz(c.secondary!), matiz(c.primary!))).toBeGreaterThan(120)
	})

	it('duotone deixa as famílias quase neutras e mantém o acento vivo', () => {
		const c = cores('cromatica', 'duotone')
		expect(Hct.fromInt(c.secondary!).chroma).toBeLessThan(10)
		expect(Hct.fromInt(c.tertiary!).chroma).toBeLessThan(10)
		expect(Hct.fromInt(c.primary!).chroma).toBeGreaterThan(20)
	})

	it('o deslocamento à mão vence a regra', () => {
		const semente = Hct.fromInt(0xffd96c47).hue
		const comDeslocamento = matizDaFamilia('secundaria', semente, 'complementar', { secundaria: 40 })
		expect(diferencaDeMatiz(comDeslocamento, semente)).toBeCloseTo(40, 0)
	})
})

describe('legibilidade garantida por construção', () => {
	const SEMENTES = [
		'#d96c47', '#ff00ff', '#0066ff', '#00c853', '#ffd400', '#111111',
		'#ffffff', '#6f6a63', '#cfc9bd', '#3a3a3c', '#8a2be2', '#00e5ff',
	]

	it(
		'acento e container passam 4,5:1 em todo tipo, harmonia, tema e semente',
		() => {
			for (const tipo of TIPOS) {
				for (const harmonia of ['intima', ...HARMONIAS.map((h) => h.valor)] as Harmonia[]) {
					for (const semente of SEMENTES) {
						for (const escuro of [false, true]) {
							const c = cores(tipo, harmonia, semente, escuro)
							expect(contraste(c.primary!, c.onPrimary!)).toBeGreaterThanOrEqual(4.5)
							expect(contraste(c.primaryContainer!, c.onPrimaryContainer!)).toBeGreaterThanOrEqual(4.5)
						}
					}
				}
			}
		},
		30_000,
	)

	it(
		'as famílias derivadas também têm texto legível',
		() => {
			for (const tipo of TIPOS) {
				for (const harmonia of HARMONIAS.map((h) => h.valor)) {
					for (const semente of SEMENTES) {
						for (const escuro of [false, true]) {
							const c = cores(tipo, harmonia, semente, escuro)
							expect(contraste(c.secondary!, c.onSecondary!)).toBeGreaterThanOrEqual(4.5)
							expect(contraste(c.tertiary!, c.onTertiary!)).toBeGreaterThanOrEqual(4.5)
							expect(contraste(c.secondaryContainer!, c.onSecondaryContainer!)).toBeGreaterThanOrEqual(4.5)
						}
					}
				}
			}
		},
		30_000,
	)

	it('o texto sobre a superfície continua legível em todo tipo', () => {
		for (const tipo of TIPOS) {
			for (const escuro of [false, true]) {
				const c = cores(tipo, 'intima', '#d96c47', escuro)
				expect(contraste(c.onSurface!, c.surface!)).toBeGreaterThanOrEqual(7)
				expect(contraste(c.onSurfaceVariant!, c.surface!)).toBeGreaterThanOrEqual(4.5)
			}
		}
	})
})

describe('compatibilidade com registros antigos', () => {
	it('sem tipo nem harmonia, a paleta é a histórica (intima + cromatica)', () => {
		const legado = coresDoEsquema({ ...BASE, tipo: undefined, harmonia: undefined } as never, false)
		const atual = coresDoEsquema(BASE, false)
		expect(atual.primary).toBe(legado.primary)
		expect(atual.secondary).toBe(legado.secondary)
		expect(atual.tertiary).toBe(legado.tertiary)
		expect(atual.surface).toBe(legado.surface)
	})

	it('o campo legado `estilo` não muda mais nada', () => {
		const tonal = coresDoEsquema({ ...BASE, estilo: 'tonal' }, false)
		const frutas = coresDoEsquema({ ...BASE, estilo: 'frutas' }, false)
		expect(tonal.primary).toBe(frutas.primary)
		expect(tonal.secondary).toBe(frutas.secondary)
	})
})

describe('roda: geometria e amostra', () => {
	it('o centro é cinza e a borda é a cor mais forte do tipo', () => {
		expect(cromaDoAcento('sobria', 100)).toBeLessThanOrEqual(18)
		expect(raioDoCroma('sobria', 0)).toBe(0)
		expect(raioDoCroma('sobria', 18)).toBe(1)
	})

	it('fora da faixa não estoura: croma acima do máximo satura em 1', () => {
		expect(raioDoCroma('cromatica', 999)).toBe(1)
		expect(raioDoCroma('cromatica', -5)).toBe(0)
	})

	it('a formação em hex tem três cores distintas nos tipos coloridos', () => {
		const formacao = formacaoEmHex(20, 40, 'viva', 'triade')
		expect(new Set([formacao.primaria, formacao.secundaria, formacao.terciaria]).size).toBe(3)
	})

	it('na roda neutra a formação é acromática', () => {
		const formacao = formacaoEmHex(20, 40, 'neutra', 'triade')
		for (const hex of [formacao.primaria, formacao.secundaria, formacao.terciaria]) {
			const valor = Number.parseInt(hex.slice(1), 16) | 0xff000000
			// Croma 0 pedido; a conversão HCT→sRGB→HCT devolve até ~2 de resíduo
			// num cinza, que é imperceptível (< 1% de saturação).
			expect(Hct.fromInt(valor).chroma).toBeLessThan(3)
		}
	})

	it('croma da família é menor que o do acento nos tipos suaves', () => {
		expect(cromaDaFamilia('pastel', 60, 'analoga')).toBeLessThan(cromaDoAcento('pastel', 60))
	})
})
