import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Contrato de acessibilidade da prévia de ações da conversa.
 *
 * A prévia é a tela em que o usuário aprova o que a IA vai fazer. Ela tinha um
 * defeito de alvo: o `<label>` cobria só o selo de risco, e o texto que
 * descreve a ação — a parte que a pessoa lê para decidir — ficava fora. Tocar
 * na frase não marcava nada, e leitor de tela anunciava "Incluir ação" sem o
 * texto visível associado.
 *
 * Este teste lê o fonte porque o componente exige uma resposta real da IA para
 * renderizar. É verificação estrutural, não de comportamento; o
 * comportamento do alvo foi medido no navegador.
 */

const raiz = join(process.cwd(), 'src')
const conversa = readFileSync(join(raiz, 'ui/ConversaJarvis.tsx'), 'utf8')
const css = readFileSync(join(raiz, 'styles/app.css'), 'utf8')

describe('prévia de ações da IA', () => {
	it('o texto da ação está dentro do <label> do checkbox', () => {
		const inicioLabel = conversa.indexOf('className="conversa__previa-escolha"')
		expect(inicioLabel).toBeGreaterThan(-1)

		const trecho = conversa.slice(inicioLabel, inicioLabel + 2600)
		expect(trecho).toContain('conversa__previa-texto')
		// O texto precisa vir antes do fechamento do label.
		const posicaoTexto = trecho.indexOf('conversa__previa-texto')
		const fimLabel = trecho.indexOf('</label>')
		expect(fimLabel).toBeGreaterThan(posicaoTexto)
	})

	it('o checkbox tem nome acessível com a descrição da ação', () => {
		expect(conversa).toContain('aria-label={`Incluir ação:')
	})

	it('o rótulo é uma coluna, para o texto não espremer o selo', () => {
		const regra = css.slice(css.indexOf('.conversa__previa-escolha {'), css.indexOf('.conversa__previa-escolha::after'))
		expect(regra).toContain('flex-direction: column')
	})

	it('o item desmarcado esmaece o texto, e não só o selo', () => {
		expect(css).toContain('.conversa__previa:not(.conversa__previa--marcada) .conversa__previa-texto')
	})
})
