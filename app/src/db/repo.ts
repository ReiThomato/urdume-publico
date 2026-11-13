import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Evento, Habit, HabitLog, Marco, NexoDatabase, Page, Priority, Project, ProjectNote, Recorrencia, Reminder, Setting, Subtask, Task } from './db'
import { proximaOcorrencia } from './eventos'
import { createId } from './id'
import { registrarMudanca } from '@/lib/jarvis/diario'

const now = (): number => Date.now()

/** Data local no formato AAAA-MM-DD (evita o deslocamento de fuso do toISOString). */
export function toDayKey(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

const isVisible = (row: { deletedAt?: number | null }): boolean => row.deletedAt == null

/**
 * Ponto de anúncio de mudança — o barramento do Jarvis.
 *
 * Era a porta do servidor de sincronização e virou o lugar onde toda escrita
 * vira acontecimento. Fica aqui, dentro do repositório, e não na tela: assim
 * uma tela nova não pode "esquecer" de emitir, e nenhum módulo precisa saber
 * que o Jarvis existe.
 *
 * A gravação é à prova de falha: se o diário não puder escrever, a tarefa que
 * o usuário acabou de salvar continua salva.
 */
async function anunciar(
	tipo: 'task' | 'project' | 'reminder' | 'page' | 'event' | 'habit' | 'habitLog',
	id: string,
	database: NexoDatabase,
): Promise<void> {
	await registrarMudanca(tipo, id, database)
}

/* --------------------------------------------------------------------------
   Projetos
   -------------------------------------------------------------------------- */

export interface CreateProjectInput {
	name: string
	order?: number
}

export async function createProject(input: CreateProjectInput, database: NexoDatabase = db): Promise<Project> {
	const name = input.name.trim()
	if (!name) throw new Error('O nome do projeto é obrigatório.')

	const timestamp = now()
	const project: Project = {
		id: createId(),
		name,
		archived: false,
		order: input.order ?? timestamp,
		createdAt: timestamp,
		updatedAt: timestamp,
	}

	await database.projects.add(project)
	await anunciar('project', project.id, database)
	return project
}

export async function updateProject(
	id: string,
	patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
	database: NexoDatabase = db,
): Promise<void> {
	await database.projects.update(id, { ...patch, updatedAt: now() })
	await anunciar('project', id, database)
}

export async function softDeleteProject(id: string, database: NexoDatabase = db): Promise<void> {
	const timestamp = now()
	await database.transaction(
		'rw',
		database.projects,
		database.tasks,
		database.pages,
		database.events,
		async () => {
			await database.projects.update(id, { deletedAt: timestamp, updatedAt: timestamp })
			// Tarefas, páginas e eventos do projeto seguem o mesmo destino, para
			// não ficarem órfãos apontando para uma lista que não existe mais.
			await database.tasks.where('projectId').equals(id).modify({ deletedAt: timestamp, updatedAt: timestamp })
			await database.pages.where('projectId').equals(id).modify({ deletedAt: timestamp, updatedAt: timestamp })
			const eventos = await database.events.where('projectId').equals(id).toArray()
			await database.events.where('projectId').equals(id).modify({ deletedAt: timestamp, updatedAt: timestamp })
			for (const evento of eventos) await anunciar('event', evento.id, database)
		},
	)
	await anunciar('project', id, database)
}

export async function listProjects(database: NexoDatabase = db): Promise<Project[]> {
	const rows = await database.projects.toArray()
	return rows.filter(isVisible).sort((a, b) => a.order - b.order)
}

/* --------------------------------------------------------------------------
   Tarefas
   -------------------------------------------------------------------------- */

export interface CreateTaskInput {
	title: string
	projectId?: string | null
	notes?: string | null
	dueDate?: string | null
	deadline?: string | null
	startMin?: number | null
	durationMin?: number | null
	someday?: boolean
	tags?: string[]
	priority?: Priority
	order?: number
	subtasks?: Subtask[]
	recurrence?: Recorrencia | null
}

export async function createTask(input: CreateTaskInput, database: NexoDatabase = db): Promise<Task> {
	const title = input.title.trim()
	if (!title) throw new Error('O título da tarefa é obrigatório.')

	// String vazia vira `null`, como nas colunas opcionais. Sem esta
	// normalização, `dueDate: ''` passa pelo `??` da tela de criação, a tarefa
	// nasce "sem dia" por acidente e some de Hoje e da agenda de avisos.
	const texto = (valor?: string | null): string | null => {
		const limpo = valor?.trim()
		return limpo ? limpo : null
	}

	const timestamp = now()
	const task: Task = {
		id: createId(),
		title,
		projectId: input.projectId ?? null,
		notes: input.notes ?? null,
		dueDate: texto(input.dueDate),
		deadline: texto(input.deadline),
		startMin: input.startMin ?? null,
		durationMin: input.durationMin ?? null,
		someday: input.someday ?? false,
		tags: input.tags ?? [],
		priority: input.priority ?? 0,
		done: false,
		doneAt: null,
		order: input.order ?? timestamp,
		createdAt: timestamp,
		updatedAt: timestamp,
		subtasks: input.subtasks ?? [],
		recurrence: input.recurrence ?? null,
	}

	await database.tasks.add(task)
	await anunciar('task', task.id, database)
	return task
}

/* ------------------------------- subtarefas ------------------------------ */

/** Acrescenta uma subtarefa ao fim da lista da tarefa-mãe. */
export async function addSubtask(taskId: string, title: string, database: NexoDatabase = db): Promise<void> {
	const texto = title.trim()
	if (!texto) throw new Error('O título da subtarefa é obrigatório.')

	const tarefa = await database.tasks.get(taskId)
	if (!tarefa) return

	const subtasks: Subtask[] = [
		...(tarefa.subtasks ?? []),
		{ id: createId(), title: texto, done: false, doneAt: null },
	]

	await database.tasks.update(taskId, { subtasks, updatedAt: now() })
	await anunciar('task', taskId, database)
}

/**
 * Marca ou desmarca uma subtarefa. A tarefa-mãe NÃO muda de estado: concluir
 * todas as subtarefas não conclui a tarefa sozinho (RF-14).
 */
export async function toggleSubtask(taskId: string, subtaskId: string, database: NexoDatabase = db): Promise<void> {
	const tarefa = await database.tasks.get(taskId)
	if (!tarefa) return

	const timestamp = now()
	const subtasks = (tarefa.subtasks ?? []).map((sub) =>
		sub.id === subtaskId
			? { ...sub, done: !sub.done, doneAt: !sub.done ? timestamp : null }
			: sub,
	)

	await database.tasks.update(taskId, { subtasks, updatedAt: timestamp })
	await anunciar('task', taskId, database)
}

export async function updateSubtask(
	taskId: string,
	subtaskId: string,
	title: string,
	database: NexoDatabase = db,
): Promise<void> {
	const texto = title.trim()
	if (!texto) return

	const tarefa = await database.tasks.get(taskId)
	if (!tarefa) return

	const subtasks = (tarefa.subtasks ?? []).map((sub) => (sub.id === subtaskId ? { ...sub, title: texto } : sub))
	await database.tasks.update(taskId, { subtasks, updatedAt: now() })
	await anunciar('task', taskId, database)
}

export async function removeSubtask(taskId: string, subtaskId: string, database: NexoDatabase = db): Promise<void> {
	const tarefa = await database.tasks.get(taskId)
	if (!tarefa) return

	const subtasks = (tarefa.subtasks ?? []).filter((sub) => sub.id !== subtaskId)
	await database.tasks.update(taskId, { subtasks, updatedAt: now() })
	await anunciar('task', taskId, database)
}

/** "2/5" para a linha da tarefa; null quando não há subtarefas. */
export function progressoDeSubtarefas(task: Task): string | null {
	const lista = task.subtasks ?? []
	if (lista.length === 0) return null
	return `${lista.filter((sub) => sub.done).length}/${lista.length}`
}

export async function updateTask(
	id: string,
	patch: Partial<Omit<Task, 'id' | 'createdAt'>>,
	database: NexoDatabase = db,
): Promise<void> {
	await database.tasks.update(id, { ...patch, updatedAt: now() })
	await anunciar('task', id, database)
}

/**
 * Conclui ou reabre a tarefa. `doneAt` é o carimbo que alimenta o Histórico:
 * reabrir apaga o carimbo em vez de manter uma data falsa.
 */
export async function toggleTask(id: string, done?: boolean, database: NexoDatabase = db): Promise<void> {
	const task = await database.tasks.get(id)
	if (!task) return

	const next = done ?? !task.done
	const timestamp = now()

	await database.tasks.update(id, {
		done: next,
		doneAt: next ? timestamp : null,
		updatedAt: timestamp,
	})
	await anunciar('task', id, database)

	// Tarefa que repete: concluir gera a próxima ocorrência, já aberta.
	// A concluída fica no histórico, com a data em que foi feita.
	if (next && task.recurrence) {
		await gerarProximaOcorrencia(task, database)
	}
}

/**
 * Cria a próxima ocorrência de uma tarefa recorrente.
 *
 * O título, projeto, etiquetas, prioridade, hora e duração são mantidos; o dia
 * avança conforme a regra. Subtarefas voltam desmarcadas — são passos a refazer.
 */
async function gerarProximaOcorrencia(task: Task, database: NexoDatabase): Promise<void> {
	const regra = task.recurrence
	if (!regra) return

	const base = task.dueDate ? new Date(`${task.dueDate}T12:00:00`) : new Date()
	const proxima = proximaOcorrencia(base, regra)
	if (!proxima) return

	// Se a próxima cai no mesmo dia (intervalo 0 ou regra esquisita), não duplica.
	const dia = toDayKey(proxima)
	if (dia === task.dueDate) return

	const timestamp = now()
	const nova: Task = {
		...task,
		id: createId(),
		done: false,
		doneAt: null,
		dueDate: dia,
		order: timestamp,
		createdAt: timestamp,
		updatedAt: timestamp,
		subtasks: (task.subtasks ?? []).map((sub) => ({ ...sub, done: false, doneAt: null })),
	}
	await database.tasks.add(nova)
	await anunciar('task', nova.id, database)
}

export async function softDeleteTask(id: string, database: NexoDatabase = db): Promise<void> {
	const timestamp = now()
	await database.tasks.update(id, { deletedAt: timestamp, updatedAt: timestamp })
	await anunciar('task', id, database)
}

/** Desfaz uma exclusão (a lixeira tem desfazer de 4 s). */
export async function restaurarTask(id: string, database: NexoDatabase = db): Promise<void> {
	await database.tasks.update(id, { deletedAt: null, updatedAt: now() })
	await anunciar('task', id, database)
}

export async function listTasks(database: NexoDatabase = db): Promise<Task[]> {
	const rows = await database.tasks.toArray()
	return rows.filter(isVisible)
}

export async function listTasksByDay(day: string, database: NexoDatabase = db): Promise<Task[]> {
	const rows = await database.tasks.where('dueDate').equals(day).toArray()
	return rows.filter(isVisible).sort((a, b) => a.order - b.order)
}

export interface DayCount {
	day: string
	total: number
	open: number
}

/** Contagem por dia para os pontos do calendário e as tiras do Início. */
export async function countTasksByDay(from: string, to: string, database: NexoDatabase = db): Promise<DayCount[]> {
	const rows = await database.tasks.toArray()
	const counts = new Map<string, DayCount>()

	for (const task of rows) {
		if (!isVisible(task) || !task.dueDate) continue
		if (task.dueDate < from || task.dueDate > to) continue

		const entry = counts.get(task.dueDate) ?? { day: task.dueDate, total: 0, open: 0 }
		entry.total += 1
		if (!task.done) entry.open += 1
		counts.set(task.dueDate, entry)
	}

	return [...counts.values()]
}

/* --------------------------------------------------------------------------
   Lembretes
   -------------------------------------------------------------------------- */

export interface CreateReminderInput {
	text: string
	dueAt?: number | null
	order?: number
}

export async function createReminder(input: CreateReminderInput, database: NexoDatabase = db): Promise<Reminder> {
	const text = input.text.trim()
	if (!text) throw new Error('O texto do lembrete é obrigatório.')

	const timestamp = now()
	const reminder: Reminder = {
		id: createId(),
		text,
		dueAt: input.dueAt ?? null,
		done: false,
		doneAt: null,
		order: input.order ?? timestamp,
		createdAt: timestamp,
		updatedAt: timestamp,
	}

	await database.reminders.add(reminder)
	await anunciar('reminder', reminder.id, database)
	return reminder
}

export async function updateReminder(
	id: string,
	patch: Partial<Omit<Reminder, 'id' | 'createdAt'>>,
	database: NexoDatabase = db,
): Promise<void> {
	await database.reminders.update(id, { ...patch, updatedAt: now() })
	await anunciar('reminder', id, database)
}

export async function toggleReminder(id: string, done?: boolean, database: NexoDatabase = db): Promise<void> {
	const reminder = await database.reminders.get(id)
	if (!reminder) return

	const next = done ?? !reminder.done
	const timestamp = now()

	await database.reminders.update(id, {
		done: next,
		doneAt: next ? timestamp : null,
		updatedAt: timestamp,
	})
	await anunciar('reminder', id, database)
}

export async function softDeleteReminder(id: string, database: NexoDatabase = db): Promise<void> {
	const timestamp = now()
	await database.reminders.update(id, { deletedAt: timestamp, updatedAt: timestamp })
	await anunciar('reminder', id, database)
}

export async function listReminders(database: NexoDatabase = db): Promise<Reminder[]> {
	const rows = await database.reminders.toArray()
	return rows.filter(isVisible).sort((a, b) => a.order - b.order)
}

/* --------------------------------------------------------------------------
   Páginas
   -------------------------------------------------------------------------- */

export interface CreatePageInput {
	title: string
	projectId?: string | null
	order?: number
}

export async function createPage(input: CreatePageInput, database: NexoDatabase = db): Promise<Page> {
	const title = input.title.trim()
	if (!title) throw new Error('O título da página é obrigatório.')

	const timestamp = now()
	const page: Page = {
		id: createId(),
		title,
		projectId: input.projectId ?? null,
		snapshot: null,
		order: input.order ?? timestamp,
		createdAt: timestamp,
		updatedAt: timestamp,
	}

	await database.pages.add(page)
	await anunciar('page', page.id, database)
	return page
}

export async function updatePage(
	id: string,
	patch: Partial<Omit<Page, 'id' | 'createdAt'>>,
	database: NexoDatabase = db,
): Promise<void> {
	await database.pages.update(id, { ...patch, updatedAt: now() })
	await anunciar('page', id, database)
}

export async function savePageSnapshot(
	id: string,
	snapshot: string,
	database: NexoDatabase = db,
	thumbnail?: string | null,
): Promise<void> {
	await database.pages.update(id, {
		snapshot,
		...(thumbnail !== undefined ? { thumbnail } : {}),
		updatedAt: now(),
	})
	// O snapshot do quadro entra na fila como o resto: é o que leva o desenho
	// para o outro aparelho.
	await anunciar('page', id, database)
}

export async function softDeletePage(id: string, database: NexoDatabase = db): Promise<void> {
	const timestamp = now()
	await database.pages.update(id, { deletedAt: timestamp, updatedAt: timestamp })
	await anunciar('page', id, database)
}

export async function listPages(database: NexoDatabase = db): Promise<Page[]> {
	const rows = await database.pages.toArray()
	return rows.filter(isVisible).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getPage(id: string, database: NexoDatabase = db): Promise<Page | undefined> {
	const page = await database.pages.get(id)
	return page && isVisible(page) ? page : undefined
}

/* --------------------------------------------------------------------------
   Ajustes (chave/valor)
   -------------------------------------------------------------------------- */

export async function getSetting<T>(key: string, fallback: T, database: NexoDatabase = db): Promise<T> {
	const row = await database.settings.get(key)
	return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown, database: NexoDatabase = db): Promise<void> {
	const row: Setting = { key, value }
	await database.settings.put(row)
}

/* --------------------------------------------------------------------------
   Backup — JSON único, restaurável
   -------------------------------------------------------------------------- */

export interface NexoBackup {
	app: 'nexo'
	version: 1
	exportedAt: number
	projects: Project[]
	tasks: Task[]
	reminders: Reminder[]
	pages: Page[]
	events: Evento[]
	habits: Habit[]
	habitLogs: HabitLog[]
	settings: Setting[]
	/**
	 * Anotações datadas dos projetos (v5).
	 *
	 * Campo opcional de propósito: um backup antigo, gerado antes desta versão,
	 * não tem a chave. Exigir o campo faria o import recusar arquivos que o
	 * usuário salvou na semana passada — o pior tipo de quebra.
	 */
	projectNotes?: ProjectNote[]
}

/**
 * Chaves de `settings` que podem sair no backup.
 *
 * É lista de PERMISSÃO, não de bloqueio: uma chave nova só sai daqui se alguém
 * a acrescentar de propósito. A alternativa ("exporta tudo menos a chave") foi
 * descartada porque o próximo recurso a nascer com um token no nome vazaria
 * sem ninguém notar.
 *
 * Ficam de fora: `jarvis.prefs` (vai junto, é inofensivo e útil — mas está
 * listado abaixo), qualquer `sync.*`, e a chave da API, que nem está nesta
 * tabela: mora em `aiSecrets`, que o backup não lê.
 */
const CHAVES_EXPORTAVEIS = new Set([
	'tema.v3',
	'blocos.v1',
	'acessibilidade',
	'ultimoBackup',
	'jarvis.prefs',
	'jarvis.ultimaAbertura',
	'jarvis.interrupcoes',
])

export async function exportBackup(database: NexoDatabase = db): Promise<NexoBackup> {
	const [projects, tasks, reminders, pages, events, habits, habitLogs, settingsBruto, projectNotes] =
		await Promise.all([
			database.projects.toArray(),
			database.tasks.toArray(),
			database.reminders.toArray(),
			database.pages.toArray(),
			database.events.toArray(),
			database.habits.toArray(),
			database.habitLogs.toArray(),
			database.settings.toArray(),
			database.projectNotes.toArray(),
		])

	// Filtro obrigatório: aqui não passa nada que não esteja na lista.
	const settings = settingsBruto.filter((linha) => CHAVES_EXPORTAVEIS.has(linha.key))

	return {
		app: 'nexo',
		version: 1,
		exportedAt: now(),
		projects,
		tasks,
		reminders,
		pages,
		events,
		habits,
		habitLogs,
		settings,
		projectNotes,
	}
}

function isBackup(value: unknown): value is NexoBackup {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Partial<NexoBackup>
	return (
		candidate.app === 'nexo' &&
		candidate.version === 1 &&
		Array.isArray(candidate.projects) &&
		Array.isArray(candidate.tasks) &&
		Array.isArray(candidate.reminders) &&
		Array.isArray(candidate.pages)
	)
}

/** Substitui todo o conteúdo local pelo backup. Lança se o arquivo não for do Nexo. */
export async function importBackup(data: unknown, database: NexoDatabase = db): Promise<void> {
	if (!isBackup(data)) throw new Error('Arquivo de backup inválido ou de versão incompatível.')

	const settings = data.settings ?? []

	await database.transaction(
		'rw',
		[
			database.projects,
			database.tasks,
			database.reminders,
			database.pages,
			database.events,
			database.habits,
			database.habitLogs,
			database.settings,
			database.projectNotes,
		],
		async () => {
			await Promise.all([
				database.projects.clear(),
				database.tasks.clear(),
				database.reminders.clear(),
				database.pages.clear(),
				database.events.clear(),
				database.habits.clear(),
				database.habitLogs.clear(),
				database.projectNotes.clear(),
			])
			await database.projects.bulkAdd(data.projects)
			await database.tasks.bulkAdd(data.tasks)
			await database.reminders.bulkAdd(data.reminders)
			await database.pages.bulkAdd(data.pages)
			await database.events.bulkAdd(data.events ?? [])
			await database.habits.bulkAdd(data.habits ?? [])
			await database.habitLogs.bulkAdd(data.habitLogs ?? [])
			// Backup antigo não tem anotações: o campo é opcional e a ausência
			// significa "nenhuma", não "arquivo inválido".
			await database.projectNotes.bulkAdd(data.projectNotes ?? [])

			// A tabela settings mistura preferências com infraestrutura de sync
			// (fila `mut:*`, revisões `rev:*`, `sync.*`). Restaurar essas chaves
			// fazia este aparelho herdar host, token e ID do aparelho de origem.
			// Preserva o que já existe de sync aqui e só troca as preferências.
			const syncKeys = new Set(
				(await database.settings.toArray())
					.filter((linha) => linha.key.startsWith('sync.') || linha.key.startsWith('mut:') || linha.key.startsWith('rev:'))
					.map((linha) => linha.key),
			)
			await database.settings.bulkPut(settings.filter((linha) => !syncKeys.has(linha.key)))
		},
	)
}

/* --------------------------------------------------------------------------
   Hooks reativos (Dexie live query)
   -------------------------------------------------------------------------- */

export function useProjects(): Project[] | undefined {
	return useLiveQuery(() => listProjects(), [])
}

export function usePages(): Page[] | undefined {
	return useLiveQuery(() => listPages(), [])
}

export function useReminders(): Reminder[] | undefined {
	return useLiveQuery(() => listReminders(), [])
}

export function useTasksByDay(day: string): Task[] | undefined {
	return useLiveQuery(() => listTasksByDay(day), [day])
}

/** Todas as tarefas visíveis: usado pelo Histórico do mês. */
export function useAllTasks(): Task[] | undefined {
	return useLiveQuery(() => listTasks(), [])
}

export async function listTasksByProject(projectId: string, database: NexoDatabase = db): Promise<Task[]> {
	const rows = await database.tasks.where('projectId').equals(projectId).toArray()
	return rows.filter(isVisible).sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order)
}

export async function listPagesByProject(projectId: string, database: NexoDatabase = db): Promise<Page[]> {
	const rows = await database.pages.where('projectId').equals(projectId).toArray()
	return rows.filter(isVisible).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(id: string, database: NexoDatabase = db): Promise<Project | undefined> {
	const projeto = await database.projects.get(id)
	return projeto && isVisible(projeto) ? projeto : undefined
}

/**
 * Projeto observado em tempo real.
 *
 * `getProject` lê uma vez. A tela de projeto usava isso e guardava o resultado
 * em `useState`: criar ou concluir um marco gravava no banco (e o Dexie avisava
 * a todos os observadores), mas esta tela não era um deles — só mostrava a
 * mudança ao sair e entrar de novo. Com `useLiveQuery`, toda escrita em
 * `projects` re-renderiza a tela; é a única forma de a interface acompanhar o
 * banco sem sincronização manual.
 */
export function useProject(projectId: string): Project | null | undefined {
	// `undefined` = ainda consultando; `null` = consultado e não existe. Sem essa
	// distinção a tela mostraria "não encontrado" no primeiro quadro.
	return useLiveQuery(async () => (await getProject(projectId)) ?? null, [projectId])
}

/* -------------------------------- marcos do projeto ----------------------- */

/**
 * Escreve a lista de marcos a partir do registro ATUAL do banco.
 *
 * Antes a tela montava a lista nova em cima de uma cópia do projeto guardada em
 * estado: dois toques rápidos (concluir um marco e criar outro) partiam da
 * mesma cópia e o segundo apagava o primeiro. Ler dentro da transação mantém a
 * escrita serial e cada chamada enxerga o que a anterior gravou.
 */
async function escreverMarcos(
	id: string,
	alterar: (marcos: Marco[]) => Marco[],
	database: NexoDatabase,
): Promise<void> {
	const timestamp = now()

	await database.transaction('rw', database.projects, async () => {
		const projeto = await database.projects.get(id)
		if (!projeto || projeto.deletedAt) return
		await database.projects.update(id, { marcos: alterar(projeto.marcos ?? []), updatedAt: timestamp })
	})

	await anunciar('project', id, database)
}

export async function addMarco(
	projectId: string,
	dados: { titulo: string; data?: string | null },
	database: NexoDatabase = db,
): Promise<void> {
	const titulo = dados.titulo.trim()
	if (!titulo) throw new Error('O nome do marco é obrigatório.')

	const marco: Marco = {
		id: createId(),
		titulo,
		data: dados.data ?? null,
		feito: false,
	}

	await escreverMarcos(projectId, (marcos) => [...marcos, marco], database)
}

export async function toggleMarco(
	projectId: string,
	marcoId: string,
	database: NexoDatabase = db,
): Promise<void> {
	await escreverMarcos(
		projectId,
		(marcos) =>
			marcos.map((marco) =>
				marco.id === marcoId
					? { ...marco, feito: !marco.feito, feitoEm: !marco.feito ? Date.now() : null }
					: marco,
			),
		database,
	)
}

/** Edição do texto e da data de um marco — os dois campos que mudam depois. */
export async function editMarco(
	projectId: string,
	marcoId: string,
	dados: { titulo?: string; data?: string | null },
	database: NexoDatabase = db,
): Promise<void> {
	const titulo = dados.titulo?.trim()
	if (dados.titulo !== undefined && !titulo) throw new Error('O nome do marco é obrigatório.')

	await escreverMarcos(
		projectId,
		(marcos) =>
			marcos.map((marco) =>
				marco.id === marcoId
					? {
							...marco,
							titulo: titulo ?? marco.titulo,
							data: dados.data === undefined ? marco.data : dados.data,
						}
					: marco,
			),
		database,
	)
}

export async function removeMarco(
	projectId: string,
	marcoId: string,
	database: NexoDatabase = db,
): Promise<void> {
	await escreverMarcos(projectId, (marcos) => marcos.filter((marco) => marco.id !== marcoId), database)
}

export function useTasksByProject(projectId: string): Task[] | undefined {
	return useLiveQuery(() => listTasksByProject(projectId), [projectId])
}

export function usePagesByProject(projectId: string): Page[] | undefined {
	return useLiveQuery(() => listPagesByProject(projectId), [projectId])
}

export function useDayCounts(from: string, to: string): Map<string, DayCount> | undefined {
	return useLiveQuery(async () => {
		const counts = await countTasksByDay(from, to)
		return new Map(counts.map((entry) => [entry.day, entry]))
	}, [from, to])
}

export function useSetting<T>(key: string, fallback: T): T | undefined {
	return useLiveQuery(() => getSetting(key, fallback), [key, JSON.stringify(fallback)])
}

/* --------------------------------------------------------------------------
   Busca (RF-43 / RF-44)
   -------------------------------------------------------------------------- */

export interface ResultadoBusca {
	tipo: 'tarefa' | 'projeto' | 'lembrete' | 'evento'
	id: string
	titulo: string
	detalhe?: string
	/** Dia da tarefa, para abrir o calendário no dia certo. */
	dia?: string
}

/** Normaliza para comparar sem acento e sem caixa. */
export function normalizar(texto: string): string {
	return texto
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
}

const contem = (alvo: string | null | undefined, termo: string): boolean =>
	!!alvo && normalizar(alvo).includes(termo)

export async function buscar(consulta: string, database: NexoDatabase = db): Promise<ResultadoBusca[]> {
	const termo = normalizar(consulta)
	if (termo.length < 2) return []

	const [tarefas, projetos, lembretes] = await Promise.all([
		database.tasks.toArray(),
		database.projects.toArray(),
		database.reminders.toArray(),
	])

	const resultados: ResultadoBusca[] = []

	for (const tarefa of tarefas) {
		if (!isVisible(tarefa)) continue
		const emSubtarefa = (tarefa.subtasks ?? []).find((sub) => contem(sub.title, termo))
		if (contem(tarefa.title, termo) || contem(tarefa.notes, termo) || emSubtarefa) {
			resultados.push({
				tipo: 'tarefa',
				id: tarefa.id,
				titulo: tarefa.title,
				detalhe: emSubtarefa ? `Subtarefa: ${emSubtarefa.title}` : tarefa.done ? 'Concluída' : 'Tarefa',
				...(tarefa.dueDate ? { dia: tarefa.dueDate } : {}),
			})
		}
	}

	for (const projeto of projetos) {
		if (!isVisible(projeto) || !contem(projeto.name, termo)) continue
		resultados.push({ tipo: 'projeto', id: projeto.id, titulo: projeto.name, detalhe: 'Projeto' })
	}

	for (const evento of await database.events.toArray()) {
		if (!isVisible(evento)) continue
		if (!contem(evento.title, termo) && !contem(evento.notes, termo)) continue
		resultados.push({
			tipo: 'evento',
			id: evento.id,
			titulo: evento.title,
			detalhe: 'Evento',
			dia: toDayKey(new Date(evento.startAt)),
		})
	}

	for (const lembrete of lembretes) {
		if (!isVisible(lembrete) || !contem(lembrete.text, termo)) continue
		resultados.push({
			tipo: 'lembrete',
			id: lembrete.id,
			titulo: lembrete.text,
			detalhe: lembrete.done ? 'Resolvido' : 'Lembrete',
		})
	}

	return resultados
}

/* --------------------------------------------------------------------------
   Aviso de lembrete vencido (RF-32), sem serviço externo
   -------------------------------------------------------------------------- */

export async function listarLembretesVencidos(database: NexoDatabase = db): Promise<Reminder[]> {
	const agora = Date.now()
	const ativos = await database.reminders.toArray()

	return ativos.filter(
		(lembrete) =>
			isVisible(lembrete) &&
			!lembrete.done &&
			lembrete.dueAt != null &&
			lembrete.dueAt <= agora &&
			lembrete.notificadoEm == null,
	)
}

export async function marcarLembreteNotificado(id: string, database: NexoDatabase = db): Promise<void> {
	await database.reminders.update(id, { notificadoEm: Date.now() })
	await anunciar('reminder', id, database)
}

/**
 * Remove várias tarefas numa transação só.
 *
 * Antes, "Limpar concluídas" chamava `updateTask` uma vez por tarefa: com 200
 * concluídas eram 200 transações, 200 avisos ao Dexie e 200 re-renders, e uma
 * falha no meio deixava a lista pela metade. Aqui é uma escrita só.
 */
export async function softDeleteTasks(ids: string[], database: NexoDatabase = db): Promise<void> {
	if (ids.length === 0) return
	const timestamp = now()

	await database.tasks.where('id').anyOf(ids).modify({ deletedAt: timestamp, updatedAt: timestamp })
	for (const id of ids) await anunciar('task', id, database)
}

/* --------------------------------------------------------------------------
   Anotações de projeto (v5)

   Cada anotação é uma linha, com data própria e título opcional. Antes havia
   um único campo de texto por projeto (`notas`), que servia para briefing e
   para anotação solta ao mesmo tempo — e ficava ilegível depois de três
   parágrafos. Aqui editar ou apagar uma não toca nas outras.

   `notas` continua existindo como "resumo do projeto": o parágrafo de
   contexto que sempre aparece no topo. Nada foi migrado.
   -------------------------------------------------------------------------- */

export interface NovaAnotacao {
	projectId: string
	title?: string | null
	body: string
	/** Momento da anotação; padrão = agora. */
	em?: number
}

export async function criarAnotacao(
	input: NovaAnotacao,
	database: NexoDatabase = db,
): Promise<ProjectNote> {
	const corpo = input.body.trim()
	if (!corpo) throw new Error('Escreva a anotação.')

	const timestamp = now()
	const anotacao: ProjectNote = {
		id: createId(),
		projectId: input.projectId,
		title: input.title?.trim() || null,
		body: corpo,
		em: input.em ?? timestamp,
		createdAt: timestamp,
		updatedAt: timestamp,
	}

	await database.projectNotes.add(anotacao)
	await anunciar('project', input.projectId, database)
	return anotacao
}

export async function editarAnotacao(
	id: string,
	patch: { title?: string | null; body?: string; em?: number },
	database: NexoDatabase = db,
): Promise<void> {
	const atual = await database.projectNotes.get(id)
	if (!atual || atual.deletedAt) return

	const mudancas: Partial<ProjectNote> = { updatedAt: now() }
	if (patch.title !== undefined) mudancas.title = patch.title?.trim() || null
	if (patch.body !== undefined) {
		const corpo = patch.body.trim()
		if (!corpo) throw new Error('Escreva a anotação.')
		mudancas.body = corpo
	}
	if (patch.em !== undefined) mudancas.em = patch.em

	await database.projectNotes.update(id, mudancas)
	await anunciar('project', atual.projectId, database)
}

/** Exclusão suave: sai da lista, volta pelo desfazer. */
export async function excluirAnotacao(id: string, database: NexoDatabase = db): Promise<void> {
	const atual = await database.projectNotes.get(id)
	if (!atual || atual.deletedAt) return

	const timestamp = now()
	await database.projectNotes.update(id, { deletedAt: timestamp, updatedAt: timestamp })
	await anunciar('project', atual.projectId, database)
}

/** Anotações de um projeto, mais recentes primeiro. */
export async function listarAnotacoes(
	projectId: string,
	database: NexoDatabase = db,
): Promise<ProjectNote[]> {
	const linhas = await database.projectNotes.where('projectId').equals(projectId).toArray()
	return linhas
		.filter(isVisible)
		.sort((a, b) => b.em - a.em || b.createdAt - a.createdAt)
}

/** Hook de leitura para a tela reagir sem recarregar tudo na mão. */
export function useAnotacoes(projectId: string): ProjectNote[] | undefined {
	return useLiveQuery(async () => listarAnotacoes(projectId), [projectId])
}

/* --------------------------------------------------------------------------
   Categorias e prioridade de projeto (v5)
   -------------------------------------------------------------------------- */

/**
 * Categorias em uso, em ordem alfabética.
 *
 * Texto livre indexado, não uma tabela: o usuário cria categoria digitando
 * ("Trabalho", "Casa"), sem tela de administração. Vazio significa "sem
 * categoria" e não entra na lista.
 */
export async function listarCategorias(database: NexoDatabase = db): Promise<string[]> {
	const projetos = await database.projects.toArray()
	const vistas = new Set<string>()
	for (const projeto of projetos) {
		if (!isVisible(projeto)) continue
		const categoria = projeto.categoria?.trim()
		if (categoria) vistas.add(categoria)
	}
	return [...vistas].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Muda categoria e/ou prioridade de um projeto. */
export async function organizarProjeto(
	id: string,
	patch: { categoria?: string | null; priority?: Priority },
	database: NexoDatabase = db,
): Promise<void> {
	const mudancas: Partial<Project> = { updatedAt: now() }
	if (patch.categoria !== undefined) mudancas.categoria = patch.categoria?.trim() || null
	if (patch.priority !== undefined) mudancas.priority = patch.priority

	await database.projects.update(id, mudancas)
	await anunciar('project', id, database)
}

/** Categorias em uso, com hook reativo para a tela de projetos. */
export function useCategorias(): string[] {
	return useLiveQuery(async () => listarCategorias(), []) ?? []
}
