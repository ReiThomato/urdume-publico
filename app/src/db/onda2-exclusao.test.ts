import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import {
	createProject,
	createTask,
	restaurarProject,
	restaurarTask,
	softDeleteProject,
	softDeleteTask,
	updateProject,
	criarAnotacao,
	listarAnotacoes,
} from '@/db/repo'
import { criarEvento } from '@/db/eventos'
import { listProjects, listTasksByProject, softDeleteTasks, restaurarTasks } from '@/db/repo'

/**
 * Exclusão com desfazer — a mesma regra em toda tela.
 *
 * O que se prova aqui é o que o usuário percebe: excluir esconde, desfazer
 * traz de volta O MESMO registro, e nada que pertença ao projeto fica órfão.
 * A faixa de 4 s é de interface; o que ela chama é isto.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`onda2-exclusao-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('tarefa: excluir e desfazer', () => {
	it('o desfazer restaura o registro real, não uma cópia', async () => {
		const projeto = await createProject({ name: 'Casa' }, banco)
		const tarefa = await createTask({ title: 'Trocar a lâmpada', projectId: projeto.id }, banco)

		await softDeleteTask(tarefa.id, banco)
		expect(await listTasksByProject(projeto.id, banco)).toHaveLength(0)

		await restaurarTask(tarefa.id, banco)
		const voltou = await listTasksByProject(projeto.id, banco)

		expect(voltou).toHaveLength(1)
		expect(voltou[0]!.id).toBe(tarefa.id)
		expect(voltou[0]!.title).toBe('Trocar a lâmpada')
		expect(voltou[0]!.deletedAt).toBeNull()
	})

	it('o diário registra excluir e restaurar, para o Jarvis saber', async () => {
		const tarefa = await createTask({ title: 'Pagar conta' }, banco)
		await softDeleteTask(tarefa.id, banco)
		await restaurarTask(tarefa.id, banco)

		const fatos = await banco.aiJournal.where('entidade').equals(tarefa.id).toArray()
		const acoes = fatos.map((fato) => fato.acao)

		expect(acoes).toContain('excluir')
		expect(acoes).toContain('restaurar')
	})
})

describe('projeto: o que a confirmação promete', () => {
	it('excluir leva tarefas, eventos E anotações', async () => {
		const projeto = await createProject({ name: 'Viagem' }, banco)
		await createTask({ title: 'Reservar hotel', projectId: projeto.id }, banco)
		const evento = await criarEvento(
			{ title: 'Embarque', startAt: Date.now(), endAt: Date.now() + 3_600_000, projectId: projeto.id },
			banco,
		)
		const anotacao = await criarAnotacao({ projectId: projeto.id, body: 'Levar passaporte' }, banco)

		await softDeleteProject(projeto.id, banco)

		expect(await listProjects(banco)).toHaveLength(0)
		expect(await listTasksByProject(projeto.id, banco)).toHaveLength(0)
		expect((await banco.events.get(evento.id))?.deletedAt).toBeTypeOf('number')
		// Era a divergência D3: o texto prometia, o código não apagava.
		expect((await banco.projectNotes.get(anotacao.id))?.deletedAt).toBeTypeOf('number')
		expect(await listarAnotacoes(projeto.id, banco)).toHaveLength(0)
	})

	it('o desfazer restaura o projeto e tudo o que desceu com ele', async () => {
		const projeto = await createProject({ name: 'Reforma' }, banco)
		const tarefa = await createTask({ title: 'Comprar tinta', projectId: projeto.id }, banco)
		const anotacao = await criarAnotacao({ projectId: projeto.id, body: 'Orçamento aprovado' }, banco)

		await softDeleteProject(projeto.id, banco)
		await restaurarProject(projeto.id, banco)

		expect(await listProjects(banco)).toHaveLength(1)
		expect((await listTasksByProject(projeto.id, banco)).map((t) => t.id)).toEqual([tarefa.id])
		expect((await banco.projectNotes.get(anotacao.id))?.deletedAt).toBeNull()
	})

	it('não deixa o diário sem os eventos do projeto (o anúncio sai da transação)', async () => {
		const projeto = await createProject({ name: 'Festa' }, banco)
		const evento = await criarEvento(
			{ title: 'Bolo', startAt: Date.now(), endAt: Date.now() + 1_800_000, projectId: projeto.id },
			banco,
		)

		await softDeleteProject(projeto.id, banco)

		const doEvento = await banco.aiJournal.where('entidade').equals(evento.id).toArray()
		expect(doEvento.some((fato) => fato.tipo === 'event' && fato.acao === 'excluir')).toBe(true)
	})
})

describe('criar projeto com todos os campos numa escrita só', () => {	it('nasce completo, sem passar por updateProject', async () => {
		const criado = await createProject(
			{
				name: 'Curso de violão',
				color: '4',
				descricao: 'Aprender três músicas',
				prazo: '2026-12-31',
				status: 'pausado',
				categoria: 'Estudos',
				priority: 2,
			},
			banco,
		)

		expect(criado.descricao).toBe('Aprender três músicas')
		expect(criado.prazo).toBe('2026-12-31')
		expect(criado.status).toBe('pausado')
		expect(criado.categoria).toBe('Estudos')
		expect(criado.priority).toBe(2)

		// E a edição não perde o que a criação definiu.
		await updateProject(criado.id, { etapa: 'Aula 1' }, banco)
		const depois = await banco.projects.get(criado.id)
		expect(depois?.categoria).toBe('Estudos')
		expect(depois?.descricao).toBe('Aprender três músicas')
	})
})

describe('limpar concluídas: o desfazer que o texto negava', () => {
	it('restauraTasks traz as tarefas apagadas em lote', async () => {
		const a = await createTask({ title: 'Feita 1' }, banco)
		const b = await createTask({ title: 'Feita 2' }, banco)

		await softDeleteTasks([a.id, b.id], banco)
		expect(await banco.tasks.filter((t) => t.deletedAt == null).count()).toBe(0)

		await restaurarTasks([a.id, b.id], banco)
		expect(await banco.tasks.filter((t) => t.deletedAt == null).count()).toBe(2)
	})
})
