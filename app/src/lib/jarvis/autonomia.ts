import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { toDayKey } from '@/db/repo'
import { lerPreferencias } from './estado'
import { avaliarAcao, ETIQUETA_AUTONOMA, executarLote } from './executor'
import type { AcaoDaIA } from './ia'
import type { ItemDoPainel } from './motor'

/**
 * Ações autônomas de baixo risco.
 *
 * A partir de um sinal, o Jarvis pode agir SEM falar com a IA — porque a ação é
 * dedutível do próprio sinal. É o que a auditoria chamou de "a IA não é
 * necessária para o que cabe numa condição booleana".
 *
 * Só existem três famílias, e todas são reversíveis e de um item:
 *
 * 1. `projeto_criado_vazio` → cria uma tarefa "Definir os primeiros passos".
 * 2. `agenda_sem_preparo`   → cria uma tarefa "Preparar: <evento>".
 * 3. `projeto_prazo_proximo` → cria uma tarefa de revisão de escopo.
 *
 * Nenhuma delas edita, move ou exclui nada existente. Se o nível de autonomia
 * for "conservador", nada acontece: vira sugestão no painel.
 *
 * O que NUNCA é autônomo, em nenhum nível: editar projeto, reagendar, criar
 * evento, excluir, mexer em configuração.
 *
 * ## O defeito que este arquivo corrigia em si mesmo
 *
 * A versão anterior pulava todo sinal com `precisaIA: true` ANTES de olhar os
 * planos. Como dois dos três planos são justamente sinais de projeto que
 * carregam `precisaIA: true`, **eles nunca executavam** — eram código morto
 * com nome plausível. Medido: com os três sinais no painel, só um agia.
 *
 * A regra correta: `precisaIA` responde "o que fazer exige julgamento?", que é
 * uma pergunta sobre o CONTEÚDO da ação. A autonomia responde "quem autoriza
 * esta ação?", que é uma pergunta sobre RISCO. São eixos diferentes. Um sinal
 * pode precisar de julgamento e, mesmo assim, ter uma ação de apoio óbvia e
 * segura — e é exatamente o caso de "projeto criado e vazio".
 */

/** Só essas três famílias, por sinal. */
const PLANOS: Record<string, (item: ItemDoPainel) => AcaoDaIA | null> = {
	projeto_criado_vazio: (item) => {
		const projetoId = item.sinal.entidades[0]
		if (!projetoId) return null
		return {
			tipo: 'criar_tarefa',
			dados: {
				titulo: 'Definir os primeiros passos',
				projetoId,
				prioridade: 1,
			},
			motivo: 'Projeto criado sem nenhuma tarefa.',
		}
	},

	projeto_prazo_proximo: (item) => {
		const projetoId = item.sinal.entidades[0]
		if (!projetoId) return null
		return {
			tipo: 'criar_tarefa',
			dados: {
				titulo: 'Revisar escopo e cortar o que não cabe no prazo',
				projetoId,
				prioridade: 2,
			},
			motivo: 'Prazo próximo com progresso baixo.',
		}
	},

	agenda_sem_preparo: (item) => {
		/*
		 * O sinal não carrega a entidade do evento (`entidades` vazio), então a
		 * ação não pode nomear o compromisso. Antes ela criava a MESMA tarefa
		 * genérica para cada evento do dia — três compromissos viravam três
		 * "Preparar o compromisso de hoje" idênticas.
		 *
		 * O detalhe do sinal já diz quantos eventos estão sem preparo; usar o
		 * número no título mantém a ação útil e uma só por dia. `evitarDuplicata`
		 * impede que o tique seguinte crie a segunda.
		 */
		return {
			tipo: 'criar_tarefa',
			dados: {
				titulo: 'Preparar os compromissos de hoje',
				prioridade: 2,
				evitarDuplicata: true,
			},
			motivo: item.sinal.detalhe,
		}
	},
}

/** Quantas ações autônomas já foram executadas hoje (teto próprio). */
const TETO_DIARIO = 2

interface ResultadoAutonomo {
	executadas: number
	/** Sinais que podem ser marcados como tratados (não voltam no tique). */
	tratados: string[]
}

/**
 * Executa o que o nível de autonomia permite, sem tocar na IA.
 *
 * Recebe o painel já calculado e devolve quantas ações fez. O chamador marca
 * esses sinais como "aceitos" para não voltarem no próximo tique.
 */
export async function agirSozinho(
	painel: { itens: ItemDoPainel[] },
	opcoes: { agora?: number } = {},
	database: NexoDatabase = db,
): Promise<ResultadoAutonomo> {
	const prefs = await lerPreferencias(database)

	// Conservador não age; sugere. Confiante e equilibrado agem no que é livre.
	if (prefs.autonomia === 'conservador') return { executadas: 0, tratados: [] }
	if (prefs.modo === 'pausado' || prefs.modo === 'manual') return { executadas: 0, tratados: [] }

	const agora = opcoes.agora ?? Date.now()
	const feitasHoje = await contarAcoesHoje(agora, database)
	if (feitasHoje >= TETO_DIARIO) return { executadas: 0, tratados: [] }

	const tratados: string[] = []
	const acoes: AcaoDaIA[] = []
	const sobra = TETO_DIARIO - feitasHoje

	for (const item of painel.itens) {
		if (acoes.length >= sobra) break
		if (item.estado !== 'novo' || !item.interrompe) continue

		const plano = PLANOS[item.sinal.id]
		if (!plano) continue

		const acao = plano(item)
		if (!acao) continue

		const avaliacao = avaliarAcao(acao, prefs.autonomia)
		// Só o que o executor classificou como LIVRE passa sem confirmação.
		if (avaliacao.risco !== 'livre') continue

		acoes.push(acao)

		/*
		 * `tratado` só quando a IA não tem nada a acrescentar.
		 *
		 * A ação autônoma aqui é o PISO: a tarefa óbvia e reversível que não
		 * precisa de julgamento. O sinal que carrega `precisaIA` continua tendo
		 * algo a dizer ("como estruturar este projeto?"), e marcar como aceito
		 * apagaria essa chance — a iniciativa filtra `estado === 'novo'`.
		 *
		 * Antes, o código fazia o oposto por dois caminhos errados: pulava
		 * esses sinais por completo (nunca agia) ou, se agisse, consumia o
		 * julgamento. Agora faz os dois: age no que é seguro e deixa o
		 * julgamento acontecer.
		 */
		if (!item.sinal.precisaIA) tratados.push(item.sinal.chave)
	}

	if (acoes.length === 0) return { executadas: 0, tratados: [] }

	// Ação idempotente: não criar a segunda "Preparar os compromissos de hoje".
	const semRepeticao: AcaoDaIA[] = []
	for (const acao of acoes) {
		if (acao.dados.evitarDuplicata) {
			const titulo = String(acao.dados.titulo ?? '')
			const projetoId = typeof acao.dados.projetoId === 'string' ? acao.dados.projetoId : null
			const hoje = toDayKey(new Date())
			const abertas = await database.tasks.where('dueDate').equals(hoje).toArray()
			const existe = abertas.some(
				(tarefa) =>
					!tarefa.done &&
					!tarefa.deletedAt &&
					tarefa.title === titulo &&
					(projetoId == null || tarefa.projectId === projetoId),
			)
			if (existe) continue
		}
		semRepeticao.push(acao)
	}

	if (semRepeticao.length === 0) return { executadas: 0, tratados }

	const resultado = await executarLote(semRepeticao, database, { autonoma: true })
	return { executadas: resultado.executadas, tratados }
}

/**
 * Conta ações autônomas do dia.
 *
 * O teto é separado do orçamento de atenção: criar uma tarefa de apoio não
 * interrompe ninguém. Mas também não pode virar fábrica de tarefas.
 *
 * Conta **lotes autônomos**, não ações da conversa. Antes, aceitar duas
 * sugestões no chat consumia o teto e o Jarvis parava de agir sozinho no resto
 * do dia — o usuário não entendia por quê.
 */
async function contarAcoesHoje(agora: number, database: NexoDatabase): Promise<number> {
	const inicio = new Date(agora)
	inicio.setHours(0, 0, 0, 0)
	const lotes = await database.aiActions.where('em').aboveOrEqual(inicio.getTime()).toArray()

	return lotes
		.filter((lote) => !lote.desfeitoEm && lote.resumo.startsWith(ETIQUETA_AUTONOMA))
		.reduce((soma) => soma + 1, 0)
}

/** Cria uma tarefa de apoio diretamente — usado pelo painel quando o usuário
 *  aceita uma sugestão sem passar pela conversa. */
export async function criarTarefaDeApoio(
	item: ItemDoPainel,
	database: NexoDatabase = db,
): Promise<boolean> {
	const plano = PLANOS[item.sinal.id]
	if (!plano) return false
	const acao = plano(item)
	if (!acao) return false

	const resultado = await executarLote([acao], database)
	return resultado.executadas > 0
}

/** Se o item tem ação de apoio disponível (para o painel mostrar o botão). */
export function temAcaoDeApoio(item: ItemDoPainel): boolean {
	return item.sinal.id in PLANOS
}
