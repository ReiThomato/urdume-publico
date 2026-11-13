import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { proximaOcorrencia } from '@/db/eventos'
import type { Evento } from '@/db/db'
import { criarEvento } from '@/db/eventos'

function chaveLocal(ms: number): string {
	const d = new Date(ms)
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Eventos de um dia, já **expandindo as repetições**.
 *
 * O banco guarda apenas a primeira ocorrência de um evento recorrente. A
 * expansão é feita na leitura: para cada evento com regra, andamos a partir do
 * início enquanto a data for <= dia pedido. É barato (poucos eventos, saltos de
 * dia/mês) e evita gravar centenas de linhas que nunca vão ser vistas.
 */
export function useEventosDoDia(dia: string): Evento[] | undefined {
	return useLiveQuery(async () => {
		const todos = await db.events.toArray()
		const doDia: Evento[] = []

		for (const evento of todos) {
			if (evento.deletedAt) continue

			if (!evento.recurrence) {
				if (chaveLocal(evento.startAt) === dia) doDia.push(evento)
				continue
			}

			// Percorre as ocorrências até passar do dia pedido.
			let atual = new Date(evento.startAt)
			let guarda = 0
			while (chaveLocal(atual.getTime()) <= dia && guarda < 500) {
				if (chaveLocal(atual.getTime()) === dia && ocorrenciaExiste(atual, evento)) {
					// A ocorrência herda o evento, mas com a data certa.
					const deslocamento = atual.getTime() - evento.startAt
					doDia.push({
						...evento,
						id: `${evento.id}@${chaveLocal(atual.getTime())}`,
						startAt: evento.startAt + deslocamento,
						endAt: evento.endAt + deslocamento,
					})
					break
				}
				const proxima = proximaOcorrencia(atual, evento.recurrence)
				if (!proxima || proxima.getTime() === atual.getTime()) break
				atual = proxima
				guarda++
			}
		}

		return doDia.sort(
			(a, b) => Number(b.diaInteiro) - Number(a.diaInteiro) || a.startAt - b.startAt,
		)
	}, [dia])
}

/** Eventos de um intervalo, também com repetições expandidas. */
export function useEventosEntre(inicio: string, fim: string): Map<string, Evento[]> | undefined {
	return useLiveQuery(async () => {
		const todos = await db.events.toArray()
		const mapa = new Map<string, Evento[]>()

		const adicionar = (evento: Evento): void => {
			const chave = chaveLocal(evento.startAt)
			if (chave < inicio || chave > fim) return
			const atual = mapa.get(chave) ?? []
			atual.push(evento)
			mapa.set(chave, atual)
		}

		for (const evento of todos) {
			if (evento.deletedAt) continue
			if (!evento.recurrence) {
				adicionar(evento)
				continue
			}

			let atual = new Date(evento.startAt)
			let guarda = 0
			while (chaveLocal(atual.getTime()) <= fim && guarda < 500) {
				const deslocamento = atual.getTime() - evento.startAt
				adicionar({
					...evento,
					id: `${evento.id}@${chaveLocal(atual.getTime())}`,
					startAt: evento.startAt + deslocamento,
					endAt: evento.endAt + deslocamento,
				})
				const proxima = proximaOcorrencia(atual, evento.recurrence)
				if (!proxima || proxima.getTime() === atual.getTime()) break
				atual = proxima
				guarda++
			}
		}

		return mapa
	}, [inicio, fim])
}

/**
 * O evento só existe a partir do seu início: se a regra avançar para antes do
 * `startAt` (não acontece hoje, mas protege), não vale.
 */
function ocorrenciaExiste(ocorrencia: Date, evento: Evento): boolean {
	return ocorrencia.getTime() >= evento.startAt
}

export { criarEvento }
