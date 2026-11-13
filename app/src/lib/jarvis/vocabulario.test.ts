import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { avaliarLote } from '@/lib/jarvis/executor'
import type { AcaoDaIA } from '@/lib/jarvis/ia'

/**
 * Trava do vocabulário.
 *
 * A lista de ações que a IA pode propor aparece em dois lugares que precisam
 * combinar: o tipo em `ia.ts` e os `case` de `avaliarAcao` em `executor.ts`.
 * Se um tipo existir num e faltar no outro, o modelo propõe algo que o
 * executor recusa com "tipo não permitido" — o usuário vê a IA "burra" quando
 * o problema é de manutenção.
 *
 * Este teste lê os dois arquivos e compara.
 */
describe('vocabulário de ações', () => {
	const ia = readFileSync(new URL('./ia.ts', import.meta.url), 'utf-8')
	const executor = readFileSync(new URL('./executor.ts', import.meta.url), 'utf-8')

	/** Tipos declarados na união de `ia.ts`. */
	function tiposDeclarados(): string[] {
		const bloco = /tipo:\s*([\s\S]*?)\n\t\/\*\* Payload validado/.exec(ia)
		expect(bloco, 'não achei a união de tipos em ia.ts').not.toBeNull()
		return [...bloco![1]!.matchAll(/'([a-z_]+)'/g)].map((achado) => achado[1]!)
	}

	function tiposNoExecutor(): string[] {
		return [...executor.matchAll(/case '([a-z_]+)':/g)].map((achado) => achado[1]!)
	}

	it('todo tipo declarado é avaliado pelo executor', () => {
		const declarados = tiposDeclarados()
		const noExecutor = new Set(tiposNoExecutor())

		expect(declarados.length).toBeGreaterThan(10)
		for (const tipo of declarados) {
			expect(noExecutor.has(tipo), `${tipo} está em ia.ts mas não em avaliarAcao`).toBe(true)
		}
	})

	it('o filtro de entrada conhece todos os tipos', () => {
		// Esta lista é a porta por onde a resposta do modelo entra. Se um tipo
		// faltar nela, a ação é descartada em silêncio: o modelo "propõe" e o
		// app ignora, sem erro na tela. Já aconteceu com criar_projeto.
		// Ancora no NOME da constante, não na anotação de tipo: a anotação muda
		// para satisfazer o compilador e o teste quebrava por motivo errado.
		const filtro = /TIPOS_PERMITIDOS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(ia)
		expect(filtro, 'não achei TIPOS_PERMITIDOS em ia.ts').not.toBeNull()

		const noFiltro = new Set([...filtro![1]!.matchAll(/'([a-z_]+)'/g)].map((a) => a[1]!))
		for (const tipo of tiposDeclarados()) {
			expect(noFiltro.has(tipo), `${tipo} passa pelo executor mas é descartado na entrada`).toBe(true)
		}
	})

	it('a instrução do prompt lista todos os tipos', () => {
		for (const tipo of tiposDeclarados()) {
			expect(ia, `o prompt não ensina ${tipo}`).toContain(`${tipo}: {`)
		}
	})

	it('nenhum tipo de exclusão existe', () => {
		for (const tipo of tiposDeclarados()) {
			expect(tipo).not.toMatch(/excluir|apagar|deletar|remover/)
		}
	})

	it('cada tipo tem dados obrigatórios verificáveis', () => {
		const exemplos: Record<string, Record<string, unknown>> = {
			criar_tarefa: { titulo: 'X' },
			// Precisa de algo a mudar além do id: só o id é recusado de propósito.
			editar_tarefa: { id: 't1', dia: '2026-11-13' },
			concluir_tarefa: { id: 't1' },
			criar_projeto: { nome: 'X' },
			editar_projeto: { id: 'p1', prazo: '2026-12-01' },
			criar_marco: { projetoId: 'p1', titulo: 'X' },
			concluir_marco: { projetoId: 'p1', marcoId: 'm1' },
			criar_evento: { titulo: 'X', inicio: 1, fim: 2 },
			concluir_evento: { id: 'e1' },
			criar_lembrete: { texto: 'X' },
			// Aviso da IA: precisa de título, corpo e horário futuro.
			avisar: { titulo: 'X', corpo: 'Y', quandoEm: Date.now() + 3_600_000 },
			criar_habito: { titulo: 'X' },
			registrar_habito: { id: 'h1' },
			criar_pagina: { titulo: 'X' },
			anotar_em_projeto: { id: 'p1', texto: 'X' },
			// Anotação datada e organização do projeto (v5).
			anotar_projeto: { projetoId: 'p1', texto: 'X' },
			organizar_projeto: { id: 'p1', categoria: 'X' },
		}

		for (const tipo of tiposDeclarados()) {
			const dados = exemplos[tipo] ?? {}
			expect(exemplos[tipo], `sem exemplo de payload para ${tipo}`).toBeDefined()

			const { avaliacoes } = avaliarLote(
				[{ tipo: tipo as AcaoDaIA['tipo'], dados, motivo: '' }],
				'equilibrado',
			)
			expect(avaliacoes[0]!.risco, `${tipo} com payload válido foi recusado`).not.toBe('proibido')
		}

		// E sem os dados, todo tipo precisa ser recusado.
		for (const tipo of tiposDeclarados()) {
			const { avaliacoes } = avaliarLote(
				[{ tipo: tipo as AcaoDaIA['tipo'], dados: {}, motivo: '' }],
				'equilibrado',
			)
			expect(avaliacoes[0]!.risco, `${tipo} sem dados deveria ser recusado`).toBe('proibido')
		}
	})
})
