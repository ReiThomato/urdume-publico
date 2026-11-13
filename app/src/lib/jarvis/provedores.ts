/**
 * Provedores de IA e seus dialetos.
 *
 * ## Por que este arquivo tem "dialeto"
 *
 * Os três grandes provedores **não** falam a mesma língua, apesar de todos
 * oferecerem "chat com um modelo":
 *
 * | | OpenAI (e compatíveis) | Gemini | Anthropic (Claude) |
 * | --- | --- | --- | --- |
 * | Endpoint | `/v1/chat/completions` | `:generateContent` | `/v1/messages` |
 * | Chave | `Authorization: Bearer` | `x-goog-api-key` | `x-api-key` |
 * | Instrução de sistema | `messages[0].role=system` | `systemInstruction` | `system` |
 * | Saída | `choices[0].message.content` | `candidates[0].content.parts[].text` | `content[].text` |
 * | JSON forçado | `response_format` | `responseMimeType` | — (só via prompt) |
 * | Versão da API | — | — | header `anthropic-version` |
 *
 * Um único `fetch` genérico devolveria 400 em dois deles. Por isso cada
 * provedor traz seu próprio `montarCorpo` e `lerResposta`, e o resto do app só
 * fala `pedir()`.
 *
 * ## Qualquer chave serve
 *
 * Esta variante não tem chave embutida nem endereço próprio: o usuário cola a
 * chave dele. O catálogo abaixo é só de ENDEREÇOS PÚBLICOS dos provedores —
 * nada de servidor privado, nada de proxy, nada de telemetria.
 *
 * ## Adicionar um provedor
 *
 * Basta acrescentar uma entrada em `PROVEDORES`. Se ele falar o formato da
 * OpenAI (a maioria dos alternativos fala), use `dialeto: 'openai'` e só mude
 * `url` e `modelo`. O teste `provedores.test.ts` confere que todo provedor
 * declarado sabe montar corpo e ler resposta.
 */

export type IdProvedor = 'openai' | 'gemini' | 'claude' | 'deepseek' | 'openrouter'

/** Família de protocolo. Define como montar o corpo e ler a resposta. */
export type Dialeto = 'openai' | 'gemini' | 'anthropic'

export interface Provedor {
	id: IdProvedor
	nome: string
	dialeto: Dialeto
	/** Endpoint completo. */
	url: string
	/**
	 * Endereço de onde o usuário tira a chave. Só documentação — o app nunca
	 * abre isso sozinho.
	 */
	ondePegarChave: string
	/** Modelo padrão, editável pelo usuário na tela de Ajustes. */
	modelo: string
	/** O que o usuário precisa saber antes de colar a chave. */
	nota: string
	/**
	 * Estimativa de preço por milhão de tokens, em US$.
	 *
	 * É estimativa e pode envelhecer: serve para o teto de gasto fazer sentido,
	 * não para prever a fatura. A tela diz "estimativa".
	 */
	preco: { entrada: number; saida: number }
}

export const PROVEDORES: Record<IdProvedor, Provedor> = {
	openai: {
		id: 'openai',
		nome: 'OpenAI (ChatGPT)',
		dialeto: 'openai',
		url: 'https://api.openai.com/v1/chat/completions',
		ondePegarChave: 'platform.openai.com/api-keys',
		modelo: 'gpt-4o-mini',
		nota: 'Chave da OpenAI. O modelo menor basta para resumir o dia e propor ações.',
		preco: { entrada: 0.15, saida: 0.6 },
	},
	gemini: {
		id: 'gemini',
		nome: 'Google Gemini',
		dialeto: 'gemini',
		url: 'https://generativelanguage.googleapis.com/v1beta/models',
		ondePegarChave: 'aistudio.google.com/apikey',
		modelo: 'gemini-2.0-flash',
		nota: 'Chave do Google AI Studio. Tem faixa gratuita, com limite de requisições por minuto.',
		preco: { entrada: 0.1, saida: 0.4 },
	},
	claude: {
		id: 'claude',
		nome: 'Anthropic (Claude)',
		dialeto: 'anthropic',
		url: 'https://api.anthropic.com/v1/messages',
		ondePegarChave: 'console.anthropic.com/settings/keys',
		modelo: 'claude-3-5-haiku-latest',
		nota: 'Chave da Anthropic. Não aceita "responda em JSON": o JSON sai por instrução no prompt.',
		preco: { entrada: 0.8, saida: 4 },
	},
	deepseek: {
		id: 'deepseek',
		nome: 'DeepSeek',
		dialeto: 'openai',
		url: 'https://api.deepseek.com/chat/completions',
		ondePegarChave: 'platform.deepseek.com/api_keys',
		modelo: 'deepseek-chat',
		nota: 'Chave da própria DeepSeek. Barato e fala o formato da OpenAI.',
		preco: { entrada: 0.15, saida: 0.6 },
	},
	openrouter: {
		id: 'openrouter',
		nome: 'OpenRouter',
		dialeto: 'openai',
		url: 'https://openrouter.ai/api/v1/chat/completions',
		ondePegarChave: 'openrouter.ai/keys',
		modelo: 'anthropic/claude-3.5-haiku',
		nota: 'Uma chave para vários modelos. Serve quando você quer testar qual responde melhor.',
		preco: { entrada: 0.8, saida: 4 },
	},
}

/** Provedor inicial de uma instalação nova. */
export const PROVEDOR_PADRAO: IdProvedor = 'openai'

export const LISTA_DE_PROVEDORES: Provedor[] = Object.values(PROVEDORES)

/** Valida uma string vinda do banco (pode estar velha ou corrompida). */
export function comoProvedor(valor: unknown): IdProvedor {
	if (typeof valor === 'string' && valor in PROVEDORES) return valor as IdProvedor
	return PROVEDOR_PADRAO
}

export interface OpcoesDaChamada {
	instrucao?: string
	temperatura?: number
	teto?: number
	/** Força a saída em JSON. Só funciona onde o provedor suporta. */
	json?: boolean
}

/**
 * Corpo da requisição, no dialeto do provedor.
 *
 * Extraído para poder ser testado sem rede: divergência de nome de campo
 * (`max_tokens` × `max_completion_tokens`, `system` × `systemInstruction`) é
 * exatamente o detalhe que passa despercebido e vira 400 em produção.
 */
export function montarCorpo(
	provedor: Provedor,
	conteudoDoUsuario: string,
	opcoes: OpcoesDaChamada = {},
): Record<string, unknown> {
	const temperatura = opcoes.temperatura ?? 0.3
	const teto = opcoes.teto ?? 700

	if (provedor.dialeto === 'gemini') {
		return {
			systemInstruction: opcoes.instrucao
				? { parts: [{ text: opcoes.instrucao }] }
				: undefined,
			contents: [{ role: 'user', parts: [{ text: conteudoDoUsuario }] }],
			generationConfig: {
				temperature: temperatura,
				maxOutputTokens: teto,
				...(opcoes.json ? { responseMimeType: 'application/json' } : {}),
			},
		}
	}

	if (provedor.dialeto === 'anthropic') {
		return {
			model: provedor.modelo,
			max_tokens: teto,
			temperature: temperatura,
			...(opcoes.instrucao ? { system: opcoes.instrucao } : {}),
			messages: [{ role: 'user', content: conteudoDoUsuario }],
		}
	}

	// openai e compatíveis
	const corpo: Record<string, unknown> = {
		model: provedor.modelo,
		messages: [
			...(opcoes.instrucao ? [{ role: 'system', content: opcoes.instrucao }] : []),
			{ role: 'user', content: conteudoDoUsuario },
		],
		temperature: temperatura,
		max_tokens: teto,
	}

	if (opcoes.json) corpo.response_format = { type: 'json_object' }

	return corpo
}

/** Cabeçalhos de autenticação, que também mudam por provedor. */
export function cabecalhos(
	provedor: Provedor,
	chave: string,
	extra: Record<string, string> = {},
): Record<string, string> {
	const base: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		...extra,
	}

	if (provedor.dialeto === 'gemini') {
		base['x-goog-api-key'] = chave
		return base
	}

	if (provedor.dialeto === 'anthropic') {
		base['x-api-key'] = chave
		// Sem esta versão a Anthropic responde 400, não 401 — e a mensagem
		// fala de "header obrigatório", não de chave.
		base['anthropic-version'] = '2023-06-01'
		return base
	}

	base.Authorization = `Bearer ${chave}`
	return base
}

/**
 * Endpoint final.
 *
 * O Gemini põe o modelo no CAMINHO, não no corpo:
 * `/v1beta/models/<modelo>:generateContent`. Montar isso é a diferença entre
 * funcionar e receber 404 com a chave certa.
 */
export function endpoint(provedor: Provedor, modelo: string): string {
	if (provedor.dialeto === 'gemini') {
		const base = provedor.url.replace(/\/+$/, '')
		return `${base}/${encodeURIComponent(modelo)}:generateContent`
	}
	return provedor.url
}

/** Texto da resposta, no dialeto do provedor. `null` se não houver texto. */
export function lerResposta(provedor: Provedor, dados: unknown): string | null {
	if (!dados || typeof dados !== 'object') return null

	if (provedor.dialeto === 'gemini') {
		const corpo = dados as {
			candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>
		}
		const partes = corpo.candidates?.[0]?.content?.parts
		if (!Array.isArray(partes)) return null
		const texto = partes
			.map((parte) => (typeof parte?.text === 'string' ? parte.text : ''))
			.join('')
		return texto.trim() ? texto : null
	}

	if (provedor.dialeto === 'anthropic') {
		const corpo = dados as { content?: Array<{ type?: string; text?: unknown }> }
		if (!Array.isArray(corpo.content)) return null
		const texto = corpo.content
			.filter((bloco) => bloco?.type === 'text')
			.map((bloco) => (typeof bloco.text === 'string' ? bloco.text : ''))
			.join('')
		return texto.trim() ? texto : null
	}

	const corpo = dados as { choices?: Array<{ message?: { content?: unknown } }> }
	const conteudo = corpo.choices?.[0]?.message?.content
	return typeof conteudo === 'string' && conteudo.trim() ? conteudo : null
}

/** Consumo de tokens, quando o provedor informa. */
export function lerConsumo(
	provedor: Provedor,
	dados: unknown,
): { entrada: number; saida: number } {
	if (!dados || typeof dados !== 'object') return { entrada: 0, saida: 0 }

	if (provedor.dialeto === 'gemini') {
		const uso = (dados as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
			.usageMetadata
		return { entrada: uso?.promptTokenCount ?? 0, saida: uso?.candidatesTokenCount ?? 0 }
	}

	if (provedor.dialeto === 'anthropic') {
		const uso = (dados as { usage?: { input_tokens?: number; output_tokens?: number } }).usage
		return { entrada: uso?.input_tokens ?? 0, saida: uso?.output_tokens ?? 0 }
	}

	const uso = (dados as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage
	return { entrada: uso?.prompt_tokens ?? 0, saida: uso?.completion_tokens ?? 0 }
}

/** Mensagem de erro legível a partir do status e do corpo. */
export function erroDoProvedor(provedor: Provedor, status: number, dados: unknown): string {
	if (status === 401 || status === 403) {
		return `Chave recusada pela ${provedor.nome}. Confira se ela foi copiada inteira.`
	}
	if (status === 429) return `${provedor.nome} recusou por limite de uso. Tente mais tarde.`
	if (status >= 500) return `${provedor.nome} está fora do ar (${status}).`

	// O corpo de erro varia; extrai o primeiro texto que existir.
	let detalhe = ''
	if (dados && typeof dados === 'object') {
		const corpo = dados as {
			error?: { message?: unknown } | string
			message?: unknown
		}
		if (typeof corpo.error === 'string') detalhe = corpo.error
		else if (corpo.error && typeof corpo.error.message === 'string') detalhe = corpo.error.message
		else if (typeof corpo.message === 'string') detalhe = corpo.message
	}

	return detalhe
		? `${provedor.nome} respondeu ${status}: ${detalhe.slice(0, 160)}`
		: `${provedor.nome} respondeu ${status}.`
}
