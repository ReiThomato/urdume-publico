import type { Table } from 'dexie'
import Dexie from 'dexie'

/** Prioridade da tarefa: 0 = nenhuma, 1 = baixa, 2 = média, 3 = alta. */
export type Priority = 0 | 1 | 2 | 3

/** Estado do tema escolhido em Ajustes. */
export type ThemePreference = 'system' | 'light' | 'dark'

interface Timestamped {
	createdAt: number
	updatedAt: number
}

/** Campos comuns às entidades que sofrem exclusão suave. */
interface SoftDeletable {
	deletedAt?: number | null
}

export interface Project extends Timestamped, SoftDeletable {
	id: string
	name: string
	/** Projetos arquivados somem de "Projetos ativos" no Início. */
	archived: boolean
	/** Ordem manual na lista de projetos. */
	order: number
	/** Índice da paleta Material (0..11). Cada lista tem cor fixa. */
	color?: string | null
	/** Ícone Material Symbols escolhido para a lista. */
	icone?: string | null

	/* --- Central de projetos ------------------------------------------------
	   Campos opcionais: uma "lista" simples continua sendo uma lista simples.
	   Quando preenchidos, ela vira um projeto com prazo e andamento. */

	/** Uma linha dizendo o que este projeto entrega. */
	descricao?: string | null
	/** Prazo final do projeto (AAAA-MM-DD). */
	prazo?: string | null
	/** Estado do projeto; ausente equivale a 'ativo'. */
	status?: 'ativo' | 'pausado' | 'concluido' | null
	/** Marco atual, ex. "Aguardando aprovação do cliente". */
	etapa?: string | null
	/** Anotações soltas do projeto (briefing, decisões, links).
	 *
	 * Substituído por `projectNotes` para anotações datadas. Continua existindo
	 * como o "resumo do projeto": um parágrafo de contexto que sempre aparece
	 * no topo, separado das anotações do dia a dia.
	 */
	notas?: string | null
	/** Categoria livre, ex. "Trabalho", "Casa", "Estudos". Vazio = sem categoria. */
	categoria?: string | null
	/**
	 * Prioridade do projeto (0 = nenhuma, 1 = baixa, 2 = média, 3 = alta).
	 *
	 * Diferente de `order`: `order` é a posição manual na lista, que o usuário
	 * arrasta. `priority` é o peso, que ordena por cima de `order` quando a
	 * lista está em "prioridade". Assim arrastar não perde a prioridade e
	 * priorizar não perde a ordem manual.
	 */
	priority?: Priority
	/** Marcos do projeto: as entregas que dividem o caminho. */
	marcos?: Marco[]
}

/**
 * Anotação datada de um projeto.
 *
 * Antes havia um único campo de texto (`Project.notas`), que servia para
 * briefing e para anotação solta — e ficava ilegível depois de três parágrafos.
 * Aqui cada anotação tem data própria, título opcional e pode ser editada ou
 * apagada sem tocar nas outras.
 *
 * `em` é o momento da anotação (pode ser retroativo: "anotei sobre ontem").
 * `updatedAt` é quando foi editada pela última vez.
 */
export interface ProjectNote extends Timestamped, SoftDeletable {
	id: string
	projectId: string
	/** Título curto; opcional — o corpo já basta para uma nota rápida. */
	title?: string | null
	/** Texto da anotação. Aceita parágrafos e marcadores simples. */
	body: string
	/** Momento a que a anotação se refere. */
	em: number
}

/**
 * Marco de um projeto.
 *
 * Diferente de tarefa: não se "faz", se ATINGE. Serve para dividir um projeto
 * longo em entregas datadas ("layout aprovado", "primeira versão no ar") e é o
 * que dá noção de estágio sem transformar o projeto numa lista de tarefas.
 */
export interface Marco {
	id: string
	titulo: string
	/** AAAA-MM-DD; opcional. */
	data?: string | null
	feito: boolean
	feitoEm?: number | null
}

/** Regra de repetição de uma tarefa ou evento. */
export interface Recorrencia {
	/** 'diaria' | 'semanal' | 'mensal' | 'dias-uteis' */
	tipo: 'diaria' | 'semanal' | 'mensal' | 'dias-uteis'
	/** a cada N unidades (1 = toda, 2 = a cada duas) */
	intervalo: number
	/** para semanal: 0=domingo … 6=sábado */
	diasDaSemana?: number[]
	/** fim opcional (epoch ms) ou contagem de ocorrências */
	ate?: number | null
	vezes?: number | null
}

/** Subtarefa vive embutida na tarefa: é sempre lida junto da mãe (RF-13). */
export interface Subtask {
	id: string
	title: string
	done: boolean
	doneAt?: number | null
	/** Hora própria da subtarefa (minutos desde 00:00), opcional. */
	startMin?: number | null
}

export interface Task extends Timestamped, SoftDeletable {
	id: string
	projectId?: string | null
	/** Título curto — o ÚNICO campo obrigatório. */
	title: string
	notes?: string | null
	done: boolean
	doneAt?: number | null
	/** Dia marcado para fazer (AAAA-MM-DD). É intenção, não prazo. */
	dueDate?: string | null
	/**
	 * Prazo final. Separado de `dueDate` porque "vou fazer quinta" e "tenho que
	 * entregar sexta" são perguntas diferentes (modelo do Things 3).
	 */
	deadline?: string | null
	/** Hora marcada do dia, em minutos desde 00:00. */
	startMin?: number | null
	/** Duração em minutos (bloco de tempo). */
	durationMin?: number | null
	/** Algum dia: existe, não cobra, não aparece em Hoje. */
	someday?: boolean
	/** Etiquetas livres (texto curto). */
	tags?: string[]
	priority: Priority
	order: number
	/** Progresso é derivado delas; concluir todas não conclui a mãe (RF-14). */
	subtasks?: Subtask[]
	/** Repetição: ao concluir, a próxima ocorrência é criada. */
	recurrence?: Recorrencia | null
}

/**
 * Hábito — entidade própria, como no Grit.
 *
 * Antes o hábito era "uma tarefa que repete", o que impedia meta numérica,
 * dias específicos da semana e histórico independente da lista de tarefas.
 * Agora ele tem seu próprio registro diário (`HabitLog`), sua própria
 * sequência e sua própria tela.
 */
export interface Habit extends Timestamped, SoftDeletable {
	id: string
	title: string
	/** Texto de apoio, ex. "20 páginas antes de dormir". */
	description?: string | null
	/** Ícone Material Symbols (nome do arquivo, ex. "menu_book"). */
	icone?: string | null
	/** Cor da paleta Material (0..11). */
	cor?: number | null
	/** Minutos desde 00:00 do horário habitual. */
	startMin?: number | null
	/** Dias da semana em que vale: 0=domingo … 6=sábado. Vazio = todos. */
	dias?: number[]
	/** Meta diária (ex. 20 páginas, 2 litros). 0 = hábito simples. */
	targetValue?: number
	/** Unidade da meta, ex. "páginas", "litros", "min". */
	targetUnit?: string
	/** Lembrete no horário habitual. */
	reminder?: boolean
	order: number
	/** Categoria (lista) opcional, para agrupar hábitos. */
	projectId?: string | null
}

/** Um dia registrado de um hábito. `value` é o quanto foi feito. */
export interface HabitLog extends Timestamped, SoftDeletable {
	id: string
	habitId: string
	/** AAAA-MM-DD */
	day: string
	value: number
}


/** Compromisso na agenda: não é tarefa, tem hora de início e fim. */
export interface Evento extends Timestamped, SoftDeletable {
	id: string
	title: string
	projectId?: string | null
	/** Início em epoch ms. */
	startAt: number
	/** Fim em epoch ms. */
	endAt: number
	/** Ocupa o dia inteiro (ignora horas). */
	diaInteiro: boolean
	/** Índice da paleta de categorias (0..6). */
	cor: number
	notes?: string | null
	local?: string | null
	recurrence?: Recorrencia | null
}

export interface Reminder extends Timestamped, SoftDeletable {
	id: string
	text: string
	/** Instante de vencimento, em epoch ms. */
	dueAt?: number | null
	done: boolean
	doneAt?: number | null
	order: number
	/** Quando o aviso local já foi mostrado (evita repetir ao reabrir). */
	notificadoEm?: number | null
}

export interface Page extends Timestamped, SoftDeletable {
	id: string
	projectId?: string | null
	title: string
	/** Snapshot do documento tldraw, serializado em JSON. */
	snapshot?: string | null
	/** SVG reduzido do conteúdo, usado como miniatura na lista (RF-22). */
	thumbnail?: string | null
	order: number
}

export interface Setting {
	key: string
	value: unknown
}

/* --------------------------------------------------------------------------
   Jarvis — memória operacional

   Quatro memórias separadas de propósito (auditoria 21, seção 6). Misturar
   fatos, histórico e conversa é o que faz um assistente "lembrar demais" num
   lugar e "esquecer" no outro:

   - `aiJournal`  diário do que aconteceu (append-only) — a fonte do barramento;
   - `aiMemory`   fatos duráveis e contadores de confiança;
   - `aiChat`     conversa, por sessão;
   - `aiJobs`     automações e agendamentos.
   -------------------------------------------------------------------------- */

/** Quem causou a escrita. A IA nunca se confunde com o usuário no diário. */
export type OrigemEscrita = 'usuario' | 'ia' | 'rotina' | 'sistema'

export type AcaoDiario = 'criar' | 'editar' | 'concluir' | 'reabrir' | 'excluir' | 'restaurar' | 'outro'

/**
 * Uma linha do diário. `antes`/`depois` guardam o registro inteiro (ou os
 * campos que mudaram) para permitir desfazer e para as regras que dependem de
 * transição, não só do estado atual.
 */
export interface JournalEntry {
	/** Auto-incremento do Dexie; a ordem de gravação é a ordem dos fatos. */
	seq?: number
	id: string
	em: number
	/** AAAA-MM-DD local, para agrupar sem recalcular fuso. */
	dia: string
	/** Entidade tocada: task, project, event, habit, habitLog, reminder, page. */
	tipo: string
	/** Id da entidade. */
	entidade: string
	acao: AcaoDiario
	origem: OrigemEscrita
	antes?: unknown
	depois?: unknown
	/** Hash do sinal derivado deste fato (quando houver). */
	fingerprint?: string | null
}

/** Uma chamada à IA — contabilidade de token, custo e resultado. */
export interface AiRun {
	id: string
	em: number
	dia: string
	origem: OrigemEscrita
	modelo: string
	entradaTokens: number
	saidaTokens: number
	custoUsd: number
	duracaoMs: number
	ok: boolean
	erro?: string | null
	sinais: string[]
	acoes: number
}

/** Fato durável ou contador (confiança por tipo de intervenção, preferências). */
export interface AiMemoryRow {
	id: string
	chave: string
	valor: unknown
	atualizadoEm: number
}

/** Automação/agendamento. `estado` permite cancelar em vez de apagar. */
export interface AiJob {
	id: string
	criadoEm: number
	quando: number
	tipo: string
	estado: 'pendente' | 'executado' | 'cancelado'
	payload?: unknown
}

/** Ação executada pela IA, com o estado anterior para desfazer. */
export interface AiActionLog {
	id: string
	em: number
	tipo: string
	resumo: string
	antes: unknown[]
	executado: boolean
	desfeitoEm?: number | null
	desfazerAte: number
}

/** Mensagem de conversa com o Jarvis. */
export interface AiChatMessage {
	id: string
	em: number
	papel: 'usuario' | 'jarvis'
	texto: string
	meta?: unknown
}

/**
 * Segredo do aparelho. Tabela PRÓPRIA, fora do backup exportado: é o que
 * impede a chave da API de vazar no JSON que o usuário manda por e-mail.
 */
export interface AiSecret {
	chave: string
	valor: string
	atualizadoEm: number
}

export class NexoDatabase extends Dexie {
	projects!: Table<Project, string>
	tasks!: Table<Task, string>
	reminders!: Table<Reminder, string>
	pages!: Table<Page, string>
	events!: Table<Evento, string>
	habits!: Table<Habit, string>
	habitLogs!: Table<HabitLog, string>
	settings!: Table<Setting, string>
	/** Anotações datadas dos projetos (v5). */
	projectNotes!: Table<ProjectNote, string>

	/* Jarvis — tabelas novas a partir da v4. */
	aiJournal!: Table<JournalEntry, number>
	aiMemory!: Table<AiMemoryRow, string>
	aiJobs!: Table<AiJob, string>
	aiRuns!: Table<AiRun, string>
	aiActions!: Table<AiActionLog, string>
	aiChat!: Table<AiChatMessage, string>
	aiSecrets!: Table<AiSecret, string>

	constructor(name = 'urdume-publico') {
		super(name)

		// v1 — primeira versão publicada.
		this.version(1).stores({
			projects: 'id, name, archived, order, updatedAt, deletedAt',
			tasks: 'id, projectId, dueDate, done, priority, order, createdAt, updatedAt, deletedAt',
			reminders: 'id, dueAt, done, order, updatedAt, deletedAt',
			pages: 'id, projectId, title, updatedAt, deletedAt',
			settings: 'key',
		})

		/**
		 * v2 — agenda de verdade.
		 *
		 * Só ADICIONA (tabela `events`, índice por data de início) e normaliza
		 * campos novos nas tarefas existentes. Nada é renomeado nem apagado: quem
		 * já tem tarefas não perde nada ao atualizar o APK.
		 */
		this.version(2)
			.stores({
				projects: 'id, name, archived, order, updatedAt, deletedAt',
				tasks:
					'id, projectId, dueDate, startMin, done, someday, priority, order, createdAt, updatedAt, deletedAt, *tags',
				reminders: 'id, dueAt, done, order, updatedAt, deletedAt',
				pages: 'id, projectId, title, updatedAt, deletedAt',
				events: 'id, projectId, startAt, diaInteiro, updatedAt, deletedAt',
				settings: 'key',
			})
			.upgrade(async (trans) => {
				await trans
					.table('tasks')
					.toCollection()
					.modify((tarefa: Task) => {
						// Etiquetas e "algum dia" passam a existir em tudo que já estava gravado.
						if (!Array.isArray(tarefa.tags)) tarefa.tags = []
						if (tarefa.someday === undefined) tarefa.someday = false
					})
			})

		/**
		 * v3 — hábitos de verdade e listas coloridas.
		 *
		 * Duas tabelas novas (`habits`, `habitLogs`) e nada destrutivo. Os hábitos
		 * que antes eram "tarefas que repetem" continuam existindo como tarefas
		 * (ninguém perde histórico); a tela de Hábitos passa a criar registros
		 * próprios, com meta, dias da semana e sequência independentes.
		 */
		this.version(3)
			.stores({
				projects: 'id, name, archived, order, updatedAt, deletedAt',
				tasks:
					'id, projectId, dueDate, deadline, startMin, done, someday, priority, order, createdAt, updatedAt, deletedAt, *tags',
				reminders: 'id, dueAt, done, order, updatedAt, deletedAt',
				pages: 'id, projectId, title, updatedAt, deletedAt',
				events: 'id, projectId, startAt, diaInteiro, updatedAt, deletedAt',
				habits: 'id, title, order, projectId, updatedAt, deletedAt',
				habitLogs: 'id, habitId, day, updatedAt, deletedAt, [habitId+day]',
				settings: 'key',
			})
			.upgrade(async (trans) => {
				await trans
					.table('projects')
					.toCollection()
					.modify((projeto: Project) => {
						if (projeto.icone === undefined) projeto.icone = null
					})
			})

		/**
		 * v4 — Jarvis: diário, memória, execuções e segredos.
		 *
		 * Só ADICIONA tabelas. Nada de renomear, nada de apagar: quem já tem
		 * dados atualiza o APK e continua com tudo. O diário usa `++seq` como
		 * chave primária, então já nasce ordenado por ordem de gravação.
		 *
		 * `aiSecrets` fica fora da tabela `settings` de propósito: o export do
		 * backup faz `settings.toArray()` e a chave da API iria junto.
		 */
		this.version(4).stores({
			projects: 'id, name, archived, order, updatedAt, deletedAt',
			tasks:
				'id, projectId, dueDate, deadline, startMin, done, someday, priority, order, createdAt, updatedAt, deletedAt, *tags',
			reminders: 'id, dueAt, done, order, updatedAt, deletedAt',
			pages: 'id, projectId, title, updatedAt, deletedAt',
			events: 'id, projectId, startAt, diaInteiro, updatedAt, deletedAt',
			habits: 'id, title, order, projectId, updatedAt, deletedAt',
			habitLogs: 'id, habitId, day, updatedAt, deletedAt, [habitId+day]',
			settings: 'key',
			aiJournal: '++seq, id, em, dia, tipo, entidade, fingerprint',
			aiMemory: 'id, chave, atualizadoEm',
			aiJobs: 'id, quando, estado, tipo',
			aiRuns: 'id, em, dia',
			aiActions: 'id, em, desfazerAte',
			aiChat: 'id, em',
			aiSecrets: 'chave',
		})

		/*
		 * v5 — memória indexada, anotações de projeto e categorias.
		 *
		 * `aiMemory` ganhou índice em `chave`, que já existia como campo mas não
		 * era indexado: ler "todos os fatos" carregava a tabela inteira e
		 * filtrava em JavaScript. Com o diário e a memória crescendo, isso vira
		 * travamento ao abrir o app.
		 *
		 * `projectNotes` é tabela nova em vez de reaproveitar `projects.notas`:
		 * `notas` é um texto corrido, e a ideia é ter VÁRIAS anotações com data,
		 * hora e título opcional. O texto antigo continua onde está, como
		 * "resumo do projeto" — nada é migrado e nada se perde.
		 *
		 * `categoria` no projeto é texto livre indexado, não uma tabela: o
		 * usuário cria categorias digitando ("Trabalho", "Casa"), sem tela de
		 * administração. Vazio significa "sem categoria".
		 */
		this.version(5).stores({
			projects: 'id, name, archived, order, priority, categoria, status, updatedAt, deletedAt',
			tasks:
				'id, projectId, dueDate, deadline, startMin, done, someday, priority, order, createdAt, updatedAt, deletedAt, *tags',
			reminders: 'id, dueAt, done, order, updatedAt, deletedAt',
			pages: 'id, projectId, title, updatedAt, deletedAt',
			events: 'id, projectId, startAt, diaInteiro, updatedAt, deletedAt',
			habits: 'id, title, order, projectId, updatedAt, deletedAt',
			habitLogs: 'id, habitId, day, updatedAt, deletedAt, [habitId+day]',
			settings: 'key',
			aiJournal: '++seq, id, em, dia, tipo, entidade, fingerprint',
			aiMemory: 'id, chave, atualizadoEm',
			aiJobs: 'id, quando, estado, tipo',
			aiRuns: 'id, em, dia',
			aiActions: 'id, em, desfazerAte',
			aiChat: 'id, em',
			aiSecrets: 'chave',
			projectNotes: 'id, projectId, em, updatedAt, deletedAt',
		})
	}
}

export const db = new NexoDatabase()
