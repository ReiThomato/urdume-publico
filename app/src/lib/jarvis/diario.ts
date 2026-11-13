import { db } from '@/db/db'
import type { AcaoDiario, JournalEntry, NexoDatabase, OrigemEscrita } from '@/db/db'
import { createId } from '@/db/id'
import { toDayKey } from '@/db/repo'

/**
 * Diário do Jarvis — o barramento de acontecimentos.
 *
 * Toda escrita do app passa por `anunciar()`, dentro do repositório. Este
 * arquivo é o que dá conteúdo a esse gancho: grava no `aiJournal` o que mudou,
 * com o estado ANTERIOR e o estado NOVO.
 *
 * Decisões que importam:
 *
 * 1. **O estado anterior vem do diário**, não de uma captura feita antes de
 *    cada escrita. Assim as 25 chamadas existentes continuam com a mesma
 *    assinatura e uma tela nova não pode esquecer de capturar o "antes".
 * 2. **A escrita do diário nunca derruba a escrita principal.** Perder um
 *    acontecimento é ruim; perder a tarefa que o usuário acabou de salvar é
 *    pior. Toda falha aqui é engolida e vira um aviso em `console.warn`.
 * 3. **A ação é inferida por comparação** (`criar`, `concluir`, `excluir`…).
 *    É menos código do que marcar 25 pontos e não desanda se alguém esquecer.
 */

const now = (): number => Date.now()

/**
 * Origem corrente. O executor da IA envolve o lote com `comOrigem('ia')`; fora
 * disso, tudo que chega ao diário foi o usuário mexendo no app.
 */
let origemCorrente: OrigemEscrita = 'usuario'

/**
 * Executa um bloco marcando quem causou as escritas.
 *
 * O app é de thread única e o executor serializa os lotes, então uma variável
 * simples basta; não há duas origens concorrentes na prática. Se um dia houver,
 * o pior efeito é um fato marcado com a origem errada — nunca uma perda.
 */
export async function comOrigem<T>(origem: OrigemEscrita, acao: () => Promise<T>): Promise<T> {
	const anterior = origemCorrente
	origemCorrente = origem
	try {
		return await acao()
	} finally {
		origemCorrente = anterior
	}
}

export function origemAtual(): OrigemEscrita {
	return origemCorrente
}

/** Campos comparados para inferir a ação. Só os que mudam de significado. */
function inferirAcao(antes: Record<string, unknown> | undefined, depois: Record<string, unknown> | undefined): AcaoDiario {
	if (!antes) return depois ? 'criar' : 'outro'
	if (!depois) return 'outro'

	const excluiuAntes = antes.deletedAt == null && depois.deletedAt != null
	if (excluiuAntes) return 'excluir'
	if (antes.deletedAt != null && depois.deletedAt == null) return 'restaurar'

	// `done` existe em tarefa, lembrete e subtarefa; `feito` em marco do projeto.
	const a = antes.done ?? antes.feito
	const d = depois.done ?? depois.feito
	if (a === false && d === true) return 'concluir'
	if (a === true && d === false) return 'reabrir'

	return 'editar'
}

/** Último estado conhecido de uma entidade, para servir de "antes". */
async function ultimoEstado(
	tipo: string,
	entidade: string,
	database: NexoDatabase,
): Promise<Record<string, unknown> | undefined> {
	const linha = await database.aiJournal
		.where('entidade')
		.equals(entidade)
		.reverse()
		.sortBy('seq')

	const nosso = linha.find((entrada) => entrada.tipo === tipo)
	return nosso?.depois as Record<string, unknown> | undefined
}

/** Lê a linha atual da entidade, seja qual for a tabela. */
async function lerAtual(
	tipo: string,
	id: string,
	database: NexoDatabase,
): Promise<Record<string, unknown> | undefined> {
	const tabelas: Record<string, () => Promise<unknown>> = {
		task: () => database.tasks.get(id),
		project: () => database.projects.get(id),
		reminder: () => database.reminders.get(id),
		page: () => database.pages.get(id),
		event: () => database.events.get(id),
		habit: () => database.habits.get(id),
		habitLog: () => database.habitLogs.get(id),
	}

	const leitor = tabelas[tipo]
	if (!leitor) return undefined
	const linha = await leitor()
	return (linha as Record<string, unknown> | undefined) ?? undefined
}

/**
 * Monta e grava a entrada do diário.
 *
 * Exportada porque o executor de ações da IA também precisa registrar o que
 * fez quando a escrita não passa pelo repositório (ex.: desfazer em lote).
 */
export async function registrarFato(
	dados: {
		tipo: string
		entidade: string
		acao: AcaoDiario
		antes?: unknown
		depois?: unknown
		origem?: OrigemEscrita
		fingerprint?: string | null
	},
	database: NexoDatabase = db,
): Promise<void> {
	const em = now()
	const entrada: JournalEntry = {
		id: createId(),
		em,
		dia: toDayKey(new Date(em)),
		tipo: dados.tipo,
		entidade: dados.entidade,
		acao: dados.acao,
		origem: dados.origem ?? origemCorrente,
		antes: dados.antes,
		depois: dados.depois,
		fingerprint: dados.fingerprint ?? null,
	}

	try {
		await database.aiJournal.add(entrada)
	} catch (causa) {
		// Nunca interrompe a escrita principal. O aviso fica no console de
		// depuração; a UI não precisa saber que o diário perdeu uma linha.
		console.warn('Jarvis: não foi possível registrar o acontecimento.', causa)
	}
}

/**
 * O gancho chamado pelo repositório DEPOIS de cada escrita.
 *
 * Lê o estado atual, busca o anterior no diário e delega a gravação. É barato
 * (uma leitura por chave primária + uma busca por índice) e não abre transação
 * própria, para não competir com a escrita que acabou de acontecer.
 */
export async function registrarMudanca(
	tipo: string,
	id: string,
	database: NexoDatabase,
): Promise<void> {
	try {
		const depois = await lerAtual(tipo, id, database)
		const antes = await ultimoEstado(tipo, id, database)
		const acao = inferirAcao(antes, depois)
		await registrarFato({ tipo, entidade: id, acao, antes, depois }, database)
	} catch (causa) {
		console.warn('Jarvis: falha ao registrar mudança.', causa)
	}
}

/** Fatos de um dia, em ordem. */
export async function fatosDoDia(dia: string, database: NexoDatabase = db): Promise<JournalEntry[]> {
	return database.aiJournal.where('dia').equals(dia).toArray()
}

/** Fatos desde um instante, em ordem cronológica. */
export async function fatosDesde(desde: number, database: NexoDatabase = db): Promise<JournalEntry[]> {
	const linhas = await database.aiJournal.where('em').aboveOrEqual(desde).toArray()
	return linhas.sort((a, b) => (a.em ?? 0) - (b.em ?? 0))
}

/** Última mudança conhecida de uma entidade (para "há quanto tempo parado"). */
export async function ultimaMudanca(tipo: string, entidade: string, database: NexoDatabase = db): Promise<number | null> {
	const linhas = await database.aiJournal.where('entidade').equals(entidade).reverse().sortBy('seq')
	const nossa = linhas.find((entrada) => entrada.tipo === tipo)
	return nossa?.em ?? null
}

/**
 * Poda o diário: mantém `dias` de histórico e no máximo `limite` linhas.
 *
 * Roda uma vez por abertura do app. Sem poda, o IndexedDB cresceria para sempre
 * — cada toque numa tarefa grava uma linha.
 */
export async function podarDiario(
	opcoes: { dias?: number; limite?: number } = {},
	database: NexoDatabase = db,
): Promise<number> {
	const dias = opcoes.dias ?? 90
	const limite = opcoes.limite ?? 20000
	const corte = now() - dias * 86_400_000

	let removidas = 0
	try {
		removidas += await database.aiJournal.where('em').below(corte).delete()

		const total = await database.aiJournal.count()
		if (total > limite) {
			const sobra = total - limite
			const antigas = await database.aiJournal.orderBy('seq').limit(sobra).primaryKeys()
			await database.aiJournal.bulkDelete(antigas)
			removidas += antigas.length
		}
	} catch (causa) {
		console.warn('Jarvis: falha ao podar o diário.', causa)
	}

	return removidas
}
