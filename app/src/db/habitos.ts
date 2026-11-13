import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Habit, HabitLog, NexoDatabase } from '@/db/db'
import { db } from '@/db/db'
import { createId } from '@/db/id'
import { toDayKey } from '@/db/repo'
import { registrarMudanca } from '@/lib/jarvis/diario'

/**
 * Anúncio de escrita de hábito.
 *
 * Faltava neste módulo: marcar ou desmarcar um dia não chegava ao barramento,
 * então sequência quebrada e hábito abandonado eram sinais impossíveis.
 */
async function anunciar(tipo: 'habit' | 'habitLog', id: string, database: NexoDatabase): Promise<void> {
	await registrarMudanca(tipo, id, database)
}

/**
 * Hábitos — o mesmo desenho do Grit: um hábito é uma entidade própria, não uma
 * tarefa que repete. Ele tem dias da semana, meta numérica opcional e um
 * registro por dia (`HabitLog`), o que permite sequência, consistência e
 * heatmap sem depender da lista de tarefas.
 */

const now = (): number => Date.now()
const visivel = (linha: { deletedAt?: number | null }): boolean => linha.deletedAt == null

export interface NovoHabito {
	title: string
	description?: string | null
	icone?: string | null
	cor?: number | null
	startMin?: number | null
	dias?: number[]
	targetValue?: number
	targetUnit?: string
	reminder?: boolean
	projectId?: string | null
	order?: number
}

export async function criarHabito(input: NovoHabito, database: NexoDatabase = db): Promise<Habit> {
	const titulo = input.title.trim()
	if (!titulo) throw new Error('O nome do hábito é obrigatório.')

	const timestamp = now()
	const habito: Habit = {
		id: createId(),
		title: titulo,
		description: input.description?.trim() || null,
		icone: input.icone ?? null,
		cor: input.cor ?? 0,
		startMin: input.startMin ?? null,
		dias: input.dias ?? [],
		targetValue: input.targetValue ?? 0,
		targetUnit: input.targetUnit?.trim() ?? '',
		reminder: input.reminder ?? false,
		order: input.order ?? timestamp,
		projectId: input.projectId ?? null,
		createdAt: timestamp,
		updatedAt: timestamp,
	}

	await database.habits.add(habito)
	await anunciar('habit', habito.id, database)
	return habito
}

export async function atualizarHabito(
	id: string,
	patch: Partial<Omit<Habit, 'id' | 'createdAt'>>,
	database: NexoDatabase = db,
): Promise<void> {
	await database.habits.update(id, { ...patch, updatedAt: now() })
	await anunciar('habit', id, database)
}

export async function excluirHabito(id: string, database: NexoDatabase = db): Promise<void> {
	const timestamp = now()
	await database.habits.update(id, { deletedAt: timestamp, updatedAt: timestamp })
	await anunciar('habit', id, database)
}

export async function listarHabitos(database: NexoDatabase = db): Promise<Habit[]> {
	const linhas = await database.habits.toArray()
	return linhas.filter(visivel).sort((a, b) => a.order - b.order)
}

export async function listarRegistros(database: NexoDatabase = db): Promise<HabitLog[]> {
	const linhas = await database.habitLogs.toArray()
	return linhas.filter(visivel)
}

/** Chave do índice composto, para achar o registro de um hábito num dia. */
const chave = (habitId: string, day: string): [string, string] => [habitId, day]

/**
 * Alterna o dia de um hábito.
 *
 * Hábito com meta grava o valor da meta (igual ao Grit: "completar" registra
 * 100%). Hábito simples grava 1. Se o dia já tinha registro, remove — assim o
 * mesmo toque corrige um engano.
 */
export async function alternarDiaHabito(
	habito: Habit,
	day: string = toDayKey(new Date()),
	database: NexoDatabase = db,
): Promise<boolean> {
	const existente = await database.habitLogs.where('[habitId+day]').equals(chave(habito.id, day)).first()

	if (existente && visivel(existente)) {
		await database.habitLogs.update(existente.id, { deletedAt: now(), updatedAt: now() })
		await anunciar('habitLog', existente.id, database)
		return false
	}

	const timestamp = now()
	const registro: HabitLog = {
		id: existente?.id ?? createId(),
		habitId: habito.id,
		day,
		value: habito.targetValue && habito.targetValue > 0 ? habito.targetValue : 1,
		createdAt: existente?.createdAt ?? timestamp,
		updatedAt: timestamp,
		deletedAt: null,
	}

	await database.habitLogs.put(registro)
	await anunciar('habitLog', registro.id, database)
	return true
}

/** Define o valor exato de um dia (hábito com meta: "17 de 20 páginas"). */
export async function registrarValor(
	habito: Habit,
	day: string,
	value: number,
	database: NexoDatabase = db,
): Promise<void> {
	const existente = await database.habitLogs.where('[habitId+day]').equals(chave(habito.id, day)).first()
	const timestamp = now()

	if (value <= 0) {
		if (existente) {
			await database.habitLogs.update(existente.id, { deletedAt: timestamp, updatedAt: timestamp })
			await anunciar('habitLog', existente.id, database)
		}
		return
	}

	const registro: HabitLog = {
		id: existente?.id ?? createId(),
		habitId: habito.id,
		day,
		value,
		createdAt: existente?.createdAt ?? timestamp,
		updatedAt: timestamp,
		deletedAt: null,
	}

	await database.habitLogs.put(registro)
	await anunciar('habitLog', registro.id, database)
}

/* --------------------------------------------------------------------------
   Leitura derivada
   -------------------------------------------------------------------------- */

export const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const
export const DIAS_NOMES = [
	'domingo',
	'segunda',
	'terça',
	'quarta',
	'quinta',
	'sexta',
	'sábado',
] as const

/** O hábito vale neste dia? (sem dias marcados = todos os dias) */
export function valeNoDia(habito: Pick<Habit, 'dias'>, data: Date): boolean {
	const dias = habito.dias ?? []
	if (dias.length === 0) return true
	return dias.includes(data.getDay())
}

export function ehMensuravel(habito: Habit): boolean {
	return (habito.targetValue ?? 0) > 0
}

/** Fração concluída no dia (0..1); null para hábito simples. */
export function progressoDoDia(habito: Habit, registro: HabitLog | undefined): number | null {
	if (!ehMensuravel(habito)) return null
	const alvo = habito.targetValue ?? 0
	if (alvo <= 0) return null
	return Math.min(1, Math.max(0, (registro?.value ?? 0) / alvo))
}

export function concluidoNoDia(registro: HabitLog | undefined): boolean {
	if (!registro) return false
	// Como no Grit: qualquer valor registrado conta como dia concluído. Isso
	// mantém calendário, sequência e heatmap coerentes entre si.
	return registro.value > 0
}

export interface HabitoCalculado extends Habit {
	registros: HabitLog[]
	porDia: Map<string, HabitLog>
	hoje: HabitLog | undefined
	concluidoHoje: boolean
	valeHoje: boolean
	sequencia: number
	recorde: number
	/** % de dias válidos com registro nos últimos 30 dias. */
	consistencia: number
	concluidos30: number
	ultimos14: Array<{ day: string; data: Date; registro?: HabitLog }>
}

/**
 * Calcula sequência, recorde e consistência.
 *
 * Sequência conta dias seguidos concluídos terminando hoje (ou ontem, se hoje
 * ainda não foi marcado — senão o número despencaria toda manhã). Dias em que o
 * hábito não vale (ex. só seg/qua/sex) não quebram a sequência.
 */
export function calcularHabito(
	habito: Habit,
	registros: HabitLog[],
	hojeChave: string = toDayKey(new Date()),
): HabitoCalculado {
	const doHabito = registros
		.filter((r) => r.habitId === habito.id && visivel(r))
		.sort((a, b) => (a.day < b.day ? -1 : 1))

	const porDia = new Map(doHabito.map((r) => [r.day, r]))
	const hoje = porDia.get(hojeChave)
	const dataHoje = new Date(`${hojeChave}T12:00:00`)

	let sequencia = 0
	const cursor = new Date(dataHoje)
	for (let i = 0; i < 730; i++) {
		const chaveDia = toDayKey(cursor)
		const valido = valeNoDia(habito, cursor)
		const registro = porDia.get(chaveDia)

		if (valido && registro) {
			sequencia++
		} else if (valido && i > 0) {
			break
		} else if (valido && i === 0) {
			// Hoje ainda sem marcação não encerra a sequência de ontem.
		} else if (!valido) {
			// Dia fora da rotina: não conta nem quebra.
		}

		cursor.setDate(cursor.getDate() - 1)
	}

	// Recorde: maior sequência em qualquer ponto do histórico. Anda pelos dias
	// registrados e conta enquanto o dia anterior esperado também tem registro.
	let recorde = sequencia
	let corrente = 0
	const diasOrdenados = [...porDia.keys()].sort()
	let anteriorEsperado: string | null = null
	for (const dia of diasOrdenados) {
		if (anteriorEsperado === null || anteriorEsperado === dia) corrente += 1
		else corrente = 1
		if (corrente > recorde) recorde = corrente
		anteriorEsperado = toDayKey(diaAnteriorUtil(dia, habito))
	}

	// Consistência dos últimos 30 dias: registros / dias em que o hábito vale.
	let validos = 0
	let feitos = 0
	const janela = new Date(dataHoje)
	for (let i = 0; i < 30; i++) {
		if (valeNoDia(habito, janela)) {
			validos++
			if (porDia.get(toDayKey(janela))) feitos++
		}
		janela.setDate(janela.getDate() - 1)
	}

	const ultimos14: HabitoCalculado['ultimos14'] = []
	const dia14 = new Date(dataHoje)
	for (let i = 13; i >= 0; i--) {
		const d = new Date(dia14)
		d.setDate(d.getDate() - i)
		const chaveDia = toDayKey(d)
		ultimos14.push({ day: chaveDia, data: d, registro: porDia.get(chaveDia) })
	}

	return {
		...habito,
		registros: doHabito,
		porDia,
		hoje,
		concluidoHoje: concluidoNoDia(hoje),
		valeHoje: valeNoDia(habito, dataHoje),
		sequencia,
		recorde,
		consistencia: validos === 0 ? 0 : Math.round((feitos / validos) * 100),
		concluidos30: feitos,
		ultimos14,
	}
}

/** Dia anterior em que o hábito vale — usado para não quebrar sequência em folgas. */
function diaAnteriorUtil(dia: string, habito: Pick<Habit, 'dias'>): Date {
	const data = new Date(`${dia}T12:00:00`)
	do {
		data.setDate(data.getDate() - 1)
	} while (!valeNoDia(habito, data))
	return data
}

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

export function useHabitos(): Habit[] | undefined {
	return useLiveQuery(() => listarHabitos(), [])
}

export function useHabitosCalculados(): HabitoCalculado[] | undefined {
	const habitos = useHabitos()
	const registros = useLiveQuery(() => listarRegistros(), [])

	return useMemo(() => {
		if (!habitos || !registros) return undefined
		const hoje = toDayKey(new Date())
		return habitos.map((habito) => calcularHabito(habito, registros, hoje))
	}, [habitos, registros])
}

export function useHabito(id: string | null): HabitoCalculado | undefined {
	const registros = useLiveQuery(async () => (id ? listarRegistros() : []), [id])
	const habito = useLiveQuery(async () => (id ? db.habits.get(id) : undefined), [id])

	return useMemo(() => {
		if (!id || !habito || !registros || habito.deletedAt) return undefined
		return calcularHabito(habito, registros)
	}, [id, habito, registros])
}

/** Totais de todos os hábitos, para o bloco do Início. */
export function useResumoHabitos(): {
	devidosHoje: number
	feitosHoje: number
	melhorSequencia: number
} | undefined {
	const calculados = useHabitosCalculados()

	return useMemo(() => {
		if (!calculados) return undefined
		return {
			devidosHoje: calculados.filter((h) => h.valeHoje).length,
			feitosHoje: calculados.filter((h) => h.concluidoHoje).length,
			melhorSequencia: calculados.reduce((maior, h) => Math.max(maior, h.sequencia), 0),
		}
	}, [calculados])
}
