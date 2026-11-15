import { describe, expect, it } from 'vitest'
import {
	BARRA_PADRAO,
	DESTINOS,
	FIXOS,
	MAXIMO_NA_BARRA,
	barraAtual,
	montarBarra,
	normalizarBarra,
} from '@/app/navegacao'

/**
 * Navegação.
 *
 * O que estes testes protegem é a promessa feita ao usuário: cinco lugares por
 * padrão, Hoje e Ajustes não se movem, nada some (o que sai da barra vai para
 * "Mais") e dado ruim no banco não deixa a barra quebrada.
 */

describe('barra inferior', () => {
	it('o padrão tem cinco lugares, com Hoje no começo e Ajustes no fim', () => {
		const barra = normalizarBarra(null)
		expect(barra).toEqual(['inicio', 'tarefas', 'projetos', 'ajustes'])
		expect(BARRA_PADRAO).toEqual(barra)
	})

	it('Hoje e Ajustes não podem sair nem se repetir', () => {
		const barra = normalizarBarra(['tarefas', 'inicio', 'inicio', 'ajustes', 'ajustes', 'projetos'])
		expect(barra[0]).toBe('inicio')
		expect(barra[barra.length - 1]).toBe('ajustes')
		expect(barra.filter((id) => id === 'inicio')).toHaveLength(1)
		expect(barra.filter((id) => id === 'ajustes')).toHaveLength(1)
	})

	it('descarta id desconhecido, nulo e lixo', () => {
		const barra = normalizarBarra(['tarefas', 'inexistente', null, 42, { id: 'x' }, 'habitos'])
		expect(barra).not.toContain('inexistente')
		expect(barra).toContain('tarefas')
		// Texto com id válido sobrevive; o resto não derruba a barra.
		expect(Array.isArray(barra)).toBe(true)
	})

	it('respeita o teto de seis mesmo com lista longa', () => {
		const barra = normalizarBarra(['tarefas', 'projetos', 'habitos', 'agenda', 'paginas', 'jarvis'])
		expect(barra.length).toBeLessThanOrEqual(MAXIMO_NA_BARRA)
	})

	it('três lugares são fixos: Hoje, Mais e Ajustes', () => {
		const { barra } = montarBarra(barraAtual(['tarefas', 'projetos', 'habitos']))
		expect(barra.map((item) => item.id)).toEqual(['inicio', 'tarefas', 'projetos', 'habitos', 'mais', 'ajustes'])
		expect(barra).toHaveLength(MAXIMO_NA_BARRA)
	})

	it('não perde destino: o que sai da barra vai para "Mais"', () => {
		const escolhidos = barraAtual(['tarefas', 'projetos'])
		const { restantes } = montarBarra(escolhidos)

		const todos = Object.keys(DESTINOS).filter((id) => id !== 'inicio' && id !== 'ajustes')
		const naBarraOuEmMais = [...escolhidos.filter((id) => id !== 'inicio' && id !== 'ajustes'), ...restantes.map((d) => d.id)]

		for (const id of todos) {
			expect(naBarraOuEmMais, `"${id}" não aparece na barra nem em Mais`).toContain(id)
		}
	})

	it('o "Mais" NUNCA sai, por mais escolhas que existam', () => {
		for (const escolha of [
			['tarefas', 'projetos'],
			['tarefas', 'projetos', 'habitos'],
			['tarefas', 'projetos', 'habitos', 'agenda', 'paginas', 'jarvis'],
		]) {
			const { barra } = montarBarra(barraAtual(escolha))
			expect(barra.some((item) => item.id === 'mais'), `Mais sumiu com ${escolha.join(', ')}`).toBe(true)
		}
	})

	it('os fixos continuam nas pontas em qualquer configuração', () => {
		for (const escolha of [['tarefas'], ['habitos'], ['tarefas', 'projetos'], ['agenda', 'jarvis', 'paginas']]) {
			const { barra } = montarBarra(barraAtual(escolha))
			expect(barra[0]!.id).toBe('inicio')
			expect(barra[barra.length - 1]!.id).toBe('ajustes')
		}
	})

	it('o "Mais" fica imediatamente antes de Ajustes', () => {
		const { barra } = montarBarra(barraAtual(['tarefas', 'projetos']))
		expect(barra[barra.length - 2]!.id).toBe('mais')
	})

	it('os fixos não entram na lista de escolhíveis', () => {
		expect(FIXOS).toEqual(['inicio', 'ajustes'])
		const { restantes } = montarBarra(barraAtual(['tarefas']))
		expect(restantes.map((d) => d.id)).not.toContain('inicio')
		expect(restantes.map((d) => d.id)).not.toContain('ajustes')
	})
})
