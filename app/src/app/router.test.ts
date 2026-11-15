import { describe, expect, it } from 'vitest'
import { parseRoute, routeToPath } from '@/app/router'
import type { Route } from '@/app/router'

/**
 * Contrato de rotas.
 *
 * O app não usa react-router: a rota é lida de `window.location` e convertida
 * à mão. Um erro aqui não gera exceção — gera tela em branco ou "não
 * encontrada", que é o pior tipo de falha: o usuário acha que perdeu o dado.
 *
 * Estes testes travam ida e volta (`parseRoute` ↔ `routeToPath`) para as rotas
 * dos Ajustes, que ganharam subpáginas, e para as rotas antigas que não podem
 * deixar de funcionar.
 */

const IDA_E_VOLTA: Route[] = [
	{ name: 'inicio' },
	{ name: 'tarefas' },
	{ name: 'tarefas', lista: 'abc' },
	{ name: 'habitos' },
	{ name: 'habito', id: 'h1' },
	{ name: 'calendario' },
	{ name: 'calendario', day: '2026-11-13' },
	{ name: 'projetos' },
	{ name: 'projeto', id: 'pr1' },
	{ name: 'jarvis' },
	{ name: 'conversa' },
	{ name: 'ajustes' },
	{ name: 'ajustes-aparencia' },
	{ name: 'ajustes-acessibilidade' },
	{ name: 'ajustes-ia' },
	{ name: 'ajustes-dados' },
	{ name: 'ajustes-aparelho' },
	{ name: 'ajustes-sobre' },
]

describe('rotas', () => {
	it('ida e volta preserva a rota', () => {
		for (const rota of IDA_E_VOLTA) {
			const caminho = routeToPath(rota)
			expect(parseRoute(caminho), `rota ${rota.name} em ${caminho}`).toEqual(rota)
		}
	})

	it('cada subpágina de Ajustes tem endereço próprio', () => {
		expect(routeToPath({ name: 'ajustes' })).toBe('/ajustes')
		expect(routeToPath({ name: 'ajustes-aparencia' })).toBe('/ajustes/aparencia')
		expect(routeToPath({ name: 'ajustes-ia' })).toBe('/ajustes/ia')
		expect(routeToPath({ name: 'ajustes-dados' })).toBe('/ajustes/dados')
	})

	it('subpágina desconhecida cai no índice, não em erro', () => {
		expect(parseRoute('/ajustes/qualquer-coisa')).toEqual({ name: 'ajustes' })
	})

	it('a rota antiga /configuracao continua funcionando', () => {
		expect(parseRoute('/configuracao')).toEqual({ name: 'ajustes' })
	})

	it('o fallback em hash serve as subpáginas', () => {
		expect(parseRoute('/#/ajustes/aparelho')).toEqual({ name: 'ajustes-aparelho' })
	})

	it('caminho raiz é o Início', () => {
		expect(parseRoute('/')).toEqual({ name: 'inicio' })
	})

	it('caminho desconhecido é marcado como não encontrado', () => {
		expect(parseRoute('/nao-existe').name).toBe('nao-encontrada')
	})
})
