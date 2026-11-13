import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { createTask } from '@/db/repo'
import { lerPreferencias } from './estado'
import { avaliarAcao, executarLote } from './executor'
import type { AcaoDaIA } from './ia'
import type { ItemDoPainel } from './motor'

/**
 * Ações autônomas de baixo risco.
 *
 * A partir de um sinal, o Jarvis pode agir SEM falar com a IA — porque a ação é
 * dedutível do próprio sinal. É o que a auditoria chamou de "a IA não é
 * necessária para o que cabe numa condição booleana".
 *
 * Só existem três, e todas são reversíveis e de um item:
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
 */

/** Só essas três ações, por sinal. */
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

	agenda_sem_preparo: (item) => ({
		tipo: 'criar_tarefa',
		dados: { titulo: 'Preparar o compromisso de hoje', prioridade: 2 },
		motivo: item.sinal.detalhe,
	}),
}

/** Quantas ações autônomas já foram executadas hoje (teto próprio). */
const TETO_DIARIO = 2

export interface ResultadoAutonomo {
	executadas: number
	/** Sinais em que agiu, para não repetir. */
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
		if (item.sinal.precisaIA) continue

		const plano = PLANOS[item.sinal.id]
		if (!plano) continue

		const acao = plano(item)
		if (!acao) continue

		const avaliacao = avaliarAcao(acao, prefs.autonomia)
		// Só o que o executor classificou como LIVRE passa sem confirmação.
		if (avaliacao.risco !== 'livre') continue

		acoes.push(acao)
		tratados.push(item.sinal.chave)
	}

	if (acoes.length === 0) return { executadas: 0, tratados: [] }

	const resultado = await executarLote(acoes, database)
	return { executadas: resultado.executadas, tratados }
}

/**
 * Conta ações autônomas do dia.
 *
 * O teto é separado do orçamento de atenção: criar uma tarefa de apoio não
 * interrompe ninguém. Mas também não pode virar fábrica de tarefas.
 */
async function contarAcoesHoje(agora: number, database: NexoDatabase): Promise<number> {
	const inicio = new Date(agora)
	inicio.setHours(0, 0, 0, 0)
	const fatos = await database.aiJournal
		.where('em')
		.aboveOrEqual(inicio.getTime())
		.toArray()

	return fatos.filter((fato) => fato.origem === 'ia' && fato.tipo === 'ia').length
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

/** Exportado para o teste conferir que criar tarefa continua sendo createTask. */
export const _criarTarefa = createTask
