import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { Retrato } from './retrato'
import type { Sinal } from './sinais'
import { lerChaveApi, lerProvedor } from './segredo'
import type { Personalidade } from './relevancia'
import {
	cabecalhos,
	endpoint,
	erroDoProvedor,
	lerConsumo,
	lerResposta,
	montarCorpo,
	PROVEDORES,
} from './provedores'
import type { IdProvedor, Provedor } from './provedores'

/**
 * Cliente da IA.
 *
 * Três decisões que não são de gosto:
 *
 * 1. **`CapacitorHttp` em vez de `fetch`.** O app roda em `http://localhost`
 *    dentro do WebView. Testado na auditoria anterior: o gateway devolve 401
 *    sem `access-control-allow-origin`, e o `fetch` do WebView é bloqueado por
 *    CORS. `CapacitorHttp` faz a requisição pelo cliente HTTP nativo, que não
 *    passa por CORS.
 *
 * 2. **O que vai no prompt é o AGREGADO.** Nunca o banco: contagens, títulos das
 *    10 tarefas mais relevantes, estado dos projetos, agenda do dia. Notas
 *    livres e conteúdo de quadro ficam no aparelho. É privacidade e é custo.
 *
 * 3. **Uma chamada devolve uma lista fechada de ações.** O modelo não escolhe
 *    função, não escreve SQL e não tem laço. Quem executa é o executor, que
 *    valida cada ação. Resposta malformada = nada acontece.
 */

export interface AcaoDaIA {
	/**
	 * Tipo da lista fechada.
	 *
	 * A lista cresceu depois da auditoria: antes só criava tarefa, marco e
	 * evento, e respondia "não consigo" a metade dos pedidos naturais ("cria um
	 * projeto", "marca o hábito de hoje", "faz um lembrete"). Criar continua
	 * separado de excluir — excluir não existe, em nenhum tipo.
	 */
	tipo:
		| 'criar_tarefa'
		| 'editar_tarefa'
		| 'concluir_tarefa'
		| 'criar_projeto'
		| 'editar_projeto'
		| 'criar_marco'
		| 'concluir_marco'
		| 'criar_evento'
		| 'concluir_evento'
		| 'criar_lembrete'
		| 'avisar'
		| 'criar_habito'
		| 'registrar_habito'
		| 'anotar_em_projeto'
		| 'anotar_projeto'
		| 'organizar_projeto'
	/** Payload validado pelo executor, não pelo modelo. */
	dados: Record<string, unknown>
	/** Por que a IA propôs isto — aparece na confirmação. */
	motivo: string
}

export interface RespostaDaIA {
	/** Texto curto para o usuário. */
	mensagem: string
	acoes: AcaoDaIA[]
}

export interface ContextoDaChamada {
	retrato: Retrato
	sinais: Sinal[]
	/** O que o usuário pediu, se foi uma pergunta. */
	pergunta?: string
	/** Nomes de projetos, para a resposta não dizer "p1". */
	nomesDeProjeto: Record<string, string>
	/** Tom, detalhe e foco escolhidos pelo usuário. */
	personalidade?: Personalidade
	/** Fatos que o usuário ensinou ("não marco nada aos domingos"). */
	conhecimento?: string[]
}

/**
 * Traduz a personalidade em instrução.
 *
 * Existe porque "tom" e "detalhe" não são texto livre: o modelo responde
 * diferente para cada combinação, e deixar isso no prompt do usuário faria a
 * saída variar de forma imprevisível. Aqui são três eixos fechados.
 *
 * Sobre o tom ríspido: palavrão explícito é recusado por filtro de conteúdo na
 * maioria dos provedores, e o que volta é uma resposta mornas — pior que não
 * pedir. A instrução abaixo pede **franqueza cortante**, que é o que o usuário
 * quer quando pede "fala a real": nomear a procrastinação, sem enfeite e sem
 * ofensa gratuita. Isso o modelo entrega de forma consistente.
 */
export function instrucaoDeEstilo(personalidade?: Personalidade): string {
	if (!personalidade) return ''

	const tons: Record<Personalidade['tom'], string> = {
		direto: 'Fale de forma direta e objetiva, sem rodeios.',

		rispido:
			'Fale de forma franca e cortante. Diga o que está errado sem amaciar: ' +
			'nomeie a procrastinação, o atraso e a desculpa quando eles existirem. ' +
			'Sem ofensa gratuita nem palavrão, mas sem panos quentes. Uma frase seca ' +
			'que dói é melhor que três que consolam.',

		sarcastico:
			'Use ironia seca e humor ácido, na medida. O sarcasmo deve apontar o ' +
			'problema real, nunca humilhar. Uma alfinetada por resposta, não cinco.',

		comediante:
			'Fale com humor leve e bem-humorado, como quem faz piada para aliviar ' +
			'mas continua sendo útil. A piada não pode esconder a informação: o ' +
			'recado prático vem primeiro.',

		serio:
			'Fale de forma sóbria e precisa, sem humor e sem coloquialismo. ' +
			'Trate o assunto com o peso que ele tem.',

		profissional:
			'Fale como um assistente executivo competente: claro, organizado, ' +
			'sem informalidade e sem opinião pessoal. Foco no que precisa ser feito ' +
			'e em quando.',

		calmo: 'Fale de forma calma e tranquila, sem alarmismo.',

		proximo: 'Fale de forma próxima e cordial, como um colega de confiança.',
	}

	const detalhes: Record<Personalidade['detalhe'], string> = {
		curto: 'Responda em no máximo 2 frases.',
		equilibrado: 'Responda em até 4 frases, com o essencial.',
		explicado: 'Explique o raciocínio em até 6 frases, com o porquê.',
	}

	const foco = personalidade.foco?.trim()
		? ` O que mais importa para o usuário: ${personalidade.foco.trim()}.`
		: ''

	return `${tons[personalidade.tom]} ${detalhes[personalidade.detalhe]}${foco}`
}

/**
 * Preço usado na contabilidade, conforme o provedor ativo.
 *
 * Continua sendo ESTIMATIVA: a Deploy não publica a tabela no manual que foi
 * passado. O teto de gasto existe justamente para o caso de a estimativa estar
 * errada.
 */
export function precoDo(provedor: Provedor): { entrada: number; saida: number } {
	return provedor.preco
}

/** Endpoint do provedor ativo. */
export async function urlDoProvedor(): Promise<string> {
	const id = await lerProvedor()
	return PROVEDORES[id].url
}

export function estimarCusto(
	entradaTokens: number,
	saidaTokens: number,
	provedor: Provedor = PROVEDORES.openai,
): number {
	return (
		(entradaTokens / 1_000_000) * provedor.preco.entrada +
		(saidaTokens / 1_000_000) * provedor.preco.saida
	)
}

/**
 * Instrução fixa. Fica separada do conteúdo para o cache de prompt do provedor
 * aproveitar o prefixo: o texto começa igual em toda chamada.
 */
export const INSTRUCAO = `Você é o Jarvis do Urdume, um app pessoal de tarefas, projetos, hábitos e agenda.
Você recebe um RESUMO do estado do app (números e títulos, nunca notas privadas) e os sinais que as regras locais detectaram.

Regras:
- Responda em português do Brasil, em no máximo 3 frases.
- Só proponha ações quando elas resolverem algo concreto do resumo.
- Use apenas os tipos de ação permitidos. Nunca invente ids: use os ids que vieram no resumo.
- Nunca proponha excluir, apagar, alterar backups, mudar configurações ou o nível de autonomia.
- Se não houver nada útil a fazer, devolva "acoes": [].
- Formato de saída: JSON puro, sem markdown:
{"mensagem": "...", "acoes": [{"tipo": "...", "dados": {...}, "motivo": "..."}]}

Tipos permitidos e seus dados:
- criar_tarefa: {"titulo": string, "dia"?: "AAAA-MM-DD", "hora"?: "HH:MM", "prazo"?: "AAAA-MM-DD", "projetoId"?: string, "prioridade"?: 0-3}
- editar_tarefa: {"id": string, "dia"?: "AAAA-MM-DD", "hora"?: "HH:MM"|null, "prazo"?: "AAAA-MM-DD", "titulo"?: string, "prioridade"?: 0-3}
- concluir_tarefa: {"id": string}
- criar_projeto: {"nome": string, "descricao"?: string, "prazo"?: "AAAA-MM-DD"}
- editar_projeto: {"id": string, "prazo"?: "AAAA-MM-DD", "status"?: "ativo"|"pausado"|"concluido"}
- criar_marco: {"projetoId": string, "titulo": string, "data"?: "AAAA-MM-DD"}
- concluir_marco: {"projetoId": string, "marcoId": string}
- criar_evento: {"titulo": string, "inicio": number, "fim": number}
- concluir_evento: {"id": string}
- criar_lembrete: {"texto": string, "quandoEm"?: number}
- avisar: {"titulo": string, "corpo": string, "quandoEm": number, "nivel"?: "info"|"atencao"|"urgente"}
- criar_habito: {"titulo": string, "dias"?: number[], "meta"?: number, "unidade"?: string}
- registrar_habito: {"id": string, "dia"?: "AAAA-MM-DD"}
- anotar_em_projeto: {"id": string, "texto": string}
- anotar_projeto: {"projetoId": string, "texto": string, "titulo"?: string, "em"?: number}
- organizar_projeto: {"id": string, "categoria"?: string|null, "prioridade"?: 0-3}

Quando o usuário pedir para ser AVISADO ou LEMBRADO num horário, use o campo
certo, não só o texto:
- "me lembra às 15h de ligar" → criar_lembrete com quandoEm em epoch ms.
- "faz uma tarefa amanhã às 9h" → criar_tarefa com dia e hora.
- "tenho que entregar sexta" → criar_tarefa com prazo (deadline), não dia.
Uma tarefa sem "hora" não produz alarme no horário; só aparece no resumo do
dia. Se o pedido tem hora, preencha "hora".

Para um aviso que não é tarefa — um relatório para revisar, um dado que você
observou, uma pergunta que precisa da resposta dele ("posso arquivar isto?"), ou
o resultado de algo que você fez — use "avisar". Ele é um ponto de notificação
seu: aparece na hora marcada, fora do app, e não vira tarefa na lista dele.
Use com parcimônia: no máximo um aviso por análise, e só quando você tiver algo
concreto a dizer. Nunca use "avisar" para repetir o que já está no painel.`

/** O resumo que vai no prompt: pequeno, sem nota livre, sem quadro. */
export function montarResumo(contexto: ContextoDaChamada): string {
	const { retrato } = contexto
	const linhas: string[] = []

	linhas.push(`Hoje: ${retrato.hoje}, ${retrato.hora}h.`)
	linhas.push(
		`Tarefas: ${retrato.tarefas.abertas} abertas, ${retrato.tarefas.atrasadas} atrasadas, ${retrato.tarefas.concluidasHoje} concluídas hoje.`,
	)

	if (retrato.tarefas.relevantes.length > 0) {
		linhas.push('Mais relevantes:')
		for (const tarefa of retrato.tarefas.relevantes.slice(0, 10)) {
			const projeto = tarefa.projeto ? ` (${tarefa.projeto})` : ''
			const atraso = tarefa.diasAtraso > 0 ? `, ${tarefa.diasAtraso}d atrasada` : ''
			linhas.push(`- [${tarefa.id}] ${tarefa.titulo}${projeto}${atraso}`)
		}
	}

	const projetos = retrato.projetos.filter((projeto) => !projeto.ignorado).slice(0, 8)
	if (projetos.length > 0) {
		linhas.push('Projetos:')
		for (const projeto of projetos) {
			const prazo = projeto.diasParaPrazo == null ? 'sem prazo' : `${projeto.diasParaPrazo}d para o prazo`
			linhas.push(
				`- [${projeto.id}] ${projeto.nome}: ${projeto.status}, ${projeto.progresso}%, ${projeto.abertas} abertas, ${prazo}, ${projeto.diasSemAtividade}d sem mudança`,
			)
		}
	}

	if (retrato.agenda.hoje.length > 0) {
		linhas.push(`Agenda de hoje (${retrato.agenda.hoje.length}):`)
		for (const evento of retrato.agenda.hoje.slice(0, 8)) {
			const hora = new Date(evento.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
			linhas.push(`- ${evento.diaInteiro ? 'dia inteiro' : hora}: ${evento.titulo}`)
		}
	}

	if (retrato.lembretes.lista.length > 0) {
		linhas.push('Lembretes abertos:')
		for (const lembrete of retrato.lembretes.lista) {
			linhas.push(`- [${lembrete.id}] ${lembrete.texto}${lembrete.vencido ? ' (vencido)' : ''}`)
		}
	}

	if (retrato.habitosDisponiveis.length > 0) {
		linhas.push('Hábitos:')
		for (const habito of retrato.habitosDisponiveis) {
			linhas.push(
				`- [${habito.id}] ${habito.titulo} — ${habito.feitoHoje ? 'feito hoje' : 'pendente hoje'}`,
			)
		}
	}

	if (retrato.paginas.recentes.length > 0) {
		linhas.push(`Páginas recentes (${retrato.paginas.total} no total):`)
		for (const pagina of retrato.paginas.recentes) {
			linhas.push(`- [${pagina.id}] ${pagina.titulo}${pagina.projeto ? ` (${pagina.projeto})` : ''}`)
		}
	}

	if (contexto.sinais.length > 0) {
		linhas.push('Sinais detectados pelas regras:')
		for (const sinal of contexto.sinais.slice(0, 8)) {
			linhas.push(`- ${sinal.id} (${sinal.nivel}): ${sinal.detalhe}`)
		}
	}

	// Conhecimento ensinado pelo usuário: entra como fato, não como ordem.
	if (contexto.conhecimento?.length) {
		linhas.push('O que o usuário me ensinou:')
		for (const fato of contexto.conhecimento.slice(0, 10)) linhas.push(`- ${fato}`)
	}

	if (contexto.pergunta) linhas.push(`Pedido do usuário: ${contexto.pergunta}`)

	return linhas.join('\n')
}

export interface ResultadoDaChamada {
	ok: boolean
	resposta: RespostaDaIA | null
	erro: string | null
	entradaTokens: number
	saidaTokens: number
	custoUsd: number
	duracaoMs: number
}

/**
 * Chamada única ao modelo. Nunca lança: devolve `ok: false` com o motivo, para
 * a tela mostrar "não deu" em vez de travar.
 */
export async function consultar(
	contexto: ContextoDaChamada,
	opcoes: { modelo?: string; timeoutMs?: number; provedor?: IdProvedor } = {},
): Promise<ResultadoDaChamada> {
	const inicio = Date.now()
	const id = opcoes.provedor ?? (await lerProvedor())
	const provedor = PROVEDORES[id]
	const modelo = opcoes.modelo ?? provedor.modelo
	const chave = await lerChaveApi(id)

	if (!chave) {
		return {
			ok: false,
			resposta: null,
			erro: 'Nenhuma chave da API salva.',
			entradaTokens: 0,
			saidaTokens: 0,
			custoUsd: 0,
			duracaoMs: 0,
		}
	}

	const corpo = montarCorpo(provedor, montarResumo(contexto), {
		instrucao: `${INSTRUCAO}\n\nEstilo: ${instrucaoDeEstilo(contexto.personalidade)}`,
		temperatura: 0.3,
		teto: 700,
		json: true,
	})

	// Modelo sobrescrito só quando o chamador pediu (teste ou modelo novo).
	if (opcoes.modelo && provedor.dialeto !== 'gemini') corpo.model = modelo

	const alvo = endpoint(provedor, modelo)
	const cabecalho = cabecalhos(provedor, chave, provedor.dialeto === 'anthropic' ? {} : {})

	try {
		let dados: unknown
		let status = 0

		if (Capacitor.isNativePlatform()) {
			// Caminho nativo: sem CORS, com timeout do lado do sistema.
			const resposta = await CapacitorHttp.post({
				url: alvo,
				headers: cabecalho,
				data: corpo,
				connectTimeout: opcoes.timeoutMs ?? 30_000,
				readTimeout: opcoes.timeoutMs ?? 30_000,
			})
			status = resposta.status
			dados = resposta.data
		} else {
			// Caminho web (desenvolvimento). O CORS pode barrar: a tela avisa
			// que a análise por IA exige o app instalado.
			const resposta = await fetch(alvo, {
				method: 'POST',
				headers: cabecalho,
				body: JSON.stringify(corpo),
			})
			status = resposta.status
			dados = await resposta.json().catch(() => null)
		}

		if (status < 200 || status >= 300) {
			return falha(erroDoProvedor(provedor, status, dados), inicio)
		}

		const conteudo = lerResposta(provedor, dados)
		if (!conteudo) {
			return falha(`${provedor.nome} devolveu uma resposta vazia.`, inicio)
		}

		const consumo = lerConsumo(provedor, dados)
		const entradaTokens = consumo.entrada
		const saidaTokens = consumo.saida

		const resposta = interpretar(conteudo)
		const duracaoMs = Date.now() - inicio

		return {
			ok: resposta !== null,
			resposta,
			erro: resposta === null ? 'A resposta não veio no formato esperado.' : null,
			entradaTokens,
			saidaTokens,
			custoUsd: estimarCusto(entradaTokens, saidaTokens, provedor),
			duracaoMs,
		}
	} catch (causa) {
		const mensagem = causa instanceof Error ? causa.message : 'Falha de rede.'
		return falha(mensagem, inicio)
	}
}

function falha(erro: string, inicio: number): ResultadoDaChamada {
	return {
		ok: false,
		resposta: null,
		erro,
		entradaTokens: 0,
		saidaTokens: 0,
		custoUsd: 0,
		duracaoMs: Date.now() - inicio,
	}
}

/**
 * Filtro de entrada da resposta do modelo.
 *
 * Precisa listar TODO tipo da união `AcaoDaIA`. Quando esta lista ficou para
 * trás, o modelo propunha `criar_projeto` e o app descartava em silêncio — a
 * ação simplesmente não aparecia na prévia, sem erro. Há teste de contrato
 * (`vocabulario.test.ts`) comparando as duas listas justamente por isso.
 */
const TIPOS_PERMITIDOS: ReadonlySet<string> = new Set([
	'criar_tarefa',
	'editar_tarefa',
	'concluir_tarefa',
	'criar_projeto',
	'editar_projeto',
	'criar_marco',
	'concluir_marco',
	'criar_evento',
	'concluir_evento',
	'criar_lembrete',
	'avisar',
	'criar_habito',
	'registrar_habito',
	'anotar_em_projeto',
	'anotar_projeto',
	'organizar_projeto',
])

/**
 * Lê a resposta do modelo com desconfiança.
 *
 * O modelo é uma fonte não confiável: pode devolver markdown, JSON quebrado,
 * campo faltando ou ação inventada. Aqui nada disso quebra o app — a resposta
 * inválida vira "não entendi" e nenhuma ação é executada.
 */
export function interpretar(conteudo: string): RespostaDaIA | null {
	if (!conteudo.trim()) return null

	// Alguns modelos embrulham em ```json … ``` mesmo com response_format.
	const limpo = conteudo
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/, '')

	let dados: unknown
	try {
		dados = JSON.parse(limpo)
	} catch {
		return null
	}

	if (!dados || typeof dados !== 'object') return null
	const bruto = dados as { mensagem?: unknown; acoes?: unknown }

	const mensagem = typeof bruto.mensagem === 'string' ? bruto.mensagem.slice(0, 600) : ''
	const lista = Array.isArray(bruto.acoes) ? bruto.acoes : []

	const acoes: AcaoDaIA[] = []
	for (const item of lista.slice(0, 5)) {
		if (!item || typeof item !== 'object') continue
		const acao = item as { tipo?: unknown; dados?: unknown; motivo?: unknown }

		if (typeof acao.tipo !== 'string' || !TIPOS_PERMITIDOS.has(acao.tipo)) continue
		if (!acao.dados || typeof acao.dados !== 'object') continue

		acoes.push({
			tipo: acao.tipo as AcaoDaIA['tipo'],
			dados: acao.dados as Record<string, unknown>,
			motivo: typeof acao.motivo === 'string' ? acao.motivo.slice(0, 240) : '',
		})
	}

	return { mensagem, acoes }
}
