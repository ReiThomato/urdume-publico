import type { Task, TipoTarefa } from '@/db/db'

/**
 * Leitura do tipo da tarefa.
 *
 * O campo nasceu depois dos dados: registros antigos não têm `tipo`. Por isso
 * a leitura nunca confia no campo — ausente vale `tarefa`, que é exatamente o
 * comportamento que essas linhas tinham.
 *
 * Está aqui, e não dentro de cada tela, porque a regra é uma só e quatro telas
 * dependem dela (Início, Tarefas, Projeto, Jarvis). Duplicar a condição foi o
 * que fez "algum dia" divergir entre a lista e o painel no passado.
 */
export function tipoDaTarefa(tarefa: Pick<Task, 'tipo' | 'someday'>): TipoTarefa {
	const tipo = tarefa.tipo
	if (tipo === 'lembrete' || tipo === 'ideia') return tipo
	// Registro anterior ao campo: "algum dia" marcado é o antigo `ideia`.
	if (tipo === undefined && tarefa.someday) return 'ideia'
	return 'tarefa'
}

/**
 * A tarefa pode vencer?
 *
 * Só `tarefa` cobra o dia. Lembrete e ideia não têm prazo por definição: o dia
 * seguinte não os transforma em atrasados, e o Jarvis não deve gerar sinal de
 * atraso por causa deles.
 */
export function cobraPrazo(tarefa: Pick<Task, 'tipo' | 'someday'>): boolean {
	return tipoDaTarefa(tarefa) === 'tarefa'
}

/**
 * A tarefa está atrasada AGORA?
 *
 * Uma função para todas as telas. Antes cada tela repetia
 * `t.dueDate && t.dueDate < hoje`, e bastava uma esquecer o tipo para um
 * lembrete aparecer como atrasado.
 */
export function estaAtrasada(
	tarefa: Pick<Task, 'tipo' | 'done' | 'dueDate' | 'deadline' | 'someday'>,
	hoje: string,
): boolean {
	if (tarefa.done || tarefa.someday) return false
	if (!cobraPrazo(tarefa)) return false
	return Boolean(
		(tarefa.dueDate && tarefa.dueDate < hoje) || (tarefa.deadline && tarefa.deadline < hoje),
	)
}

/** Rótulo curto para a linha e para o seletor. */
export const ROTULO_DO_TIPO: Record<TipoTarefa, { nome: string; descricao: string }> = {
	tarefa: {
		nome: 'Tarefa',
		descricao: 'Tem dia para fazer. Se o dia passar, aparece como atrasada.',
	},
	lembrete: {
		nome: 'Lembrete',
		descricao: 'Sem prazo. Existe para ser lembrado, não para vencer.',
	},
	ideia: {
		nome: 'Ideia',
		descricao: 'Algo para fazer algum dia. Fica guardado sem cobrar.',
	},
}

export const TIPOS_DE_TAREFA: TipoTarefa[] = ['tarefa', 'lembrete', 'ideia']
