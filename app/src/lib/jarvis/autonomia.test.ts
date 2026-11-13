import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { listTasks } from '@/db/repo'
import { agirSozinho } from '@/lib/jarvis/autonomia'
import type { ItemDoPainel } from '@/lib/jarvis/motor'
import type { Sinal } from '@/lib/jarvis/sinais'
import { salvarPreferencias } from '@/lib/jarvis/estado'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-auto-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

function item(parcial: Partial<Sinal> & { id: string }, interrompe = true): ItemDoPainel {
	return {
		sinal: {
			familia: 'projetos',
			nivel: 'oportunidade',
			titulo: 'Projeto sem tarefas',
			detalhe: 'detalhe',
			magnitude: 0.5,
			urgencia: 0.5,
			entidades: ['p1'],
			precisaIA: false,
			chave: `${parcial.id}:p1`,
			...parcial,
		},
		relevancia: 0.9,
		interrompe,
		motivo: null,
		estado: 'novo',
		em: Date.now(),
	}
}

describe('autonomia de baixo risco', () => {
	it('conservador não cria nada sozinho', async () => {
		await salvarPreferencias({ autonomia: 'conservador', modo: 'ativo' }, banco)
		const resultado = await agirSozinho({ itens: [item({ id: 'projeto_criado_vazio' })] }, {}, banco)

		expect(resultado.executadas).toBe(0)
		expect(await listTasks(banco)).toHaveLength(0)
	})

	it('equilibrado cria uma tarefa de abertura no projeto vazio', async () => {
		await salvarPreferencias({ autonomia: 'equilibrado', modo: 'ativo' }, banco)
		await banco.projects.add({
			id: 'p1',
			name: 'Curso de cerâmica',
			archived: false,
			order: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})

		const resultado = await agirSozinho({ itens: [item({ id: 'projeto_criado_vazio' })] }, {}, banco)
		const tarefas = await listTasks(banco)

		expect(resultado.executadas).toBe(1)
		expect(tarefas).toHaveLength(1)
		expect(tarefas[0]!.title).toBe('Definir os primeiros passos')
		expect(tarefas[0]!.projectId).toBe('p1')
	})

	it('não age em sinal que pede julgamento da IA', async () => {
		await salvarPreferencias({ autonomia: 'confiante', modo: 'ativo' }, banco)
		const resultado = await agirSozinho(
			{ itens: [item({ id: 'projeto_criado_vazio', precisaIA: true })] },
			{},
			banco,
		)
		expect(resultado.executadas).toBe(0)
	})

	it('não age em sinal que não interrompeu', async () => {
		await salvarPreferencias({ autonomia: 'confiante', modo: 'ativo' }, banco)
		const resultado = await agirSozinho(
			{ itens: [item({ id: 'projeto_criado_vazio' }, false)] },
			{},
			banco,
		)
		expect(resultado.executadas).toBe(0)
	})

	it('não age quando o modo é pausado', async () => {
		await salvarPreferencias({ autonomia: 'confiante', modo: 'pausado' }, banco)
		const resultado = await agirSozinho({ itens: [item({ id: 'projeto_criado_vazio' })] }, {}, banco)
		expect(resultado.executadas).toBe(0)
	})

	it('respeita o teto diário de 2 ações', async () => {
		await salvarPreferencias({ autonomia: 'confiante', modo: 'ativo' }, banco)
		await banco.projects.add({
			id: 'p1',
			name: 'Um',
			archived: false,
			order: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})

		const itens = [
			item({ id: 'projeto_criado_vazio', chave: 'a' }),
			item({ id: 'projeto_prazo_proximo', chave: 'b' }),
			item({ id: 'agenda_sem_preparo', chave: 'c', entidades: [] }),
		]

		const resultado = await agirSozinho({ itens }, {}, banco)
		expect(resultado.executadas).toBe(2)
		expect(await listTasks(banco)).toHaveLength(2)
	})

	it('a tarefa criada aparece no diário com origem ia', async () => {
		await salvarPreferencias({ autonomia: 'equilibrado', modo: 'ativo' }, banco)
		await banco.projects.add({
			id: 'p1',
			name: 'Um',
			archived: false,
			order: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		})

		await agirSozinho({ itens: [item({ id: 'projeto_criado_vazio' })] }, {}, banco)
		const tarefa = (await listTasks(banco))[0]!

		const fatos = await banco.aiJournal.where('entidade').equals(tarefa.id).toArray()
		expect(fatos.some((fato) => fato.origem === 'ia')).toBe(true)
	})
})
