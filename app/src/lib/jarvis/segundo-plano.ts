import { Capacitor } from '@capacitor/core'
import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { toDayKey } from '@/db/repo'
import { lerPreferencias } from './estado'
import { lerRetrato } from './leitura'
import { avaliarAgora, lerPainel } from './motor'
import {
	gravarPausaParaRunner,
	idDeNotificacao,
	gravarPlano,
	gravarRetrato,
	gravarIdsDaAgenda,
	lerIdsDaAgenda,
} from './ponte'
import type { PlanoDeHoje } from './ponte'
import { agendar, cancelarIds, cancelarTodas, contarAgendadas } from './notificacoes'
import type { Aviso } from './notificacoes'
import { montarAgenda, resumirAgenda, LIMITE_DA_AGENDA } from './agenda'

/**
 * O que roda quando o app vai para segundo plano ou volta.
 *
 * É a ponte entre o mundo com banco (WebView) e o mundo sem banco (runner).
 * Aqui, com o app ainda vivo, dá para ler tudo; o que sai daqui é um resumo
 * pequeno que o runner consegue usar depois.
 *
 * Duas famílias de aviso, de propósito separadas:
 *
 *   1. **plano do Jarvis** — o que as regras decidiram que merece interromper,
 *      caindo nas janelas de 8h/13h/18h. É julgamento.
 *   2. **agenda** — o que tem hora marcada: tarefa às 15h30, prazo, hábito às
 *      7h, evento, lembrete. É relógio, não opinião.
 *
 * Antes só existia (1), e (1) nunca disparava porque o canal não existia.
 *
 * Nada aqui chama a IA.
 */

const HORA = 3_600_000

/** Horas dos tiques em que faz sentido avisar, se o app estiver aberto. */
const JANELAS = [8, 13, 18]

/**
 * Converte o painel do dia em avisos concretos.
 *
 * Só entra o que interromperia de fato; o resto continua no painel. Cada aviso
 * cai num dos tiques do dia — nunca "agora", para não tocar o celular no meio
 * de uma reunião.
 */
export function montarAvisos(
	painel: { itens: Array<{ sinal: { chave: string; titulo: string; nivel: string; detalhe: string }; interrompe: boolean }> },
	agora: number,
): Aviso[] {
	const avisos: Aviso[] = []
	const dia = new Date(agora)

	for (const item of painel.itens) {
		if (!item.interrompe) continue

		// Próxima janela que ainda não passou; se todas passaram, amanhã às 8h.
		let alvo = JANELAS.map((hora) => {
			const data = new Date(dia)
			data.setHours(hora, 0, 0, 0)
			return data.getTime()
		}).find((instante) => instante > agora + 5 * 60_000)

		if (alvo == null) {
			const amanha = new Date(dia)
			amanha.setDate(amanha.getDate() + 1)
			amanha.setHours(8, 0, 0, 0)
			alvo = amanha.getTime()
		}

		avisos.push({
			id: idDeNotificacao(item.sinal.chave),
			titulo: item.sinal.titulo,
			corpo: item.sinal.detalhe,
			em: alvo,
			chave: item.sinal.chave,
		})
	}

	return avisos.slice(0, 3)
}

export interface Sincronizacao {
	retratoGravado: boolean
	planoGravado: boolean
	agendadas: number
	/** Avisos datados (tarefa, prazo, hábito, evento, lembrete). */
	agendadasNaAgenda: number
	erro: string | null
	/** Resumo para a tela de diagnóstico. */
	resumoDaAgenda: string
}

/**
 * Grava retrato + plano e agenda as notificações.
 *
 * Chamada quando o app vai para segundo plano, quando volta, depois de cada
 * avaliação automática e depois de cada escrita relevante. É idempotente: os
 * ids são derivados da chave, então reagendar substitui em vez de duplicar.
 */
export async function sincronizarSegundoPlano(
	agora = Date.now(),
	database: NexoDatabase = db,
): Promise<Sincronizacao> {
	const prefs = await lerPreferencias(database)
	const dia = toDayKey(new Date(agora))

	// Pausado é pausado: cancela o que estava agendado, apaga o plano e para.
	if (prefs.modo === 'pausado') {
		await cancelarTodas()
		await gravarPlano({ geradoEm: agora, itens: [], validoAte: 0 })
		await gravarIdsDaAgenda([])
		return {
			retratoGravado: false,
			planoGravado: true,
			agendadas: 0,
			agendadasNaAgenda: 0,
			erro: null,
			resumoDaAgenda: 'Pausado.',
		}
	}

	const retrato = await lerRetrato(
		{ agora, hoje: dia, projetosIgnorados: prefs.projetosIgnorados },
		database,
	)
	await gravarRetrato(retrato)
	await gravarPausaParaRunner(false)

	const painel = (await lerPainel(dia, database)) ?? (await avaliarAgora({ agora }, database))
	const avisos = prefs.notificacoes ? montarAvisos(painel, agora) : []

	const plano: PlanoDeHoje = {
		geradoEm: agora,
		itens: avisos.map((aviso) => ({
			id: aviso.id,
			em: aviso.em,
			titulo: aviso.titulo,
			corpo: aviso.corpo,
			nivel: painel.itens.find((item) => item.sinal.chave === aviso.chave)?.sinal.nivel ?? 'atencao',
			chave: aviso.chave ?? '',
		})),
		// O plano vale até o fim do dia: depois disso, o runner avisa que
		// envelheceu em vez de repetir conteúdo de ontem como se fosse de hoje.
		validoAte: new Date(new Date(agora).setHours(23, 59, 0, 0)).getTime(),
	}

	await gravarPlano(plano)

	let agendadas = 0
	let agendadasNaAgenda = 0
	let erro: string | null = null

	// A agenda lê o banco inteiro de propósito: `lerRetrato` é resumido e não
	// carrega hora de tarefa, hora de hábito nem ocorrência de evento recorrente.
	const daAgenda = await montarAgendaDoBanco(agora, database)

	if (Capacitor.isNativePlatform()) {
		const resultado = await agendar(avisos)
		agendadas = resultado.agendadas
		if (resultado.erro) erro = resultado.erro

		const anteriores = await lerIdsDaAgenda()
		const novos = daAgenda.map((aviso) => aviso.id)

		// Cancela só o que saiu: tarefa concluída, prazo adiantado, hábito já
		// feito. Sem isso, um aviso de amanhã sumiria quando o app reabrisse.
		const removidos = anteriores.filter((id) => !novos.includes(id))
		if (removidos.length > 0) await cancelarIds(removidos)

		const agendamentoDaAgenda = await agendar(daAgenda)
		agendadasNaAgenda = agendamentoDaAgenda.agendadas
		if (agendamentoDaAgenda.erro && !erro) erro = agendamentoDaAgenda.erro

		await gravarIdsDaAgenda(novos)
	}

	return {
		retratoGravado: true,
		planoGravado: true,
		agendadas,
		agendadasNaAgenda,
		erro,
		resumoDaAgenda: resumirAgenda(daAgenda, agora),
	}
}

/**
 * Lê o banco e monta a agenda datada.
 *
 * Separado para poder ser chamado pela tela de diagnóstico sem duplicar a
 * consulta. Devolve lista vazia se as preferências desligarem a agenda.
 */
export async function montarAgendaDoBanco(agora = Date.now(), database: NexoDatabase = db): Promise<Aviso[]> {
	const prefs = await lerPreferencias(database)
	if (!prefs.agendaDeAvisos) return []

	const [tarefas, eventos, habitos, registros, lembretes, projetos] = await Promise.all([
		database.tasks.toArray(),
		database.events.toArray(),
		database.habits.toArray(),
		database.habitLogs.toArray(),
		database.reminders.toArray(),
		database.projects.toArray(),
	])

	return montarAgenda({
		tarefas,
		eventos,
		habitos,
		registros,
		lembretes,
		projetos,
		prefs,
		agora,
	}).slice(0, LIMITE_DA_AGENDA)
}

/**
 * Rearma só a agenda datada, sem avaliar sinais nem regravar o retrato.
 *
 * É o caminho chamado a cada escrita (criar tarefa, marcar hábito, mover
 * evento). Recalcular o painel aqui seria caro e inútil: o painel é julgamento
 * e muda nos tiques; a agenda é relógio e muda quando o dado muda.
 */
export async function rearmarAgenda(agora = Date.now(), database: NexoDatabase = db): Promise<number> {
	if (!Capacitor.isNativePlatform()) return 0

	const prefs = await lerPreferencias(database)
	if (prefs.modo === 'pausado') return 0

	const daAgenda = await montarAgendaDoBanco(agora, database)
	const anteriores = await lerIdsDaAgenda()
	const novos = daAgenda.map((aviso) => aviso.id)

	const removidos = anteriores.filter((id) => !novos.includes(id))
	if (removidos.length > 0) await cancelarIds(removidos)

	const resultado = await agendar(daAgenda)
	await gravarIdsDaAgenda(novos)
	return resultado.agendadas
}

/** Espelho da pausa para o runner, que não lê o IndexedDB. */

/**
 * O runner é registrado no carregamento do plugin (config em
 * `capacitor.config.ts`). Esta função só garante que ele exista e que o
 * intervalo seja o documentado — mínimo de 15 min no Android.
 */
export function intervaloDoRunnerEmMinutos(): number {
	return 15
}

/** Fuso do aparelho, para os textos de hora não saírem em UTC. */
export function horaLocal(instante: number): string {
	return new Date(instante).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Estado do sistema para a central: permissão, canal, quantos agendados. */
export interface Diagnostico {
	agendadas: number
	agenda: string
}

export async function diagnosticoDoSistema(agora = Date.now(), database: NexoDatabase = db): Promise<Diagnostico> {
	const avisos = await montarAgendaDoBanco(agora, database)
	return {
		agendadas: await contarAgendadas(),
		agenda: resumirAgenda(avisos, agora),
	}
}

/** Utilizado nos testes para conferir o recorte do dia. */
export const HORAS_DE_AVISO = JANELAS
export const HORA_MS = HORA
