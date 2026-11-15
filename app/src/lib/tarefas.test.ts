import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createTask, listTasks, toggleTask, updateTask } from '@/db/repo'
import { cobraPrazo, estaAtrasada, tipoDaTarefa } from '@/lib/tarefas'
import { montarRetrato } from '@/lib/jarvis/retrato'
import { montarAgenda } from '@/lib/jarvis/agenda'
import { PREFERENCIAS_PADRAO } from '@/lib/jarvis/relevancia'

/**
 * Tipo de tarefa: o que impede um lembrete de "vencer".
 *
 * O defeito relatado foi: criar uma tarefa hoje sem prazo e, no dia seguinte,
 * ela aparecer como vencida. A causa era o `dueDate` gravado com a data de
 * hoje. Estes testes travam as duas metades da correção:
 *
 * 1. a criação grava o tipo e respeita a ausência de dia;
 * 2. a leitura — telas, retrato do Jarvis e agenda — não trata lembrete nem
 *    ideia como atraso.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`nexo-tarefas-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

const HOJE = '2026-11-12'
const ONTEM = '2026-11-11'

describe('tipo da tarefa', () => {
	it('nasce como tarefa quando ninguém diz o tipo', async () => {
		const tarefa = await createTask({ title: 'Sem tipo' }, banco)
		expect(tarefa.tipo).toBe('tarefa')
		expect(tipoDaTarefa(tarefa)).toBe('tarefa')
	})

	it('registro antigo sem o campo vale como tarefa', () => {
		expect(tipoDaTarefa({ tipo: undefined })).toBe('tarefa')
	})

	it('registro antigo com "algum dia" vale como ideia', () => {
		expect(tipoDaTarefa({ tipo: undefined, someday: true } as never)).toBe('ideia')
	})

	it('lembrete é gravado sem dia quando não há dia', async () => {
		const tarefa = await createTask({ title: 'Ligar para o dentista', tipo: 'lembrete' }, banco)
		expect(tarefa.tipo).toBe('lembrete')
		expect(tarefa.dueDate).toBeNull()
	})

	it('ideia marca someday para os registros antigos continuarem iguais', async () => {
		const tarefa = await createTask({ title: 'Aprender violão', tipo: 'ideia', someday: true }, banco)
		expect(tarefa.tipo).toBe('ideia')
		expect(tarefa.someday).toBe(true)
	})

	it('lembrete sem dia nunca fica atrasado, nem no dia seguinte', () => {
		expect(estaAtrasada({ tipo: 'lembrete', done: false, dueDate: null }, HOJE)).toBe(false)
		// Mesmo que um dia seja gravado por engano, lembrete não cobra.
		expect(estaAtrasada({ tipo: 'lembrete', done: false, dueDate: ONTEM }, HOJE)).toBe(false)
	})

	it('ideia nunca fica atrasada', () => {
		expect(estaAtrasada({ tipo: 'ideia', done: false, dueDate: ONTEM }, HOJE)).toBe(false)
	})

	it('tarefa com dia anterior fica atrasada', () => {
		expect(estaAtrasada({ tipo: 'tarefa', done: false, dueDate: ONTEM }, HOJE)).toBe(true)
	})

	it('tarefa concluída não fica atrasada', () => {
		expect(estaAtrasada({ tipo: 'tarefa', done: true, dueDate: ONTEM }, HOJE)).toBe(false)
	})

	it('só tarefa cobra prazo', () => {
		expect(cobraPrazo({ tipo: 'tarefa' })).toBe(true)
		expect(cobraPrazo({ tipo: 'lembrete' })).toBe(false)
		expect(cobraPrazo({ tipo: 'ideia' })).toBe(false)
	})

	it('trocar o tipo pela edição persiste', async () => {
		const tarefa = await createTask({ title: 'Revisar contrato', dueDate: HOJE }, banco)
		await updateTask(tarefa.id, { tipo: 'lembrete', dueDate: null }, banco)

		const [salva] = await listTasks(banco)
		expect(salva!.tipo).toBe('lembrete')
		expect(salva!.dueDate).toBeNull()
	})

	it('concluir um lembrete continua funcionando', async () => {
		const tarefa = await createTask({ title: 'Pagar conta', tipo: 'lembrete' }, banco)
		await toggleTask(tarefa.id, true, banco)
		const [salva] = await listTasks(banco)
		expect(salva!.done).toBe(true)
		expect(salva!.doneAt).toBeTypeOf('number')
	})
})

describe('lembrete fora do Jarvis', () => {
	it('não entra na contagem de atrasadas do retrato', async () => {
		await createTask({ title: 'Lembrete antigo', tipo: 'lembrete', dueDate: ONTEM }, banco)
		await createTask({ title: 'Tarefa antiga', tipo: 'tarefa', dueDate: ONTEM }, banco)

		const tarefas = await listTasks(banco)
		const retrato = montarRetrato({
			hoje: HOJE,
			agora: new Date(`${HOJE}T12:00:00`).getTime(),
			tasks: tarefas,
			projects: [],
			events: [],
			habits: [],
			habitLogs: [],
			reminders: [],
			interrupcoesHoje: 0,
		})

		// Só a tarefa de verdade conta como atrasada.
		expect(retrato.tarefas.atrasadas).toBe(1)
	})

	it('lembrete sem hora não gera aviso nenhum', async () => {
		const lembrete = await createTask({ title: 'Comprar pilha', tipo: 'lembrete' }, banco)

		const avisos = montarAgenda({
			tarefas: [lembrete],
			eventos: [],
			habitos: [],
			registros: [],
			lembretes: [],
			projetos: [],
			prefs: { ...PREFERENCIAS_PADRAO, agendaDeAvisos: true },
			agora: new Date(`${HOJE}T10:00:00`).getTime(),
		})

		expect(avisos).toHaveLength(0)
	})

	it('lembrete COM hora avisa na hora, mesmo sem dia', async () => {
		const agora = new Date(`${HOJE}T10:00:00`).getTime()
		const lembrete = await createTask(
			{ title: 'Tomar remédio', tipo: 'lembrete', startMin: 15 * 60 },
			banco,
		)

		const avisos = montarAgenda({
			tarefas: [lembrete],
			eventos: [],
			habitos: [],
			registros: [],
			lembretes: [],
			projetos: [],
			prefs: { ...PREFERENCIAS_PADRAO, agendaDeAvisos: true },
			agora,
		})

		expect(avisos).toHaveLength(1)
		expect(avisos[0]!.em).toBe(new Date(`${HOJE}T15:00:00`).getTime())
	})
})
