import { describe, expect, it } from 'vitest'
import {
	CHAVE_DA_ORDEM_DE_CRIACAO,
	OPCOES_DE_CRIACAO,
	ORDEM_PADRAO,
	moverOpcao,
	ordenarOpcoes,
} from '@/app/criacao'

/**
 * Ordem do menu de criação.
 *
 * A regra é simples e tem de continuar simples: a escolha do usuário vale, nada
 * some, e dado antigo no banco não deixa a folha sem uma opção. Ordem de menu é
 * uma preferência de rotina — quem cria lembrete três vezes por dia não deve
 * descer a lista a cada vez.
 */
describe('ordem do menu de criação', () => {
	it('o padrão é a ordem do catálogo', () => {
		expect(ordenarOpcoes(null).map((o) => o.id)).toEqual(ORDEM_PADRAO)
	})

	it('a ordem salva é respeitada', () => {
		const ordem = ['lembrete', 'tarefa', 'evento', 'habito', 'lista']
		expect(ordenarOpcoes(ordem).map((o) => o.id)).toEqual(ordem)
	})

	it('opção nova no código entra no fim, sem sumir da tela', () => {
		// Simula uma ordem salva antes de "habito" existir no catálogo.
		const antiga = ['lembrete', 'tarefa']
		const resolvidas = ordenarOpcoes(antiga).map((o) => o.id)

		expect(resolvidas.slice(0, 2)).toEqual(antiga)
		expect(resolvidas).toHaveLength(OPCOES_DE_CRIACAO.length)
		expect(resolvidas).toContain('habito')
	})

	it('chave desconhecida e lixo são descartados sem quebrar', () => {
		const resolvidas = ordenarOpcoes(['tarefa', 'nao-existe', null, 7, { a: 1 }])
		expect(resolvidas.map((o) => o.id)).toContain('tarefa')
		expect(resolvidas).toHaveLength(OPCOES_DE_CRIACAO.length)
	})

	it('duplicata não aparece duas vezes', () => {
		const resolvidas = ordenarOpcoes(['tarefa', 'tarefa', 'evento'])
		const ids = resolvidas.map((o) => o.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	it('mover para cima e para baixo troca com o vizinho', () => {
		const base = ORDEM_PADRAO
		const subiu = moverOpcao(base, base[1]!, -1)
		expect(subiu[0]).toBe(base[1])
		expect(subiu[1]).toBe(base[0])

		const desceu = moverOpcao(base, base[0]!, 1)
		expect(desceu[0]).toBe(base[1])
		expect(desceu[1]).toBe(base[0])
	})

	it('mover além da borda não faz nada', () => {
		expect(moverOpcao(ORDEM_PADRAO, ORDEM_PADRAO[0]!, -1)).toEqual(ORDEM_PADRAO)
		expect(moverOpcao(ORDEM_PADRAO, ORDEM_PADRAO[ORDEM_PADRAO.length - 1]!, 1)).toEqual(ORDEM_PADRAO)
	})

	it('a chave é estável: renomear o catálogo não invalida a escolha', () => {
		// A chave é um contrato com o banco do usuário. Mudá-la faria a ordem
		// dele voltar ao padrão sem aviso.
		expect(CHAVE_DA_ORDEM_DE_CRIACAO).toBe('criacao.ordem')
	})
})
