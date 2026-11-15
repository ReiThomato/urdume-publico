import { describe, expect, it } from 'vitest'
import { contrasteEntre, corDe, PALETA, tintaSobre } from '@/ui/paleta'
import { estiloDaFaixa } from '@/ui/cores'

/**
 * Cor de projeto: o valor guardado tem duas formas e as duas têm de sobreviver.
 *
 * O defeito real que estes testes travam: o cartão da central lia a cor com
 * `Number(projeto.color)`. Índice da paleta (`2`) funcionava; cor livre
 * (`#3366ff`) virava `NaN` e caía no coral padrão. Quem escolhia uma cor nova
 * e vibrante via a pasta mudar para o cinza da superfície — a cor que ele
 * acabou de escolher desaparecia.
 */
describe('cor do projeto', () => {
	it('índice da paleta vira o tom daquela posição', () => {
		expect(corDe(2).hex).toBe(PALETA[2]!.hex)
		// String numérica existe em registros antigos; também resolve.
		expect(corDe('2').hex).toBe(PALETA[2]!.hex)
	})

	it('hex livre é respeitado, não cai no padrão', () => {
		expect(corDe('#3366ff').hex).toBe('#3366ff')
		expect(corDe('#FF00FF').hex).toBe('#ff00ff')
		// O que o código antigo fazia com este valor:
		expect(Number('#3366ff')).toBeNaN()
	})

	it('vazio cai num tom determinístico pelo id', () => {
		// Duas chamadas para o mesmo projeto devolvem o mesmo tom; ids
		// diferentes não precisam devolver tons diferentes.
		expect(corDe(null, 'projeto-a').hex).toBe(corDe(undefined, 'projeto-a').hex)
		expect(corDe(0).hex).toBe(PALETA[0]!.hex)
	})

	it('a tinta escolhida é sempre a de maior contraste', () => {
		// Âmbar: luminância 0,41 cai no limiar de `ehCorClara` e recebia branco
		// (2,3:1). Aqui a decisão é por contraste real.
		expect(tintaSobre('#e0a02a')).toBe('#1c1b1f')
		expect(tintaSobre('#FF00FF')).toBe('#1c1b1f')
		expect(tintaSobre('#004EE8')).toBe('#ffffff')
		expect(tintaSobre('#c74a4a')).toBe('#ffffff')

		// Nenhuma cor da paleta pode ficar ilegível: as duas opções de tinta
		// existem justamente para o pior caso ser escolhido.
		for (const item of PALETA) {
			const tinta = tintaSobre(item.hex)
			expect(['#ffffff', '#1c1b1f']).toContain(tinta)
		}
	})
})

describe('faixa do cartão de projeto', () => {
	it('a tinta da faixa passa 4,5:1 em TODA cor da paleta', () => {
		// O defeito real: a mistura fixa de 55% deixava o Gesso (#ded6c6) num
		// tom médio onde nem preto (4,18) nem branco (4,10) passavam.
		for (const item of PALETA) {
			const estilo = estiloDaFaixa(item.hex) as Record<string, string>
			const fundo = estilo['--cor-da-faixa']!
			const tinta = estilo['--tinta-da-faixa']!
			expect(contrasteEntre(fundo, tinta)).toBeGreaterThanOrEqual(4.5)
		}
	})

	it('vale também para hex livre, claro e escuro', () => {
		for (const hex of ['#ffffff', '#f5f0e8', '#ffff00', '#00ff00', '#808080', '#000000', '#3d3a37', '#8b3a4e']) {
			const estilo = estiloDaFaixa(hex) as Record<string, string>
			const fundo = estilo['--cor-da-faixa']!
			const tinta = estilo['--tinta-da-faixa']!
			expect(contrasteEntre(fundo, tinta)).toBeGreaterThanOrEqual(4.5)
		}
	})
})
