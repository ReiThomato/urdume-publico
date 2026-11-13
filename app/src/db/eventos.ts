import { createId } from '@/db/id'
import type { Evento, NexoDatabase, Recorrencia } from '@/db/db'
import { db } from '@/db/db'
import { registrarMudanca } from '@/lib/jarvis/diario'
import { toDayKey } from './repo'

/**
 * Anúncio de escrita da agenda.
 *
 * Faltava aqui: hábitos e eventos eram invisíveis para o barramento, então o
 * Jarvis nunca saberia de um compromisso criado, remarcado ou cancelado.
 */
async function anunciar(id: string, database: NexoDatabase = db): Promise<void> {
	await registrarMudanca('event', id, database)
}

/* ---------------------------------------------------------------------------
   Agenda: eventos e repetição
   --------------------------------------------------------------------------- */

/** Próxima data de uma repetição, a partir da data atual. */
export function proximaOcorrencia(
	atual: Date,
	regra: Recorrencia,
): Date | null {
	const nova = new Date(atual)

	switch (regra.tipo) {
		case 'diaria':
			nova.setDate(nova.getDate() + (regra.intervalo || 1))
			break
		case 'dias-uteis':
			// Avança até cair em dia útil (seg–sex), sem pular feriados.
			do {
				nova.setDate(nova.getDate() + 1)
			} while (nova.getDay() === 0 || nova.getDay() === 6)
			break
		case 'semanal': {
			const dias = regra.diasDaSemana?.length ? regra.diasDaSemana : [nova.getDay()]
			const passo = regra.intervalo || 1
			// Procura o próximo dia permitido, dentro do mesmo ciclo de semanas.
			let tentativa = new Date(nova)
			for (let i = 0; i < 7 * passo; i++) {
				tentativa.setDate(tentativa.getDate() + 1)
				if (dias.includes(tentativa.getDay())) {
					nova.setTime(tentativa.getTime())
					return nova
				}
			}
			return null
		}
		case 'mensal': {
			const dia = nova.getDate()
			nova.setMonth(nova.getMonth() + (regra.intervalo || 1))
			// 31 de janeiro + 1 mês cai em março: volta para o último dia do mês.
			if (nova.getDate() !== dia) nova.setDate(0)
			break
		}
	}

	if (regra.ate && nova.getTime() > regra.ate) return null
	return nova
}

/* ---------------------------------------------------------------- eventos */

export interface CriarEventoInput {
	title: string
	startAt: number
	endAt: number
	diaInteiro?: boolean
	cor?: number
	projectId?: string | null
	notes?: string | null
	local?: string | null
	recurrence?: Recorrencia | null
}

export async function criarEvento(input: CriarEventoInput, database: NexoDatabase = db): Promise<Evento> {
	const titulo = input.title.trim()
	if (!titulo) throw new Error('O título do evento é obrigatório.')

	const agora = Date.now()
	const evento: Evento = {
		id: createId(),
		title: titulo,
		startAt: input.startAt,
		endAt: input.endAt,
		diaInteiro: input.diaInteiro ?? false,
		cor: input.cor ?? 3,
		projectId: input.projectId ?? null,
		notes: input.notes ?? null,
		local: input.local ?? null,
		recurrence: input.recurrence ?? null,
		createdAt: agora,
		updatedAt: agora,
	}

	await database.events.add(evento)
	await anunciar(evento.id, database)
	return evento
}

export async function atualizarEvento(
	id: string,
	patch: Partial<Omit<Evento, 'id' | 'createdAt'>>,
	database: NexoDatabase = db,
): Promise<void> {
	await database.events.update(id, { ...patch, updatedAt: Date.now() })
	await anunciar(id, database)
}

export async function excluirEvento(id: string, database: NexoDatabase = db): Promise<void> {
	const agora = Date.now()
	await database.events.update(id, { deletedAt: agora, updatedAt: agora })
	await anunciar(id, database)
}

/** Eventos que tocam um dia (AAAA-MM-DD), incluindo os de dia inteiro. */
export async function eventosDoDia(dia: string): Promise<Evento[]> {
	const todos = await db.events.toArray()
	return todos
		.filter((evento) => !evento.deletedAt && toDayKey(new Date(evento.startAt)) === dia)
		.sort((a, b) => Number(b.diaInteiro) - Number(a.diaInteiro) || a.startAt - b.startAt)
}

/** Eventos de um intervalo de dias, para a linha do dia e o mês. */
export async function eventosEntre(inicio: string, fim: string): Promise<Evento[]> {
	const todos = await db.events.toArray()
	return todos.filter((evento) => {
		if (evento.deletedAt) return false
		const dia = toDayKey(new Date(evento.startAt))
		return dia >= inicio && dia <= fim
	})
}
