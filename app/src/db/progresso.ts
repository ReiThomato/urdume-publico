import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { chaveDoDia } from '@/lib/date'
import type { Task } from '@/db/db'

/**
 * Progresso real: contagens a partir dos dados que já existem.
 *
 * Sem gráfico decorativo. O que aparece é o que dá para provar: quantas foram
 * concluídas, quantas estão atrasadas e qual a sequência de dias com conclusão.
 * A sequência usa `doneAt`, que é gravado quando a tarefa é concluída.
 */
export interface Progresso {
	concluidasHoje: number
	concluidasSemana: number
	concluidasMes: number
	atrasadas: number
	abertas: number
	sequencia: number
	porDia: Array<{ dia: string; total: number }>
}

export function useProgresso(): Progresso | undefined {
	const tarefas = useLiveQuery(async () => {
		const todas = await db.tasks.toArray()
		return todas.filter((t) => !t.deletedAt)
	}, [])

	return useMemo(() => {
		if (!tarefas) return undefined

		const hoje = chaveDoDia(new Date())
		const agora = new Date()
		const inicioSemana = new Date(agora)
		// Semana começando no domingo, como o calendário do app.
		inicioSemana.setDate(agora.getDate() - agora.getDay())
		inicioSemana.setHours(0, 0, 0, 0)
		const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)

		let concluidasHoje = 0
		let concluidasSemana = 0
		let concluidasMes = 0
		let atrasadas = 0
		let abertas = 0
		const porDiaContagem = new Map<string, number>()

		for (const t of tarefas) {
			if (t.done && t.doneAt) {
				const quando = new Date(t.doneAt)
				const chave = chaveDoDia(quando)
				porDiaContagem.set(chave, (porDiaContagem.get(chave) ?? 0) + 1)
				if (chave === hoje) concluidasHoje++
				if (quando >= inicioSemana) concluidasSemana++
				if (quando >= inicioMes) concluidasMes++
			} else if (!t.done) {
				abertas++
				if (t.dueDate && t.dueDate < hoje) atrasadas++
			}
		}

		// Sequência: dias consecutivos, terminando hoje ou ontem, com ao menos 1.
		let sequencia = 0
		const cursor = new Date(agora)
		for (let i = 0; i < 365; i++) {
			const chave = chaveDoDia(cursor)
			if (porDiaContagem.has(chave)) {
				sequencia++
				cursor.setDate(cursor.getDate() - 1)
			} else if (i === 0) {
				// Hoje sem conclusão ainda não quebra a sequência: conta de ontem.
				cursor.setDate(cursor.getDate() - 1)
			} else {
				break
			}
		}

		const porDia: Array<{ dia: string; total: number }> = []
		for (let i = 6; i >= 0; i--) {
			const d = new Date(agora)
			d.setDate(d.getDate() - i)
			const chave = chaveDoDia(d)
			porDia.push({ dia: chave, total: porDiaContagem.get(chave) ?? 0 })
		}

		return { concluidasHoje, concluidasSemana, concluidasMes, atrasadas, abertas, sequencia, porDia }
	}, [tarefas])
}

/**
 * Hábitos derivados de tarefas recorrentes.
 *
 * Em vez de uma tabela paralela, um hábito é uma tarefa com repetição: a grade
 * mostra os últimos 14 dias com conclusão, lida de `doneAt`. É honesto — o dado
 * é o mesmo que o usuário cria e conclui, sem contagem inventada.
 */
export interface Habito {
	tarefaId: string
	titulo: string
	sequencia: number
	feitos: boolean[]
	concluidoHoje: boolean
}

export function useHabitos(): Habito[] | undefined {
	const tarefas = useLiveQuery(async () => {
		const todas = await db.tasks.toArray()
		return todas.filter((t) => !t.deletedAt)
	}, [])

	return useMemo(() => {
		if (!tarefas) return undefined

		const agora = new Date()
		const dias: string[] = []
		for (let i = 13; i >= 0; i--) {
			const d = new Date(agora)
			d.setDate(d.getDate() - i)
			dias.push(chaveDoDia(d))
		}

		// Agrupa por título: a ocorrência de amanhã é a mesma tarefa repetida com
		// outro id, então o hábito é identificado pelo título + regra.
		const grupos = new Map<string, Task[]>()
		for (const t of tarefas) {
			if (!t.recurrence) continue
			const chave = t.title.toLowerCase()
			const lista = grupos.get(chave) ?? []
			lista.push(t)
			grupos.set(chave, lista)
		}

		const habitos: Habito[] = []
		for (const [, lista] of grupos) {
			const feitos = dias.map((dia) =>
				lista.some((t) => t.done && t.doneAt && chaveDoDia(new Date(t.doneAt)) === dia),
			)
			// Sequência: conta de trás para frente até o primeiro dia sem conclusão.
			let sequencia = 0
			for (let i = feitos.length - 1; i >= 0; i--) {
				if (feitos[i]) sequencia++
				else break
			}
			const maisRecente = [...lista].sort((a, b) => b.createdAt - a.createdAt)[0]!
			habitos.push({
				tarefaId: maisRecente.id,
				titulo: maisRecente.title,
				sequencia,
				feitos,
				concluidoHoje: feitos[feitos.length - 1] ?? false,
			})
		}

		return habitos.sort((a, b) => b.sequencia - a.sequencia)
	}, [tarefas])
}
