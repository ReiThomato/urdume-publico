import type { Evento, Habit, HabitLog, Page, Project, Reminder, Task } from '@/db/db'

/**
 * Retrato — a fotografia reduzida do app num instante.
 *
 * É a ÚNICA coisa que as regras e a IA recebem. Nunca o banco inteiro.
 * Três motivos, todos práticos:
 *
 * 1. as regras viram funções puras (testáveis sem Dexie, com dados sintéticos);
 * 2. o mesmo objeto pode ser gravado no armazenamento nativo, onde o runner de
 *    segundo plano lê (ele não tem IndexedDB — ver auditoria 21, seção 0);
 * 3. o que sai do aparelho fica pequeno e sem notas livres.
 *
 * `geradoEm` é obrigatório e sempre usado: uma conclusão sobre dados de ontem
 * não pode ser apresentada como se fosse de agora.
 */
export interface Retrato {
	geradoEm: number
	/** AAAA-MM-DD local do instante em que foi gerado. */
	hoje: string
	/** Hora local 0–23 no momento da geração. */
	hora: number

	tarefas: {
		abertas: number
		atrasadas: number
		concluidasHoje: number
		concluidas7d: number
		/** Abertas sem dia, sem "algum dia" e sem prazo. */
		semData: number
		cargaHoje: number
		/** Tarefas mais relevantes para o prompt (máx. 10). */
		relevantes: Array<{
			id: string
			titulo: string
			diasAtraso: number
			prioridade: number
			projeto?: string | null
		}>
		/** Alta prioridade atrasada há 3+ dias, ou 3+ atrasadas. */
		atrasoCritico: boolean
		/** Tarefas com 5+ subtarefas abertas e nada marcado nos últimos 7 dias. */
		subtarefasParadas: number
		/** Títulos de tarefas recorrentes com 3+ ciclos vencidos. */
		recorrentesFalhando: string[]
	}

	projetos: Array<{
		id: string
		nome: string
		status: 'ativo' | 'pausado' | 'concluido'
		/** Dias desde a última escrita no projeto ou em algo dele. */
		diasSemAtividade: number
		diasParaPrazo: number | null
		progresso: number
		abertas: number
		concluidas: number
		/** Marcos pendentes com data. */
		marcosPendentes: number
		marcosAtrasados: number
		/** Criado há menos de 24 h e sem nenhuma tarefa. */
		criadoVazio: boolean
		/** Acompanhamento desligado nas preferências. */
		ignorado: boolean
		/** Tarefas deste projeto concluídas hoje (libera o que dependia). */
		concluidasHoje: number
	}>

	agenda: {
		hoje: Array<{ id: string; inicio: number; fim: number; titulo: string; diaInteiro: boolean }>
		amanha: Array<{ id: string; inicio: number; fim: number; titulo: string }>
		conflitosHoje: number
		/** Maior janela livre de 60+ min entre o primeiro e o último evento. */
		maiorJanelaLivre: number
		/** Evento começando em até 60 min. */
		proximoEmMin: number | null
		/** Eventos de hoje ou amanhã sem nenhuma tarefa aberta no mesmo projeto. */
		semPreparo: number
		/** Quantos dias dos próximos 7 têm 5+ eventos. */
		diasCheiosNaSemana: number
		/**
		 * Eventos excluídos nas últimas 24 h. Vem do diário, não da tabela:
		 * evento apagado não existe mais para ser lido.
		 */
		cancelados24h: number
	}

	habitos: Array<{
		id: string
		titulo: string
		valeHoje: boolean
		feitoHoje: boolean
		sequencia: number
		recorde: number
		diasSemRegistro: number
		consistencia: number
		/** Meta do dia entre 80% e 99% (registrou, mas não fechou). */
		metaQuase: boolean
		/** Registros nos últimos 7 dias, sobre os dias em que o hábito vale. */
		feitosNaSemana: number
		devidosNaSemana: number
		/** Dois hábitos marcados para o mesmo minuto do dia. */
		conflitoDeHorario: boolean
	}>

	lembretes: {
		abertos: number
		vencidos: number
		/** Texto dos abertos (máx. 5), para a IA poder citar sem ler o banco. */
		lista: Array<{ id: string; texto: string; vencido: boolean }>
	}

	paginas: {
		total: number
		/** Título das mais recentes (máx. 5). */
		recentes: Array<{ id: string; titulo: string; projeto: string | null }>
	}

	habitosDisponiveis: Array<{ id: string; titulo: string; feitoHoje: boolean }>

	uso: {
		/** Dias desde a última abertura registrada (0 = hoje). */
		diasSemAbrir: number
		/** Último backup em epoch ms, se houver. */
		ultimoBackup: number | null
		/** Interrupções já feitas hoje (orçamento de atenção). */
		interrupcoesHoje: number
		/** Fatos gravados nas últimas 24 h. */
		fatos24h: number
		/** Já abriu o app hoje (primeira abertura do dia). */
		primeiroUsoHoje: boolean
		/** Instante da última abertura, para "voltou depois de N dias". */
		ultimaAbertura: number | null
	}
}

export interface FontesDoRetrato {
	tasks: Task[]
	projects: Project[]
	/** Opcional: quem já monta um retrato sem páginas não precisa mudar. */
	pages?: Page[]
	events: Evento[]
	habits: Habit[]
	habitLogs: HabitLog[]
	reminders: Reminder[]
	/** AAAA-MM-DD. */
	hoje: string
	agora: number
	/** Última abertura do app (epoch ms), se houver. */
	ultimaAbertura?: number | null
	ultimoBackup?: number | null
	interrupcoesHoje?: number
	fatos24h?: number
	/** Ids de projetos com acompanhamento desligado. */
	projetosIgnorados?: string[]
	/** Eventos excluídos nas últimas 24 h (do diário). */
	eventosCancelados24h?: number
}

const DIA = 86_400_000

export function diaParaMs(dia: string): number {
	const [ano, mes, data] = dia.split('-').map(Number)
	return new Date(ano ?? 1970, (mes ?? 1) - 1, data ?? 1).getTime()
}

/** Diferença em dias de calendário (positivo = alvo no passado). */
export function diasEntre(dia: string, referencia: string): number {
	return Math.round((diaParaMs(referencia) - diaParaMs(dia)) / DIA)
}

function chave(data: Date): string {
	const ano = data.getFullYear()
	const mes = String(data.getMonth() + 1).padStart(2, '0')
	const dia = String(data.getDate()).padStart(2, '0')
	return `${ano}-${mes}-${dia}`
}

const visivel = (linha: { deletedAt?: number | null }): boolean => linha.deletedAt == null

/**
 * Monta o retrato a partir das entidades.
 *
 * Função pura de propósito: recebe listas, devolve um objeto. Nada de Dexie
 * aqui dentro, para o teste poder chamar com dados inventados.
 */
export function montarRetrato(fontes: FontesDoRetrato): Retrato {
	const { hoje, agora } = fontes
	const amanha = chave(new Date(diaParaMs(hoje) + DIA))
	const seteDiasAtras = agora - 7 * DIA

	const tarefasVisiveis = fontes.tasks.filter(visivel)
	const abertas = tarefasVisiveis.filter((t) => !t.done && !t.someday)

	const atrasadas = abertas.filter((t) => !!t.dueDate && t.dueDate < hoje)
	const concluidasHoje = tarefasVisiveis.filter(
		(t) => t.done && t.doneAt != null && chave(new Date(t.doneAt)) === hoje,
	)
	const concluidas7d = tarefasVisiveis.filter((t) => t.done && (t.doneAt ?? 0) >= seteDiasAtras)
	const semData = abertas.filter((t) => !t.dueDate && !t.deadline && !t.someday)
	const cargaHoje = abertas.filter((t) => t.dueDate === hoje)

	const diasAtraso = (t: Task): number => (t.dueDate ? diasEntre(t.dueDate, hoje) : 0)

	const relevantes = [...abertas]
		.sort(
			(a, b) =>
				diasAtraso(b) - diasAtraso(a) ||
				(b.priority ?? 0) - (a.priority ?? 0) ||
				(a.order ?? 0) - (b.order ?? 0),
		)
		.slice(0, 10)
		.map((t) => ({
			id: t.id,
			titulo: t.title,
			diasAtraso: Math.max(0, diasAtraso(t)),
			prioridade: t.priority ?? 0,
			projeto: fontes.projects.find((p) => p.id === t.projectId)?.name ?? null,
		}))

	const atrasoCritico =
		atrasadas.length >= 3 || atrasadas.some((t) => (t.priority ?? 0) >= 3 && diasAtraso(t) >= 3)

	// Subtarefas paradas: a mãe está aberta, tem 5+ subtarefas abertas e
	// nenhuma foi marcada nos últimos 7 dias.
	const subtarefasParadas = abertas.filter((t) => {
		const subs = (t.subtasks ?? []).filter((sub) => !sub.done)
		if (subs.length < 5) return false
		const ultimaMarcacao = Math.max(
			0,
			...(t.subtasks ?? []).filter((sub) => sub.done).map((sub) => sub.doneAt ?? 0),
		)
		return agora - ultimaMarcacao > 7 * DIA
	}).length

	// Recorrentes falhando: a ocorrência atual está vencida há tempo suficiente
	// para 3 ciclos terem passado sem conclusão.
	const recorrentesFalhando = abertas
		.filter((t) => t.recurrence && t.dueDate && diasAtraso(t) >= 3 * cicloEmDias(t.recurrence))
		.map((t) => t.title)

	/* ------------------------------- projetos ------------------------------ */

	const projetos = fontes.projects.filter(visivel).map((projeto) => {
		const doProjeto = tarefasVisiveis.filter((t) => t.projectId === projeto.id)
		const feitas = doProjeto.filter((t) => t.done).length
		const total = doProjeto.length
		const progresso = total === 0 ? 0 : Math.round((feitas / total) * 100)

		const marcos = projeto.marcos ?? []
		const marcosPendentes = marcos.filter((m) => !m.feito)
		const marcosAtrasados = marcosPendentes.filter((m) => !!m.data && m.data < hoje)

		// Atividade: a escrita mais recente no projeto, numa tarefa dele, numa
		// página dele ou num evento dele.
		const carimbos = [
			projeto.updatedAt,
			...doProjeto.map((t) => t.updatedAt ?? 0),
			...fontes.events.filter((e) => e.projectId === projeto.id).map((e) => e.updatedAt ?? 0),
		]
		const ultima = Math.max(...carimbos.filter((valor) => Number.isFinite(valor)), projeto.updatedAt)

		const criadoHa = agora - (projeto.createdAt ?? agora)
		const diasParaPrazo = projeto.prazo ? diasEntre(hoje, projeto.prazo) : null

		return {
			id: projeto.id,
			nome: projeto.name,
			status: projeto.status ?? 'ativo',
			diasSemAtividade: Math.max(0, Math.floor((agora - ultima) / DIA)),
			diasParaPrazo,
			progresso,
			abertas: total - feitas,
			concluidas: feitas,
			marcosPendentes: marcosPendentes.length,
			marcosAtrasados: marcosAtrasados.length,
			criadoVazio: criadoHa < DIA && total === 0,
			ignorado: (fontes.projetosIgnorados ?? []).includes(projeto.id),
			concluidasHoje: doProjeto.filter(
				(t) => t.done && t.doneAt != null && chave(new Date(t.doneAt)) === hoje,
			).length,
		}
	})

	/* -------------------------------- agenda ------------------------------- */

	const eventosVisiveis = fontes.events.filter(visivel)
	const diaDe = (evento: Evento): string => chave(new Date(evento.startAt))

	const eventosHoje = eventosVisiveis
		.filter((e) => diaDe(e) === hoje)
		.sort((a, b) => Number(b.diaInteiro) - Number(a.diaInteiro) || a.startAt - b.startAt)

	const eventosAmanha = eventosVisiveis.filter((e) => diaDe(e) === amanha)

	const comHorario = eventosHoje.filter((e) => !e.diaInteiro).sort((a, b) => a.startAt - b.startAt)

	let conflitos = 0
	for (let i = 1; i < comHorario.length; i++) {
		const anterior = comHorario[i - 1]!
		const atual = comHorario[i]!
		if (atual.startAt < anterior.endAt) conflitos++
	}

	let maiorJanela = 0
	for (let i = 1; i < comHorario.length; i++) {
		const vao = comHorario[i]!.startAt - comHorario[i - 1]!.endAt
		if (vao > maiorJanela) maiorJanela = Math.round(vao / 60_000)
	}

	const proximo = comHorario.find((e) => e.startAt >= agora)
	const proximoEmMin = proximo ? Math.round((proximo.startAt - agora) / 60_000) : null

	// Compromisso sem preparo: nas próximas 24 h e nenhuma tarefa aberta no
	// mesmo projeto (quando o evento tem projeto).
	const abertasPorProjeto = new Set(
		abertas.filter((t) => t.projectId).map((t) => t.projectId as string),
	)
	const em24h = agora + DIA
	const semPreparo = eventosVisiveis.filter(
		(e) =>
			e.startAt >= agora &&
			e.startAt <= em24h &&
			!!e.projectId &&
			!abertasPorProjeto.has(e.projectId),
	).length

	// Semana cheia: 3+ dias (de hoje a +7) com 5+ eventos.
	const porDia = new Map<string, number>()
	for (const evento of eventosVisiveis) {
		const dia = diaDe(evento)
		if (dia < hoje || dia > chave(new Date(diaParaMs(hoje) + 7 * DIA))) continue
		porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
	}
	const diasCheiosNaSemana = [...porDia.values()].filter((quantidade) => quantidade >= 5).length

	/* -------------------------------- hábitos ------------------------------ */

	const habitosVisiveis = fontes.habits.filter(visivel)
	const minutosUsados = new Map<number, number>()

	const habitos = habitosVisiveis.map((habito) => {
		const registros = fontes.habitLogs
			.filter((r) => r.habitId === habito.id && visivel(r))
			.sort((a, b) => (a.day < b.day ? 1 : -1))

		const ultimo = registros[0]
		const diasSemRegistro = ultimo ? diasEntre(ultimo.day, hoje) : 999
		const hojeRegistro = registros.find((r) => r.day === hoje)
		const alvo = habito.targetValue ?? 0
		const metaQuase =
			alvo > 0 && !!hojeRegistro && hojeRegistro.value >= alvo * 0.8 && hojeRegistro.value < alvo

		if (habito.startMin != null) {
			minutosUsados.set(habito.startMin, (minutosUsados.get(habito.startMin) ?? 0) + 1)
		}

		// Semana: registros sobre dias em que o hábito valia nos últimos 7 dias.
		let devidos = 0
		let feitos = 0
		for (let i = 0; i < 7; i++) {
			const dia = chave(new Date(diaParaMs(hoje) - i * DIA))
			const vale =
				(habito.dias ?? []).length === 0 ||
				(habito.dias ?? []).includes(new Date(diaParaMs(dia)).getDay())
			if (!vale) continue
			devidos++
			if (registros.some((r) => r.day === dia && r.value > 0)) feitos++
		}

		return {
			id: habito.id,
			titulo: habito.title,
			valeHoje: (habito.dias ?? []).length === 0 || (habito.dias ?? []).includes(new Date(diaParaMs(hoje)).getDay()),
			feitoHoje: !!hojeRegistro && hojeRegistro.value > 0,
			sequencia: calcularSequencia(habito, registros, hoje),
			recorde: calcularRecorde(habito, registros, hoje),
			diasSemRegistro,
			consistencia: devidos === 0 ? 0 : Math.round((feitos / devidos) * 100),
			metaQuase,
			feitosNaSemana: feitos,
			devidosNaSemana: devidos,
			conflitoDeHorario: habito.startMin != null && (minutosUsados.get(habito.startMin) ?? 0) > 1,
		}
	})

	/* ------------------------------- lembretes ----------------------------- */

	const lembretesVisiveis = fontes.reminders.filter(visivel)

	return {
		geradoEm: agora,
		hoje,
		hora: new Date(agora).getHours(),
		tarefas: {
			abertas: abertas.length,
			atrasadas: atrasadas.length,
			concluidasHoje: concluidasHoje.length,
			concluidas7d: concluidas7d.length,
			semData: semData.length,
			cargaHoje: cargaHoje.length,
			relevantes,
			atrasoCritico,
			subtarefasParadas,
			recorrentesFalhando,
		},
		projetos,
		agenda: {
			hoje: eventosHoje.map((e) => ({
				id: e.id,
				inicio: e.startAt,
				fim: e.endAt,
				titulo: e.title,
				diaInteiro: e.diaInteiro,
			})),
			amanha: eventosAmanha.map((e) => ({ id: e.id, inicio: e.startAt, fim: e.endAt, titulo: e.title })),
			conflitosHoje: conflitos,
			maiorJanelaLivre: maiorJanela,
			proximoEmMin,
			semPreparo,
			diasCheiosNaSemana,
			cancelados24h: fontes.eventosCancelados24h ?? 0,
		},
		habitos,
		lembretes: {
			abertos: lembretesVisiveis.filter((r) => !r.done).length,
			vencidos: lembretesVisiveis.filter((r) => !r.done && (r.dueAt ?? 0) > 0 && (r.dueAt ?? 0) <= agora).length,
			lista: lembretesVisiveis
				.filter((r) => !r.done)
				.slice(0, 5)
				.map((r) => ({
					id: r.id,
					texto: r.text,
					vencido: (r.dueAt ?? 0) > 0 && (r.dueAt ?? 0) <= agora,
				})),
		},

		paginas: {
			total: (fontes.pages ?? []).filter(visivel).length,
			recentes: (fontes.pages ?? [])
				.filter(visivel)
				.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
				.slice(0, 5)
				.map((pagina) => ({
					id: pagina.id,
					titulo: pagina.title,
					projeto: fontes.projects.find((p) => p.id === pagina.projectId)?.name ?? null,
				})),
		},

		habitosDisponiveis: fontes.habits
			.filter(visivel)
			.slice(0, 10)
			.map((habito) => ({
				id: habito.id,
				titulo: habito.title,
				feitoHoje: fontes.habitLogs.some(
					(registro) =>
						registro.habitId === habito.id &&
						registro.day === hoje &&
						registro.value > 0 &&
						visivel(registro),
				),
			})),
		uso: {
			diasSemAbrir: fontes.ultimaAbertura ? Math.max(0, Math.floor((agora - fontes.ultimaAbertura) / DIA)) : 0,
			ultimoBackup: fontes.ultimoBackup ?? null,
			interrupcoesHoje: fontes.interrupcoesHoje ?? 0,
			fatos24h: fontes.fatos24h ?? 0,
			primeiroUsoHoje:
				!!fontes.ultimaAbertura && chave(new Date(fontes.ultimaAbertura)) < hoje,
			ultimaAbertura: fontes.ultimaAbertura ?? null,
		},
	}
}

/** Maior sequência já alcançada, considerando os dias em que o hábito vale. */
function calcularRecorde(habito: Habit, registros: HabitLog[], hoje: string): number {
	const feitos = new Set(registros.filter((r) => r.value > 0).map((r) => r.day))
	const dias = habito.dias ?? []

	let melhor = 0
	let corrente = 0
	let cursor = diaParaMs(hoje)

	for (let i = 0; i < 400; i++) {
		const dia = chave(new Date(cursor))
		const vale = dias.length === 0 || dias.includes(new Date(cursor).getDay())

		if (vale) {
			if (feitos.has(dia)) corrente++
			else {
				melhor = Math.max(melhor, corrente)
				corrente = 0
			}
		}
		cursor -= DIA
	}

	return Math.max(melhor, corrente)
}

/** Dias que uma repetição leva para voltar, para medir ciclos perdidos. */
function cicloEmDias(regra: { tipo: string; intervalo: number }): number {
	switch (regra.tipo) {
		case 'diaria':
			return Math.max(1, regra.intervalo || 1)
		case 'dias-uteis':
			return 1
		case 'semanal':
			return Math.max(1, regra.intervalo || 1) * 7
		case 'mensal':
			return Math.max(1, regra.intervalo || 1) * 30
		default:
			return 1
	}
}

/** Dias seguidos com registro, terminando hoje ou ontem. */
function calcularSequencia(
	habito: Habit,
	registros: HabitLog[],
	hoje: string,
): number {
	const porDia = new Set(registros.filter((r) => r.value > 0).map((r) => r.day))
	const dias = habito.dias ?? []

	let sequencia = 0
	let cursor = diaParaMs(hoje)
	let primeiro = true

	for (let i = 0; i < 400; i++) {
		const dia = chave(new Date(cursor))
		const vale = dias.length === 0 || dias.includes(new Date(cursor).getDay())

		if (vale) {
			if (porDia.has(dia)) sequencia++
			else if (primeiro) {
				// Hoje sem marcação ainda não quebrou: conta a partir de ontem.
			} else break
		}

		primeiro = false
		cursor -= DIA
	}

	return sequencia
}

/** Retrato vazio — usado quando ainda não há dados e nos testes negativos. */
export function retratoVazio(hoje: string, agora = Date.now()): Retrato {
	return montarRetrato({
		tasks: [],
		projects: [],
		pages: [],
		events: [],
		habits: [],
		habitLogs: [],
		reminders: [],
		hoje,
		agora,
	})
}
