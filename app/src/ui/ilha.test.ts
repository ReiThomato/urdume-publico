import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A ilha do Jarvis é um OVERLAY. Regras que o código precisa manter:
 *
 * 1. **não empurra o layout** — nenhuma reserva de altura no fluxo;
 * 2. **não cobre o título** — fica abaixo do cabeçalho, não em cima;
 * 3. **toque recolhe** para a gota;
 * 4. **arrasto em qualquer direção dispensa** ("Agora não");
 * 5. **botões têm prioridade** sobre os gestos.
 *
 * Este teste lê o fonte de propósito. Os defeitos 1 e 2 já aconteceram e são
 * invisíveis em teste de unidade de componente: o bug está na relação entre um
 * componente (que publica uma variável) e o CSS de outra tela (que a consome).
 * Foi assim que "ilha discreta" virou "conteúdo pulando".
 */

const raiz = join(import.meta.dirname, '..')
const app = readFileSync(join(raiz, 'styles/app.css'), 'utf8')
const ilha = readFileSync(join(raiz, 'styles/ilha.css'), 'utf8')
const componente = readFileSync(join(raiz, 'ui/IlhaDoJarvis.tsx'), 'utf8')
const shell = readFileSync(join(raiz, 'ui/AppShell.tsx'), 'utf8')

describe('ilha não altera o layout', () => {
	it('o cabeçalho NÃO reserva espaço para a ilha', () => {
		// O defeito original: `padding-top: calc(var(--s-3) + var(--ilha-altura))`.
		// Cada recado empurrava o conteúdo ~90 px e puxava de volta ao recolher.
		expect(app).not.toContain('--ilha-altura')
		expect(app).not.toMatch(/\.topo[^{]*\{[^}]*padding-top:\s*calc\([^)]*ilha/m)
	})

	it('o componente não publica altura para o layout', () => {
		expect(componente).not.toContain('--ilha-altura')
		expect(componente).not.toContain('ResizeObserver')
	})

	it('a ilha é fixed e fica abaixo do cabeçalho', () => {
		const bloco = /\.ilha-area\s*\{([\s\S]*?)\}/.exec(ilha)
		expect(bloco, 'não achei .ilha-area').not.toBeNull()

		expect(bloco![1]).toContain('position: fixed')
		// Abaixo do cabeçalho: usa a altura publicada por `.topo`.
		expect(bloco![1]).toContain('--topo-h')
	})

	it('o cabeçalho publica a própria altura real', () => {
		expect(shell).toContain("setProperty('--topo-h'")
		expect(shell).toContain('ResizeObserver')
	})

	it('a faixa deixa o toque passar; só o cartão intercepta', () => {
		const bloco = /\.ilha-area\s*\{([\s\S]*?)\}/.exec(ilha)
		expect(bloco![1]).toContain('pointer-events: none')

		const cartao = /\.ilha\s*\{([\s\S]*?)\}/.exec(ilha)
		expect(cartao![1]).toContain('pointer-events: auto')
	})
})

describe('gestos', () => {
	it('toque recolhe para a gota', () => {
		// No soltar sem arrasto, `setRecolhida(true)`.
		expect(componente).toMatch(/setRecolhida\(true\)/)
	})

	it('arrasto em QUALQUER direção dispensa', () => {
		/*
		 * A versão anterior só aceitava arrasto para cima
		 * (`if (arrasto < -LIMIAR)`), e só no eixo Y. O pedido é o oposto:
		 * qualquer direção vale como "Agora não".
		 */
		expect(componente).toContain('LIMIAR_DISPENSA')
		// A distância é euclidiana: cobre x negativo, positivo e y de ambos.
		expect(componente).toMatch(/Math\.hypot\(\s*deslocamento\.x,\s*deslocamento\.y\s*\)/)
		expect(componente).not.toMatch(/arrasto\s*<\s*-LIMIAR/)
	})

	it('toque e arrasto são distinguidos por limiar', () => {
		// Sem isto, um dedo que escorrega 2 px viraria dispensa.
		expect(componente).toContain('LIMIAR_ARRASTO')
		expect(componente).toMatch(/Math\.hypot\(dx,\s*dy\)\s*<\s*LIMIAR_ARRASTO/)
	})

	it('botões dentro da ilha não disparam gesto', () => {
		expect(componente).toContain("closest('button, a, input, textarea, select')")
	})

	it('durante o arrasto a transição do transform é desligada', () => {
		expect(ilha).toContain('.ilha--arrastando')
		const bloco = /\.ilha--arrastando\s*\{([\s\S]*?)\}/.exec(ilha)
		expect(bloco![1]).toContain('transition: none')
	})

	it('o gesto não vira rolagem da página no WebView', () => {
		expect(ilha).toContain('touch-action: none')
	})
})

describe('a ilha continua sendo só um exibidor', () => {
	it('não executa ação no toque do corpo', () => {
		/*
		 * Tocar no cartão recolhe — não abre a tela, não executa nada. As únicas
		 * ações são os três botões explícitos. Isso mantém a ilha como leitor de
		 * notícias, não como atalho acidental.
		 *
		 * O corte vai até o `onClick` dos botões: antes dele só existe o gesto.
		 */
		const gesto = componente.slice(
			componente.indexOf('const aoPressionar'),
			componente.indexOf("className=\"ilha__acoes\""),
		)
		expect(gesto).not.toContain('onAbrir(atual)')
		expect(gesto).not.toContain('onFazer(atual)')
		expect(gesto).not.toContain('onDispensar(')
	})

	it('os três botões continuam existindo', () => {
		expect(componente).toContain('Agora não')
		expect(componente).toContain('onFazer(atual)')
		expect(componente).toContain('onAbrir(atual)')
	})
})
