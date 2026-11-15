import type { NexoDatabase, Task } from '@/db/db'
import { db } from '@/db/db'
import { toDayKey } from '@/db/repo'

/**
 * Lotes — filtrar, pré-visualizar, executar, desfazer.
 *
 * ## Por que filtro e não lista de ids
 *
 * A ação de um item propõe `{ id }`. Em lote, enumerar 40 ids custa tokens,
 * erra (o modelo inventa) e não é auditável. Um **filtro declarativo** resolve
 * as três coisas: custo constante, determinismo (mesmo filtro, mesmo
 * resultado) e a pergunta "o que casou?" tem resposta.
 *
 * O modelo nunca vê a lista; o app nunca confia no que o modelo contou.
 *
 * ## A escada de risco
 *
 * As travas antigas (lista fechada, 5 itens, desfazer) foram desenhadas para
 * UM item. Em lote, um toque pode destruir mais do que qualquer bug:
 *
 *   1–5    → confirmação conforme autonomia
 *   6–20   → confirmar, com prévia e 3 exemplos
 *   21–100 → confirmar-forte: digitar o número de itens
 *   >100   → proibido: dividir
 *
 * E a regra dura: **exclusão em lote nunca é executável pela IA**, em nenhum
 * volume. Ela pode propor "arquivar", que é reversível.
 */

/** Filtro declarativo sobre tarefas. */
export interface FiltroDeTarefas {
	/** `atrasada` = dia anterior a hoje e aberta. */
	estado?: 'aberta' | 'concluida' | 'atrasada' | 'hoje' | 'semana' | 'sem-data'
	projetoId?: string | null
	/** Só tarefas com dia anterior a esta data (AAAA-MM-DD). */
	antesDe?: string
	/** Só tarefas com prioridade maior ou igual a este valor (0–3). */
	prioridadeMinima?: number
	/** Restringe ao texto do título. */
	contem?: string
	/** Restringe a uma etiqueta. */
	etiqueta?: string
	/** Ids explícitos, quando o usuário selecionou na tela. */
	ids?: string[]
}

export interface PreviaDeLote {
	filtro: FiltroDeTarefas
	/** Quantas tarefas casaram. */
	total: number
	/** Até três exemplos de título, para o usuário reconhecer o conjunto. */
	exemplos: string[]
	/** Risco calculado pelo volume. */
	risco: 'livre' | 'confirmar' | 'confirmar-forte' | 'proibido'
	/** Instrução para o usuário, quando precisa confirmar. */
	exigencia: string | null
}

export interface ResultadoDeLote {
	total: number
	aplicadas: number
	recusadas: Array<{ id: string; titulo: string; motivo: string }>
	/** Ids que mudaram, para o desfazer. */
	ids: string[]
}

/**
 * Resolve o filtro contra o banco.
 *
 * Funções puras sobre a lista, para o teste poder passar dados inventados e o
 * comportamento ser reproduzível.
 */
export function selecionarTarefas(tarefas: Task[], filtro: FiltroDeTarefas, hoje = toDayKey(new Date())): Task[] {
	const visiveis = tarefas.filter((tarefa) => tarefa.deletedAt == null)

	if (filtro.ids?.length) {
		const alvo = new Set(filtro.ids)
		return visiveis.filter((tarefa) => alvo.has(tarefa.id))
	}

	const semana = new Date(hoje)
	semana.setDate(semana.getDate() + 7)
	const fimDaSemana = toDayKey(semana)

	return visiveis.filter((tarefa) => {
		if (filtro.projetoId !== undefined) {
			const alvo = filtro.projetoId ?? null
			if ((tarefa.projectId ?? null) !== alvo) return false
		}

		if (filtro.contem) {
			const termo = filtro.contem.toLowerCase()
			if (!tarefa.title.toLowerCase().includes(termo)) return false
		}

		if (filtro.etiqueta) {
			if (!(tarefa.tags ?? []).includes(filtro.etiqueta)) return false
		}

		if (filtro.prioridadeMinima !== undefined) {
			if ((tarefa.priority ?? 0) < filtro.prioridadeMinima) return false
		}

		if (filtro.antesDe && !(tarefa.dueDate && tarefa.dueDate < filtro.antesDe)) return false

		switch (filtro.estado) {
			case 'aberta':
				if (tarefa.done) return false
				break
			case 'concluida':
				if (!tarefa.done) return false
				break
			case 'atrasada':
				if (tarefa.done || !tarefa.dueDate || tarefa.dueDate >= hoje) return false
				break
			case 'hoje':
				if (tarefa.done || tarefa.dueDate !== hoje) return false
				break
			case 'semana':
				if (tarefa.done || !tarefa.dueDate || tarefa.dueDate < hoje || tarefa.dueDate > fimDaSemana) {
					return false
				}
				break
			case 'sem-data':
				if (tarefa.done || tarefa.dueDate) return false
				break
			default:
				break
		}

		return true
	})
}

/** Risco pelo volume — a escada. */
export function riscoPorVolume(total: number): PreviaDeLote['risco'] {
	if (total === 0) return 'livre'
	if (total <= 5) return 'livre'
	if (total <= 20) return 'confirmar'
	if (total <= 100) return 'confirmar-forte'
	return 'proibido'
}

/** Monta a prévia: o que casou, com risco e exigência. */
export function preverLote(tarefas: Task[], filtro: FiltroDeTarefas, hoje?: string): PreviaDeLote {
	const casadas = selecionarTarefas(tarefas, filtro, hoje)
	const risco = riscoPorVolume(casadas.length)

	const exigencia =
		risco === 'confirmar'
			? `Confirme: ${casadas.length} itens serão alterados.`
			: risco === 'confirmar-forte'
				? `Digite ${casadas.length} para confirmar que são ${casadas.length} itens.`
				: risco === 'proibido'
					? `São ${casadas.length} itens — acima de 100. Divida em partes.`
					: null

	return {
		filtro,
		total: casadas.length,
		exemplos: casadas.slice(0, 3).map((tarefa) => tarefa.title),
		risco,
		exigencia,
	}
}

export type OperacaoDeLote =
	| { tipo: 'mover'; para: string }
	| { tipo: 'concluir' }
	| { tipo: 'reabrir' }
	| { tipo: 'priorizar'; prioridade: 0 | 1 | 2 | 3 }
	| { tipo: 'etiquetar'; etiqueta: string }
	| { tipo: 'arquivar' }

/**
 * Aplica uma operação a um conjunto já filtrado.
 *
 * Executa item a item e **reporta o que falhou**, em vez de fingir atomicidade:
 * se o item 17 é inválido, os 16 anteriores ficaram feitos e o usuário precisa
 * saber exatamente isso — não "erro no lote".
 */
export async function aplicarLote(
	ids: string[],
	operacao: OperacaoDeLote,
	database: NexoDatabase = db,
): Promise<ResultadoDeLote> {
	const recusadas: ResultadoDeLote['recusadas'] = []
	const aplicadas: string[] = []

	for (const id of ids) {
		try {
			const tarefa = await database.tasks.get(id)
			if (!tarefa || tarefa.deletedAt) {
				recusadas.push({ id, titulo: '—', motivo: 'Não existe mais.' })
				continue
			}

			switch (operacao.tipo) {
				case 'mover': {
					if (!/^\d{4}-\d{2}-\d{2}$/.test(operacao.para)) {
						recusadas.push({ id, titulo: tarefa.title, motivo: 'Data inválida.' })
						continue
					}
					await database.tasks.update(id, {
						dueDate: operacao.para,
						updatedAt: Date.now(),
					})
					aplicadas.push(id)
					break
				}

				case 'concluir': {
					if (tarefa.done) {
						recusadas.push({ id, titulo: tarefa.title, motivo: 'Já estava concluída.' })
						continue
					}
					await database.tasks.update(id, {
						done: true,
						doneAt: Date.now(),
						updatedAt: Date.now(),
					})
					aplicadas.push(id)
					break
				}

				case 'reabrir': {
					if (!tarefa.done) {
						recusadas.push({ id, titulo: tarefa.title, motivo: 'Já estava aberta.' })
						continue
					}
					await database.tasks.update(id, {
						done: false,
						doneAt: null,
						updatedAt: Date.now(),
					})
					aplicadas.push(id)
					break
				}

				case 'priorizar': {
					await database.tasks.update(id, {
						priority: operacao.prioridade,
						updatedAt: Date.now(),
					})
					aplicadas.push(id)
					break
				}

				case 'etiquetar': {
					const etiqueta = operacao.etiqueta.trim()
					if (!etiqueta) {
						recusadas.push({ id, titulo: tarefa.title, motivo: 'Etiqueta vazia.' })
						continue
					}
					const atuais = tarefa.tags ?? []
					if (atuais.includes(etiqueta)) {
						recusadas.push({ id, titulo: tarefa.title, motivo: `Já tinha #${etiqueta}.` })
						continue
					}
					await database.tasks.update(id, {
						tags: [...atuais, etiqueta],
						updatedAt: Date.now(),
					})
					aplicadas.push(id)
					break
				}

				case 'arquivar': {
					// Arquivar = "algum dia": sai da lista do dia e não cobra prazo.
					await database.tasks.update(id, {
						someday: true,
						updatedAt: Date.now(),
					})
					aplicadas.push(id)
					break
				}
			}
		} catch (causa) {
			recusadas.push({
				id,
				titulo: '—',
				motivo: causa instanceof Error ? causa.message : 'Falhou.',
			})
		}
	}

	/*
	 * O diário recebe UM fato do lote, não um por item.
	 *
	 * Sem isso, aplicar uma operação a 40 tarefas gravaria 40 linhas no diário
	 * — e o diário já é a tabela que mais cresce. `registrarFato` aceita um
	 * resumo; o "antes" detalhado fica em `aiActions`, que é podado por prazo.
	 */
	if (aplicadas.length > 0) {
		const { registrarFato } = await import('./diario')
		await registrarFato(
			{
				tipo: 'task',
				entidade: aplicadas[0]!,
				acao: 'outro',
				depois: { lote: operacao.tipo, aplicadas: aplicadas.length },
			},
			database,
		)
	}

	return { total: ids.length, aplicadas: aplicadas.length, recusadas, ids: aplicadas }
}

/**
 * Desfaz um lote de tarefas restaurando o estado anterior.
 *
 * Recebe o mapa `id → antes` que o chamador guardou. Simples de propósito: o
 * desfazer de lote não pode depender de reconstruir a operação, porque o
 * banco mudou depois.
 */
export async function desfazerLoteDeTarefas(
	antes: Array<{ id: string; tarefa: Task }>,
	database: NexoDatabase = db,
): Promise<number> {
	let restauradas = 0

	for (const { id, tarefa } of antes) {
		try {
			await database.tasks.update(id, {
				done: tarefa.done,
				doneAt: tarefa.doneAt ?? null,
				priority: tarefa.priority ?? 0,
				dueDate: tarefa.dueDate ?? null,
				someday: tarefa.someday ?? false,
				tags: tarefa.tags ?? [],
				deletedAt: tarefa.deletedAt ?? null,
				updatedAt: Date.now(),
			})
			restauradas++
		} catch {
			// Item sumiu: o desfazer segue com os outros.
		}
	}

	return restauradas
}
