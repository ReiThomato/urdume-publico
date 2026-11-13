import { describe, expect, it } from 'vitest'
import {
	cabecalhos,
	endpoint,
	erroDoProvedor,
	lerConsumo,
	lerResposta,
	LISTA_DE_PROVEDORES,
	montarCorpo,
	PROVEDORES,
} from '@/lib/jarvis/provedores'

/**
 * Os três dialetos, exercitados sem rede.
 *
 * A divergência entre OpenAI, Gemini e Anthropic é o tipo de detalhe que passa
 * despercebido e vira 400 em produção: nome do campo de teto, lugar da
 * instrução de sistema, cabeçalho de autenticação, e o modelo indo no CAMINHO
 * em vez do corpo. Cada teste abaixo corresponde a um desses pontos.
 */

describe('OpenAI e compatíveis', () => {
	const openai = PROVEDORES.openai

	it('manda system na lista de mensagens e max_tokens', () => {
		const corpo = montarCorpo(openai, 'resuma meu dia', { instrucao: 'seja breve', teto: 300 })

		expect(corpo.model).toBe(openai.modelo)
		expect(corpo.max_tokens).toBe(300)
		const mensagens = corpo.messages as Array<{ role: string; content: string }>
		expect(mensagens[0]).toEqual({ role: 'system', content: 'seja breve' })
		expect(mensagens[1]).toEqual({ role: 'user', content: 'resuma meu dia' })
	})

	it('autentica com Bearer', () => {
		const cab = cabecalhos(openai, 'sk-abc')
		expect(cab.Authorization).toBe('Bearer sk-abc')
	})

	it('lê choices[0].message.content', () => {
		const texto = lerResposta(openai, {
			choices: [{ message: { content: '{"acoes":[]}' } }],
		})
		expect(texto).toBe('{"acoes":[]}')
	})

	it('o endpoint não muda com o modelo', () => {
		expect(endpoint(openai, 'gpt-4o-mini')).toBe(openai.url)
	})
})

describe('Gemini', () => {
	const gemini = PROVEDORES.gemini

	it('põe o modelo no caminho, com generateContent', () => {
		expect(endpoint(gemini, 'gemini-2.0-flash')).toBe(
			'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
		)
	})

	it('usa systemInstruction e generationConfig', () => {
		const corpo = montarCorpo(gemini, 'resuma', { instrucao: 'seja breve', teto: 200, json: true })

		expect(corpo.systemInstruction).toEqual({ parts: [{ text: 'seja breve' }] })
		expect(corpo.contents).toEqual([{ role: 'user', parts: [{ text: 'resuma' }] }])
		const config = corpo.generationConfig as Record<string, unknown>
		expect(config.maxOutputTokens).toBe(200)
		expect(config.responseMimeType).toBe('application/json')
		// Não existe no formato do Gemini; mandar isso daria 400.
		expect(corpo.messages).toBeUndefined()
	})

	it('autentica com x-goog-api-key, não Bearer', () => {
		const cab = cabecalhos(gemini, 'AIza-teste')
		expect(cab['x-goog-api-key']).toBe('AIza-teste')
		expect(cab.Authorization).toBeUndefined()
	})

	it('lê candidates[0].content.parts[].text e junta as partes', () => {
		const texto = lerResposta(gemini, {
			candidates: [{ content: { parts: [{ text: 'pri' }, { text: 'meiro' }] } }],
		})
		expect(texto).toBe('primeiro')
	})

	it('lê o consumo de usageMetadata', () => {
		expect(
			lerConsumo(gemini, { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }),
		).toEqual({ entrada: 10, saida: 5 })
	})
})

describe('Anthropic (Claude)', () => {
	const claude = PROVEDORES.claude

	it('manda system separado, nunca como mensagem', () => {
		const corpo = montarCorpo(claude, 'resuma', { instrucao: 'seja breve' })

		expect(corpo.system).toBe('seja breve')
		expect(corpo.messages).toEqual([{ role: 'user', content: 'resuma' }])
		// `max_tokens` é OBRIGATÓRIO aqui; sem ele a API recusa.
		expect(corpo.max_tokens).toBe(700)
	})

	it('autentica com x-api-key e exige anthropic-version', () => {
		const cab = cabecalhos(claude, 'sk-ant-abc')
		expect(cab['x-api-key']).toBe('sk-ant-abc')
		expect(cab['anthropic-version']).toBe('2023-06-01')
		// Sem a versão, a resposta é 400 falando de header — não de chave.
		expect(cab.Authorization).toBeUndefined()
	})

	it('lê content[] filtrando só os blocos de texto', () => {
		const texto = lerResposta(claude, {
			content: [
				{ type: 'thinking', text: 'ignorar' },
				{ type: 'text', text: 'resposta' },
			],
		})
		expect(texto).toBe('resposta')
	})

	it('lê o consumo de usage', () => {
		expect(lerConsumo(claude, { usage: { input_tokens: 7, output_tokens: 3 } })).toEqual({
			entrada: 7,
			saida: 3,
		})
	})

	it('não tenta forçar JSON: o provedor não tem esse campo', () => {
		const corpo = montarCorpo(claude, 'x', { json: true })
		expect(corpo.response_format).toBeUndefined()
	})
})

describe('robustez', () => {
	it('resposta vazia ou estranha vira null, sem lançar', () => {
		for (const provedor of LISTA_DE_PROVEDORES) {
			expect(lerResposta(provedor, null)).toBe(null)
			expect(lerResposta(provedor, {})).toBe(null)
			expect(lerResposta(provedor, { candidates: [] })).toBe(null)
			expect(lerConsumo(provedor, null)).toEqual({ entrada: 0, saida: 0 })
		}
	})

	it('chave recusada tem mensagem que diz o que fazer', () => {
		const texto = erroDoProvedor(PROVEDORES.openai, 401, null)
		expect(texto).toContain('Chave recusada')
		expect(texto).toContain('copiada inteira')
	})

	it('erro do provedor mostra o detalhe quando vem no corpo', () => {
		const texto = erroDoProvedor(PROVEDORES.gemini, 400, {
			error: { message: 'API key not valid' },
		})
		expect(texto).toContain('400')
		expect(texto).toContain('API key not valid')
	})
})
