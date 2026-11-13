import { describe, expect, it } from 'vitest'
import { Hct, TonalPalette } from '@material/material-color-utilities'
import { coresDoEsquema, contraste } from './tema'

/**
 * A cor-semente precisa chegar ao acento.
 *
 * O bug que originou este teste: escolher magenta (#FF00FF) em "Nova cor"
 * salvava a semente, mas o primário saía #F1B3E6 — rosa pálido, quase igual ao
 * da paleta pronta. O esquema Material fixa o croma do primário em ~36, então
 * qualquer semente saturada virava pastel e o usuário concluía, com razão, que
 * o seletor "não fazia nada".
 *
 * O teste reproduz a regra de `coresDoEsquema` sem tocar em DOM: a matiz precisa
 * ser preservada e o croma não pode desabar.
 */

/** Mesma regra de `app/tema.ts` — manter em sincronia. */
function acentoDaSemente(hex: string, escuro: boolean): { hue: number; chroma: number } {
	const semente = Hct.fromInt(Number.parseInt(hex.replace('#', ''), 16) | 0xff000000)
	const croma = semente.chroma < 12 ? semente.chroma : Math.max(semente.chroma, 16)
	const tom = TonalPalette.fromHueAndChroma(semente.hue, croma).tone(escuro ? 80 : 40)
	const resultado = Hct.fromInt(tom)
	return { hue: resultado.hue, chroma: resultado.chroma }
}

function diferencaDeMatiz(a: number, b: number): number {
	const bruta = Math.abs(a - b) % 360
	return bruta > 180 ? 360 - bruta : bruta
}

const PREFERENCIAS = { modo: 'light' as const, amoled: false, semente: '#d96c47', estilo: 'tonal' as const, fonte: 'figtree' as const }

describe('acento derivado da cor-semente', () => {
	it('mantém a matiz da semente magenta (não vira rosa de outra família)', () => {
		const semente = Hct.fromInt(0xffff00ff)
		const acento = acentoDaSemente('#ff00ff', false)

		expect(diferencaDeMatiz(acento.hue, semente.hue)).toBeLessThan(12)
	})

	it('não apaga o croma de uma semente forte', () => {
		const semente = Hct.fromInt(0xffff00ff)
		const acento = acentoDaSemente('#ff00ff', false)

		// O esquema Material padrão devolvia ~36; a semente tem ~107.
		expect(acento.chroma).toBeGreaterThan(semente.chroma * 0.6)
	})

	it('respeita o cinza: semente neutra continua neutra', () => {
		const acento = acentoDaSemente('#6f6a63', false)
		// Pedra tem croma ~4; elevar para 12 a transformaria em bege.
		expect(acento.chroma).toBeLessThan(10)
	})

	it('funde a cor em toda a paleta mantendo matizes coerentes', () => {
		for (const hex of ['#ff00ff', '#00c853', '#2962ff', '#ffe600']) {
			const semente = Hct.fromInt(Number.parseInt(hex.slice(1), 16) | 0xff000000)
			const claro = acentoDaSemente(hex, false)
			const escuro = acentoDaSemente(hex, true)

			expect(diferencaDeMatiz(claro.hue, semente.hue)).toBeLessThan(12)
			expect(diferencaDeMatiz(escuro.hue, semente.hue)).toBeLessThan(12)
		}
	})
})

describe('cor personalizada aplicada como as nativas', () => {
	/**
	 * O sintoma relatado: "quando defino uma nova cor, a mudança não é
	 * perceptível como nas cores nativas". A causa era o TOM fixo (40 no claro):
	 * uma cor clara ou viva saía escurecida, longe da amostra que o usuário
	 * acabou de escolher.
	 */
	it('mantém um tom próximo da cor escolhida, sem escurecer tudo para 40', () => {
		for (const hex of ['#ffd400', '#00ff00', '#00e5ff', '#ff2d78', '#0066ff']) {
			const prefs = { ...PREFERENCIAS, semente: hex }
			const cores = coresDoEsquema(prefs, false)
			const escolhida = Hct.fromInt(Number.parseInt(hex.slice(1), 16) | 0xff000000)
			const aplicada = Hct.fromInt(cores.primary!)

			expect(diferencaDeMatiz(aplicada.hue, escolhida.hue)).toBeLessThan(12)
			// Antes: um amarelo de tom 86 saía em tom 40 (46 de diferença).
			expect(Math.abs(aplicada.tone - escolhida.tone)).toBeLessThanOrEqual(26)
		}
	})

	it('funciona no escuro com o mesmo princípio', () => {
		for (const hex of ['#ffd400', '#0066ff', '#ff00ff']) {
			const prefs = { ...PREFERENCIAS, semente: hex }
			const cores = coresDoEsquema(prefs, true)
			const escolhida = Hct.fromInt(Number.parseInt(hex.slice(1), 16) | 0xff000000)
			const aplicada = Hct.fromInt(cores.primary!)

			expect(diferencaDeMatiz(aplicada.hue, escolhida.hue)).toBeLessThan(12)
			expect(aplicada.tone).toBeGreaterThan(escolhida.tone - 40)
		}
	})

	/** Botão e chip com texto por cima precisam continuar legíveis. */
	it('mantém contraste de 4,5:1 entre o acento e seu texto, em qualquer semente', () => {
		const sementes = [
			'#ff00ff', '#0066ff', '#00c853', '#ffd400', '#111111', '#8a2be2',
			'#ff2d78', '#00ff00', '#7a9e52', '#d96c47', '#ffffff', '#f5f0e8',
		]

		for (const semente of sementes) {
			for (const escuro of [false, true]) {
				const cores = coresDoEsquema({ ...PREFERENCIAS, semente }, escuro)
				expect(contraste(cores.primary!, cores.onPrimary!)).toBeGreaterThanOrEqual(4.5)
				expect(contraste(cores.primaryContainer!, cores.onPrimaryContainer!)).toBeGreaterThanOrEqual(4.5)
			}
		}
	})

	it('semente cinza continua cinza (não vira bege)', () => {
		const cores = coresDoEsquema({ ...PREFERENCIAS, semente: '#6f6a63' }, false)
		expect(Hct.fromInt(cores.primary!).chroma).toBeLessThan(10)
	})

	/** O resto do app usa secundário e terciário: eles também precisam reagir. */
	it('secundário e terciário acompanham a semente', () => {
		const laranja = coresDoEsquema({ ...PREFERENCIAS, semente: '#d96c47' }, false)
		const azul = coresDoEsquema({ ...PREFERENCIAS, semente: '#0066ff' }, false)

		expect(azul.secondary).not.toBe(laranja.secondary)
		expect(azul.tertiary).not.toBe(laranja.tertiary)
		expect(diferencaDeMatiz(Hct.fromInt(azul.secondary!).hue, Hct.fromInt(azul.primary!).hue)).toBeLessThan(12)
	})
})
