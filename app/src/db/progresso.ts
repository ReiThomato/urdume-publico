import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { chaveDoDia } from '@/lib/date'

/**
 * Progresso real: contagens a partir dos dados que já existem.
 *
 * Sem gráfico decorativo. O que aparece é o que dá para provar. Duas séries,
 * de propósito separadas:
 *
 * - **tarefas** concluídas, por `doneAt`;
 * - **hábitos** marcados, por `habitLogs` (a tabela própria, que já existia e
 *   só não era contada aqui).
 *
 * A soma das duas é o que o gráfico empilha. Manter as séries separadas é o que
 * permite empilhar sem inventar número: quem olha vê de onde veio o total.
 */
export interface Progresso {
	concluidasHoje: number
	concluidasSemana: number
	concluidasMes: number
	/** Hábitos marcados hoje, na semana e no mês. */
	habitosHoje: number
	habitosSemana: number
	habitosMes: number
	atrasadas: number
	abertas: number
	sequencia: number
	/**
	 * Série de 7 dias, com as duas partes separadas.
	 *
	 * `total` continua existindo (= tarefas + hábitos) para quem só precisa do
	 * número, e é o que a sequência usa.
	 */
	porDia: Array<{ dia: string; tarefas: number; habitos: number; total: number }>
}

export function useProgresso(): Progresso | undefined {
	const dados = useLiveQuery(async () => {
		const [tarefas, habitos, registros] = await Promise.all([
			db.tasks.toArray(),
			db.habits.toArray(),
			db.habitLogs.toArray(),
		])

		return {
			tarefas: tarefas.filter((t) => !t.deletedAt),
			habitos: habitos.filter((h) => !h.deletedAt),
			registros: registros.filter((r) => !r.deletedAt && r.value > 0),
		}
	}, [])

	return useMemo(() => {
		if (!dados) return undefined

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

		const tarefasPorDia = new Map<string, number>()
		const habitosPorDia = new Map<string, number>()

		for (const t of dados.tarefas) {
			if (t.done && t.doneAt) {
				const quando = new Date(t.doneAt)
				const chave = chaveDoDia(quando)
				tarefasPorDia.set(chave, (tarefasPorDia.get(chave) ?? 0) + 1)
				if (chave === hoje) concluidasHoje++
				if (quando >= inicioSemana) concluidasSemana++
				if (quando >= inicioMes) concluidasMes++
			} else if (!t.done) {
				abertas++
				if (t.dueDate && t.dueDate < hoje) atrasadas++
			}
		}

		/*
		 * Hábitos: o registro é a marcação do dia (`habitLogs.day`), e não a
		 * data de criação. Cada dia conta uma vez por hábito — se o usuário
		 * marcou e desmarcou, o registro mais recente manda, e é para isso que
		 * agrupamos por `habitId+day` antes de contar.
		 */
		let habitosHoje = 0
		let habitosSemana = 0
		let habitosMes = 0

		const jaContado = new Set<string>()
		for (const registro of dados.registros) {
			const chaveContagem = `${registro.habitId}:${registro.day}`
			if (jaContado.has(chaveContagem)) continue
			jaContado.add(chaveContagem)

			habitosPorDia.set(registro.day, (habitosPorDia.get(registro.day) ?? 0) + 1)

			if (registro.day === hoje) habitosHoje++

			const quando = new Date(`${registro.day}T12:00:00`)
			if (quando >= inicioSemana) habitosSemana++
			if (quando >= inicioMes) habitosMes++
		}

		// O total por dia é o que a sequência mede.
		const totalPorDia = new Map<string, number>()
		for (const [dia, n] of tarefasPorDia) totalPorDia.set(dia, (totalPorDia.get(dia) ?? 0) + n)
		for (const [dia, n] of habitosPorDia) totalPorDia.set(dia, (totalPorDia.get(dia) ?? 0) + n)

		// Sequência: dias consecutivos, terminando hoje ou ontem, com ao menos 1.
		let sequencia = 0
		const cursor = new Date(agora)
		for (let i = 0; i < 365; i++) {
			const chave = chaveDoDia(cursor)
			if (totalPorDia.has(chave)) {
				sequencia++
				cursor.setDate(cursor.getDate() - 1)
			} else if (i === 0) {
				// Hoje sem nada ainda não quebra a sequência: conta de ontem.
				cursor.setDate(cursor.getDate() - 1)
			} else {
				break
			}
		}

		const porDia: Progresso['porDia'] = []
		for (let i = 6; i >= 0; i--) {
			const d = new Date(agora)
			d.setDate(d.getDate() - i)
			const chave = chaveDoDia(d)
			const tarefas = tarefasPorDia.get(chave) ?? 0
			const habitos = habitosPorDia.get(chave) ?? 0
			porDia.push({ dia: chave, tarefas, habitos, total: tarefas + habitos })
		}

		return {
			concluidasHoje,
			concluidasSemana,
			concluidasMes,
			habitosHoje,
			habitosSemana,
			habitosMes,
			atrasadas,
			abertas,
			sequencia,
			porDia,
		}
	}, [dados])
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
		const grupos = new Map<string, import('@/db/db').Task[]>()
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
