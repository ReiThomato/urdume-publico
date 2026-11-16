import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A ilha do Jarvis é um OVERLAY, no padrão da Ilha Dinâmica do iPhone.
 * Regras que o código precisa manter:
 *
 * 1. **não empurra o layout** — nenhuma reserva de altura no fluxo;
 * 2. **sai do TOPO da tela**, centralizada, por cima do cabeçalho — como a
 *    notificação do iPhone. Não é uma faixa abaixo do título: isso a deixava a
 *    70 px do topo, parecendo um cartão solto no meio da tela;
 * 3. **toque recolhe** para a gota;
 * 4. **arrasto em qualquer direção dispensa** ("Agora não");
 * 5. **botões têm prioridade** sobre os gestos.
 *
 * Este teste lê o fonte de propósito. Os defeitos 1, 2 e o "jogada para baixo"
 * são invisíveis em teste de unidade de componente: o bug está na relação
 * entre um componente (que publica uma variável) e o CSS de outra tela.
 */

const raiz = join(import.meta.dirname, '..')
const app = readFileSync(join(raiz, 'styles/app.css'), 'utf8')
const ilha = readFileSync(join(raiz, 'styles/ilha.css'), 'utf8')
const componente = readFileSync(join(raiz, 'ui/IlhaDoJarvis.tsx'), 'utf8')
const shell = readFileSync(join(raiz, 'ui/AppShell.tsx'), 'utf8')

/**
 * O CSS sem comentários.
 *
 * Várias asserções são "esta string NÃO aparece", e os comentários explicam o
 * defeito antigo citando exatamente o valor proibido. Sem tirar comentário, o
 * teste acusa a própria explicação.
 */
const semComentario = (texto: string): string => texto.replace(/\/\*[\s\S]*?\*\//g, '')

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

	it('a ilha sai do topo, não de baixo do cabeçalho', () => {
		const bloco = /\.ilha-area\s*\{([\s\S]*?)\}/.exec(semComentario(ilha))
		expect(bloco, 'não achei .ilha-area').not.toBeNull()

		expect(bloco![1]).toContain('position: fixed')

		/*
		 * A regressão que este teste guarda: a ilha já foi ancorada em
		 * `safe-area + --topo-h + 6px`, ou seja, ABAIXO do cabeçalho. Ela
		 * nasce a 70 px do topo e o usuário lê isso como "jogada para baixo".
		 *
		 * O correto é o topo absoluto dentro da safe area. Somar `--topo-h`
		 * aqui é o defeito.
		 */
		expect(bloco![1]).not.toContain('--topo-h')
		expect(bloco![1]).toMatch(/top:\s*calc\(env\(safe-area-inset-top\)\s*\+\s*\d+px\)/)
	})

	it('a ilha fica acima de tudo o que flutua', () => {
		// Cabeçalho 20, barra 40, FAB 45/46, aviso 60 — a fala do Jarvis é a
		// camada de cima, senão o lembrete do sistema cobre a notificação.
		const bloco = /\.ilha-area\s*\{([\s\S]*?)\}/.exec(semComentario(ilha))
		expect(bloco, 'não achei .ilha-area').not.toBeNull()
		const z = /z-index:\s*(\d+)/.exec(bloco?.[1] ?? '')
		expect(z, 'ilha sem z-index').not.toBeNull()
		expect(Number(z?.[1] ?? 0)).toBeGreaterThan(60)
	})

	it('o cabeçalho continua publicando a própria altura', () => {
		// A ilha não usa mais `--topo-h`, mas outras medidas dependem dele.
		expect(shell).toContain("setProperty('--topo-h'")
		expect(shell).toContain('ResizeObserver')
	})

	it('a faixa deixa o toque passar; só o cartão intercepta', () => {
		const bloco = /\.ilha-area\s*\{([\s\S]*?)\}/.exec(semComentario(ilha))
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
