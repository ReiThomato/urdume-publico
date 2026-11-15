import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contratos que o aparelho já quebrou uma vez.
 *
 * Cada asserção aqui corresponde a um defeito que só apareceu no Redmi e que
 * custou uma rodada. Ler o fonte não substitui testar no aparelho, mas impede
 * que a correção seja desfeita sem ninguém notar.
 */

const raiz = join(process.cwd(), 'src')
const folhaTsx = readFileSync(join(raiz, 'ui/Folha.tsx'), 'utf8')
const folhaCss = readFileSync(join(raiz, 'styles/folha.css'), 'utf8')
const appCss = readFileSync(join(raiz, 'styles/app.css'), 'utf8')
const navCss = readFileSync(join(raiz, 'styles/nav.css'), 'utf8')
const mainTsx = readFileSync(join(raiz, 'main.tsx'), 'utf8')

describe('folha com o teclado aberto', () => {
	it('mede o que o teclado ocupa, não só a altura visível', () => {
		// Altura certa + posição errada = botões atrás do teclado.
		expect(folhaTsx).toContain('--folha-teclado')
		expect(folhaCss).toContain('padding-bottom: var(--folha-teclado, 0px)')
	})

	it('as ações do formulário não são sticky', () => {
		// `sticky` dentro do corpo fazia os botões flutuarem sobre o teclado.
		expect(appCss).not.toMatch(/\.folha__corpo form\.formulario > \.formulario__acoes\s*{[^}]*position:\s*sticky/)
	})

	it('o voltar do Android fecha a folha antes de navegar', () => {
		expect(mainTsx).toContain('fecharFolhaDoTopo')
		expect(folhaTsx).toContain('registrarFechadorDeFolha')
	})
})

describe('barra inferior', () => {
	it('o item ativo é retângulo arredondado, não pílula', () => {
		const regra = navCss.slice(navCss.indexOf('.destinos__indicador {'))
		const trecho = regra.slice(0, regra.indexOf('}'))
		expect(trecho).toContain('border-radius: 14px')
		expect(trecho).not.toContain('var(--r-pill)')
	})

	it('os dois FABs têm o mesmo tamanho', () => {
		const conversa = appCss.slice(appCss.indexOf('.fab--conversa {'))
		expect(conversa.slice(0, conversa.indexOf('}'))).toContain('width: var(--s-12)')
	})
})

describe('arrasto da folha', () => {
	const folha = readFileSync(join(raiz, 'ui/Folha.tsx'), 'utf8')

	it('usa eventos de toque, não de ponteiro', () => {
		// `touch-action: pan-y` faz o navegador cancelar `pointermove` no meio do
		// gesto — o arrasto nunca completava no aparelho.
		expect(folha).toContain("addEventListener('touchstart'")
		expect(folha).toContain("addEventListener('touchmove'")
	})

	it('o gesto vive no painel inteiro, não numa faixa', () => {
		expect(folha).toMatch(/painel\.addEventListener\('touchstart'/)
	})

	it('desiste do arrasto quando o conteúdo ainda pode rolar', () => {
		expect(folha).toContain('podeArrastarDe')
		expect(folha).toContain('scrollTop > 0')
	})
})
