import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { NexoDatabase } from '@/db/db'
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
 * Quantos assuntos entram no prompt.
 *
 * 12 e não 8: a agregação permite cobrir mais com o mesmo custo de tokens,
 * porque um assunto carrega vários sinais em uma linha. Medido com 400
 * tarefas e 25 projetos: ~1.000 tokens de resumo.
 */
export const LIMITE_DE_ASSUNTOS = 12

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
 *    livres ficam no aparelho. É privacidade e é custo.
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
		/**
		 * Cobertura dos recursos que o usuário cria na tela.
		 *
		 * Auditoria de cobertura (docs/36): o usuário podia criar subtarefa,
		 * editar evento, editar hábito e concluir lembrete, e nenhum desses
		 * existia para a IA. É exatamente o "recurso indisponível" que o caso
		 * dos eventos expôs antes.
		 */
		| 'adicionar_subtarefa'
		| 'concluir_subtarefa'
		| 'editar_evento'
		| 'editar_habito'
		| 'concluir_lembrete'
		/**
		 * Operação em lote, declarativa.
		 *
		 * O modelo propõe um FILTRO, não uma lista de ids: enumerar 40 custa
		 * tokens, erra e não é auditável. O executor resolve o filtro no banco,
		 * mostra a contagem e aplica com a escada de risco por volume.
		 *
		 * Exclusão em lote não existe, em nenhum volume: `arquivar` (reversível)
		 * é o máximo que a IA pode propor.
		 */
		| 'lote_tarefas'
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

interface ContextoDaChamada {
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

	/**
	 * Mensagens anteriores da conversa, no formato do provedor.
	 *
	 * Sem isto o modelo responde cada pergunta como se fosse a primeira — era
	 * a queixa principal sobre a IA. Ver `memoria-conversa.ts`.
	 */
	historico?: Array<{ role: 'user' | 'assistant'; content: string }>
	/** Sinais que o usuário já recusou/silenciou, em texto curto. */
	recusas?: string[]

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
export const INSTRUCAO = `Você é o Jarvis, o assistente pessoal dentro do Urdume — um app de tarefas, projetos, hábitos e agenda. Você fala com o dono do app, que é uma pessoa só, e conhece o estado atual do app pelo RESUMO abaixo (números e títulos; nunca notas privadas).

COMO FALAR
- Português do Brasil, natural, como um assistente competente que conhece o contexto.
- Responda o que foi perguntado. Se a pergunta depende de algo dito antes na conversa, use o HISTÓRICO — ele está aí para isso.
- Seja específico: cite nomes, datas e números do resumo. Nunca invente dado que não está no resumo.
- Se não souber, diga o que falta saber e como descobrir dentro do app. Não invente.
- Não repita o pedido do usuário de volta. Não comece com "Claro!" nem "Com certeza".

QUANDO PROPÔR AÇÃO
- Proponha ação quando o pedido do usuário pedir uma mudança, ou quando houver algo concreto a resolver com o que está no resumo.
- Não proponha ação para conversa, dúvida ou opinião.
- Uma ação por problema. Duas ações só quando o pedido tiver duas partes claras.
- Use SÓ os ids que aparecem no resumo. Id inventado é recusado e o usuário perde a confiança.
- Nunca proponha excluir, apagar, restaurar backup, mudar configuração ou autonomia.

FORMATO
Responda SOMENTE com JSON, sem markdown:
{"mensagem": "sua resposta em texto natural", "acoes": [{"tipo": "...", "dados": {...}, "motivo": "por que, em uma linha"}]}
"acoes" pode e deve ser [] quando não houver o que fazer. "mensagem" nunca fica vazia.

TIPOS PERMITIDOS E SEUS DADOS
- criar_tarefa: {"titulo": string, "dia"?: "AAAA-MM-DD", "hora"?: "HH:MM", "prazo"?: "AAAA-MM-DD", "projetoId"?: string, "prioridade"?: 0-3}
- editar_tarefa: {"id": string, "dia"?: "AAAA-MM-DD", "hora"?: "HH:MM"|null, "prazo"?: "AAAA-MM-DD", "titulo"?: string, "prioridade"?: 0-3}
- concluir_tarefa: {"id": string}
- criar_projeto: {"nome": string, "descricao"?: string, "prazo"?: "AAAA-MM-DD", "categoria"?: string, "prioridade"?: 0-3}
- editar_projeto: {"id": string, "prazo"?: "AAAA-MM-DD", "status"?: "ativo"|"pausado"|"concluido", "categoria"?: string, "prioridade"?: 0-3}
- criar_marco: {"projetoId": string, "titulo": string, "data"?: "AAAA-MM-DD"}
- concluir_marco: {"projetoId": string, "marcoId": string}
- criar_evento: {"titulo": string, "dia": "AAAA-MM-DD", "hora": "HH:MM", "duracaoMin"?: number}
- concluir_evento: {"id": string}
- criar_lembrete: {"texto": string, "dia"?: "AAAA-MM-DD", "hora"?: "HH:MM", "emMinutos"?: number, "quandoEm"?: number}
- avisar: {"titulo": string, "corpo": string, "dia"?: "AAAA-MM-DD", "hora"?: "HH:MM", "emMinutos"?: number, "nivel"?: "informativo"|"atencao"|"urgente"}
- criar_habito: {"titulo": string, "dias"?: number[], "meta"?: number, "unidade"?: string}
- registrar_habito: {"id": string, "dia"?: "AAAA-MM-DD"}
- anotar_em_projeto: {"id": string, "texto": string}
- anotar_projeto: {"projetoId": string, "texto": string, "titulo"?: string, "em"?: number}
- organizar_projeto: {"id": string, "categoria"?: string|null, "prioridade"?: 0-3}
- lote_tarefas: {"filtro": {...}, "operacao": {...}}
  O filtro aceita: estado ("aberta"|"concluida"|"atrasada"|"hoje"|"semana"|"sem-data"),
  projetoId, antesDe ("AAAA-MM-DD"), prioridadeMinima (0-3), contem (texto), etiqueta.
  A operação aceita: {"tipo":"mover","para":"AAAA-MM-DD"} | {"tipo":"concluir"} |
  {"tipo":"reabrir"} | {"tipo":"priorizar","prioridade":0-3} |
  {"tipo":"etiquetar","etiqueta":string} | {"tipo":"arquivar"}.
  USE ISSO em vez de repetir ações: "marca tudo do projeto X como feito",
  "move as atrasadas para segunda", "põe #urgente nas de prazo". Nunca liste ids
  de vários itens — o filtro resolve. Exclusão em lote não existe.
- adicionar_subtarefa: {"tarefaId": string, "titulo": string}
- concluir_subtarefa: {"tarefaId": string, "subtarefaId": string}
- editar_evento: {"id": string, "titulo"?: string, "dia"?: "AAAA-MM-DD", "hora"?: "HH:MM", "duracaoMin"?: number}
- editar_habito: {"id": string, "titulo"?: string, "meta"?: number, "unidade"?: string, "dias"?: number[]}
- concluir_lembrete: {"id": string}

QUANDO O USUÁRIO PEDIR PARA SER AVISADO OU LEMBRADO NUM HORÁRIO, use o campo certo:
- "me lembra às 15h de ligar" → criar_lembrete com dia de hoje e hora "15:00".
- "me lembra amanhã às 9h" → criar_lembrete com dia de amanhã e hora "09:00".
- "me avisa daqui a 2 horas" → criar_lembrete ou avisar com emMinutos: 120.
- "faz uma tarefa amanhã às 9h" → criar_tarefa com dia e hora.
- "tenho que entregar sexta" → criar_tarefa com prazo, não dia.
- "marca reunião sexta às 15h" → criar_evento com dia e hora.

VOCÊ NÃO SABE CONVERTER DATA PARA EPOCH. Nunca preencha "quandoEm": use "dia"
(AAAA-MM-DD) + "hora" (HH:MM) no fuso do aparelho, ou "emMinutos" para algo
relativo a agora. O executor calcula o resto. Isso vale para criar_evento,
criar_lembrete e avisar.

Uma tarefa sem hora não produz alarme; só aparece no resumo do dia.

"avisar" é para um recado que não é tarefa: um relatório para revisar, um dado que você observou, uma pergunta que precisa de resposta, o resultado de algo que você fez. No máximo um aviso por resposta.`

/** O resumo que vai no prompt: pequeno e sem nota livre. */
export function montarResumo(contexto: ContextoDaChamada): string {
	const { retrato } = contexto
	const linhas: string[] = []

	linhas.push(`Hoje: ${retrato.hoje}, ${retrato.hora}h.`)
	linhas.push(
		`Tarefas: ${retrato.tarefas.abertas} abertas, ${retrato.tarefas.atrasadas} atrasadas, ${retrato.tarefas.concluidasHoje} concluídas hoje.`,
	)

	/*
	 * Tarefas de hoje com hora. Antes o resumo só dizia "3 tarefas atrasadas" e
	 * a IA não conseguia citar um compromisso concreto. É o que faz a diferença
	 * entre "você tem coisas hoje" e "às 11h você tem a reunião com o Pedro".
	 */
	if (retrato.tarefas.deHoje.length > 0) {
		linhas.push(`Tarefas de hoje (${retrato.tarefas.deHoje.length}):`)
		for (const tarefa of retrato.tarefas.deHoje) {
			const hora = tarefa.hora ? `${tarefa.hora} ` : ''
			const projeto = tarefa.projeto ? ` (${tarefa.projeto})` : ''
			linhas.push(`- [${tarefa.id}] ${hora}${tarefa.titulo}${projeto}`)
			/*
			 * Subtarefas abertas, com id.
			 *
			 * `concluir_subtarefa` exige `subtarefaId`; sem imprimir o id, o tipo
			 * existia no catálogo e era impossível de preencher sem o modelo
			 * inventar — o mesmo defeito que `concluir_evento` teve.
			 */
			for (const sub of tarefa.subtarefas ?? []) {
				linhas.push(`  · subtarefa [${sub.id}] ${sub.titulo}`)
			}
		}
	}

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
			const proximo = projeto.proximoPasso ? `, próximo passo: "${projeto.proximoPasso}"` : ''
			linhas.push(
				`- [${projeto.id}] ${projeto.nome}: ${projeto.status}, ${projeto.progresso}%, ${projeto.abertas} abertas, ${prazo}, ${projeto.diasSemAtividade}d sem mudança${proximo}`,
			)
			/*
			 * Marcos pendentes, COM id.
			 *
			 * `concluir_marco` exige `marcoId`, e o resumo só trazia a CONTAGEM
			 * de marcos pendentes. Sem o id impresso, a ação existia no catálogo
			 * e era impossível de preencher sem o modelo inventar — e id
			 * inventado é recusado. Era um tipo morto.
			 */
			for (const marco of projeto.marcosAbertos ?? []) {
				const data = marco.data ? ` (${marco.data})` : ''
				linhas.push(`  · marco [${marco.id}] ${marco.titulo}${data}`)
			}
		}
	}

	if (retrato.agenda.hoje.length > 0) {
		linhas.push(`Agenda de hoje (${retrato.agenda.hoje.length}):`)
		for (const evento of retrato.agenda.hoje.slice(0, 8)) {
			const hora = new Date(evento.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
			// O id é o que permite "concluir_evento" e "editar evento". Antes ele
			// não era impresso: a ação existia no catálogo e era impossível de
			// preencher sem inventar id — o modelo inventava e o executor recusava.
			linhas.push(`- [${evento.id}] ${evento.diaInteiro ? 'dia inteiro' : hora}: ${evento.titulo}`)
		}
	}

	if (retrato.agenda.amanha.length > 0) {
		linhas.push(`Agenda de amanhã (${retrato.agenda.amanha.length}):`)
		for (const evento of retrato.agenda.amanha.slice(0, 6)) {
			const hora = new Date(evento.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
			linhas.push(`- [${evento.id}] ${hora}: ${evento.titulo}`)
		}
	}

	if (retrato.agenda.conflitosHoje > 0) {
		linhas.push(`Atenção: ${retrato.agenda.conflitosHoje} conflito(s) de horário hoje.`)
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

	// O que ele já recusou. Sem isto, a IA propõe de novo a mesma coisa todos
	// os dias — é a forma mais rápida de virar um assistente que incomoda.
	if (contexto.recusas?.length) {
		linhas.push('O usuário já recusou ou silenciou isto (NÃO repita):')
		for (const recusa of contexto.recusas.slice(0, 8)) linhas.push(`- ${recusa}`)
	}

	if (contexto.pergunta) linhas.push(`Pedido do usuário: ${contexto.pergunta}`)

	return linhas.join('\n')
}

interface ResultadoDaChamada {
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
	opcoes: {
		modelo?: string
		timeoutMs?: number
		provedor?: IdProvedor
		/**
		 * Banco de onde ler provedor e chave.
		 *
		 * Sem isto, `consultar` sempre lia o banco global — o que funciona no
		 * app, mas torna impossível testar o caminho real com um banco
		 * isolado (e um vazamento de estado entre testes).
		 */
		database?: NexoDatabase
	} = {},
): Promise<ResultadoDaChamada> {
	const inicio = Date.now()
	const banco = opcoes.database
	const id = opcoes.provedor ?? (await lerProvedor(banco))
	const provedor = PROVEDORES[id]
	const modelo = opcoes.modelo ?? provedor.modelo
	const chave = await lerChaveApi(id, banco)

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

	/*
	 * Corpo no dialeto do provedor ativo.
	 *
	 * `montarCorpo` resolve as três divergências que quebram a chamada:
	 * `max_tokens` × `maxOutputTokens`, `system` × `systemInstruction`, e o
	 * JSON forçado (que a Anthropic não aceita e faz por prompt).
	 */
	const corpo = montarCorpo(provedor, montarResumo(contexto), {
		instrucao: `${INSTRUCAO}\n\nEstilo: ${instrucaoDeEstilo(contexto.personalidade)}`,
		temperatura: 0.5,
		teto: 1100,
		json: true,
	})

	try {
		let conteudo: string
		let entradaTokens = 0
		let saidaTokens = 0

		const url = endpoint(provedor, modelo)
		const headers = cabecalhos(provedor, chave)

		if (Capacitor.isNativePlatform()) {
			// Caminho nativo: sem CORS, com timeout do lado do sistema.
			const resposta = await CapacitorHttp.post({
				url,
				headers,
				data: corpo,
				connectTimeout: opcoes.timeoutMs ?? 30_000,
				readTimeout: opcoes.timeoutMs ?? 30_000,
			})

			if (resposta.status < 200 || resposta.status >= 300) {
				return falha(erroDoProvedor(provedor, resposta.status, resposta.data), inicio)
			}

			const texto = lerResposta(provedor, resposta.data)
			if (!texto) return falha('A resposta não veio no formato esperado.', inicio)
			conteudo = texto
			const consumo = lerConsumo(provedor, resposta.data)
			entradaTokens = consumo.entrada
			saidaTokens = consumo.saida
		} else {
			// Caminho web (desenvolvimento). Aqui o CORS pode barrar; a tela
			// informa que a análise por IA exige o app instalado.
			const resposta = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(corpo),
			})

			if (!resposta.ok) {
				const corpoDoErro = await resposta.json().catch(() => null)
				return falha(erroDoProvedor(provedor, resposta.status, corpoDoErro), inicio)
			}

			const json = await resposta.json()
			const texto = lerResposta(provedor, json)
			if (!texto) return falha('A resposta não veio no formato esperado.', inicio)
			conteudo = texto
			const consumo = lerConsumo(provedor, json)
			entradaTokens = consumo.entrada
			saidaTokens = consumo.saida
		}

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
	'lote_tarefas',
	'adicionar_subtarefa',
	'concluir_subtarefa',
	'editar_evento',
	'editar_habito',
	'concluir_lembrete',
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

	// JSON válido com `"mensagem": ""` era aceito como sucesso e a tela dizia
	// "Sem sugestões agora" — indistinguível de uma resposta real e vazia. Sem
	// fala e sem ação não é resposta: é falha, e o chamador precisa saber.
	if (!mensagem.trim() && acoes.length === 0) return null

	return { mensagem, acoes }
}
