import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { NexoDatabase } from '@/db/db'
import { consultar } from '@/lib/jarvis/ia'
import { PROVEDORES } from '@/lib/jarvis/provedores'
import type { IdProvedor } from '@/lib/jarvis/provedores'
import { salvarChaveApi, salvarProvedor } from '@/lib/jarvis/segredo'
import type { ContextoDaChamada } from '@/lib/jarvis/ia'

/**
 * O caminho REAL da chamada, ponta a ponta.
 *
 * Os outros testes provam que cada dialeto monta corpo e lê resposta. Isso não
 * prova que `consultar` chega ao provedor: entre uma coisa e outra ficam a
 * leitura da chave, a escolha do endpoint, os cabeçalhos, o tratamento de erro
 * e a interpretação do JSON.
 *
 * Aqui sobe um servidor HTTP de verdade em `localhost` e o provedor aponta
 * para ele. Cada dialeto recebe o corpo no SEU formato e responde no SEU
 * formato — se um campo estiver errado, a requisição falha como falharia em
 * produção.
 *
 * Nenhuma chave real é usada: a chave é de mentira e o servidor é local.
 */

interface Recebido {
	caminho: string
	cabecalhos: Record<string, string | string[] | undefined>
	corpo: Record<string, unknown>
}

let banco: NexoDatabase
let servidor: Server
let base: string
let recebidos: Recebido[]
/** O que o servidor devolve: status + corpo JSON. */
let resposta: { status: number; corpo: unknown }

const contexto: ContextoDaChamada = {
	retrato: {
		geradoEm: 0,
		hoje: '2026-11-15',
		hora: 9,
		tarefas: {
			abertas: 2,
			atrasadas: 1,
			concluidasHoje: 0,
			concluidas7d: 3,
			semData: 0,
			cargaHoje: 1,
			relevantes: [],
			atrasoCritico: false,
			subtarefasParadas: 0,
			recorrentesFalhando: [],
			deHoje: [],
		},
		projetos: [],
		agenda: {
			hoje: [],
			amanha: [],
			conflitosHoje: 0,
			maiorJanelaLivre: 0,
			proximoEmMin: null,
			semPreparo: 0,
			diasCheiosNaSemana: 0,
			cancelados24h: 0,
		},
		habitos: [],
		lembretes: { abertos: 0, vencidos: 0, lista: [] },
		habitosDisponiveis: [],
		uso: {
			diasSemAbrir: 0,
			ultimoBackup: null,
			interrupcoesHoje: 0,
			fatos24h: 0,
			primeiroUsoHoje: false,
			ultimaAbertura: null,
		},
	},
	sinais: [],
	pergunta: 'o que eu faço agora?',
	nomesDeProjeto: {},
	personalidade: { tom: 'direto', detalhe: 'equilibrado', iniciativa: 'equilibrada' },
	conhecimento: [],
} as ContextoDaChamada

const FALA = { mensagem: 'Comece pela tarefa atrasada.', acoes: [] }

beforeEach(async () => {
	banco = new NexoDatabase(`ia-ponta-${crypto.randomUUID()}`)
	await banco.open()
	recebidos = []
	resposta = { status: 200, corpo: null }

	servidor = createServer((req, res) => {
		const partes: Buffer[] = []
		req.on('data', (pedaco) => partes.push(pedaco as Buffer))
		req.on('end', () => {
			let corpo: Record<string, unknown> = {}
			try {
				corpo = JSON.parse(Buffer.concat(partes).toString('utf8')) as Record<string, unknown>
			} catch {
				corpo = {}
			}
			recebidos.push({ caminho: req.url ?? '', cabecalhos: req.headers, corpo })
			res.setHeader('Content-Type', 'application/json')
			res.statusCode = resposta.status
			res.end(JSON.stringify(resposta.corpo ?? {}))
		})
	})

	await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
	const endereco = servidor.address() as AddressInfo
	base = `http://127.0.0.1:${endereco.port}`

	/*
	 * Aponta os provedores para o servidor local.
	 *
	 * O `url` real é preservado pelo `mockRestore` do `afterEach`; aqui cada
	 * provedor responde no endereço do servidor de teste. Sem isso não daria
	 * para exercitar o caminho real sem gastar uma chamada paga.
	 */
	for (const provedor of Object.values(PROVEDORES)) {
		vi.spyOn(provedor, 'url', 'get').mockReturnValue(`${base}/v1/messages`)
	}
})

afterEach(async () => {
	vi.restoreAllMocks()
	await new Promise<void>((resolve) => servidor.close(() => resolve()))
	await banco.delete()
})

/** Prepara o banco com provedor e chave. */
async function ligar(qual: IdProvedor): Promise<void> {
	await salvarProvedor(qual, banco)
	await salvarChaveApi('chave-de-teste-123', qual, banco)
}

describe('a chamada real chega ao provedor, em cada dialeto', () => {
	it('OpenAI: corpo no formato de chat, cabeçalho Bearer', async () => {
		await ligar('openai')
		resposta = { status: 200, corpo: { choices: [{ message: { content: JSON.stringify(FALA) } }], usage: { prompt_tokens: 120, completion_tokens: 30 } } }

		const r = await consultar(contexto, { database: banco })

		expect(r.ok, r.erro ?? '').toBe(true)
		expect(r.resposta?.mensagem).toBe(FALA.mensagem)
		expect(r.entradaTokens).toBe(120)
		expect(r.saidaTokens).toBe(30)

		const pedido = recebidos.at(-1)!
		expect(pedido.corpo.model).toBe(PROVEDORES.openai.modelo)
		expect((pedido.corpo.messages as unknown[]).length).toBeGreaterThan(1)
		expect(pedido.corpo.response_format).toEqual({ type: 'json_object' })
		expect(pedido.cabecalhos.authorization).toBe('Bearer chave-de-teste-123')

	})

	it('Gemini: modelo no caminho, chave no header próprio', async () => {
		await ligar('gemini')
		resposta = {
			status: 200,
			corpo: {
				candidates: [{ content: { parts: [{ text: JSON.stringify(FALA) }] } }],
				usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 20 },
			},
		}

		const r = await consultar(contexto, { database: banco })

		expect(r.ok, r.erro ?? '').toBe(true)
		expect(r.resposta?.mensagem).toBe(FALA.mensagem)
		expect(r.entradaTokens).toBe(90)

		const pedido = recebidos.at(-1)!
		// O modelo vai no CAMINHO: sem isso o Gemini devolve 404.
		expect(pedido.caminho).toContain(PROVEDORES.gemini.modelo)
		expect(pedido.caminho).toContain('generateContent')
		expect(pedido.cabecalhos['x-goog-api-key']).toBe('chave-de-teste-123')
		expect(pedido.cabecalhos.authorization).toBeUndefined()
		expect(pedido.corpo.systemInstruction).toBeTruthy()
		expect(pedido.corpo.contents).toBeTruthy()

	})

	it('Anthropic: max_tokens, x-api-key e versão obrigatória', async () => {
		await ligar('claude')
		resposta = { status: 200, corpo: { content: [{ type: 'text', text: JSON.stringify(FALA) }], usage: { input_tokens: 70, output_tokens: 15 } } }

		const r = await consultar(contexto, { database: banco })

		expect(r.ok, r.erro ?? '').toBe(true)
		expect(r.resposta?.mensagem).toBe(FALA.mensagem)
		expect(r.entradaTokens).toBe(70)

		const pedido = recebidos.at(-1)!
		expect(pedido.corpo.max_tokens).toBeTypeOf('number')
		// A Anthropic não aceita `response_format`: forçar JSON no corpo dá 400.
		expect(pedido.corpo.response_format).toBeUndefined()
		expect(pedido.corpo.system).toBeTruthy()
		expect(pedido.cabecalhos['x-api-key']).toBe('chave-de-teste-123')
		expect(pedido.cabecalhos['anthropic-version']).toBeTruthy()

	})
})

describe('os erros chegam legíveis, sem quebrar a tela', () => {
	it('sem chave, não chama a rede e diz o que falta', async () => {
		await salvarProvedor('openai', banco)

		const r = await consultar(contexto, { database: banco })

		expect(r.ok).toBe(false)
		expect(r.erro).toMatch(/chave/i)
		expect(recebidos).toHaveLength(0)
	})

	it('401 vira "chave recusada", não um código solto', async () => {
		await ligar('openai')
		resposta = { status: 401, corpo: { error: { message: 'Incorrect API key' } } }

		const r = await consultar(contexto, { database: banco })

		expect(r.ok).toBe(false)
		expect(r.erro).toMatch(/recusada/i)
	})

	it('resposta fora do formato esperado é falha, não sucesso vazio', async () => {
		await ligar('openai')
		resposta = { status: 200, corpo: { choices: [{ message: { content: 'não é json' } }] } }

		const r = await consultar(contexto, { database: banco })

		expect(r.ok).toBe(false)
		expect(r.resposta).toBeNull()
	})

	it('JSON válido com mensagem vazia continua sendo falha', async () => {
		await ligar('openai')
		resposta = { status: 200, corpo: { choices: [{ message: { content: '{"mensagem":"","acoes":[]}' } }] } }

		const r = await consultar(contexto, { database: banco })

		expect(r.ok).toBe(false)
	})

	it('falha de rede vira mensagem do app, não "Failed to fetch"', async () => {
		await ligar('openai')
		// Servidor derrubado: o fetch rejeita como no navegador.
		await new Promise<void>((resolve) => servidor.close(() => resolve()))

		const r = await consultar(contexto, { database: banco })

		expect(r.ok).toBe(false)
		expect(r.erro).not.toMatch(/failed to fetch/i)
		expect(r.erro).toMatch(/conexão|CORS|APK/i)
	})

	it('ação desconhecida é descartada, a fala útil fica', async () => {
		await ligar('openai')
		resposta = {
			status: 200,
			corpo: {
				choices: [{
					message: {
						content: JSON.stringify({
							mensagem: 'Dá para começar por aqui.',
							acoes: [
								{ tipo: 'apagar_tudo', dados: {}, motivo: 'x' },
								{ tipo: 'criar_tarefa', dados: { titulo: 'Ligar para o fornecedor' }, motivo: 'está atrasada' },
							],
						}),
					},
				}],
			},
		}

		const r = await consultar(contexto, { database: banco })

		expect(r.ok).toBe(true)
		expect(r.resposta?.acoes).toHaveLength(1)
		expect(r.resposta?.acoes[0]!.tipo).toBe('criar_tarefa')
	})
})
