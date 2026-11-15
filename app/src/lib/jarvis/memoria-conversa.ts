import type { AiChatMessage, NexoDatabase } from '@/db/db'
import { db } from '@/db/db'
import { SESSAO_PRINCIPAL } from './conversas'

/**
 * Memória de conversa.
 *
 * O defeito que isto corrige é o mais caro do app: o modelo recebia **só** a
 * pergunta atual e um resumo do banco. As mensagens anteriores existiam no
 * IndexedDB e eram lidas apenas para desenhar a tela. Resultado: "e as outras
 * duas?" não tinha como ser respondido, e cada pergunta parecia a primeira.
 *
 * A regra aqui é de janela e de custo:
 *
 * - as últimas `JANELA` mensagens vão inteiras, em pares usuário/assistente;
 * - o que ficou para trás vira **um** resumo curto, gerado localmente (sem
 *   chamada extra ao modelo, que dobraria o custo de cada conversa);
 * - mensagens de sistema (do próprio app) entram como assistente, porque é o
 *   que o usuário leu.
 *
 * O resumo é determinístico: pega o assunto de cada par antigo, não tenta
 * interpretar. Um resumo "inteligente" exigiria uma segunda chamada por
 * mensagem, e o orçamento de atenção já é o recurso escasso.
 */

export interface MensagemParaOModelo {
	role: 'user' | 'assistant'
	content: string
}

/** Quantas mensagens recentes vão inteiras. 12 = 6 trocas. */
export const JANELA = 12

/** Acima disso, as mensagens mais antigas entram no resumo. */
export const LIMITE_DO_RESUMO = 40

/** Teto de leitura numa chamada: a janela mais o que será resumido. */
export const MAXIMO_DE_HISTORICO = JANELA + LIMITE_DO_RESUMO

/** Um par pergunta/resposta, como o modelo deve ver. */
function comoMensagens(linhas: AiChatMessage[]): MensagemParaOModelo[] {
	return linhas.map((linha) => ({
		role: linha.papel === 'usuario' ? 'user' : 'assistant',
		content: linha.texto,
	}))
}

/**
 * Resumo do que ficou fora da janela.
 *
 * Curto de propósito: 6 linhas no máximo. O modelo precisa saber *que* assuntos
 * já foram tratados, não reviver a conversa inteira — isso é o que a janela faz.
 */
export function resumirConversa(antigas: AiChatMessage[]): string {
	if (antigas.length === 0) return ''

	const perguntas = antigas.filter((linha) => linha.papel === 'usuario').slice(-6)
	if (perguntas.length === 0) return ''

	const linhas = perguntas.map((linha) => `- ${linha.texto.replace(/\s+/g, ' ').slice(0, 120)}`)
	return `Assuntos já tratados nesta conversa (mais antigos):\n${linhas.join('\n')}`
}

/**
 * Monta o histórico para a chamada.
 *
 * `ate` é o instante da pergunta atual: mensagens gravadas depois dela não
 * podem entrar (o usuário pode ter mandado duas perguntas seguidas).
 */
export async function historicoParaOModelo(
	opcoes: { ate?: number; janela?: number; database?: NexoDatabase; sessao?: string } = {},
): Promise<{ mensagens: MensagemParaOModelo[]; resumo: string; total: number }> {
	const database = opcoes.database ?? db
	const janela = opcoes.janela ?? JANELA
	const ate = opcoes.ate ?? Date.now()

	/*
	 * Filtro por conversa.
	 *
	 * Sem ele, todas as mensagens do banco entravam no histórico, qualquer que
	 * fosse a conversa aberta — e o modelo recebia o fio anterior como se fosse
	 * continuação. Pior: o resumo das antigas despejava assuntos de OUTRA
	 * conversa no prompt, rotulados como "já tratados nesta conversa".
	 *
	 * Mensagem antiga (de antes das sessões existirem) não tem `sessao` e
	 * pertence à conversa `principal` — a mesma regra de `sessaoDa()`. Filtrar
	 * por igualdade em `sessao` excluiria essas linhas do histórico principal,
	 * então a `principal` lê as duas formas.
	 */
	const sessao = opcoes.sessao
	let recentes: AiChatMessage[]

	if (sessao && sessao !== SESSAO_PRINCIPAL) {
		recentes = await database.aiChat
			.where('em')
			.belowOrEqual(ate)
			.and((linha) => linha.sessao === sessao)
			.reverse()
			.limit(janela + LIMITE_DO_RESUMO)
			.toArray()
	} else if (sessao === SESSAO_PRINCIPAL) {
		recentes = await database.aiChat
			.where('em')
			.belowOrEqual(ate)
			.and((linha) => !linha.sessao || linha.sessao === SESSAO_PRINCIPAL)
			.reverse()
			.limit(janela + LIMITE_DO_RESUMO)
			.toArray()
	} else {
		// Sem sessão informada: comportamento antigo, mantido para as chamadas
		// que não são de conversa (testes e diagnóstico).
		recentes = await database.aiChat
			.where('em')
			.belowOrEqual(ate)
			.reverse()
			.limit(janela + LIMITE_DO_RESUMO)
			.toArray()
	}

	recentes.reverse()

	const total = recentes.length
	const dentroDaJanela = recentes.slice(-janela)
	const antigas = recentes.slice(0, Math.max(0, recentes.length - janela))

	return {
		mensagens: comoMensagens(dentroDaJanela),
		resumo: resumirConversa(antigas),
		total,
	}
}
