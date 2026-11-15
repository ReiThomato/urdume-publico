import { describe, expect, it } from 'vitest'
import {
	BLOCOS_DO_PROJETO_PADRAO,
	blocosDoProjeto,
	blocosVisiveisDoProjeto,
	definicaoDoBloco,
	tiposDisponiveisNoProjeto,
} from '@/lib/blocos-projeto'
import type { BlocoDoProjeto } from '@/db/db'

/**
 * Blocos configuráveis da tela de projeto.
 *
 * A regra que mais importa aqui é a compatibilidade: projeto gravado antes
 * desta versão não tem `blocos` e precisa continuar abrindo exatamente como
 * antes. Os testes travam isso e os casos em que uma configuração gravada está
 * incompleta ou corrompida.
 */

describe('blocos do projeto', () => {
	it('projeto sem configuração usa o padrão', () => {
		const blocos = blocosDoProjeto({ blocos: undefined })
		expect(blocos).toEqual(BLOCOS_DO_PROJETO_PADRAO)
	})

	it('lista vazia também cai no padrão', () => {
		expect(blocosDoProjeto({ blocos: [] })).toEqual(BLOCOS_DO_PROJETO_PADRAO)
	})

	it('preserva a ordem gravada', () => {
		const config: BlocoDoProjeto[] = [
			{ id: 'a', tipo: 'tarefas' },
			{ id: 'b', tipo: 'painel' },
			{ id: 'c', tipo: 'marcos' },
		]
		expect(blocosDoProjeto({ blocos: config }).map((b) => b.tipo)).toEqual([
			'tarefas',
			'painel',
			'marcos',
		])
	})

	it('ocultar mantém o bloco na configuração', () => {
		const config: BlocoDoProjeto[] = [
			{ id: 'a', tipo: 'painel' },
			{ id: 'b', tipo: 'marcos', oculto: true },
			{ id: 'c', tipo: 'tarefas' },
		]
		expect(blocosDoProjeto({ blocos: config })).toHaveLength(3)
		expect(blocosVisiveisDoProjeto({ blocos: config }).map((b) => b.tipo)).toEqual([
			'painel',
			'tarefas',
		])
	})

	it('não perde os blocos essenciais se a configuração os omitir', () => {
		const config: BlocoDoProjeto[] = [{ id: 'a', tipo: 'marcos' }]
		const tipos = blocosDoProjeto({ blocos: config }).map((b) => b.tipo)
		expect(tipos).toContain('painel')
		expect(tipos).toContain('tarefas')
	})

	it('ignora tipo desconhecido em vez de quebrar a tela', () => {
		const config = [
			{ id: 'a', tipo: 'painel' },
			{ id: 'b', tipo: 'grafico-novo' },
			{ id: 'c', tipo: 'tarefas' },
		] as unknown as BlocoDoProjeto[]
		const tipos = blocosDoProjeto({ blocos: config }).map((b) => b.tipo)
		expect(tipos).toContain('painel')
		expect(tipos).toContain('tarefas')
		expect(tipos).not.toContain('grafico-novo' as never)
	})

	it('não duplica o mesmo tipo', () => {
		const config: BlocoDoProjeto[] = [
			{ id: 'a', tipo: 'tarefas' },
			{ id: 'b', tipo: 'tarefas' },
		]
		expect(blocosDoProjeto({ blocos: config }).filter((b) => b.tipo === 'tarefas')).toHaveLength(1)
	})

	it('lista os tipos ainda não usados', () => {
		const config: BlocoDoProjeto[] = [
			{ id: 'a', tipo: 'painel' },
			{ id: 'b', tipo: 'tarefas' },
		]
		const disponiveis = tiposDisponiveisNoProjeto({ blocos: config })
		expect(disponiveis).not.toContain('painel')
		expect(disponiveis).not.toContain('tarefas')
		expect(disponiveis).toContain('texto')
	})

	it('cada tipo tem definição com nome e título padrão', () => {
		for (const def of [definicaoDoBloco('painel'), definicaoDoBloco('texto')]) {
			expect(def.nome.length).toBeGreaterThan(0)
			expect(def.tituloPadrao.length).toBeGreaterThan(0)
		}
	})
})
