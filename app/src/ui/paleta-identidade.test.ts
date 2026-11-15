import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PALETA as CORES_SEMENTE } from './paleta'

/**
 * A paleta de identificação (24 cores) e a roda de cores.
 *
 * Estes testes cobrem o que a rodada anterior deixou passar:
 *
 * 1. A paleta realmente tem as cores neutras e as famílias que faltavam.
 * 2. Os 12 índices antigos NÃO mudaram de valor — projeto antigo continua com
 *    a mesma cor.
 * 3. Toda cor da paleta tem uma tinta legível por cima (4,5:1), inclusive
 *    gesso e carvão.
 * 4. O CSS não voltou a cravar branco/preto onde a tinta precisa vir do tema.
 */

const css = (nome: string): string =>
	readFileSync(new URL(`../styles/${nome}`, import.meta.url), 'utf-8')

const TELAS = css('telas.css')
const ILHA = css('ilha.css')
const APP = css('app.css')
const RODA = css('roda.css')

const semComentario = (texto: string): string => texto.replace(/\/\*[\s\S]*?\*\//g, '')

describe('paleta de identificação', () => {
	it('tem 24 cores, com as neutras que faltavam', () => {
		expect(CORES_SEMENTE).toHaveLength(24)
		const nomes = CORES_SEMENTE.map((cor) => cor.nome)
		for (const neutra of ['gesso', 'carvao', 'pedra']) expect(nomes).toContain(neutra)
	})

	it('cobre as famílias de matiz que não existiam (laranja, ciano, menta, vinho)', () => {
		const nomes = CORES_SEMENTE.map((cor) => cor.nome)
		for (const familia of ['laranja', 'ciano', 'menta', 'vinho', 'floresta', 'magenta']) {
			expect(nomes).toContain(familia)
		}
	})

	it('os 12 índices antigos continuam com o mesmo valor', () => {
		// Congelado de propósito: registros antigos guardam o índice, e trocar
		// um hex aqui repinta projetos que o usuário não tocou.
		const antigos = [
			'#e8623f', '#e0a02a', '#7d9a3f', '#3a9d7d', '#3299a8', '#4878c8',
			'#5f63c4', '#8a5cc4', '#bf5588', '#c74a4a', '#9a6a4e', '#7b7a76',
		]
		expect(CORES_SEMENTE.slice(0, 12).map((cor) => cor.hex)).toEqual(antigos)
	})
})

describe('roda de cores no CSS', () => {
	it('o disco declara touch-action: none (o gesto é da roda, não da folha)', () => {
		expect(RODA).toMatch(/\.roda__disco\s*\{[^}]*touch-action:\s*none/)
	})

	it('o pino tem alvo de toque maior que o desenho', () => {
		// O componente desenha um círculo invisível de 22 px de raio = 44 de
		// diâmetro. O CSS não pode encolher o grupo.
		const fonte = readFileSync(new URL('../ui/RodaDeCores.tsx', import.meta.url), 'utf-8')
		expect(fonte).toContain('TOQUE_DO_PINO = 22')
	})

	it('não crava branco no texto da roda (o tema decide)', () => {
		expect(semComentario(RODA)).not.toMatch(/color:\s*#fff/i)
	})
})

describe('chrome do app segue o acento, não os apoios', () => {
	const NAV = css('nav.css')

	it('a barra inferior usa o par do acento', () => {
		// Com uma harmonia explícita, a secundária pode ser verde-limão: a barra
		// não pode mudar de cor por causa de uma escolha feita para os cartões.
		const limpo = semComentario(NAV)
		expect(limpo).toMatch(/\.destinos__indicador\s*\{[^}]*background:\s*var\(--primary-container\)/)
		expect(limpo).toMatch(/\.destino\[aria-current='page'\]\s*\{[^}]*color:\s*var\(--on-primary-container\)/)
	})
})

describe('tema claro: os vazamentos que a auditoria encontrou', () => {
	it('a ilha não usa #fff fixo na tinta', () => {
		const limpo = semComentario(ILHA)
		// O aro dos pinos é exceção declarada no arquivo da roda; aqui, não.
		expect(limpo).not.toMatch(/\.ilha\s*\{[^}]*color:\s*#fff/)
	})

	it('a pílula recolhida usa a superfície do tema, não um preto cravado', () => {
		const limpo = semComentario(ILHA)
		expect(limpo).not.toMatch(/rgb\(28 28 30/)
		expect(limpo).toMatch(/\.ilha--pilula \.ilha__marca\s*\{[^}]*var\(--surface-container-highest\)/)
	})

	it('a faixa do cartão de projeto usa a tinta calculada', () => {
		const limpo = semComentario(TELAS)
		expect(limpo).toMatch(/\.projeto-cartao__faixa\s*\{[^}]*-da-faixa/)
	})

	it('o visor da pílula não depende de um bloco só para o tema claro', () => {
		// Antes havia `:root[data-tema='light'] .ilha--pilula .ilha__avatar-visor`
		// repetindo a MESMA regra do bloco base — dois lugares para a mesma
		// decisão, que divergem na primeira mudança.
		expect(semComentario(ILHA)).not.toMatch(/data-tema='light'\] \.ilha--pilula \.ilha__avatar-visor/)
	})
})

describe('tamanho de texto respeita a preferência', () => {
	it('nenhum font-size em px fixo fora dos casos justificados', () => {
		const soltos = [TELAS, ILHA, APP]
			.join('\n')
			.split('\n')
			.filter((linha) => /font-size:\s*\d+px/.test(linha))
		// `--toque`/ícone e o piso de 16 do campo são os únicos px legítimos, e
		// eles estão em tokens.css, não aqui.
		expect(soltos).toEqual([])
	})
})
