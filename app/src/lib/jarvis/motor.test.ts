import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createProject, createTask, softDeleteTask, toggleTask, updateTask } from '@/db/repo'
import { criarEvento } from '@/db/eventos'
import { alternarDiaHabito, criarHabito } from '@/db/habitos'
import { comOrigem, fatosDoDia, podarDiario, registrarMudanca } from '@/lib/jarvis/diario'
import { avaliarAgora, lerPainel, marcarItem } from '@/lib/jarvis/motor'
import { lerPreferencias, salvarPreferencias } from '@/lib/jarvis/estado'
import { registrarAbertura } from '@/lib/jarvis/leitura'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-teste-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('diário de acontecimentos', () => {
	it('registra criação de tarefa com estado depois', async () => {
		const tarefa = await createTask({ title: 'Revisar proposta' }, banco)
		const fatos = await fatosDoDia(
			new Date().getFullYear() +
				'-' +
				String(new Date().getMonth() + 1).padStart(2, '0') +
				'-' +
				String(new Date().getDate()).padStart(2, '0'),
			banco,
		)

		const fato = fatos.find((entrada) => entrada.entidade === tarefa.id)
		expect(fato).toBeDefined()
		expect(fato?.acao).toBe('criar')
		expect((fato?.depois as { title?: string }).title).toBe('Revisar proposta')
	})

	it('infere conclusão e reabertura', async () => {
		const tarefa = await createTask({ title: 'Pagar conta' }, banco)
		await toggleTask(tarefa.id, true, banco)
		await toggleTask(tarefa.id, false, banco)

		const fatos = (await banco.aiJournal.where('entidade').equals(tarefa.id).toArray()).sort(
			(a, b) => (a.seq ?? 0) - (b.seq ?? 0),
		)

		expect(fatos.map((fato) => fato.acao)).toEqual(['criar', 'concluir', 'reabrir'])
		expect((fatos[1]?.antes as { done?: boolean }).done).toBe(false)
		expect((fatos[1]?.depois as { done?: boolean }).done).toBe(true)
	})

	it('infere exclusão com antes preservado', async () => {
		const tarefa = await createTask({ title: 'Descartável' }, banco)
		await softDeleteTask(tarefa.id, banco)

		const fatos = await banco.aiJournal.where('entidade').equals(tarefa.id).toArray()
		const excluida = fatos.find((fato) => fato.acao === 'excluir')

		expect(excluida).toBeDefined()
		// O registro nasceu sem `deletedAt`; o diário guarda o estado como veio,
		// então "não excluída" pode ser `null` ou ausente. O que importa é que
		// não havia carimbo de exclusão antes.
		expect((excluida?.antes as { deletedAt?: number | null }).deletedAt).toBeFalsy()
	})

	it('marca a origem quando a escrita vem da IA', async () => {
		const tarefa = await comOrigem('ia', () => createTask({ title: 'Sugerida pelo Jarvis' }, banco))
		const fatos = await banco.aiJournal.where('entidade').equals(tarefa.id).toArray()

		expect(fatos[0]?.origem).toBe('ia')
	})

	it('registra eventos de agenda e de hábito, que antes eram invisíveis', async () => {
		const evento = await criarEvento(
			{ title: 'Reunião', startAt: Date.now() + 3_600_000, endAt: Date.now() + 7_200_000 },
			banco,
		)
		const habito = await criarHabito({ title: 'Ler' }, banco)
		await alternarDiaHabito(habito, '2026-11-12', banco)

		expect(await banco.aiJournal.where('entidade').equals(evento.id).count()).toBe(1)
		expect(await banco.aiJournal.where('tipo').equals('habit').count()).toBe(1)
		expect(await banco.aiJournal.where('tipo').equals('habitLog').count()).toBe(1)
	})

	it('a falha do diário não derruba a escrita principal', async () => {
		const tarefa = await createTask({ title: 'Continua salva' }, banco)

		// Simula o diário quebrado e confirma que a tarefa continua lá.
		const original = banco.aiJournal.add.bind(banco.aiJournal)
		banco.aiJournal.add = (() => Promise.reject(new Error('disco cheio'))) as unknown as typeof banco.aiJournal.add

		await expect(updateTask(tarefa.id, { title: 'Editada' }, banco)).resolves.toBeUndefined()
		expect((await banco.tasks.get(tarefa.id))?.title).toBe('Editada')

		banco.aiJournal.add = original
	})

	it('poda linhas antigas', async () => {
		await registrarMudanca('task', (await createTask({ title: 'Velha' }, banco)).id, banco)
		const removidas = await podarDiario({ dias: 0 }, banco)
		expect(removidas).toBeGreaterThan(0)
	})
})

describe('motor de avaliação', () => {
	it('grava o painel do dia e não duplica ao reavaliar', async () => {
		const projeto = await createProject({ name: 'Cliente novo' }, banco)
		await updateTask((await createTask({ title: 'Semana 1', projectId: projeto.id }, banco)).id, {}, banco)
		await createTask({ title: 'Atrasada', dueDate: '2020-01-01' }, banco)

		const agora = Date.now()
		await salvarPreferencias({ orcamentoDiario: 10 }, banco)

		const primeiro = await avaliarAgora({ agora, forcar: true }, banco)
		const segundo = await avaliarAgora({ agora: agora + 1000 }, banco)

		expect(primeiro.itens.length).toBeGreaterThan(0)
		expect(segundo.itens.length).toBe(primeiro.itens.length)
		expect(new Set(segundo.itens.map((item) => item.sinal.chave)).size).toBe(segundo.itens.length)
	})

	it('pausado devolve painel vazio', async () => {
		await createTask({ title: 'Atrasada', dueDate: '2020-01-01' }, banco)
		await salvarPreferencias({ modo: 'pausado' }, banco)

		const painel = await avaliarAgora({}, banco)
		expect(painel.itens).toEqual([])
		expect(await lerPainel(painel.dia, banco)).toBeNull()
	})

	it('manual não avalia automaticamente', async () => {
		await salvarPreferencias({ modo: 'manual' }, banco)
		const painel = await avaliarAgora({}, banco)
		expect(painel.resumo).toContain('Nada pendente')
	})

	it('marcar como dispensado reduz a confiança do tipo', async () => {
		await createTask({ title: 'Atrasada', dueDate: '2020-01-01' }, banco)
		const painel = await avaliarAgora({ forcar: true }, banco)
		const item = painel.itens.find((entrada) => entrada.sinal.id === 'tarefa_atrasada')
		expect(item).toBeDefined()

		await marcarItem(painel.dia, item!.sinal.chave, 'dispensado', banco)
		const linha = await banco.aiMemory.where('chave').equals(`confianca:${item!.sinal.id}`).first()
		expect(linha?.valor).toBeLessThan(0.85)
	})

	it('registra a última abertura', async () => {
		const aberta = await registrarAbertura(banco)
		expect(typeof aberta).toBe('number')
		const prefs = await lerPreferencias(banco)
		expect(prefs.modo).toBe('ativo')
	})
})
