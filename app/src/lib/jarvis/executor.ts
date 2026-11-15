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
import { alternarDiaHabito, criarHabito, marcarDiaHabito } from '@/db/habitos'
import { criarAnotacao, organizarProjeto } from '@/db/repo'
import type { Priority } from '@/db/db'
import { aplicarLote, riscoPorVolume, selecionarTarefas } from './lotes'
import type { FiltroDeTarefas, OperacaoDeLote } from './lotes'
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
 * Valida uma data que veio do modelo.
 *
 * O modelo escreve "amanhã", "20/11/2026", "sexta" — e `createTask` normaliza
 * só string vazia. Uma data fora do formato `AAAA-MM-DD` entra no banco como
 * texto: `'amanhã' < '2026-11-14'` é falso, então a tarefa nunca atrasa; e
 * `'20/11/2026'` nunca casa com nenhuma comparação, então o prazo nunca avisa.
 * A tarefa fica invisível para a agenda para sempre.
 *
 * Devolve a data normalizada quando é válida, `null` quando não é. Quem chama
 * decide recusar a ação em vez de gravar lixo.
 */
export function diaValido(valor: unknown): string | null {
	if (typeof valor !== 'string') return null
	const texto = valor.trim()
	const achado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
	if (!achado) return null

	const ano = Number(achado[1])
	const mes = Number(achado[2])
	const dia = Number(achado[3])
	if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null

	// Rejeita 31/02 e afins: a data tem de existir no calendário.
	const data = new Date(ano, mes - 1, dia)
	if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null

	return texto
}

/**
 * Resolve um instante a partir do que o modelo sabe escrever.
 *
 * ## Por que isto existe
 *
 * O prompt pedia `quandoEm` em **epoch ms** para lembrete e aviso. O modelo
 * recebe o dia em texto e a hora cheia — não tem como converter para epoch sem
 * adivinhar fuso e minuto. Para evento o problema já tinha sido resolvido
 * aceitando `dia` + `hora`; a mesma lição não havia sido aplicada aqui.
 *
 * Medido: um `criar_lembrete` com epoch inventado gravou vencimento em
 * 2025-01-01 e o app reportou sucesso. Pior: `avisar` era **impossível** de
 * emitir, porque exige `quandoEm: number` e o modelo não produz um.
 *
 * Ordem de confiança:
 *   1. `dia` (AAAA-MM-DD) + `hora` (HH:MM), no fuso do aparelho;
 *   2. `quandoEm` em epoch **ms** (maior que 1e12);
 *   3. `quandoEm` em epoch **segundos** (maior que 1e9);
 *   4. `emMinutos` (relativo a agora), que o modelo sabe estimar ("daqui a 2 h").
 *
 * Devolve `null` quando não dá para saber — e a ação é recusada antes de o
 * usuário confirmar, em vez de agendar para 1970.
 */
export function resolverInstante(dados: Record<string, unknown>, agora = Date.now()): number | null {
	const dia = diaValido(dados.dia)
	if (dia) {
		const horaTexto = typeof dados.hora === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(dados.hora.trim()) : null
		const h = horaTexto ? Number(horaTexto[1]) : 9
		const m = horaTexto ? Number(horaTexto[2]) : 0
		if (h > 23 || m > 59) return null

		const [ano, mes, diaMes] = dia.split('-').map(Number)
		const instante = new Date(ano!, mes! - 1, diaMes!, h, m, 0, 0).getTime()
		return Number.isNaN(instante) ? null : instante
	}

	const numero = (valor: unknown): number | null => {
		const n = typeof valor === 'string' ? Number(valor) : typeof valor === 'number' ? valor : NaN
		return Number.isFinite(n) ? n : null
	}

	const bruto = numero(dados.quandoEm)
	if (bruto != null) {
		// 1e12 ms ≈ ano 2001; abaixo disso é segundos (ou lixo).
		const instante = bruto < 1e12 ? Math.round(bruto * 1000) : Math.round(bruto)
		const ano = new Date(instante).getFullYear()
		if (ano < 2000 || ano > 2100) return null
		return instante
	}

	const minutos = numero(dados.emMinutos)
	if (minutos != null && minutos > 0 && minutos <= 60 * 24 * 30) {
		return agora + Math.round(minutos) * 60_000
	}

	return null
}

/**
 * Resolve o horário de um evento a partir do que o modelo mandou.
 *
 * ## Por que isto existe
 *
 * A ação pedia `inicio` e `fim` em **epoch ms**, um número que o modelo não tem
 * como calcular: ele recebe o dia em texto ("2026-11-13") e não recebe o epoch
 * de agora. O resultado era o defeito que o dono do app viu — a confirmação
 * aparecia, ele aceitava, e **nenhum evento era criado** no dia e hora
 * descritos (ou era criado em 1970).
 *
 * Agora aceita as três formas, na ordem em que são confiáveis:
 *
 * 1. `dia` (AAAA-MM-DD) + `hora` (HH:MM) — o que o modelo sabe produzir;
 * 2. `inicio` em epoch **ms** (maior que 1e12);
 * 3. `inicio` em epoch **segundos** (maior que 1e9) — modelos devolvem muito
 *    isso, e sem a conversão o evento cairia em 1970.
 *
 * Devolve `null` quando não dá para saber, e aí a ação é recusada ANTES de o
 * usuário confirmar — prometer e não fazer é pior que dizer "não entendi".
 */
export function resolverHorarioDoEvento(dados: Record<string, unknown>): {
	inicio: number
	fim: number
} | null {
	const numero = (valor: unknown): number | null => {
		const n = typeof valor === 'string' ? Number(valor) : typeof valor === 'number' ? valor : NaN
		return Number.isFinite(n) ? n : null
	}

	const duracao =
		(typeof dados.duracaoMin === 'number' && dados.duracaoMin > 0 ? dados.duracaoMin : null) ?? 60

	// 1. Dia + hora, no fuso do aparelho (não em UTC: o evento é local).
	const dia = typeof dados.dia === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dados.dia.trim()) : null
	if (dia) {
		const horaTexto = typeof dados.hora === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(dados.hora.trim()) : null
		const h = horaTexto ? Number(horaTexto[1]) : 0
		const m = horaTexto ? Number(horaTexto[2]) : 0
		if (h > 23 || m > 59) return null

		const base = new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3]), h, m, 0, 0)
		if (Number.isNaN(base.getTime())) return null
		return { inicio: base.getTime(), fim: base.getTime() + duracao * 60_000 }
	}

	// 2 e 3. Epoch, em ms ou em segundos.
	const bruto = numero(dados.inicio)
	if (bruto == null) return null

	// 1e12 ms ≈ ano 2001; qualquer coisa abaixo disso é segundos (ou lixo).
	const inicio = bruto < 1e12 ? Math.round(bruto * 1000) : Math.round(bruto)

	// Sanidade: um evento fora de 2000–2100 é erro de unidade, não um evento.
	const ano = new Date(inicio).getFullYear()
	if (ano < 2000 || ano > 2100) return null

	const fimBruto = numero(dados.fim)
	let fim: number
	if (fimBruto != null) {
		const convertido = fimBruto < 1e12 ? Math.round(fimBruto * 1000) : Math.round(fimBruto)
		fim = convertido > inicio ? convertido : inicio + duracao * 60_000
	} else {
		fim = inicio + duracao * 60_000
	}

	return { inicio, fim }
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

type Risco = 'livre' | 'confirmar' | 'confirmar-forte' | 'proibido'

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

			// Data em formato estranho é recusada ANTES de o usuário confirmar:
			// "amanhã" e "20/11/2026" gravados como texto deixam a tarefa fora
			// da agenda e do sinal de atraso, sem erro visível.
			if (dados.dia !== undefined && dados.dia !== null && diaValido(dados.dia) == null) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: `Data inválida em "dia": ${String(dados.dia)}. Use AAAA-MM-DD.`,
				}
			}
			if (dados.prazo !== undefined && dados.prazo !== null && diaValido(dados.prazo) == null) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: `Data inválida em "prazo": ${String(dados.prazo)}. Use AAAA-MM-DD.`,
				}
			}

			const dia = diaValido(dados.dia) ? ` para ${dados.dia}` : ''
			const hora =
				typeof dados.hora === 'string' && /^\d{1,2}:\d{2}$/.test(dados.hora)
					? ` às ${dados.hora}`
					: ''
			const prazo = diaValido(dados.prazo) ? `, prazo ${dados.prazo}` : ''
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
			for (const campo of ['dia', 'prazo'] as const) {
				if (dados[campo] !== undefined && dados[campo] !== null && diaValido(dados[campo]) == null) {
					return {
						acao,
						risco: 'proibido',
						previa: '',
						recusa: `Data inválida em "${campo}": ${String(dados[campo])}. Use AAAA-MM-DD.`,
					}
				}
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
			if (typeof dados.data === 'string' && diaValido(dados.data) == null) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Data de marco inválida. Use AAAA-MM-DD.' }
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
			if (dados.prazo !== undefined && dados.prazo !== null && diaValido(dados.prazo) == null) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: `Data inválida em "prazo": ${String(dados.prazo)}. Use AAAA-MM-DD.`,
				}
			}
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

			// Sem horário, o lembrete é válido (existe para ser visto na lista).
			// Com horário em formato ilegível, é recusado: agendar para 1970 é
			// pior que não agendar.
			const temHorario = dados.dia !== undefined || dados.quandoEm !== undefined || dados.emMinutos !== undefined
			const instante = temHorario ? resolverInstante(dados) : null
			if (temHorario && instante == null) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: 'Não entendi o horário do lembrete. Diga "amanhã às 9h" ou "daqui a 2 horas".',
				}
			}

			return {
				acao,
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: instante
					? `Criar lembrete “${texto}” para ${new Date(instante).toLocaleString('pt-BR')}.`
					: `Criar lembrete “${texto}”.`,
				recusa: null,
			}
		}

		case 'avisar': {
			const titulo = exigir('titulo')
			const corpo = exigir('corpo')
			if (!titulo || !corpo) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Aviso sem título ou corpo.' }
			}

			/*
			 * Antes exigia `quandoEm: number`. O modelo não calcula epoch, então
			 * este tipo — o único canal pelo qual a IA fala fora do app — era
			 * impossível de emitir: toda tentativa caía em "Aviso sem horário".
			 * Agora aceita dia+hora e minutos relativos, como o resto.
			 */
			const quando = resolverInstante(dados)
			if (quando == null) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: 'Aviso sem horário legível. Use "dia" + "hora" ou "emMinutos".',
				}
			}

			return {
				acao,
				// Um aviso não altera dado nenhum do usuário e pode ser cancelado:
				// é o mesmo risco de um lembrete. Ainda assim, no modo
				// conservador, a IA só avisa depois de confirmação.
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Avisar em ${new Date(quando).toLocaleString('pt-BR')}: “${titulo}” — ${corpo}`,
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
			/*
			 * A prévia usa o TÍTULO quando ele vem junto.
			 *
			 * `avaliarAcao` é síncrona e não pode consultar o banco, então o
			 * executor não tem como resolver o id. Quem propõe a ação já conhece
			 * o nome (a inferência de comportamento, por exemplo) e o inclui em
			 * `dados.titulo`. Sem ele, a confirmação mostraria um UUID — que é
			 * ilegível para decidir se aceita.
			 */
			const nome = typeof dados.titulo === 'string' && dados.titulo.trim() ? dados.titulo.trim() : id
			const quando = typeof dados.dia === 'string' ? ` em ${dados.dia}` : ' hoje'

			return {
				acao,
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Registrar “${nome}” como cumprido${quando}.`,
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

		case 'adicionar_subtarefa': {
			const tarefaId = exigir('tarefaId')
			const titulo = exigir('titulo')
			if (!tarefaId || !titulo) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Subtarefa sem tarefa ou sem título.' }
			}
			return {
				acao,
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Acrescentar a subtarefa “${titulo}” à tarefa ${tarefaId}.`,
				recusa: null,
			}
		}

		case 'concluir_subtarefa': {
			const tarefaId = exigir('tarefaId')
			const subtarefaId = exigir('subtarefaId')
			if (!tarefaId || !subtarefaId) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Subtarefa não identificada.' }
			}
			return {
				acao,
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Marcar a subtarefa ${subtarefaId} como concluída.`,
				recusa: null,
			}
		}

		case 'editar_evento': {
			const id = exigir('id')
			if (!id) return { acao, risco: 'proibido', previa: '', recusa: 'Evento não identificado.' }
			const mudancas = ['titulo', 'dia', 'hora', 'duracaoMin'].filter(
				(campo) => dados[campo] !== undefined,
			)
			if (mudancas.length === 0) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Nada para mudar.' }
			}
			if (dados.dia !== undefined && diaValido(dados.dia) == null) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: 'Data de evento inválida. Use AAAA-MM-DD.',
				}
			}
			// Reagendar compromisso altera a agenda de alguém: sempre confirma.
			return {
				acao,
				risco: 'confirmar',
				previa: `Editar evento ${id}: ${mudancas.map((campo) => `${campo} → ${String(dados[campo])}`).join(', ')}.`,
				recusa: null,
			}
		}

		case 'editar_habito': {
			const id = exigir('id')
			if (!id) return { acao, risco: 'proibido', previa: '', recusa: 'Hábito não identificado.' }
			const mudancas = ['titulo', 'meta', 'unidade', 'dias'].filter(
				(campo) => dados[campo] !== undefined,
			)
			if (mudancas.length === 0) {
				return { acao, risco: 'proibido', previa: '', recusa: 'Nada para mudar.' }
			}
			// Hábito é rotina de longo prazo: sempre confirma, como criar.
			return {
				acao,
				risco: 'confirmar',
				previa: `Editar hábito ${id}: ${mudancas.join(', ')}.`,
				recusa: null,
			}
		}

		case 'concluir_lembrete': {
			const id = exigir('id')
			if (!id) return { acao, risco: 'proibido', previa: '', recusa: 'Lembrete não identificado.' }
			return {
				acao,
				risco: autonomia === 'conservador' ? 'confirmar' : 'livre',
				previa: `Marcar o lembrete ${id} como feito.`,
				recusa: null,
			}
		}

		case 'lote_tarefas': {
			const filtro = dados.filtro
			const operacao = dados.operacao

			if (!filtro || typeof filtro !== 'object') {
				return { acao, risco: 'proibido', previa: '', recusa: 'Lote sem filtro.' }
			}
			if (!operacao || typeof operacao !== 'object') {
				return { acao, risco: 'proibido', previa: '', recusa: 'Lote sem operação.' }
			}

			const tipoOperacao = (operacao as { tipo?: unknown }).tipo
			const permitidas = ['mover', 'concluir', 'reabrir', 'priorizar', 'etiquetar', 'arquivar']
			if (typeof tipoOperacao !== 'string' || !permitidas.includes(tipoOperacao)) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: 'Operação de lote não permitida. Excluir não existe em lote.',
				}
			}

			/*
			 * O volume define o risco, e ele é calculado AQUI.
			 *
			 * `totalDoLote` é preenchido por quem chama (a tela, que tem o banco).
			 * Sem contagem, assume-se `confirmar`: nunca "livre por omissão".
			 * Se o filtro casar mais de 100, a ação é proibida antes de o usuário
			 * confirmar — não depois.
			 */
			const total = typeof dados.totalDoLote === 'number' ? dados.totalDoLote : null
			const risco = total == null ? 'confirmar' : riscoPorVolume(total)

			if (risco === 'proibido') {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: `${total} itens é acima do limite de 100 por lote. Divida em partes.`,
				}
			}

			const rotulo: Record<string, string> = {
				mover: `mover para ${String((operacao as { para?: unknown }).para ?? '?')}`,
				concluir: 'marcar como concluídas',
				reabrir: 'reabrir',
				priorizar: `mudar prioridade para ${String((operacao as { prioridade?: unknown }).prioridade ?? '?')}`,
				etiquetar: `etiquetar #${String((operacao as { etiqueta?: unknown }).etiqueta ?? '?')}`,
				arquivar: 'guardar em "algum dia"',
			}

			const quantidade =
				total == null
					? 'as tarefas que casarem com o filtro'
					: `${total} ${total === 1 ? 'tarefa' : 'tarefas'}`

			return {
				acao,
				risco,
				previa: `Vou ${rotulo[tipoOperacao]} em ${quantidade}.`,
				recusa: null,
			}
		}

		case 'criar_evento': {
			const titulo = exigir('titulo')
			const horario = resolverHorarioDoEvento(dados)
			if (!titulo || !horario) {
				return {
					acao,
					risco: 'proibido',
					previa: '',
					recusa: 'Evento sem dia e hora que eu consiga ler. Diga "sexta às 15h" ou "20/11 às 15h".',
				}
			}
			return {
				acao,
				risco: 'confirmar',
				previa: `Criar evento “${titulo}” em ${new Date(horario.inicio).toLocaleString('pt-BR')}.`,
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

interface ResultadoExecucao {
	executadas: number
	recusadas: number
	erro: string | null
	/** Id do lote, para desfazer. */
	loteId: string | null
}

/**
 * Etiqueta do lote: separa o que a autonomia fez do que o usuário aprovou.
 *
 * Gravada em `AiActionLog.resumo`, que é a única coluna livre do registro.
 * Sem ela, `contarAcoesHoje` não distingue "o Jarvis agiu sozinho" de "o
 * usuário aceitou 2 sugestões na conversa" — e as duas ações da conversa
 * consumiam o teto de autonomia do dia.
 */
export const ETIQUETA_AUTONOMA = '[autônoma]'

/** Executa as ações que já foram confirmadas.
 *
 * Só recebe o que passou por `avaliarLote` e pelo "Sim" do usuário. Mesmo
 * assim, revalida: entre a prévia e o toque, o registro pode ter mudado.
 */
export async function executarLote(
	acoes: AcaoDaIA[],
	database: NexoDatabase = db,
	opcoes: { autonoma?: boolean } = {},
): Promise<ResultadoExecucao> {
	const loteId = createId()
	const antes: unknown[] = []
	let executadas = 0
	let recusadas = 0
	/** Por que cada ação recusada caiu — é o que o usuário vê quando falha. */
	const motivos: string[] = []

	for (const acao of acoes) {
		/*
		 * Revalidação obrigatória.
		 *
		 * Antes, esta função executava direto o que recebia. Uma ação inválida
		 * — evento sem horário legível, projeto sem nome — chegava em
		 * `executarUma`, era recusada lá dentro, e o contador... somava como
		 * executada quando `executarUma` devolvia um objeto. O resultado foi o
		 * que o dono do app viu: "1 ação feita" e nada criado.
		 *
		 * Classificar antes garante que o número que o usuário lê é o número de
		 * coisas que mudaram no banco.
		 */
		const classificacao = avaliarAcao(acao, 'confiante')
		if (classificacao.risco === 'proibido') {
			recusadas++
			motivos.push(classificacao.recusa ?? `${acao.tipo} inválida.`)
			continue
		}

		const resultado = await comOrigem('ia', async () => {
			try {
				const snapshot = await executarUma(acao, database)
				if (!snapshot) return false
				antes.push(snapshot)
				return true
			} catch (causa) {
				console.warn('Jarvis: ação falhou.', causa)
				motivos.push(causa instanceof Error ? causa.message : `${acao.tipo} falhou.`)
				return false
			}
		})

		if (resultado) executadas++
		else recusadas++
	}

	if (executadas === 0) {
		return {
			executadas: 0,
			recusadas,
			erro: motivos[0] ?? 'Nenhuma ação pôde ser executada.',
			loteId: null,
		}
	}

	const registro: AiActionLog = {
		id: loteId,
		em: Date.now(),
		tipo: 'lote',
		resumo: `${opcoes.autonoma ? `${ETIQUETA_AUTONOMA} ` : ''}${executadas} ${executadas === 1 ? 'ação' : 'ações'} da IA`,
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
					// `diaValido` e não `typeof === 'string'`: o modelo escreve
					// "amanhã", e isso entrava no banco como texto sem nunca mais
					// casar com a agenda nem com o sinal de atraso.
					dueDate: diaValido(dados.dia) ?? toDayKey(new Date()),
					projectId: typeof dados.projetoId === 'string' ? dados.projetoId : null,
					priority: typeof dados.prioridade === 'number' ? (dados.prioridade as 0 | 1 | 2 | 3) : 0,
					// Hora e prazo existem porque sem eles "me avise às 15h" virava
					// uma tarefa sem horário — e o alarme nunca existia. A hora entra
					// como minutos do dia, que é o que o banco guarda.
					startMin: horaParaMinutos(dados.hora),
					deadline: diaValido(dados.prazo),
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
			if (diaValido(dados.dia)) patch.dueDate = dados.dia
			if (typeof dados.prioridade === 'number') patch.priority = dados.prioridade
			if (dados.hora === null) patch.startMin = null
			else if (typeof dados.hora === 'string') patch.startMin = horaParaMinutos(dados.hora)
			if (diaValido(dados.prazo)) patch.deadline = dados.prazo

			if (Object.keys(patch).length === 0) return null

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

			const antes = { ...atual }
			const patch: Record<string, unknown> = {}
			if (diaValido(dados.prazo)) patch.prazo = dados.prazo
			if (dados.status === 'ativo' || dados.status === 'pausado' || dados.status === 'concluido') {
				patch.status = dados.status
			}
			/*
			 * Categoria e prioridade.
			 *
			 * O prompt ensina esses dois campos desde a rodada anterior, mas o
			 * executor só aplicava prazo e status: a ação era classificada,
			 * executada, contada como "1 ação feita" — e o banco não mudava.
			 * Sucesso falso é pior que erro, porque o usuário para de conferir.
			 */
			if (dados.categoria === null) patch.categoria = null
			else if (typeof dados.categoria === 'string') patch.categoria = dados.categoria
			if (
				typeof dados.prioridade === 'number' &&
				dados.prioridade >= 0 &&
				dados.prioridade <= 3
			) {
				patch.priority = dados.prioridade
			}

			if (Object.keys(patch).length === 0) return null

			await updateProject(id, patch, database)
			return { tipo: 'project', id, antes }
		}

		case 'criar_evento': {
			const horario = resolverHorarioDoEvento(dados)
			// Recusa explícita em vez de gravar em 1970: o chamador conta como
			// recusada e o usuário vê que não foi feito.
			if (!horario) return null

			const evento = await criarEvento(
				{
					title: String(dados.titulo ?? ''),
					startAt: horario.inicio,
					endAt: horario.fim,
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
			const quando = resolverInstante(dados)
			const lembrete = await createReminder(
				{
					text: String(dados.texto ?? ''),
					dueAt: quando,
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
			const quandoEm = resolverInstante(dados)
			if (!titulo || !corpo || quandoEm == null) return null

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
			// Marcar, não alternar: a IA não pode desfazer um registro que o
			// usuário já tinha. Ver `marcarDiaHabito` em `db/habitos.ts`.
			const jaEstava = (
				await database.habitLogs.where('[habitId+day]').equals([id, dia]).first()
			)
			const marcou = await marcarDiaHabito(habito, dia, database)
			if (!marcou) return null

			// Já estava marcado: nada mudou, mas a ação foi cumprida. Devolver
			// o registro permite o desfazer desmarcar só quando ela marcou de
			// fato — desfazer um "já estava" não pode apagar o dia do usuário.
			const eraNovo = !(jaEstava && !jaEstava.deletedAt && jaEstava.value > 0)
			return eraNovo
				? { tipo: 'habitLog', id: `${id}:${dia}`, antes: null, criado: { habitId: id, dia } }
				: { tipo: 'habitLog', id: `${id}:${dia}`, antes: null }
		}

		case 'lote_tarefas': {
			/*
			 * Execução do lote.
			 *
			 * Duas responsabilidades: resolver o FILTRO (o que o modelo propôs)
			 * e APLICAR a operação. A lista de ids é calculada aqui, contra o
			 * banco — o modelo nunca a vê nem a informa.
			 */
			const filtro = dados.filtro as FiltroDeTarefas | undefined
			const operacao = dados.operacao as OperacaoDeLote | undefined
			if (!filtro || !operacao) return null

			const tarefas = await database.tasks.toArray()
			const casadas = selecionarTarefas(tarefas, filtro)
			if (casadas.length === 0) return null

			const antes = casadas.map((tarefa) => ({ id: tarefa.id, tarefa }))
			const resultado = await aplicarLote(
				casadas.map((tarefa) => tarefa.id),
				operacao,
				database,
			)
			if (resultado.aplicadas === 0) return null

			return {
				tipo: 'task',
				id: resultado.ids[0]!,
				antes,
				criado: { lote: operacao.tipo, aplicadas: resultado.aplicadas },
			}
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
				habit: () => database.habits as unknown as TabelaAtualizavel,
				// A anotação de projeto é uma entidade própria (`projectNotes`).
				// Sem esta linha, desfazer "anotar no projeto" não fazia nada e a
				// função devolvia ok — a nota continuava lá.
				projectNote: () => database.projectNotes as unknown as TabelaAtualizavel,
			}

			if (item.tipo === 'habitLog') {
				// Id composto `habitId:dia`. Desfazer = desmarcar o dia.
				const [habitId, dia] = item.id.split(':')
				if (habitId && dia) {
					const habito = await database.habits.get(habitId)
					if (habito) await alternarDiaHabito(habito, dia, database)
				}
			} else if (item.tipo === 'task' && Array.isArray(item.antes)) {
				/*
				 * Lote de tarefas: o `antes` é a LISTA de tarefas afetadas.
				 *
				 * O desfazer comum assume um registro só e faria
				 * `update(id, {...lista})` — gravando lixo no campo. Aqui a
				 * restauração é item a item, com o estado anterior de cada um.
				 */
				const lista = item.antes as Array<{ id: string; tarefa: Record<string, unknown> }>
				for (const entrada of lista) {
					if (!entrada?.id || !entrada.tarefa) continue
					await database.tasks.update(entrada.id, {
						done: entrada.tarefa.done,
						doneAt: entrada.tarefa.doneAt ?? null,
						priority: entrada.tarefa.priority ?? 0,
						dueDate: entrada.tarefa.dueDate ?? null,
						someday: entrada.tarefa.someday ?? false,
						tags: entrada.tarefa.tags ?? [],
						deletedAt: entrada.tarefa.deletedAt ?? null,
						updatedAt: agora,
					} as never)
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
