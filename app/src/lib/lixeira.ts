import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import {
	listarEventosExcluidos,
	listarLembretesExcluidos,
	listarProjetosExcluidos,
	listarTarefasExcluidas,
	restaurarProject,
	restaurarReminder,
	restaurarTask,
} from '@/db/repo'
import { restaurarEvento } from '@/db/eventos'
import { listarHabitosExcluidos, restaurarHabito } from '@/db/habitos'

/**
 * Lixeira.
 *
 * O app sempre excluiu "de forma suave": o registro ganha `deletedAt` e some
 * das listas. O problema era o depois — a faixa de desfazer durava 4 s e, ao
 * sumir, o registro continuava no banco, invisível para sempre. Não havia
 * exclusão real, nem caminho de volta: o dado ocupava espaço e não podia ser
 * recuperado por ninguém.
 *
 * A lixeira resolve os dois lados: dá acesso ao que foi excluído (restaurar ou
 * apagar de vez) e torna a exclusão definitiva uma decisão explícita, com
 * confirmação. Nada aqui apaga sozinho, e a limpeza automática fica fora: o
 * usuário decide quando o "de vez" acontece.
 *
 * Ordem de exibição: o mais recente primeiro — é o que a pessoa quer desfazer.
 */

export type TipoNaLixeira = 'tarefa' | 'projeto' | 'lembrete' | 'evento' | 'habito'

export interface ItemDaLixeira {
	tipo: TipoNaLixeira
	id: string
	titulo: string
	/** Epoch ms da exclusão. */
	excluidoEm: number
	/** Contexto curto: projeto da tarefa, dia do evento, etc. */
	detalhe: string | null
}

function maisRecentePrimeiro(a: ItemDaLixeira, b: ItemDaLixeira): number {
	return b.excluidoEm - a.excluidoEm
}

/** Tudo que está excluído, numa lista só, misturando os tipos. */
export async function listarLixeira(database: NexoDatabase = db): Promise<ItemDaLixeira[]> {
	const [tarefas, projetos, lembretes, eventos, habitos] = await Promise.all([
		listarTarefasExcluidas(database),
		listarProjetosExcluidos(database),
		listarLembretesExcluidos(database),
		listarEventosExcluidos(database),
		listarHabitosExcluidos(database),
	])

	const itens: ItemDaLixeira[] = [
		...tarefas.map((t) => ({
			tipo: 'tarefa' as const,
			id: t.id,
			titulo: t.title,
			excluidoEm: t.deletedAt ?? 0,
			detalhe: t.dueDate ?? null,
		})),
		...projetos.map((p) => ({
			tipo: 'projeto' as const,
			id: p.id,
			titulo: p.name,
			excluidoEm: p.deletedAt ?? 0,
			detalhe: p.categoria ?? null,
		})),
		...lembretes.map((l) => ({
			tipo: 'lembrete' as const,
			id: l.id,
			titulo: l.text,
			excluidoEm: l.deletedAt ?? 0,
			detalhe: null,
		})),
		...eventos.map((e) => ({
			tipo: 'evento' as const,
			id: e.id,
			titulo: e.title,
			excluidoEm: e.deletedAt ?? 0,
			detalhe: new Date(e.startAt).toLocaleDateString('pt-BR'),
		})),
		...habitos.map((h) => ({
			tipo: 'habito' as const,
			id: h.id,
			titulo: h.title,
			excluidoEm: h.deletedAt ?? 0,
			detalhe: null,
		})),
	]

	return itens.sort(maisRecentePrimeiro)
}

/** Devolve o item à lista de onde saiu. */
export async function restaurarDaLixeira(
	tipo: TipoNaLixeira,
	id: string,
	database: NexoDatabase = db,
): Promise<void> {
	switch (tipo) {
		case 'tarefa':
			return restaurarTask(id, database)
		case 'projeto':
			return restaurarProject(id, database)
		case 'lembrete':
			return restaurarReminder(id, database)
		case 'evento':
			return restaurarEvento(id, database)
		case 'habito':
			return restaurarHabito(id, database)
	}
}

/**
 * Apaga de vez. Irreversível — a tela pede confirmação antes.
 *
 * Projeto apaga junto o que é dele (tarefas já excluídas): deixar
 * órfão um registro cujo pai não existe mais não ajuda ninguém.
 */
export async function apagarDeVez(
	tipo: TipoNaLixeira,
	id: string,
	database: NexoDatabase = db,
): Promise<void> {
	switch (tipo) {
		case 'tarefa':
			await database.tasks.delete(id)
			return
		case 'projeto': {
			const tarefas = await database.tasks.where('projectId').equals(id).toArray()
			await database.transaction('rw', [database.tasks, database.projects], async () => {
				await database.tasks.bulkDelete(tarefas.map((t) => t.id))
				await database.projects.delete(id)
			})
			return
		}
		case 'lembrete':
			await database.reminders.delete(id)
			return
		case 'evento':
			await database.events.delete(id)
			return
		case 'habito': {
			const registros = await database.habitLogs.where('habitId').equals(id).toArray()
			await database.transaction('rw', [database.habitLogs, database.habits], async () => {
				await database.habitLogs.bulkDelete(registros.map((r) => r.id))
				await database.habits.delete(id)
			})
			return
		}
	}
}

/** Observa a lixeira para a tela reagir a restaurar/apagar. */
export function useLixeira(): ItemDaLixeira[] | undefined {
	return useLiveQuery(() => listarLixeira(db), [])
}

/** Quantos itens estão na lixeira, para o selo do menu. */
export async function contarLixeira(database: NexoDatabase = db): Promise<number> {
	return (await listarLixeira(database)).length
}
