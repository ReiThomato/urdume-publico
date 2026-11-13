import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { montarRetrato } from './retrato'
import type { Retrato } from './retrato'

/**
 * Leitura do banco para o retrato. É o único lugar do núcleo que toca o Dexie.
 *
 * Tudo é lido numa passada; os agregados são calculados por `montarRetrato`,
 * que é puro. Assim as regras continuam testáveis sem banco e o custo é uma
 * leitura grande por avaliação, não uma consulta por sinal.
 */

const CHAVE_ULTIMA_ABERTURA = 'jarvis.ultimaAbertura'
const CHAVE_INTERRUPCOES = 'jarvis.interrupcoes'

/** Carimba a abertura do app. Chamado uma vez por sessão, no Shell. */
export async function registrarAbertura(database: NexoDatabase = db): Promise<number> {
	const agora = Date.now()
	try {
		await database.settings.put({ key: CHAVE_ULTIMA_ABERTURA, value: agora })
	} catch (causa) {
		console.warn('Jarvis: falha ao registrar a abertura.', causa)
	}
	return agora
}

export async function lerUltimaAbertura(database: NexoDatabase = db): Promise<number | null> {
	const linha = await database.settings.get(CHAVE_ULTIMA_ABERTURA)
	return typeof linha?.value === 'number' ? linha.value : null
}

/**
 * Interrupções do dia. Guarda a data junto do número: sem isso, o contador de
 * ontem zeraria o orçamento de hoje — ou o contrário, que é pior.
 */
export async function lerInterrupcoes(
	dia: string,
	database: NexoDatabase = db,
): Promise<number> {
	const linha = await database.settings.get(CHAVE_INTERRUPCOES)
	const valor = linha?.value as { dia?: string; total?: number } | undefined
	if (!valor || valor.dia !== dia) return 0
	return valor.total ?? 0
}

export async function contarInterrupcao(dia: string, database: NexoDatabase = db): Promise<number> {
	const atual = await lerInterrupcoes(dia, database)
	const total = atual + 1
	await database.settings.put({ key: CHAVE_INTERRUPCOES, value: { dia, total } })
	return total
}

/**
 * Eventos excluídos nas últimas 24 h.
 *
 * Vem do diário porque o registro apagado não está mais na tabela. Sem isso,
 * "compromisso cancelado" seria impossível de detectar.
 */
async function contarEventosCancelados(agora: number, database: NexoDatabase): Promise<number> {
	const fatos = await database.aiJournal.where('em').aboveOrEqual(agora - 86_400_000).toArray()
	return fatos.filter((fato) => fato.tipo === 'event' && fato.acao === 'excluir').length
}

/** Contagem de fatos das últimas 24 h, sem carregar o diário inteiro. */
async function contarFatos24h(agora: number, database: NexoDatabase): Promise<number> {
	return database.aiJournal.where('em').aboveOrEqual(agora - 86_400_000).count()
}

export interface OpcoesDoRetrato {
	/** Instante de referência (testes usam um relógio fixo). */
	agora?: number
	/** AAAA-MM-DD local. */
	hoje: string
	projetosIgnorados?: string[]
}

/**
 * Monta o retrato a partir do banco.
 *
 * Uma falha aqui não pode quebrar o app: o chamador recebe um retrato vazio e
 * o Jarvis simplesmente não tem o que dizer — que é melhor do que travar a
 * tela inicial.
 */
export async function lerRetrato(
	opcoes: OpcoesDoRetrato,
	database: NexoDatabase = db,
): Promise<Retrato> {
	const agora = opcoes.agora ?? Date.now()

	try {
		const [tasks, projects, pages, events, habits, habitLogs, reminders, ultimaAbertura, ultimoBackup, interrupcoes, fatos24h, cancelados24h] =
			await Promise.all([
				database.tasks.toArray(),
				database.projects.toArray(),
				database.pages.toArray(),
				database.events.toArray(),
				database.habits.toArray(),
				database.habitLogs.toArray(),
				database.reminders.toArray(),
				lerUltimaAbertura(database),
				database.settings.get('ultimoBackup'),
				lerInterrupcoes(opcoes.hoje, database),
				contarFatos24h(agora, database),
				contarEventosCancelados(agora, database),
			])

		return montarRetrato({
			tasks,
			projects,
			pages,
			events,
			habits,
			habitLogs,
			reminders,
			hoje: opcoes.hoje,
			agora,
			ultimaAbertura,
			ultimoBackup: typeof ultimoBackup?.value === 'number' ? ultimoBackup.value : null,
			interrupcoesHoje: interrupcoes,
			fatos24h,
			projetosIgnorados: opcoes.projetosIgnorados,
			eventosCancelados24h: cancelados24h,
		})
	} catch (causa) {
		console.warn('Jarvis: falha ao montar o retrato.', causa)
		return {
			geradoEm: agora,
			hoje: opcoes.hoje,
			hora: new Date(agora).getHours(),
			tarefas: {
				abertas: 0,
				atrasadas: 0,
				concluidasHoje: 0,
				concluidas7d: 0,
				semData: 0,
				cargaHoje: 0,
				relevantes: [],
				atrasoCritico: false,
				subtarefasParadas: 0,
				recorrentesFalhando: [],
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
			paginas: { total: 0, recentes: [] },
			habitosDisponiveis: [],
			uso: {
				diasSemAbrir: 0,
				ultimoBackup: null,
				interrupcoesHoje: 0,
				fatos24h: 0,
				primeiroUsoHoje: false,
				ultimaAbertura: null,
			},
		}
	}
}
