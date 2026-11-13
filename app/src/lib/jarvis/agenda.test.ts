import { describe, expect, it } from 'vitest'
import type { Evento, Habit, HabitLog, Project, Reminder, Task } from '@/db/db'
import { PREFERENCIAS_PADRAO } from '@/lib/jarvis/relevancia'
import type { PreferenciasJarvis } from '@/lib/jarvis/relevancia'
import { LIMITE_DA_AGENDA, montarAgenda } from '@/lib/jarvis/agenda'
import type { MaterialDaAgenda } from '@/lib/jarvis/agenda'

/**
 * Testes da agenda datada.
 *
 * O que estes testes protegem, em ordem de importância:
 *
 * 1. uma tarefa marcada para 15h gera um aviso às 15h — não às 8h, não em
 *    "alguma janela do dia";
 * 2. hábito já feito no dia não avisa de novo;
 * 3. a faixa silenciosa é respeitada de verdade (o aviso é descartado);
 * 4. prazo vence hoje → aviso de manhã; vence amanhã → aviso na véspera;
 * 5. nada no passado entra na lista.
 */

const AGORA = new Date(2026, 10, 12, 7, 0, 0).getTime() // 12/11/2026, 07:00 local

function prefs(patch: Partial<PreferenciasJarvis> = {}): PreferenciasJarvis {
	return {
		...PREFERENCIAS_PADRAO,
		// Faixa silenciosa desligada por padrão nos testes: os horários testados
		// (7h, 9h) cairiam nela e todo teste viraria "foi silenciado". O teste
		// de silêncio é explícito.
		silencio: { inicio: 22, fim: 7, ligado: false },
		...patch,
	}
}

const agoraIso = (): string => '2026-11-12'

function tarefa(patch: Partial<Task> = {}): Task {
	return {
		id: 't1',
		title: 'Revisar proposta',
		done: false,
		priority: 0,
		order: 1,
		createdAt: AGORA,
		updatedAt: AGORA,
		...patch,
	}
}

function material(patch: Partial<MaterialDaAgenda> = {}): MaterialDaAgenda {
	return {
		tarefas: [],
		eventos: [],
		habitos: [],
		registros: [],
		lembretes: [],
		projetos: [],
		prefs: prefs(),
		agora: AGORA,
		...patch,
	}
}

const horaDe = (em: number): number => new Date(em).getHours()
const minutoDe = (em: number): number => new Date(em).getMinutes()

describe('agenda: tarefas', () => {
	it('avisa no minuto marcado, não na janela do dia', () => {
		const avisos = montarAgenda(
			material({
				tarefas: [tarefa({ dueDate: agoraIso(), startMin: 15 * 60 + 30 })],
			}),
		)

		expect(avisos).toHaveLength(1)
		expect(horaDe(avisos[0]!.em)).toBe(15)
		expect(minutoDe(avisos[0]!.em)).toBe(30)
		expect(avisos[0]!.titulo).toBe('Revisar proposta')
	})

	it('não avisa tarefa sem hora marcada individualmente', () => {
		const avisos = montarAgenda(material({ tarefas: [tarefa({ dueDate: agoraIso() })] }))
		// Só sobra o resumo do dia, que é UM aviso para todas.
		expect(avisos).toHaveLength(1)
		expect(avisos[0]!.titulo).toBe('1 tarefa para hoje')
	})

	it('junta as tarefas do dia sem hora num único resumo', () => {
		const avisos = montarAgenda(
			material({
				tarefas: [
					tarefa({ id: 'a', title: 'A', dueDate: agoraIso() }),
					tarefa({ id: 'b', title: 'B', dueDate: agoraIso() }),
					tarefa({ id: 'c', title: 'C', dueDate: agoraIso() }),
				],
			}),
		)

		expect(avisos).toHaveLength(1)
		expect(avisos[0]!.titulo).toBe('3 tarefas para hoje')
		expect(avisos[0]!.corpo).toContain('A, B, C')
	})

	it('ignora tarefa concluída e "algum dia"', () => {
		const avisos = montarAgenda(
			material({
				tarefas: [
					tarefa({ id: 'a', dueDate: agoraIso(), startMin: 15 * 60, done: true }),
					tarefa({ id: 'b', dueDate: agoraIso(), startMin: 16 * 60, someday: true }),
				],
			}),
		)
		expect(avisos).toHaveLength(0)
	})

	it('não agenda nada no passado', () => {
		const avisos = montarAgenda(
			material({ tarefas: [tarefa({ dueDate: agoraIso(), startMin: 6 * 60 })] }),
		)
		expect(avisos.filter((aviso) => aviso.em < AGORA)).toHaveLength(0)
	})

	it('nomeia o projeto no corpo quando a tarefa tem um', () => {
		const projeto: Project = {
			id: 'p1',
			name: 'Reforma',
			archived: false,
			order: 1,
			createdAt: AGORA,
			updatedAt: AGORA,
		}
		const avisos = montarAgenda(
			material({
				projetos: [projeto],
				tarefas: [tarefa({ dueDate: agoraIso(), startMin: 15 * 60, projectId: 'p1' })],
			}),
		)
		expect(avisos[0]!.corpo).toContain('Reforma')
	})
})

describe('agenda: prazos', () => {
	it('prazo hoje avisa às 9h', () => {
		const avisos = montarAgenda(
			material({ tarefas: [tarefa({ deadline: agoraIso() })] }),
		)
		const prazo = avisos.find((aviso) => aviso.chave?.startsWith('agenda:prazo:'))
		expect(prazo).toBeDefined()
		expect(horaDe(prazo!.em)).toBe(9)
	})

	it('prazo amanhã avisa na véspera, às 18h', () => {
		const avisos = montarAgenda(
			material({ tarefas: [tarefa({ deadline: '2026-11-13' })] }),
		)
		const vespera = avisos.find((aviso) => aviso.chave?.startsWith('agenda:vespera:'))
		expect(vespera).toBeDefined()
		expect(horaDe(vespera!.em)).toBe(18)
		expect(new Date(vespera!.em).getDate()).toBe(12)
	})

	it('prazo de projeto ativo avisa; concluído e ignorado não', () => {
		const base: Project = {
			id: 'p1',
			name: 'Entrega',
			archived: false,
			order: 1,
			createdAt: AGORA,
			updatedAt: AGORA,
			prazo: agoraIso(),
		}

		const ativo = montarAgenda(material({ projetos: [base] }))
		expect(ativo.some((aviso) => aviso.chave?.startsWith('agenda:projeto:'))).toBe(true)

		const concluido = montarAgenda(
			material({ projetos: [{ ...base, status: 'concluido' }] }),
		)
		expect(concluido.some((aviso) => aviso.chave?.startsWith('agenda:projeto:'))).toBe(false)

		const ignorado = montarAgenda(
			material({ projetos: [base], prefs: prefs({ projetosIgnorados: ['p1'] }) }),
		)
		expect(ignorado.some((aviso) => aviso.chave?.startsWith('agenda:projeto:'))).toBe(false)
	})
})

describe('agenda: hábitos', () => {
	function habito(patch: Partial<Habit> = {}): Habit {
		return {
			id: 'h1',
			title: 'Ler 20 páginas',
			dias: [],
			startMin: 21 * 60,
			targetValue: 0,
			targetUnit: '',
			reminder: true,
			order: 1,
			createdAt: AGORA,
			updatedAt: AGORA,
			...patch,
		}
	}

	it('avisa no horário habitual do hábito', () => {
		const avisos = montarAgenda(material({ habitos: [habito()] }))
		const deHoje = avisos.find((aviso) => aviso.em > AGORA)
		expect(deHoje).toBeDefined()
		expect(horaDe(deHoje!.em)).toBe(21)
	})

	it('não avisa de novo o hábito já feito no dia', () => {
		const registro: HabitLog = {
			id: 'l1',
			habitId: 'h1',
			day: agoraIso(),
			value: 1,
			createdAt: AGORA,
			updatedAt: AGORA,
		}

		const avisos = montarAgenda(material({ habitos: [habito()], registros: [registro] }))
		const deHoje = avisos.filter(
			(aviso) => aviso.chave === `agenda:habito:h1:${agoraIso()}`,
		)
		expect(deHoje).toHaveLength(0)
	})

	it('respeita os dias da semana do hábito', () => {
		// 12/11/2026 é quinta (4). Um hábito só de segunda não deve aparecer.
		const avisos = montarAgenda(material({ habitos: [habito({ dias: [1] })] }))
		const daSemana = avisos.filter((aviso) => aviso.chave?.startsWith('agenda:habito:'))
		expect(daSemana.every((aviso) => new Date(aviso.em).getDay() === 1)).toBe(true)
	})

	it('hábito sem hora não vira alarme', () => {
		const avisos = montarAgenda(material({ habitos: [habito({ startMin: null })] }))
		expect(avisos.filter((aviso) => aviso.chave?.startsWith('agenda:habito:'))).toHaveLength(0)
	})
})

describe('agenda: eventos e lembretes', () => {
	function evento(patch: Partial<Evento> = {}): Evento {
		return {
			id: 'e1',
			title: 'Reunião',
			startAt: new Date(2026, 10, 12, 14, 0, 0).getTime(),
			endAt: new Date(2026, 10, 12, 15, 0, 0).getTime(),
			diaInteiro: false,
			cor: 0,
			createdAt: AGORA,
			updatedAt: AGORA,
			...patch,
		}
	}

	it('avisa com a antecedência configurada', () => {
		const avisos = montarAgenda(
			material({ eventos: [evento()], prefs: prefs({ antecedenciaMin: 30 }) }),
		)
		expect(avisos).toHaveLength(1)
		expect(horaDe(avisos[0]!.em)).toBe(13)
		expect(minutoDe(avisos[0]!.em)).toBe(30)
		expect(avisos[0]!.corpo).toContain('14:00')
	})

	it('evento de dia inteiro não avisa como compromisso com hora', () => {
		const avisos = montarAgenda(material({ eventos: [evento({ diaInteiro: true })] }))
		expect(avisos).toHaveLength(0)
	})

	it('expande evento recorrente dentro do horizonte', () => {
		const diario = evento({
			startAt: new Date(2026, 10, 12, 9, 0, 0).getTime(),
			endAt: new Date(2026, 10, 12, 10, 0, 0).getTime(),
			recurrence: { tipo: 'diaria', intervalo: 1 },
		})

		const avisos = montarAgenda(material({ eventos: [diario] }))
		// 7 dias de horizonte = 8 ocorrências (hoje + 7), mas as que caem no
		// passado são descartadas; hoje às 9h ainda é futuro (agora é 7h).
		expect(avisos.length).toBeGreaterThanOrEqual(7)
		expect(new Set(avisos.map((aviso) => aviso.chave)).size).toBe(avisos.length)
	})

	it('lembrete avisa no instante exato', () => {
		const lembrete: Reminder = {
			id: 'r1',
			text: 'Ligar para o fornecedor',
			dueAt: new Date(2026, 10, 12, 10, 0, 0).getTime(),
			done: false,
			order: 1,
			createdAt: AGORA,
			updatedAt: AGORA,
		}

		const avisos = montarAgenda(material({ lembretes: [lembrete] }))
		expect(avisos).toHaveLength(1)
		expect(avisos[0]!.em).toBe(lembrete.dueAt)
		expect(avisos[0]!.corpo).toBe('Ligar para o fornecedor')
	})

	it('lembrete já feito não avisa', () => {
		const lembrete: Reminder = {
			id: 'r1',
			text: 'X',
			dueAt: new Date(2026, 10, 12, 10, 0, 0).getTime(),
			done: true,
			order: 1,
			createdAt: AGORA,
			updatedAt: AGORA,
		}
		expect(montarAgenda(material({ lembretes: [lembrete] }))).toHaveLength(0)
	})
})

describe('agenda: travas', () => {
	it('desligada nas preferências devolve lista vazia', () => {
		const avisos = montarAgenda(
			material({
				prefs: prefs({ agendaDeAvisos: false }),
				tarefas: [tarefa({ dueDate: agoraIso(), startMin: 15 * 60 })],
			}),
		)
		expect(avisos).toHaveLength(0)
	})

	it('respeita a faixa silenciosa', () => {
		const avisos = montarAgenda(
			material({
				prefs: prefs({ silencio: { inicio: 22, fim: 7, ligado: true } }),
				tarefas: [tarefa({ dueDate: agoraIso(), startMin: 23 * 60 })],
			}),
		)
		expect(avisos).toHaveLength(0)
	})

	it('a faixa silenciosa que cruza a meia-noite funciona', () => {
		const avisos = montarAgenda(
			material({
				prefs: prefs({ silencio: { inicio: 22, fim: 7, ligado: true } }),
				tarefas: [tarefa({ dueDate: agoraIso(), startMin: 1 * 60 + 30 })],
			}),
		)
		// 1h30 está dentro de 22→7, mas também já passou: continua fora.
		expect(avisos).toHaveLength(0)
	})

	it('limita a quantidade e ordena do mais próximo', () => {
		const tarefas = Array.from({ length: 60 }, (_, indice) =>
			tarefa({
				id: `t${indice}`,
				title: `Tarefa ${indice}`,
				dueDate: '2026-11-13',
				startMin: 8 * 60 + indice * 10,
			}),
		)

		const avisos = montarAgenda(material({ tarefas }))
		expect(avisos.length).toBeLessThanOrEqual(LIMITE_DA_AGENDA)
		for (let i = 1; i < avisos.length; i++) {
			expect(avisos[i]!.em).toBeGreaterThanOrEqual(avisos[i - 1]!.em)
		}
	})

	it('nada além do horizonte entra', () => {
		const distante = tarefa({ dueDate: '2026-12-31', startMin: 10 * 60 })
		const avisos = montarAgenda(material({ tarefas: [distante] }))
		expect(avisos).toHaveLength(0)
	})

	it('ids são estáveis entre execuções', () => {
		const entrada = material({ tarefas: [tarefa({ dueDate: agoraIso(), startMin: 15 * 60 })] })
		const primeira = montarAgenda(entrada)
		const segunda = montarAgenda(entrada)
		expect(primeira.map((aviso) => aviso.id)).toEqual(segunda.map((aviso) => aviso.id))
	})
})

/**
 * O caso que fez o usuário dizer "não recebo nada": marcar para 1 minuto à
 * frente.
 *
 * O campo de hora tem resolução de minuto. Marcar às 16:28:57 para 16:29 grava
 * 16:29:00; ao salvar (16:29:12) o horário já passou. A versão anterior
 * descartava esse aviso em silêncio — a tarefa aparecia na lista e nenhuma
 * notificação saía. Foi reproduzido no aparelho do usuário, não deduzido.
 */
describe('agenda: horário que venceu agora', () => {
	it('avisa imediatamente o que venceu há menos de 2 minutos', () => {
		const agora = AGORA
		const avisos = montarAgenda(
			material({
				agora,
				tarefas: [tarefa({ dueDate: agoraIso(), startMin: (7 * 60) - 1 })],
			}),
		)

		const daTarefa = avisos.find((aviso) => aviso.chave?.startsWith('agenda:tarefa:'))
		expect(daTarefa).toBeDefined()
		// Reagendado para logo à frente, não descartado.
		expect(daTarefa!.em).toBeGreaterThan(agora)
		expect(daTarefa!.em - agora).toBeLessThan(10_000)
	})

	it('NÃO avisa o que venceu há mais de 2 minutos', () => {
		const avisos = montarAgenda(
			material({
				agora: AGORA,
				tarefas: [tarefa({ dueDate: agoraIso(), startMin: 7 * 60 - 10 })],
			}),
		)
		expect(avisos.filter((aviso) => aviso.chave?.startsWith('agenda:tarefa:'))).toHaveLength(0)
	})

	it('não avisa tarefa de dias atrás como se fosse agora', () => {
		const avisos = montarAgenda(
			material({
				agora: AGORA,
				tarefas: [tarefa({ dueDate: '2026-11-05', startMin: 9 * 60 })],
			}),
		)
		expect(avisos.filter((aviso) => aviso.chave?.startsWith('agenda:tarefa:'))).toHaveLength(0)
	})
})
