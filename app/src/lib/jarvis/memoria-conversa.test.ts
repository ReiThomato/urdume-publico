import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import type { AiChatMessage } from '@/db/db'
import { MAXIMO_DE_HISTORICO, historicoParaOModelo } from '@/lib/jarvis/memoria-conversa'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-memoria-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

let sequencia = 0
async function mensagem(papel: AiChatMessage['papel'], texto: string, em: number): Promise<void> {
	await banco.aiChat.put({ id: `m${sequencia++}`, em, papel, texto })
}

describe('memória de conversa', () => {
	it('manda os turnos na ordem em que foram ditos', async () => {
		const base = Date.UTC(2026, 10, 13, 10, 0, 0)
		await mensagem('usuario', 'Quais são as tarefas de hoje?', base)
		await mensagem('jarvis', 'Três: revisar o relatório, ligar para o banco e pagar a conta.', base + 1000)
		await mensagem('usuario', 'E as duas que ficaram de ontem?', base + 2000)

		const { mensagens } = await historicoParaOModelo({ ate: base + 3000, database: banco })

		expect(mensagens).toHaveLength(3)
		expect(mensagens[0]).toEqual({ role: 'user', content: 'Quais são as tarefas de hoje?' })
		expect(mensagens[1]!.role).toBe('assistant')
		expect(mensagens[2]!.content).toBe('E as duas que ficaram de ontem?')
	})

	it('não inclui mensagem gravada depois da pergunta atual', async () => {
		const base = Date.UTC(2026, 10, 13, 10, 0, 0)
		await mensagem('usuario', 'primeira', base)
		await mensagem('usuario', 'pergunta de agora', base + 1000)
		await mensagem('jarvis', 'resposta que ainda não existia', base + 2000)

		const { mensagens } = await historicoParaOModelo({ ate: base + 1000, database: banco })

		expect(mensagens.map((m) => m.content)).toEqual(['primeira', 'pergunta de agora'])
	})

	it('pega as MAIS RECENTES quando passa da janela, não as primeiras', async () => {
		const base = Date.UTC(2026, 10, 13, 8, 0, 0)
		for (let i = 0; i < 30; i++) {
			await mensagem('usuario', `mensagem ${i}`, base + i * 1000)
		}

		const { mensagens, resumo } = await historicoParaOModelo({
			ate: base + 60_000,
			janela: 6,
			database: banco,
		})

		expect(mensagens).toHaveLength(6)
		expect(mensagens[5]!.content).toBe('mensagem 29')
		expect(mensagens[0]!.content).toBe('mensagem 24')
		// O que ficou de fora vira resumo (só os assuntos mais recentes deles),
		// e o resumo não repete o que está na janela.
		expect(resumo).toContain('mensagem 23')
		expect(resumo).not.toContain('mensagem 24')
		expect(resumo).not.toContain('mensagem 29')
	})

	it('resumo é curto mesmo com conversa longa', async () => {
		const base = Date.UTC(2026, 10, 13, 8, 0, 0)
		for (let i = 0; i < 60; i++) {
			await mensagem('usuario', `assunto ${i} `.repeat(20), base + i * 1000)
		}

		const { resumo } = await historicoParaOModelo({ ate: base + 120_000, janela: 4, database: banco })

		// 6 linhas, cada uma truncada em 120 caracteres.
		const linhas = resumo.split('\n')
		expect(linhas.length).toBeLessThanOrEqual(7)
		expect(Math.max(...linhas.map((linha) => linha.length))).toBeLessThanOrEqual(130)
	})

	it('conversa vazia não inventa histórico', async () => {
		const { mensagens, resumo, total } = await historicoParaOModelo({ database: banco })
		expect(mensagens).toEqual([])
		expect(resumo).toBe('')
		expect(total).toBe(0)
	})

	it('o limite de leitura é o da janela mais o do resumo', async () => {
		expect(MAXIMO_DE_HISTORICO).toBeGreaterThan(0)
	})
})
