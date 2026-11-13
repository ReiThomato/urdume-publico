import { describe, expect, it } from 'vitest'
import type { Evento, Habit, HabitLog, Project, Task } from '@/db/db'
import { montarRetrato } from '@/lib/jarvis/retrato'
import type { FontesDoRetrato } from '@/lib/jarvis/retrato'
import { avaliarCompostos, avaliarSinais } from '@/lib/jarvis/sinais'

const AGORA = new Date(2026, 10, 12, 9, 0, 0).getTime() // 12/11/2026, 09:00 local
const HOJE = '2026-11-12'

function tarefa(parcial: Partial<Task> & { id: string }): Task {
	return {
		id: parcial.id,
		title: parcial.title ?? `Tarefa ${parcial.id}`,
		projectId: parcial.projectId ?? null,
		done: parcial.done ?? false,
		doneAt: parcial.doneAt ?? null,
		dueDate: parcial.dueDate ?? null,
		deadline: parcial.deadline ?? null,
		startMin: parcial.startMin ?? null,
		durationMin: parcial.durationMin ?? null,
		someday: parcial.someday ?? false,
		tags: parcial.tags ?? [],
		priority: parcial.priority ?? 0,
		order: parcial.order ?? 0,
		createdAt: parcial.createdAt ?? AGORA - 10 * 86_400_000,
		updatedAt: parcial.updatedAt ?? AGORA - 10 * 86_400_000,
		subtasks: parcial.subtasks ?? [],
		recurrence: parcial.recurrence ?? null,
		notes: parcial.notes ?? null,
		deletedAt: parcial.deletedAt ?? null,
	}
}

function projeto(parcial: Partial<Project> & { id: string }): Project {
	return {
		id: parcial.id,
		name: parcial.name ?? `Projeto ${parcial.id}`,
		archived: false,
		order: 0,
		status: parcial.status ?? 'ativo',
		prazo: parcial.prazo ?? null,
		marcos: parcial.marcos ?? [],
		createdAt: parcial.createdAt ?? AGORA - 30 * 86_400_000,
		updatedAt: parcial.updatedAt ?? AGORA - 30 * 86_400_000,
		deletedAt: parcial.deletedAt ?? null,
	}
}

function evento(parcial: Partial<Evento> & { id: string }): Evento {
	return {
		id: parcial.id,
		title: parcial.title ?? `Evento ${parcial.id}`,
		projectId: parcial.projectId ?? null,
		startAt: parcial.startAt ?? AGORA,
		endAt: parcial.endAt ?? AGORA + 3_600_000,
		diaInteiro: parcial.diaInteiro ?? false,
		cor: 0,
		createdAt: AGORA,
		updatedAt: AGORA,
		deletedAt: parcial.deletedAt ?? null,
		notes: null,
		local: null,
		recurrence: null,
	}
}

function fontes(parcial: Partial<FontesDoRetrato> = {}): FontesDoRetrato {
	return {
		tasks: [],
		projects: [],
		events: [],
		habits: [],
		habitLogs: [],
		reminders: [],
		hoje: HOJE,
		agora: AGORA,
		ultimaAbertura: AGORA - 3_600_000,
		...parcial,
	}
}

const ids = (sinais: { id: string }[]): string[] => sinais.map((s) => s.id)

describe('retrato', () => {
	it('conta atrasadas só entre tarefas abertas e visíveis', () => {
		const r = montarRetrato(
			fontes({
				tasks: [
					tarefa({ id: 'a', dueDate: '2026-11-10' }),
					tarefa({ id: 'b', dueDate: '2026-11-10', done: true, doneAt: AGORA }),
					tarefa({ id: 'c', dueDate: '2026-11-10', deletedAt: AGORA }),
					tarefa({ id: 'd', dueDate: HOJE }),
				],
			}),
		)

		expect(r.tarefas.atrasadas).toBe(1)
		expect(r.tarefas.concluidasHoje).toBe(1)
		expect(r.tarefas.cargaHoje).toBe(1)
	})

	it('calcula progresso do projeto e dias sem atividade', () => {
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', updatedAt: AGORA - 9 * 86_400_000 })],
				tasks: [
					tarefa({ id: 'a', projectId: 'p1', done: true, doneAt: AGORA, updatedAt: AGORA - 9 * 86_400_000 }),
					tarefa({ id: 'b', projectId: 'p1', updatedAt: AGORA - 9 * 86_400_000 }),
					tarefa({ id: 'c', projectId: 'p1', updatedAt: AGORA - 9 * 86_400_000 }),
					tarefa({ id: 'd', projectId: 'p1', updatedAt: AGORA - 9 * 86_400_000 }),
				],
			}),
		)

		const p1 = r.projetos.find((p) => p.id === 'p1')!
		expect(p1.progresso).toBe(25)
		expect(p1.abertas).toBe(3)
		expect(p1.diasSemAtividade).toBe(9)
	})

	it('detecta conflito de agenda e janela livre', () => {
		const r = montarRetrato(
			fontes({
				events: [
					evento({ id: 'e1', startAt: AGORA + 3_600_000, endAt: AGORA + 7_200_000 }),
					evento({ id: 'e2', startAt: AGORA + 5_400_000, endAt: AGORA + 9_000_000 }),
					evento({ id: 'e3', startAt: AGORA + 12_600_000, endAt: AGORA + 14_400_000 }),
				],
			}),
		)

		expect(r.agenda.conflitosHoje).toBe(1)
		expect(r.agenda.maiorJanelaLivre).toBe(60)
		expect(r.agenda.proximoEmMin).toBe(60)
	})
})

describe('sinais de tarefas', () => {
	it('dispara atraso crítico com 3+ atrasadas', () => {
		const r = montarRetrato(
			fontes({
				tasks: [
					tarefa({ id: 'a', dueDate: '2026-11-01' }),
					tarefa({ id: 'b', dueDate: '2026-11-02' }),
					tarefa({ id: 'c', dueDate: '2026-11-03' }),
				],
			}),
		)

		expect(ids(avaliarSinais(r))).toContain('atraso_critico')
		expect(r.tarefas.atrasoCritico).toBe(true)
	})

	it('não dispara atraso crítico com uma tarefa de prioridade baixa atrasada', () => {
		const r = montarRetrato(fontes({ tasks: [tarefa({ id: 'a', dueDate: '2026-11-11', priority: 1 })] }))
		expect(r.tarefas.atrasoCritico).toBe(false)
		expect(ids(avaliarSinais(r))).not.toContain('atraso_critico')
	})

	it('trata prioridade alta atrasada há 3 dias como crítico', () => {
		const r = montarRetrato(fontes({ tasks: [tarefa({ id: 'a', dueDate: '2026-11-08', priority: 3 })] }))
		expect(r.tarefas.atrasoCritico).toBe(true)
	})

	it('detecta trabalho liberado quando algo é concluído num projeto com abertas', () => {
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', updatedAt: AGORA })],
				tasks: [
					tarefa({ id: 'a', projectId: 'p1', done: true, doneAt: AGORA, updatedAt: AGORA }),
					tarefa({ id: 'b', projectId: 'p1', updatedAt: AGORA }),
				],
			}),
		)

		expect(ids(avaliarSinais(r))).toContain('dependente_liberada')
	})

	it('não fala de trabalho liberado quando nada ficou aberto', () => {
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', updatedAt: AGORA })],
				tasks: [tarefa({ id: 'a', projectId: 'p1', done: true, doneAt: AGORA, updatedAt: AGORA })],
			}),
		)

		expect(ids(avaliarSinais(r))).not.toContain('dependente_liberada')
	})

	it('detecta subtarefas paradas', () => {
		const subs = Array.from({ length: 5 }, (_, i) => ({
			id: `s${i}`,
			title: `Passo ${i}`,
			done: false,
			doneAt: null,
		}))
		const r = montarRetrato(fontes({ tasks: [tarefa({ id: 'a', subtasks: subs, updatedAt: AGORA - 30 * 86_400_000 })] }))

		expect(r.tarefas.subtarefasParadas).toBe(1)
		expect(ids(avaliarSinais(r))).toContain('subtarefas_paradas')
	})
})

describe('sinais de projetos', () => {
	it('dispara projeto parado depois de 7 dias', () => {
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', updatedAt: AGORA - 10 * 86_400_000 })],
				tasks: [tarefa({ id: 'a', projectId: 'p1', updatedAt: AGORA - 10 * 86_400_000 })],
			}),
		)

		const sinal = avaliarSinais(r).find((s) => s.id === 'projeto_sem_atividade')
		expect(sinal).toBeDefined()
		expect(sinal?.entidades).toEqual(['p1'])
	})

	it('não fala de projeto pausado como se estivesse ativo', () => {
		const r = montarRetrato(
			fontes({ projects: [projeto({ id: 'p1', status: 'pausado', updatedAt: AGORA - 20 * 86_400_000 })] }),
		)

		expect(ids(avaliarSinais(r))).not.toContain('projeto_sem_atividade')
	})

	it('respeita projeto ignorado nas preferências', () => {
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', updatedAt: AGORA - 20 * 86_400_000 })],
				projetosIgnorados: ['p1'],
			}),
		)

		expect(ids(avaliarSinais(r))).not.toContain('projeto_sem_atividade')
	})

	it('detecta prazo próximo com progresso baixo', () => {
		const hoje = new Date(2026, 10, 12)
		const prazo = new Date(2026, 10, 14)
		const chavePrazo = `2026-11-14`
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', prazo: chavePrazo, updatedAt: AGORA })],
				tasks: [
					tarefa({ id: 'a', projectId: 'p1', updatedAt: AGORA }),
					tarefa({ id: 'b', projectId: 'p1', updatedAt: AGORA }),
					tarefa({ id: 'c', projectId: 'p1', updatedAt: AGORA }),
				],
			}),
		)
		void hoje
		void prazo

		const sinal = avaliarSinais(r).find((s) => s.id === 'projeto_prazo_proximo')
		expect(sinal).toBeDefined()
		expect(sinal?.nivel).toBe('urgente')
	})

	it('detecta prazo estourado', () => {
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', prazo: '2026-11-01', updatedAt: AGORA })],
				tasks: [tarefa({ id: 'a', projectId: 'p1', updatedAt: AGORA })],
			}),
		)

		expect(ids(avaliarSinais(r))).toContain('projeto_prazo_estourado')
	})
})

describe('sinais de agenda e hábitos', () => {
	it('dispara conflito de agenda', () => {
		const r = montarRetrato(
			fontes({
				events: [
					evento({ id: 'e1', startAt: AGORA + 3_600_000, endAt: AGORA + 7_200_000 }),
					evento({ id: 'e2', startAt: AGORA + 5_400_000, endAt: AGORA + 9_000_000 }),
				],
			}),
		)

		expect(ids(avaliarSinais(r))).toContain('agenda_conflito')
	})

	it('dispara sequência quebrada só quando havia sequência alta', () => {
		const habito: Habit = {
			id: 'h1',
			title: 'Ler',
			order: 0,
			dias: [],
			targetValue: 0,
			targetUnit: '',
			createdAt: AGORA - 40 * 86_400_000,
			updatedAt: AGORA,
		}
		const registro = (day: string): HabitLog => ({
			id: `l-${day}`,
			habitId: 'h1',
			day,
			value: 1,
			createdAt: AGORA,
			updatedAt: AGORA,
		})

		// Dez dias seguidos, terminando anteontem: ontem ficou sem.
		const dias = Array.from({ length: 10 }, (_, i) => {
			const data = new Date(AGORA - (i + 2) * 86_400_000)
			return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
		})

		const r = montarRetrato(fontes({ habits: [habito], habitLogs: dias.map(registro) }))
		const sinal = avaliarSinais(r).find((s) => s.id === 'habito_sequencia_quebrada')
		expect(sinal).toBeDefined()
	})

	it('não dispara sequência quebrada quando o hábito foi feito ontem', () => {
		const habito: Habit = {
			id: 'h1',
			title: 'Ler',
			order: 0,
			dias: [],
			targetValue: 0,
			targetUnit: '',
			createdAt: AGORA - 40 * 86_400_000,
			updatedAt: AGORA,
		}
		const r = montarRetrato(
			fontes({
				habits: [habito],
				habitLogs: [
					{ id: 'l1', habitId: 'h1', day: '2026-11-11', value: 1, createdAt: AGORA, updatedAt: AGORA },
					{ id: 'l2', habitId: 'h1', day: '2026-11-10', value: 1, createdAt: AGORA, updatedAt: AGORA },
				],
			}),
		)

		expect(ids(avaliarSinais(r))).not.toContain('habito_sequencia_quebrada')
	})
})

describe('regras compostas', () => {
	it('junta dados soltos em "projeto abandonado"', () => {
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', prazo: '2026-11-16', updatedAt: AGORA })],
			}),
		)

		expect(ids(avaliarCompostos(r))).toContain('projeto_abandonado')
	})

	it('não marca projeto abandonado quando já há tarefas', () => {
		const r = montarRetrato(
			fontes({
				projects: [projeto({ id: 'p1', prazo: '2026-11-16', updatedAt: AGORA })],
				tasks: [tarefa({ id: 'a', projectId: 'p1', updatedAt: AGORA })],
			}),
		)

		expect(ids(avaliarCompostos(r))).not.toContain('projeto_abandonado')
	})

	it('detecta dia impossível', () => {
		const r = montarRetrato(
			fontes({
				tasks: Array.from({ length: 5 }, (_, i) => tarefa({ id: `t${i}`, dueDate: HOJE })),
				events: [
					evento({ id: 'e1', startAt: AGORA + 3_600_000, endAt: AGORA + 7_200_000 }),
					evento({ id: 'e2', startAt: AGORA + 5_400_000, endAt: AGORA + 9_000_000 }),
					evento({ id: 'e3', startAt: AGORA + 10_800_000, endAt: AGORA + 12_600_000 }),
				],
			}),
		)

		expect(ids(avaliarCompostos(r))).toContain('dia_impossivel')
	})
})

describe('retrato vazio', () => {
	it('não inventa sinais', () => {
		const r = montarRetrato(fontes())
		expect(avaliarSinais(r)).toEqual([])
		expect(avaliarCompostos(r)).toEqual([])
	})
})
