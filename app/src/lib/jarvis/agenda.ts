import type { Evento, Habit, HabitLog, Project, Reminder, Task } from '@/db/db'
import { proximaOcorrencia } from '@/db/eventos'
import { concluidoNoDia, valeNoDia } from '@/db/habitos'
import { toDayKey } from '@/db/repo'
import { dentroDoSilencio } from './relevancia'
import type { PreferenciasJarvis } from './relevancia'
import { idDeNotificacao } from './ponte'
import type { Aviso } from './notificacoes'

/**
 * Agenda de avisos — a notificação no horário da coisa, não no horário da IA.
 *
 * O painel do Jarvis (`motor.ts` → `montarAvisos`) responde "o que merece
 * interromper". Isso é julgamento, e julgamento não é pontual: as janelas são
 * 8h, 13h e 18h. Só que uma tarefa marcada para 15h30 não pede julgamento —
 * pede um alarme às 15h30. Antes deste arquivo, nada no app fazia isso:
 *
 *   - tarefa com hora não avisava;
 *   - prazo de tarefa e de projeto não avisava;
 *   - hábito no horário habitual não avisava;
 *   - evento próximo não avisava;
 *   - lembrete criado pela IA caía na Notification API do navegador, que não
 *     existe dentro do WebView do Capacitor — ou seja, silêncio absoluto.
 *
 * Tudo aqui é aritmética pura sobre as entidades. Não chama IA, não gasta
 * token, e é testável com dados sintéticos.
 *
 * Regras de convivência:
 *   - respeita a faixa silenciosa (o que cair dentro dela é descartado, não
 *     adiado para 7h da manhã seguinte);
 *   - respeita `agendaDeAvisos` nas preferências;
 *   - só agenda o futuro, e nada além do horizonte (padrão 7 dias);
 *   - no máximo `LIMITE` avisos por sincronização, os mais próximos primeiro.
 */

const MINUTO = 60_000
const HORA = 3_600_000
const DIA = 86_400_000

/** Resumo das tarefas do dia sem hora marcada. */
const HORA_DO_RESUMO = 8 * 60 + 30
/** Aviso de prazo no próprio dia. */
const HORA_DO_PRAZO = 9 * 60
/** Véspera do prazo. */
const HORA_DA_VESPERA = 18 * 60

/** Quantos avisos agendamos por vez. O Android não gosta de centenas. */
export const LIMITE_DA_AGENDA = 40

/** Horizonte padrão em dias. Além disso, o app reavalia quando for aberto. */
export const HORIZONTE_PADRAO = 7

/**
 * Quanto de atraso ainda vale a pena avisar.
 *
 * O campo de hora tem resolução de MINUTO. Quem marca "daqui a 1 minuto" às
 * 16:28:57 grava 16:29:00; ao salvar, 16:29:12, o horário já passou por 12
 * segundos. Antes isso era descartado em silêncio — o usuário via a tarefa na
 * lista e nunca recebia nada.
 *
 * Agora um horário que venceu há menos de 2 minutos ainda avisa, imediatamente.
 * É a leitura correta do pedido: "me avise agora, acabei de marcar".
 *
 * Mais que isso não avisa: viraria um alarme retroativo para algo que já devia
 * ter sido feito — e esse caso já tem lugar próprio (o sinal de tarefa
 * atrasada, no painel do Jarvis).
 */
const ATRASO_TOLERADO = 2 * 60_000

export interface MaterialDaAgenda {
	tarefas: Task[]
	eventos: Evento[]
	habitos: Habit[]
	registros: HabitLog[]
	lembretes: Reminder[]
	projetos: Project[]
	prefs: PreferenciasJarvis
	agora: number
	horizonteDias?: number
}

const visivel = (linha: { deletedAt?: number | null }): boolean => linha.deletedAt == null

/** Instante de um minuto do dia numa data AAAA-MM-DD, no fuso do aparelho. */
function instanteDoDia(dia: string, minutoDoDia: number): number | null {
	const [ano, mes, diaMes] = dia.split('-').map(Number)
	if (!ano || !mes || !diaMes) return null
	return new Date(ano, mes - 1, diaMes, 0, 0, 0, 0).getTime() + minutoDoDia * MINUTO
}

function horaDe(instante: number): number {
	return new Date(instante).getHours()
}

function dentroDoHorarioSilencioso(instante: number, prefs: PreferenciasJarvis): boolean {
	return prefs.silencio.ligado && dentroDoSilencio(horaDe(instante), prefs.silencio)
}

/** Nome do projeto, para o corpo do aviso dizer onde a coisa mora. */
function nomeDoProjeto(projetos: Project[], id?: string | null): string | null {
	if (!id) return null
	return projetos.find((projeto) => projeto.id === id && visivel(projeto))?.name ?? null
}

/** Títulos em uma linha: "A, B e mais 2". */
function listar(titulos: string[], maximo = 3): string {
	const usados = titulos.slice(0, maximo)
	const restantes = titulos.length - usados.length
	if (usados.length === 0) return ''
	return restantes > 0 ? `${usados.join(', ')} e mais ${restantes}` : usados.join(', ')
}

/** Ocorrências de um evento dentro do horizonte, já com a hora certa. */
function ocorrenciasDoEvento(evento: Evento, agora: number, ate: number): number[] {
	const saida: number[] = []
	const primeira = evento.startAt

	if (primeira > agora && primeira <= ate) saida.push(primeira)
	if (!evento.recurrence) return saida

	let atual = new Date(primeira)
	// 400 passos cobre ~1 ano de diária e ~7 anos de semanal; o limite de
	// tempo é o que realmente manda.
	for (let passo = 0; passo < 400; passo++) {
		const proxima = proximaOcorrencia(atual, evento.recurrence)
		if (!proxima) break
		if (proxima.getTime() > ate) break
		if (proxima.getTime() > agora) saida.push(proxima.getTime())
		if (proxima.getTime() === atual.getTime()) break
		atual = proxima
	}

	return saida
}

/**
 * Converte o estado do app em avisos datados.
 *
 * Devolve a lista ordenada, sem duplicata de chave e já filtrada por silêncio,
 * horizonte e passado.
 */
export function montarAgenda(material: MaterialDaAgenda): Aviso[] {
	const { prefs, agora } = material
	if (!prefs.agendaDeAvisos) return []

	const horizonteDias = material.horizonteDias ?? HORIZONTE_PADRAO
	const fimDoHorizonte = agora + horizonteDias * DIA
	/** Início da janela que ainda vale a pena avisar: agora − tolerância. */
	const inicio = agora - ATRASO_TOLERADO

	const tarefas = material.tarefas.filter(visivel)
	const projetos = material.projetos.filter(visivel)
	const habitos = material.habitos.filter(visivel)
	const lembretes = material.lembretes.filter(visivel)
	const eventos = material.eventos.filter(visivel)
	const hoje = toDayKey(new Date(agora))
	const amanha = toDayKey(new Date(agora + DIA))

	const avisos: Aviso[] = []

	/** Só entra o que é futuro, está no horizonte e fora do silêncio. */
	const adicionar = (aviso: Aviso): void => {
		if (aviso.em > fimDoHorizonte) return

		// Venceu há pouco? Dispara agora. Fora da tolerância, é passado e não
		// entra — tarefa de dias atrás não pode tocar como se fosse de agora.
		let em = aviso.em
		if (em < agora) {
			if (em < inicio) return
			em = agora + 1_000
		}

		if (dentroDoHorarioSilencioso(em, prefs)) return
		avisos.push({ ...aviso, em })
	}

	/* ------------------------------- tarefas ------------------------------- */

	const abertas = tarefas.filter((tarefa) => !tarefa.done && !tarefa.someday)

	for (const tarefa of abertas) {
		const projeto = nomeDoProjeto(projetos, tarefa.projectId)
		const onde = projeto ? ` · ${projeto}` : ''

		// 1. Hora marcada: avisa no minuto em que ela começa.
		if (tarefa.dueDate && tarefa.startMin != null) {
			const em = instanteDoDia(tarefa.dueDate, tarefa.startMin)
			if (em != null) {
				adicionar({
					id: idDeNotificacao(`agenda:tarefa:${tarefa.id}:${tarefa.dueDate}`),
					titulo: tarefa.title,
					corpo: `Tarefa marcada para agora${onde}.`,
					em,
					chave: `agenda:tarefa:${tarefa.id}:${tarefa.dueDate}`,
				})
			}
		}

		// 2. Prazo final: avisa às 9h do dia e às 18h da véspera.
		if (tarefa.deadline) {
			const noDia = instanteDoDia(tarefa.deadline, HORA_DO_PRAZO)
			if (noDia != null) {
				adicionar({
					id: idDeNotificacao(`agenda:prazo:${tarefa.id}:${tarefa.deadline}`),
					titulo: `Vence hoje: ${tarefa.title}`,
					corpo: `Prazo final hoje${onde}.`,
					em: noDia,
					chave: `agenda:prazo:${tarefa.id}:${tarefa.deadline}`,
				})
			}

			if (tarefa.deadline === amanha) {
				const vespera = instanteDoDia(hoje, HORA_DA_VESPERA)
				if (vespera != null) {
					adicionar({
						id: idDeNotificacao(`agenda:vespera:${tarefa.id}:${tarefa.deadline}`),
						titulo: `Vence amanhã: ${tarefa.title}`,
						corpo: `Último dia para terminar${onde}.`,
						em: vespera,
						chave: `agenda:vespera:${tarefa.id}:${tarefa.deadline}`,
					})
				}
			}
		}
	}

	// 3. Tarefas de hoje sem hora: um resumo só, para não virar enxurrada.
	const semHoraHoje = abertas.filter(
		(tarefa) => tarefa.dueDate === hoje && tarefa.startMin == null,
	)
	if (semHoraHoje.length > 0) {
		const em = instanteDoDia(hoje, HORA_DO_RESUMO)
		if (em != null) {
			adicionar({
				id: idDeNotificacao(`agenda:resumo:${hoje}`),
				titulo:
					semHoraHoje.length === 1
						? '1 tarefa para hoje'
						: `${semHoraHoje.length} tarefas para hoje`,
				corpo: listar(semHoraHoje.map((tarefa) => tarefa.title)),
				em,
				chave: `agenda:resumo:${hoje}`,
			})
		}
	}

	/* -------------------------------- prazos -------------------------------- */

	for (const projeto of projetos) {
		if (projeto.status === 'concluido' || !projeto.prazo) continue
		if (projeto.archived) continue
		if ((material.prefs.projetosIgnorados ?? []).includes(projeto.id)) continue

		const noDia = instanteDoDia(projeto.prazo, HORA_DO_PRAZO)
		if (noDia != null) {
			adicionar({
				id: idDeNotificacao(`agenda:projeto:${projeto.id}:${projeto.prazo}`),
				titulo: `Prazo do projeto: ${projeto.name}`,
				corpo: 'O prazo deste projeto é hoje.',
				em: noDia,
				chave: `agenda:projeto:${projeto.id}:${projeto.prazo}`,
			})
		}
	}

	/* -------------------------------- hábitos ------------------------------- */

	const feitos = new Map<string, Set<string>>()
	for (const registro of material.registros) {
		if (!visivel(registro)) continue
		const dias = feitos.get(registro.habitId) ?? new Set<string>()
		if (concluidoNoDia(registro)) dias.add(registro.day)
		feitos.set(registro.habitId, dias)
	}

	for (const habito of habitos) {
		// Sem hora não avisa: hábito é rotina, e rotina sem hora é intenção,
		// não compromisso. Quem marca 7h quer ser lembrado às 7h.
		if (habito.startMin == null) continue

		for (let salto = 0; salto <= horizonteDias; salto++) {
			const dia = new Date(agora + salto * DIA)
			if (!valeNoDia(habito, dia)) continue

			const chaveDia = toDayKey(dia)
			if (feitos.get(habito.id)?.has(chaveDia)) continue

			const em = instanteDoDia(chaveDia, habito.startMin)
			if (em == null) continue

			adicionar({
				id: idDeNotificacao(`agenda:habito:${habito.id}:${chaveDia}`),
				titulo: habito.title,
				corpo: 'Na hora que você marcou para este hábito.',
				em,
				chave: `agenda:habito:${habito.id}:${chaveDia}`,
			})
		}
	}

	/* -------------------------------- eventos ------------------------------- */

	const antecedencia = Math.max(0, Math.min(180, prefs.antecedenciaMin)) * MINUTO

	for (const evento of eventos) {
		if (evento.diaInteiro) continue

		for (const inicioEvento of ocorrenciasDoEvento(evento, agora, fimDoHorizonte)) {
			const em = inicioEvento - antecedencia
			if (em < inicio) continue

			const hora = new Date(inicioEvento).toLocaleTimeString('pt-BR', {
				hour: '2-digit',
				minute: '2-digit',
			})

			adicionar({
				id: idDeNotificacao(`agenda:evento:${evento.id}:${inicioEvento}`),
				titulo: evento.title,
				corpo: `Começa às ${hora}${evento.local ? ` · ${evento.local}` : ''}.`,
				em,
				chave: `agenda:evento:${evento.id}:${inicioEvento}`,
			})
		}
	}

	/* ------------------------------- lembretes ------------------------------ */

	for (const lembrete of lembretes) {
		if (lembrete.done || lembrete.dueAt == null) continue

		adicionar({
			id: idDeNotificacao(`agenda:lembrete:${lembrete.id}`),
			titulo: 'Lembrete',
			corpo: lembrete.text,
			em: lembrete.dueAt,
			chave: `agenda:lembrete:${lembrete.id}`,
		})
	}

	/* -------------------------------- saída -------------------------------- */

	// Chave repetida = mesma coisa duas vezes (ex.: tarefa com hora e prazo no
	// mesmo dia em que o resumo também cairia). Fica o primeiro, que é o mais
	// específico pela ordem em que montamos.
	const vistas = new Set<string>()
	const unicos = avisos.filter((aviso) => {
		if (vistas.has(aviso.chave ?? String(aviso.id))) return false
		vistas.add(aviso.chave ?? String(aviso.id))
		return true
	})

	return unicos.sort((a, b) => a.em - b.em).slice(0, LIMITE_DA_AGENDA)
}

/** Resumo do que a agenda vai avisar, para a tela de diagnóstico. */
export function resumirAgenda(avisos: Aviso[], agora = Date.now()): string {
	if (avisos.length === 0) return 'Nada agendado.'

	const proximo = avisos[0]
	if (!proximo) return 'Nada agendado.'

	const emMin = Math.round((proximo.em - agora) / MINUTO)
	const quando =
		emMin < 60
			? `em ${Math.max(1, emMin)} min`
			: emMin < 24 * 60
				? `em ${Math.round(emMin / 60)} h`
				: `em ${Math.round(emMin / (24 * 60))} dias`

	return `${avisos.length} aviso(s). Próximo ${quando}: ${proximo.titulo}.`
}

/** Hora local de um aviso, para depuração e teste. */
export const HORA_MS = HORA
