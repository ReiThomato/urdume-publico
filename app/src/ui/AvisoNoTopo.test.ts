import { describe, expect, it } from 'vitest'

/**
 * Aviso no topo — a lógica de gesto, isolada.
 *
 * O componente depende de `pointer events` e de tempo; testar o JSX inteiro
 * exigiria jsdom e um runner de componente. O que realmente pode dar errado é
 * a **decisão** de dispensar: qual deslocamento conta como gesto, e em que
 * direção. Isso é matemática, e é o que este arquivo trava.
 *
 * A regra, copiada do componente de propósito (mantenha as duas iguais):
 *
 *   - arrastar mais de 48 px para o lado  → dispensar;
 *   - arrastar mais de 48 px para cima    → dispensar;
 *   - arrastar para baixo                 → volta ao lugar (não dispensa);
 *   - abaixo do limiar                    → volta ao lugar.
 */

const LIMIAR = 48

function deveDispensar(deslocamento: { x: number; y: number }): boolean {
	return Math.abs(deslocamento.x) > LIMIAR || deslocamento.y < -LIMIAR
}

/** Acompanha o eixo dominante, como o componente faz. */
function acompanhar(dx: number, dy: number): { x: number; y: number } {
	if (Math.abs(dx) > Math.abs(dy)) return { x: dx, y: 0 }
	return { x: 0, y: Math.min(0, dy) }
}

describe('gesto de dispensar', () => {
	it('para o lado além do limiar dispensa', () => {
		expect(deveDispensar({ x: 60, y: 0 })).toBe(true)
		expect(deveDispensar({ x: -60, y: 0 })).toBe(true)
	})

	it('para cima além do limiar dispensa', () => {
		expect(deveDispensar({ x: 0, y: -60 })).toBe(true)
	})

	it('para baixo NÃO dispensa', () => {
		expect(deveDispensar({ x: 0, y: 80 })).toBe(false)
	})

	it('abaixo do limiar não dispensa', () => {
		expect(deveDispensar({ x: 20, y: 0 })).toBe(false)
		expect(deveDispensar({ x: 0, y: -20 })).toBe(false)
	})

	it('o limiar é exato, sem margem escondida', () => {
		expect(deveDispensar({ x: LIMIAR, y: 0 })).toBe(false)
		expect(deveDispensar({ x: LIMIAR + 1, y: 0 })).toBe(true)
	})
})

describe('acompanhamento do dedo', () => {
	it('segue o eixo horizontal quando ele domina', () => {
		expect(acompanhar(40, 5)).toEqual({ x: 40, y: 0 })
	})

	it('segue o eixo vertical quando ele domina, e só para cima', () => {
		expect(acompanhar(5, -40)).toEqual({ x: 0, y: -40 })
		// Para baixo, a caixa não desce: não há o que revelar embaixo dela.
		expect(acompanhar(5, 40)).toEqual({ x: 0, y: 0 })
	})
})

/**
 * Contrato do componente: as três formas de dispensar precisam existir.
 *
 * Este teste é de leitura de fonte, e existe porque a regressão aqui é
 * silenciosa: alguém remove o botão ou o handler de gesto e nada quebra nos
 * testes de lógica — só o usuário, que fica sem conseguir fechar o aviso.
 */
describe('formas de dispensar', () => {
	it('o componente tem gesto, botão de fechar e ação opcional', async () => {
		const fs = await import('node:fs')
		const fonte = fs.readFileSync(new URL('./AvisoNoTopo.tsx', import.meta.url), 'utf-8')

		expect(fonte).toContain('onPointerDown')
		expect(fonte).toContain('onPointerMove')
		expect(fonte).toContain('onPointerUp')
		expect(fonte).toContain('aria-label="Fechar aviso"')
		expect(fonte).toContain('aviso.acao')
	})

	it('não usa position relative no contêiner (o CSS precisa do fixed)', async () => {
		const fs = await import('node:fs')
		const fonte = fs.readFileSync(new URL('./AvisoNoTopo.tsx', import.meta.url), 'utf-8')

		// Um `style={{ position: 'relative' }}` inline sobrescreve o `fixed` da
		// classe e o aviso passa a existir fora da tela. Aconteceu na primeira
		// versão.
		expect(fonte).not.toContain("position: 'relative'")
	})

	it('o CSS posiciona o aviso no topo, acima do conteúdo', async () => {
		const fs = await import('node:fs')
		const css = fs.readFileSync(new URL('../styles/app.css', import.meta.url), 'utf-8')

		expect(css).toMatch(/\.aviso-topo\s*\{[^}]*position:\s*fixed/)
		expect(css).toMatch(/\.aviso-topo\s*\{[^}]*top:/)
		expect(css).toMatch(/\.aviso-topo\s*\{[^}]*z-index:\s*6/)
	})
})
