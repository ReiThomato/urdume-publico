import { db } from '@/db/db'
import type { AiChatMessage, NexoDatabase } from '@/db/db'
import { createId } from '@/db/id'
import { gravarMemoria, lerMemoria } from './estado'

/**
 * Conversas do Jarvis.
 *
 * ## Por que mais de uma
 *
 * Uma conversa só obriga a escolher entre duas coisas ruins: continuar no mesmo
 * fio (e carregar contexto que não interessa) ou apagar tudo para começar de
 * novo (e perder o que foi dito). O usuário pediu três, com o mais antigo saindo
 * quando o quarto abre — é o padrão de "abas recentes" dos mensageiros.
 *
 * ## As regras
 *
 * - **no máximo 3** conversas guardadas;
 * - abrir a quarta **apaga a mais antiga**, com as mensagens dela;
 * - `principal` é a conversa que já existia antes desta função: não é apagada
 *   enquanto houver outras mais novas para sair primeiro;
 * - o título é a primeira pergunta do usuário, curto — não um campo a preencher.
 *
 * ## O que NÃO é
 *
 * Isto não é "memória": a memória do Jarvis (`aiMemory`) é global e continua
 * valendo em qualquer conversa. A conversa é só o histórico do diálogo.
 */

export interface SessaoDeChat {
	id: string
	titulo: string
	criadaEm: number
	ultimaEm: number
	mensagens: number
}

/** Quantas conversas ficam guardadas. */
export const MAXIMO_DE_CONVERSAS = 3

/** Chave da conversa aberta, em `settings`. */
const CHAVE_ABERTA = 'chat.sessaoAberta'

/**
 * Registro das sessões criadas: `{ id: { criadaEm, titulo } }`.
 *
 * Por que não inferir da mensagem: o horário da primeira mensagem empata (duas
 * conversas no mesmo minuto) e às vezes até inverte, porque a gravação acontece
 * alguns milissegundos depois da criação. A ordem de exclusão precisa ser
 * determinística — a conversa mais antiga é a que foi CRIADA primeiro, não a
 * que teve a sorte de gravar a primeira mensagem antes.
 */
const CHAVE_SESSOES = 'chat.sessoes'

interface RegistroDeSessao {
	criadaEm: number
	titulo: string | null
}

async function lerRegistro(database: NexoDatabase): Promise<Record<string, RegistroDeSessao>> {
	const salvo = await lerMemoria<Record<string, RegistroDeSessao>>(CHAVE_SESSOES, {}, database)
	return salvo && typeof salvo === 'object' ? salvo : {}
}

async function anotarSessao(
	id: string,
	titulo: string | null,
	database: NexoDatabase,
): Promise<void> {
	const registro = await lerRegistro(database)
	registro[id] = { criadaEm: registro[id]?.criadaEm ?? Date.now(), titulo: titulo ?? registro[id]?.titulo ?? null }
	await gravarMemoria(CHAVE_SESSOES, registro, database)
}

/** Índice da conversa que já existia (mensagens sem `sessao`). */
export const SESSAO_PRINCIPAL = 'principal'

/** Sessão de uma mensagem, com o padrão para as antigas. */
export function sessaoDa(mensagem: AiChatMessage): string {
	return mensagem.sessao && mensagem.sessao.trim() ? mensagem.sessao : SESSAO_PRINCIPAL
}

/** Qual conversa está aberta. */
export async function lerSessaoAberta(database: NexoDatabase = db): Promise<string> {
	const salva = await lerMemoria<string | null>(CHAVE_ABERTA, null, database)
	return typeof salva === 'string' && salva ? salva : SESSAO_PRINCIPAL
}

export async function abrirSessao(id: string, database: NexoDatabase = db): Promise<void> {
	await gravarMemoria(CHAVE_ABERTA, id, database)
}

/**
 * Lista as conversas, da mais recente para a mais antiga.
 *
 * A conversa `principal` entra mesmo vazia: é onde as mensagens antigas vivem,
 * e esconder uma conversa com histórico seria pior do que mostrar uma vazia.
 */
export async function listarSessoes(database: NexoDatabase = db): Promise<SessaoDeChat[]> {
	const [todas, registro] = await Promise.all([
		database.aiChat.orderBy('em').toArray(),
		lerRegistro(database),
	])

	const mapa = new Map<string, SessaoDeChat>()
	for (const mensagem of todas) {
		const id = sessaoDa(mensagem)
		const atual = mapa.get(id)

		if (!atual) {
			const primeiraPergunta = mensagem.papel === 'usuario' ? mensagem.texto : ''
			mapa.set(id, {
				id,
				titulo:
					registro[id]?.titulo ??
					(primeiraPergunta ? resumirTitulo(primeiraPergunta) : 'Conversa'),
				criadaEm: registro[id]?.criadaEm ?? mensagem.em,
				ultimaEm: mensagem.em,
				mensagens: 1,
			})
			continue
		}

		atual.mensagens += 1
		atual.ultimaEm = Math.max(atual.ultimaEm, mensagem.em)
		atual.criadaEm = Math.min(atual.criadaEm, mensagem.em)

		// O título vem da PRIMEIRA pergunta do usuário, não da primeira
		// mensagem: o Jarvis pode ter falado antes (aviso, saudação).
		if (atual.titulo === 'Conversa' && mensagem.papel === 'usuario') {
			atual.titulo = resumirTitulo(mensagem.texto)
		}
	}

	if (!mapa.has(SESSAO_PRINCIPAL)) {
		mapa.set(SESSAO_PRINCIPAL, {
			id: SESSAO_PRINCIPAL,
			titulo: 'Conversa',
			// Criada antes de qualquer outra: é a conversa original.
			criadaEm: registro[SESSAO_PRINCIPAL]?.criadaEm ?? 0,
			ultimaEm: 0,
			mensagens: 0,
		})
	}

	return [...mapa.values()].sort((a, b) => b.ultimaEm - a.ultimaEm)
}

/** Título curto: 42 caracteres, sem quebrar palavra no meio. */
function resumirTitulo(texto: string): string {
	const limpo = texto.replace(/\s+/g, ' ').trim()
	if (limpo.length <= 42) return limpo
	const corte = limpo.slice(0, 42)
	const ultimoEspaco = corte.lastIndexOf(' ')
	return `${(ultimoEspaco > 20 ? corte.slice(0, ultimoEspaco) : corte).trim()}…`
}

/**
 * Cria uma conversa nova e a abre.
 *
 * Se já houver `MAXIMO_DE_CONVERSAS`, a mais antiga é apagada ANTES de criar —
 * assim o limite nunca é ultrapassado, nem por um instante.
 */
export async function novaSessao(database: NexoDatabase = db): Promise<string> {
	const existentes = await listarSessoes(database)
	const comMensagens = existentes.filter((sessao) => sessao.mensagens > 0)

	if (comMensagens.length >= MAXIMO_DE_CONVERSAS) {
		/*
		 * Sai a conversa mais ANTIGA — por criação, não por último uso.
		 *
		 * Ordenar por `ultimaEm` parecia natural ("a que eu não uso há mais
		 * tempo"), mas é instável: duas conversas usadas no mesmo minuto
		 * empatam, e a escolha vira sorteio. O usuário pediu que "o último seja
		 * excluído", que é a mais velha por criação — previsível e explicável.
		 */
		const maisAntiga = [...comMensagens].sort((a, b) => a.criadaEm - b.criadaEm)[0]
		if (maisAntiga) await apagarSessao(maisAntiga.id, database)
	}

	const id = createId()
	await anotarSessao(id, null, database)
	await abrirSessao(id, database)
	return id
}

/**
 * Guarda o título da sessão quando a primeira pergunta chega.
 *
 * Chamado pela tela; sem isso, o título seria recalculado a cada listagem e
 * poderia mudar (a primeira mensagem deixa de ser a primeira quando o Jarvis
 * fala antes).
 */
export async function titulandoSessao(
	id: string,
	texto: string,
	database: NexoDatabase = db,
): Promise<void> {
	const registro = await lerRegistro(database)
	if (registro[id]?.titulo) return
	await anotarSessao(id, resumirTitulo(texto), database)
}

/** Apaga a conversa e todas as mensagens dela. */
export async function apagarSessao(id: string, database: NexoDatabase = db): Promise<number> {
	const mensagens = await database.aiChat.toArray()
	const alvo = mensagens.filter((mensagem) => sessaoDa(mensagem) === id)
	if (alvo.length > 0) {
		await database.aiChat.bulkDelete(alvo.map((mensagem) => mensagem.id))
	}

	const registro = await lerRegistro(database)
	if (registro[id]) {
		delete registro[id]
		await gravarMemoria(CHAVE_SESSOES, registro, database)
	}

	// Se a conversa apagada era a aberta, cai para a mais recente que sobrou.
	if ((await lerSessaoAberta(database)) === id) {
		const restantes = await listarSessoes(database)
		const proxima = restantes.find((sessao) => sessao.id !== id && sessao.mensagens > 0)
		await abrirSessao(proxima?.id ?? SESSAO_PRINCIPAL, database)
	}

	return alvo.length
}

/** Mensagens de uma conversa, em ordem cronológica. */
export async function mensagensDaSessao(
	id: string,
	limite = 200,
	database: NexoDatabase = db,
): Promise<AiChatMessage[]> {
	const todas = await database.aiChat.orderBy('em').reverse().limit(limite * 3).toArray()
	const daSessao = todas.filter((mensagem) => sessaoDa(mensagem) === id).slice(0, limite)
	return daSessao.reverse()
}

/**
 * Garante que exista pelo menos uma conversa aberta.
 *
 * Chamado pela tela: sem isto, a primeira abertura depois da migração leria
 * uma sessão que não existe e mostraria a conversa vazia.
 */
export async function garantirSessao(database: NexoDatabase = db): Promise<string> {
	const aberta = await lerSessaoAberta(database)
	if (aberta !== SESSAO_PRINCIPAL) return aberta

	const sessoes = await listarSessoes(database)
	const temPrincipal = sessoes.some((sessao) => sessao.id === SESSAO_PRINCIPAL && sessao.mensagens > 0)
	if (temPrincipal) return SESSAO_PRINCIPAL

	const maisRecente = sessoes.find((sessao) => sessao.mensagens > 0)
	if (maisRecente) {
		await abrirSessao(maisRecente.id, database)
		return maisRecente.id
	}

	return SESSAO_PRINCIPAL
}
