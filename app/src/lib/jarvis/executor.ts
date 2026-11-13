import { db } from '@/db/db'
import type { AiActionLog, NexoDatabase } from '@/db/db'
import { createId } from '@/db/id'
import { toDayKey } from '@/db/repo'
import {
	addMarco,
	createProject,
	createReminder,
	createTask,
	toggleMarco,
	toggleTask,
	updateProject,
	updateTask,
} from '@/db/repo'
import { criarEvento, excluirEvento } from '@/db/eventos'
import { alternarDiaHabito, criarHabito } from '@/db/habitos'
import { criarAnotacao, organizarProjeto } from '@/db/repo'
import type { Priority } from '@/db/db'
import { comOrigem, registrarFato } from './diario'
import { gravarMemoria } from './estado'
import { idDeNotificacao } from './ponte'
import type { Aviso } from './notificacoes'
import type { AcaoDaIA } from './ia'

/**
 * "15:30" → 930 minutos desde 00:00.
 *
 * O banco guarda `startMin` (minutos do dia) e não uma data, porque a hora de
 * uma tarefa é sempre no dia dela. Receber "15:30" do modelo e gravar como
 * data seria criar um segundo lugar de verdade para o mesmo dado.
 */
function horaParaMinutos(valor: unknown): number | null {
	if (typeof valor !== 'string') return null
	const achado = /^(\d{1,2}):(\d{2})$/.exec(valor.trim())
	if (!achado) return null
	const hora = Number(achado[1])
	const minuto = Number(achado[2])
	if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null
	return hora * 60 + minuto
}

/**
 * Executor de ações da IA.
 *
 * A IA propõe; este arquivo decide se pode. Toda a autoridade está aqui, não no
 * prompt — um modelo que "promete" não excluir não é garantia de nada; um
 * executor que não tem função de excluir é.
 *
 * Quatro travas:
 *
 * 1. **Lista fechada** de tipos. Não existe função por nome, `eval` nem SQL.
 * 2. **Risco por ação**: alcance × reversibilidade × área. O nível de autonomia
 *    do usuário define o que passa sem confirmação.
 * 3. **Limite de lote**: no máximo 5 itens por execução. Pedido maior é
 *    recusado inteiro (não executa "a metade que dava").
 * 4. **Desfazer de 24 h**: guarda o estado anterior de tudo que tocou.
 *
 * O que NUNCA é executável, em nenhum nível: excluir, apagar, mexer em backup,
 * mudar configuração, mudar autonomia. Esses tipos nem existem no vocabulário.
 */

export type Risco = 'livre' | 'confirmar' | 'proibido'

export interface AvaliacaoDaAcao {
	acao: AcaoDaIA
	risco: Risco
	/** Texto humano do que vai acontecer, com antes → depois. */
	previa: string
	/** Por que foi recusada, quando for. */
	recusa: string | null
}

/** Itens que uma ação toca. Usado para o limite de lote. */
function alcance(acao: AcaoDaIA): number {
	switch (acao.tipo) {
		case 'criar_evento':
		case 'criar_marco':
		case 'editar_projeto':
		case 'concluir_tarefa':
		case 'editar_tarefa':
		case 'criar_tarefa':
			return 1
		default:
			return 1
	}
}

/**
 * Valida e classifica uma ação sem executar nada.
 *
 * É o que a folha de confirmação mostra: a prévia vem daqui, não do texto do
 * modelo. Se o modelo mentir na explicação, a prévia continua sendo a verdade.
 */
export function avaliarAcao(
	acao: AcaoDaIA,
	autonomia: 'conservador' | 'equilibrado' | 'confiante',
): AvaliacaoDaAcao {
	const dados = acao.dados ?? {}

	// Campos obrigatórios por tipo. Sem eles, nem tenta.
	const exigir = (campo: string): string | null => {
		const valor = dados[campo]
		return typeof valor === 'string' && valor.trim() ? valor.trim() : null
	}

	switch (acao.tipo) {
		case 'criar_tarefa': {
			const titulo = exigir('titulo')
			if (!titulo) return { acao, risco: 'proibido', previa: '', recusa: 'Tarefa sem título.' }
			const dia = typeof dados.dia === 'string' ? ` para ${dados.dia}` : ''
			const hora =
				typeof dados.hora === 'string' && /^\d{1,2}:\d{2}$/.test(dados.hora)
					? ` às ${dados.hora}`
					: ''
			const prazo = typeof dados.prazo === 'string' ? `, prazo ${dados.prazo}` : ''
			return {
				acao,
				// No modo conservador, criar tarefa ainda pede confirmação: é o
				// padrão que menos surpreende. Equilibrado e confiante criam direto.
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Criar tarefa “${titulo}”${dia}${hora}${prazo}.`,
				recusa: null,
			}
		}

		case 'editar_tarefa': {
			const id = exigir('id')
			if (!id) return { acao, risco: 'proibido', previa: '', recusa: 'Tarefa não identificada.' }
			const mudancas = ['dia', 'titulo', 'prioridade', 'hora', 'prazo'].filter(
				(campo) => dados[campo] !== undefined,
			)
			if (mudancas.length === 0) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Nada para mudar.' }
			}
			return {
				acao,
				// Alterar algo que já existe é sempre confirmação, em todos os níveis.
				risco: 'confirmar',
				previa: `Editar tarefa ${id}: ${mudancas.map((campo) => `${campo} → ${String(dados[campo])}`).join(', ')}.`,
				recusa: null,
			}
		}

		case 'concluir_tarefa': {
			const id = exigir('id')
			if (!id) return { acao, risco: 'proibido', previa: '', recusa: 'Tarefa não identificada.' }
			return {
				acao,
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Marcar a tarefa ${id} como concluída.`,
				recusa: null,
			}
		}

		case 'criar_marco': {
			const projetoId = exigir('projetoId')
			const titulo = exigir('titulo')
			if (!projetoId || !titulo) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Marco sem projeto ou sem nome.' }
			}
			return {
				acao,
				risco: 'confirmar',
				previa: `Criar marco “${titulo}” no projeto ${projetoId}.`,
				recusa: null,
			}
		}

		case 'editar_projeto': {
			const id = exigir('id')
			if (!id) return { acao, risco: 'proibido', previa: '', recusa: 'Projeto não identificado.' }
			// Autonomia nunca autoriza mexer em configuração do projeto sozinha.
			return {
				acao,
				risco: 'confirmar',
				previa: `Alterar projeto ${id}: ${['prazo', 'status']
					.filter((campo) => dados[campo] !== undefined)
					.map((campo) => `${campo} → ${String(dados[campo])}`)
					.join(', ')}.`,
				recusa: null,
			}
		}

		case 'criar_projeto': {
			const nome = exigir('nome')
			if (!nome) return { acao, risco: 'proibido', previa: '', recusa: 'Projeto sem nome.' }
			return {
				acao,
				// Criar um projeto vazio é reversível e não mexe em nada existente.
				// No conservador ainda pede confirmação, como criar tarefa.
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Criar projeto “${nome}”${typeof dados.prazo === 'string' ? ` com prazo em ${dados.prazo}` : ''}.`,
				recusa: null,
			}
		}

		case 'concluir_marco': {
			const projetoId = exigir('projetoId')
			const marcoId = exigir('marcoId')
			if (!projetoId || !marcoId) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Marco não identificado.' }
			}
			return {
				acao,
				risco: 'confirmar',
				previa: `Marcar o marco ${marcoId} do projeto ${projetoId} como atingido.`,
				recusa: null,
			}
		}

		case 'concluir_evento': {
			const id = exigir('id')
			if (!id) return { acao, risco: 'proibido', previa: '', recusa: 'Evento não identificado.' }
			return {
				acao,
				// Concluir um compromisso é registro, não alteração de horário.
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Marcar o compromisso ${id} como cumprido.`,
				recusa: null,
			}
		}

		case 'criar_lembrete': {
			const texto = exigir('texto')
			if (!texto) return { acao, risco: 'proibido', previa: '', recusa: 'Lembrete sem texto.' }
			return {
				acao,
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Criar lembrete “${texto}”.`,
				recusa: null,
			}
		}

		case 'avisar': {
			const titulo = exigir('titulo')
			const corpo = exigir('corpo')
			if (!titulo || !corpo) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Aviso sem título ou corpo.' }
			}
			if (typeof dados.quandoEm !== 'number') {
				return { acao, risco: 'proibido', previa: '', recusa: 'Aviso sem horário.' }
			}
			const quando = new Date(dados.quandoEm)
			return {
				acao,
				// Um aviso não altera dado nenhum do usuário e pode ser cancelado:
				// é o mesmo risco de um lembrete. Ainda assim, no modo
				// conservador, a IA só avisa depois de confirmação.
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Avisar em ${quando.toLocaleString('pt-BR')}: “${titulo}” — ${corpo}`,
				recusa: null,
			}
		}

		case 'criar_habito': {
			const titulo = exigir('titulo')
			if (!titulo) return { acao, risco: 'proibido', previa: '', recusa: 'Hábito sem nome.' }
			return {
				acao,
				// Hábito é rotina de longo prazo: sempre confirma, em todos os níveis.
				risco: 'confirmar',
				previa: `Criar hábito “${titulo}”${typeof dados.meta === 'number' ? ` com meta de ${dados.meta}` : ''}.`,
				recusa: null,
			}
		}

		case 'registrar_habito': {
			const id = exigir('id')
			if (!id) return { acao, risco: 'proibido', previa: '', recusa: 'Hábito não identificado.' }
			return {
				acao,
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Registrar o hábito ${id} como cumprido${typeof dados.dia === 'string' ? ` em ${dados.dia}` : ' hoje'}.`,
				recusa: null,
			}
		}

		case 'anotar_em_projeto': {
			const id = exigir('id')
			const texto = exigir('texto')
			if (!id || !texto) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Anotação sem projeto ou sem texto.' }
			}
			return {
				acao,
				// Mexer nas notas é mudar o registro do usuário: confirma.
				risco: 'confirmar',
				previa: `Acrescentar uma linha às notas do projeto ${id}: “${texto.slice(0, 80)}${texto.length > 80 ? '…' : ''}”.`,
				recusa: null,
			}
		}

		case 'anotar_projeto': {
			const projetoId = exigir('projetoId')
			const texto = exigir('texto')
			if (!projetoId || !texto) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: 'Anotação sem projeto ou sem texto.',
				}
			}
			const quando =
				typeof dados.em === 'number' ? new Date(dados.em).toLocaleString('pt-BR') : 'agora'
			return {
				acao,
				// Criar uma anotação nova não altera nada existente e pode ser
				// apagada; no conservador, ainda pede confirmação.
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Anotar no projeto ${projetoId} em ${quando}: “${texto.slice(0, 80)}${texto.length > 80 ? '…' : ''}”.`,
				recusa: null,
			}
		}

		case 'organizar_projeto': {
			const id = exigir('id')
			if (!id) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Projeto não identificado.' }
			}
			const partes: string[] = []
			if (dados.categoria !== undefined) {
				partes.push(`categoria → ${dados.categoria === null ? 'nenhuma' : String(dados.categoria)}`)
			}
			if (dados.prioridade !== undefined) partes.push(`prioridade → ${String(dados.prioridade)}`)
			if (partes.length === 0) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Nada para mudar.' }
			}
			return {
				acao,
				risco: 'confirmar',
				previa: `Organizar projeto ${id}: ${partes.join(', ')}.`,
				recusa: null,
			}
		}

		case 'criar_evento': {
			const titulo = exigir('titulo')
			const inicio = Number(dados.inicio)
			const fim = Number(dados.fim)
			if (!titulo || !Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Evento com horário inválido.' }
			}
			return {
				acao,
				risco: 'confirmar',
				previa: `Criar evento “${titulo}” em ${new Date(inicio).toLocaleString('pt-BR')}.`,
				recusa: null,
			}
		}

		default:
			return {
				acao,
				risco: 'proibido',
				previa: '',
				recusa: 'Tipo de ação não permitido.',
			}
	}
}

/** Avalia o lote inteiro: um item inválido recusa o lote? Não — recusa só ele. */
export function avaliarLote(
	acoes: AcaoDaIA[],
	autonomia: 'conservador' | 'equilibrado' | 'confiante',
): { avaliacoes: AvaliacaoDaAcao[]; erroDoLote: string | null } {
	if (acoes.length === 0) {
		return { avaliacoes: [], erroDoLote: null }
	}

	if (acoes.length > 5) {
		return {
			avaliacoes: [],
			erroDoLote: `A IA propôs ${acoes.length} ações; o limite é 5 por vez. Nada foi executado.`,
		}
	}

	const total = acoes.reduce((soma, acao) => soma + alcance(acao), 0)
	if (total > 5) {
		return {
			avaliacoes: [],
			erroDoLote: `O lote toca ${total} itens; o limite é 5. Nada foi executado.`,
		}
	}

	return { avaliacoes: acoes.map((acao) => avaliarAcao(acao, autonomia)), erroDoLote: null }
}

export interface ResultadoExecucao {
	executadas: number
	recusadas: number
	erro: string | null
	/** Id do lote, para desfazer. */
	loteId: string | null
}

/**
 * Executa as ações que já foram confirmadas.
 *
 * Só recebe o que passou por `avaliarLote` e pelo "Sim" do usuário. Mesmo
 * assim, revalida: entre a prévia e o toque, o registro pode ter mudado.
 */
export async function executarLote(
	acoes: AcaoDaIA[],
	database: NexoDatabase = db,
): Promise<ResultadoExecucao> {
	const loteId = createId()
	const antes: unknown[] = []
	let executadas = 0
	let recusadas = 0

	for (const acao of acoes) {
		const resultado = await comOrigem('ia', async () => {
			try {
				const snapshot = await executarUma(acao, database)
				if (!snapshot) return false
				antes.push(snapshot)
				return true
			} catch (causa) {
				console.warn('Jarvis: ação falhou.', causa)
				return false
			}
		})

		if (resultado) executadas++
		else recusadas++
	}

	if (executadas === 0) {
		return { executadas: 0, recusadas, erro: 'Nenhuma ação pôde ser executada.', loteId: null }
	}

	const registro: AiActionLog = {
		id: loteId,
		em: Date.now(),
		tipo: 'lote',
		resumo: `${executadas} ${executadas === 1 ? 'ação' : 'ações'} da IA`,
		antes,
		executado: true,
		desfeitoEm: null,
		desfazerAte: Date.now() + 24 * 3_600_000,
	}
	await database.aiActions.put(registro)

	await registrarFato(
		{
			tipo: 'ia',
			entidade: loteId,
			acao: 'criar',
			depois: { acoes, executadas },
			origem: 'ia',
		},
		database,
	)

	return { executadas, recusadas, erro: null, loteId }
}

/** Executa uma ação e devolve o estado anterior (ou null se nem existia). */
async function avisarAgora(aviso: Aviso): Promise<void> {
	// Import dinâmico: o executor também roda em teste (Node), onde não existe
	// plugin nativo. `agendar` já devolve erro limpo nesse caso.
	const { agendar } = await import('./notificacoes')
	await agendar([aviso]).catch(() => undefined)
}

async function executarUma(acao: AcaoDaIA, database: NexoDatabase): Promise<unknown | null> {
	const dados = acao.dados

	switch (acao.tipo) {
		case 'criar_tarefa': {
			const tarefa = await createTask(
				{
					title: String(dados.titulo ?? ''),
					dueDate: typeof dados.dia === 'string' ? dados.dia : toDayKey(new Date()),
					projectId: typeof dados.projetoId === 'string' ? dados.projetoId : null,
					priority: typeof dados.prioridade === 'number' ? (dados.prioridade as 0 | 1 | 2 | 3) : 0,
					// Hora e prazo existem porque sem eles "me avise às 15h" virava
					// uma tarefa sem horário — e o alarme nunca existia. A hora entra
					// como minutos do dia, que é o que o banco guarda.
					startMin: horaParaMinutos(dados.hora),
					deadline: typeof dados.prazo === 'string' ? dados.prazo : null,
				},
				database,
			)
			return { tipo: 'task', id: tarefa.id, antes: null, criada: tarefa }
		}

		case 'editar_tarefa': {
			const id = String(dados.id ?? '')
			const atual = await database.tasks.get(id)
			if (!atual || atual.deletedAt) return null

			const patch: Record<string, unknown> = {}
			if (typeof dados.titulo === 'string') patch.title = dados.titulo
			if (typeof dados.dia === 'string') patch.dueDate = dados.dia
			if (typeof dados.prioridade === 'number') patch.priority = dados.prioridade
			if (dados.hora === null) patch.startMin = null
			else if (typeof dados.hora === 'string') patch.startMin = horaParaMinutos(dados.hora)
			if (typeof dados.prazo === 'string') patch.deadline = dados.prazo

			await updateTask(id, patch, database)
			return { tipo: 'task', id, antes: atual }
		}

		case 'concluir_tarefa': {
			const id = String(dados.id ?? '')
			const atual = await database.tasks.get(id)
			if (!atual || atual.deletedAt || atual.done) return null

			await toggleTask(id, true, database)
			return { tipo: 'task', id, antes: atual }
		}

		case 'criar_marco': {
			const projetoId = String(dados.projetoId ?? '')
			const projeto = await database.projects.get(projetoId)
			if (!projeto || projeto.deletedAt) return null

			await addMarco(
				projetoId,
				{ titulo: String(dados.titulo ?? ''), data: typeof dados.data === 'string' ? dados.data : null },
				database,
			)
			return { tipo: 'project', id: projetoId, antes: projeto }
		}

		case 'editar_projeto': {
			const id = String(dados.id ?? '')
			const atual = await database.projects.get(id)
			if (!atual || atual.deletedAt) return null

			const patch: Record<string, unknown> = {}
			if (typeof dados.prazo === 'string') patch.prazo = dados.prazo
			if (dados.status === 'ativo' || dados.status === 'pausado' || dados.status === 'concluido') {
				patch.status = dados.status
			}

			await updateProject(id, patch, database)
			return { tipo: 'project', id, antes: atual }
		}

		case 'criar_evento': {
			const evento = await criarEvento(
				{
					title: String(dados.titulo ?? ''),
					startAt: Number(dados.inicio),
					endAt: Number(dados.fim),
				},
				database,
			)
			return { tipo: 'event', id: evento.id, antes: null, criado: evento }
		}

		case 'criar_projeto': {
			const projeto = await createProject({ name: String(dados.nome ?? '') }, database)
			if (typeof dados.descricao === 'string' || typeof dados.prazo === 'string') {
				await updateProject(
					projeto.id,
					{
						...(typeof dados.descricao === 'string' ? { descricao: dados.descricao } : {}),
						...(typeof dados.prazo === 'string' ? { prazo: dados.prazo } : {}),
					},
					database,
				)
			}
			return { tipo: 'project', id: projeto.id, antes: null, criado: projeto }
		}

		case 'concluir_marco': {
			const projetoId = String(dados.projetoId ?? '')
			const marcoId = String(dados.marcoId ?? '')
			const projeto = await database.projects.get(projetoId)
			if (!projeto || projeto.deletedAt) return null
			const marco = (projeto.marcos ?? []).find((entrada) => entrada.id === marcoId)
			if (!marco || marco.feito) return null

			await toggleMarco(projetoId, marcoId, database)
			return { tipo: 'project', id: projetoId, antes: projeto }
		}

		case 'concluir_evento': {
			const id = String(dados.id ?? '')
			const evento = await database.events.get(id)
			if (!evento || evento.deletedAt) return null

			// Evento não tem campo "feito". Concluir = encerrar o compromisso,
			// com exclusão SUAVE: sai da agenda, fica no diário, pode voltar pelo
			// desfazer. Nada é apagado de verdade.
			//
			// A cópia do "antes" precisa ser feita ANTES da escrita: o Dexie
			// devolve o mesmo objeto que atualiza no banco, e sem o clone o
			// "antes" ficava com `deletedAt` já preenchido — desfazer não
			// restaurava nada. Era um bug real, pego pelo teste.
			const antes = { ...evento }
			await excluirEvento(id, database)
			return { tipo: 'event', id, antes }
		}

		case 'criar_lembrete': {
			const lembrete = await createReminder(
				{
					text: String(dados.texto ?? ''),
					dueAt: typeof dados.quandoEm === 'number' ? dados.quandoEm : null,
				},
				database,
			)
			return { tipo: 'reminder', id: lembrete.id, antes: null, criado: lembrete }
		}

		/**
		 * Aviso próprio da IA: um ponto de notificação que não é tarefa nem
		 * lembrete na lista do usuário.
		 *
		 * Guardado em `aiMemory` sob `aviso:<id>` e agendado na hora. Existe
		 * porque a IA não tinha nenhuma forma de falar com o usuário fora do
		 * app: podia criar tarefa, mas não dizer "o relatório de outubro está
		 * pronto", nem "posso arquivar este projeto?", nem "terminei o que você
		 * pediu". Sem isso, a autonomia dela terminava na tela.
		 */
		case 'avisar': {
			const titulo = String(dados.titulo ?? '').trim()
			const corpo = String(dados.corpo ?? '').trim()
			const quandoEm = Number(dados.quandoEm)
			if (!titulo || !corpo || !Number.isFinite(quandoEm)) return null

			// O horário precisa estar no futuro: um aviso para ontem toca agora e
			// ensina o usuário a ignorar notificação.
			const em = Math.max(quandoEm, Date.now() + 60_000)
			const chave = `aviso:${createId()}`

			await gravarMemoria(
				chave,
				{
					titulo,
					corpo,
					em,
					nivel: typeof dados.nivel === 'string' ? dados.nivel : 'info',
				},
				database,
			)

			await avisarAgora({
				id: idDeNotificacao(chave),
				titulo,
				corpo,
				em,
				chave,
			})

			return { tipo: 'aviso', id: chave, antes: null, criado: { titulo, em } }
		}

		case 'criar_habito': {
			const habito = await criarHabito(
				{
					title: String(dados.titulo ?? ''),
					dias: Array.isArray(dados.dias) ? (dados.dias as number[]) : [],
					targetValue: typeof dados.meta === 'number' ? dados.meta : 0,
					targetUnit: typeof dados.unidade === 'string' ? dados.unidade : '',
				},
				database,
			)
			return { tipo: 'habit', id: habito.id, antes: null, criado: habito }
		}

		case 'registrar_habito': {
			const id = String(dados.id ?? '')
			const habito = await database.habits.get(id)
			if (!habito || habito.deletedAt) return null

			const dia = typeof dados.dia === 'string' ? dados.dia : toDayKey(new Date())
			const marcou = await alternarDiaHabito(habito, dia, database)
			// Alternou para "desmarcado": não era conclusão, então não conta.
			if (!marcou) return null

			return { tipo: 'habitLog', id: `${id}:${dia}`, antes: null, criado: { habitId: id, dia } }
		}

		case 'anotar_em_projeto': {
			const id = String(dados.id ?? '')
			const texto = String(dados.texto ?? '').trim()
			const projeto = await database.projects.get(id)
			if (!projeto || projeto.deletedAt || !texto) return null

			// Acrescenta no fim, com marcador "·": o usuário precisa distinguir
			// o que escreveu do que a IA propôs e ele aprovou.
			const atual = projeto.notas?.trim() ? `${projeto.notas.trim()}\n` : ''
			await updateProject(id, { notas: `${atual}· ${texto}` }, database)
			return { tipo: 'project', id, antes: projeto }
		}

		/**
		 * Anotação datada num projeto.
		 *
		 * Diferente de `anotar_em_projeto`, que escreve no resumo corrido: aqui
		 * é uma linha própria, com data e hora, que o usuário pode editar ou
		 * apagar sem tocar nas outras. É o formato novo, e a IA precisa dele —
		 * senão ficaria presa ao campo antigo enquanto o usuário usa as
		 * anotações.
		 */
		case 'anotar_projeto': {
			const projetoId = String(dados.projetoId ?? '')
			const corpo = String(dados.texto ?? '').trim()
			const projeto = await database.projects.get(projetoId)
			if (!projeto || projeto.deletedAt || !corpo) return null

			const nota = await criarAnotacao(
				{
					projectId: projetoId,
					title: typeof dados.titulo === 'string' ? dados.titulo : null,
					body: corpo,
					em: typeof dados.em === 'number' ? dados.em : Date.now(),
				},
				database,
			)
			return { tipo: 'projectNote', id: nota.id, antes: null, criado: nota }
		}

		/**
		 * Categoria e prioridade do projeto.
		 *
		 * A IA precisa conseguir organizar o que ela mesma cria — senão o
		 * usuário teria de arrumar à mão cada projeto sugerido por ela. Isto é
		 * reversível e de baixo alcance, então segue a autonomia normal.
		 */
		case 'organizar_projeto': {
			const id = String(dados.id ?? '')
			const projeto = await database.projects.get(id)
			if (!projeto || projeto.deletedAt) return null

			const patch: { categoria?: string | null; priority?: Priority } = {}
			if (dados.categoria === null) patch.categoria = null
			else if (typeof dados.categoria === 'string') patch.categoria = dados.categoria
			if (typeof dados.prioridade === 'number' && dados.prioridade >= 0 && dados.prioridade <= 3) {
				patch.priority = dados.prioridade as Priority
			}

			if (Object.keys(patch).length === 0) return null

			const antes = { ...projeto }
			await organizarProjeto(id, patch, database)
			return { tipo: 'project', id, antes }
		}

		default:
			return null
	}
}

/**
 * Desfaz um lote, restaurando o estado anterior de cada item.
 *
 * Criar não tem "antes": desfazer uma criação significa excluir o que a IA
 * criou. Isso é permitido AQUI — desfazer é a válvula de escape que torna a
 * autonomia aceitável — mas continua sendo o modelo escolhendo; a exclusão
 * nunca parte de uma resposta da IA.
 */
export async function desfazerLote(
	loteId: string,
	database: NexoDatabase = db,
): Promise<{ ok: boolean; erro: string | null }> {
	const registro = await database.aiActions.get(loteId)
	if (!registro) return { ok: false, erro: 'Este lote não existe mais.' }
	if (registro.desfeitoEm) return { ok: false, erro: 'Este lote já foi desfeito.' }
	if (Date.now() > registro.desfazerAte) {
		return { ok: false, erro: 'O prazo de desfazer (24 h) passou.' }
	}

	const agora = Date.now()

	await comOrigem('ia', async () => {
		for (const item of registro.antes as Array<{
			tipo: string
			id: string
			antes: unknown | null
			criado?: unknown
		}>) {
			/**
			 * Duas situações, e elas exigem ações opostas:
			 *
			 * - **criado pela IA** (`antes` nulo): desfazer = tirar do caminho,
			 *   com exclusão suave (nada é apagado de verdade).
			 * - **alterado pela IA**: desfazer = restaurar o registro anterior.
			 *
			 * A tabela de hábito tem um caso a mais: `habitLog` é o registro do
			 * dia, não o hábito. Criar um registro é o efeito a desfazer.
			 */
			// Tipagem frouxa de propósito: cada tabela tem seu tipo de registro e
			// o patch vem do estado anterior gravado, que já era daquele tipo. O
			// Dexie valida a forma; aqui o que importa é escolher a tabela certa.
			type TabelaAtualizavel = {
				update: (id: string, patch: never) => Promise<unknown>
			}
			const tabelas: Record<string, () => TabelaAtualizavel> = {
				task: () => database.tasks as unknown as TabelaAtualizavel,
				project: () => database.projects as unknown as TabelaAtualizavel,
				event: () => database.events as unknown as TabelaAtualizavel,
				reminder: () => database.reminders as unknown as TabelaAtualizavel,
				page: () => database.pages as unknown as TabelaAtualizavel,
				habit: () => database.habits as unknown as TabelaAtualizavel,
			}

			if (item.tipo === 'habitLog') {
				// Id composto `habitId:dia`. Desfazer = desmarcar o dia.
				const [habitId, dia] = item.id.split(':')
				if (habitId && dia) {
					const habito = await database.habits.get(habitId)
					if (habito) await alternarDiaHabito(habito, dia, database)
				}
			} else {
				const tabela = tabelas[item.tipo]
				if (tabela) {
					// `deletedAt` é explícito nas duas pontas: um registro que
					// nasceu sem o campo (undefined) não voltaria a "não excluído"
					// só por espalhar o objeto anterior — o Dexie mantém o valor
					// que já está gravado. Foi o segundo bug que o teste pegou.
					const patch = item.antes
						? {
								...(item.antes as Record<string, unknown>),
								deletedAt: (item.antes as { deletedAt?: number | null }).deletedAt ?? null,
								updatedAt: agora,
							}
						: { deletedAt: agora, updatedAt: agora }
					await tabela().update(item.id, patch as never)
				}
			}

			await registrarFato(
				{ tipo: item.tipo, entidade: item.id, acao: 'restaurar', origem: 'ia' },
				database,
			)
		}
	})

	await database.aiActions.update(loteId, { desfeitoEm: agora })
	return { ok: true, erro: null }
}

/** Último lote desfazível ainda dentro do prazo. */
export async function ultimoLoteDesfazivel(
	database: NexoDatabase = db,
): Promise<AiActionLog | null> {
	const lotes = await database.aiActions.toArray()
	const agora = Date.now()
	return (
		lotes
			.filter((lote) => !lote.desfeitoEm && lote.desfazerAte > agora)
			.sort((a, b) => b.em - a.em)[0] ?? null
	)
}
