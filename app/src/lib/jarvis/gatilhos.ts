import { db } from '@/db/db'
import type { AiJob, NexoDatabase } from '@/db/db'
import { createId } from '@/db/id'
import { toDayKey } from '@/db/repo'
import { avaliarAgora } from './motor'
import { lerPreferencias } from './estado'
import { sincronizarSegundoPlano } from './segundo-plano'

/**
 * Gatilhos: o usuário decide quando o Jarvis deve olhar.
 *
 * Isto é a resposta concreta a "consigo criar eventos para acionar a IA?".
 * Não é um cron: o Android não garante horário, então um gatilho é uma
 * **janela** — "às 18h, se o app estiver aberto ou assim que abrir depois
 * disso". É a mesma honestidade do resto do sistema, aplicada aqui.
 *
 * O que um gatilho faz:
 *   1. roda as regras locais (sem IA, sem token);
 *   2. se houver algo acima do corte, avisa;
 *   3. se o usuário quiser análise profunda, ela é pedida na hora, não
 *      automaticamente — o gatilho não vira gasto escondido.
 *
 * Um gatilho nunca executa ação de escrita. Ele só faz o Jarvis OLHAR.
 */

export interface DadosDoGatilho {
	/** Hora local (0–23) a partir da qual passa a valer. */
	hora: number
	/** 0=domingo … 6=sábado. Vazio = todos os dias. */
	dias: number[]
	/** Texto que o usuário reconhece ("fechar o dia"). */
	titulo: string
	/**
	 * Pedir análise da IA junto. Desligado por padrão: o gatilho é local e
	 * barato; quem quer julgamento do modelo pede na conversa.
	 */
	comIA: boolean
}

export type Gatilho = AiJob & { payload: DadosDoGatilho }

export const GATILHOS_SUGERIDOS: DadosDoGatilho[] = [
	{ hora: 8, dias: [1, 2, 3, 4, 5], titulo: 'Abrir o dia', comIA: false },
	{ hora: 13, dias: [1, 2, 3, 4, 5], titulo: 'Checar o meio do dia', comIA: false },
	{ hora: 18, dias: [1, 2, 3, 4, 5], titulo: 'Fechar o dia', comIA: false },
]

export async function listarGatilhos(database: NexoDatabase = db): Promise<Gatilho[]> {
	const jobs = await database.aiJobs.toArray()
	return jobs
		.map((job) => ({ ...job, payload: job.payload as DadosDoGatilho }))
		.sort((a, b) => a.payload.hora - b.payload.hora)
}

export async function criarGatilho(
	dados: DadosDoGatilho,
	database: NexoDatabase = db,
): Promise<Gatilho | null> {
	if (dados.hora < 0 || dados.hora > 23) return null
	const titulo = dados.titulo.trim()
	if (!titulo) return null

	const existentes = await database.aiJobs.toArray()
	// Mesma hora e mesmos dias: já existe. Dois gatilhos iguais só duplicariam
	// a avaliação e o aviso.
	const repetido = existentes.some((job) => {
		const payload = job.payload as DadosDoGatilho
		return payload.hora === dados.hora && payload.dias.join() === dados.dias.join()
	})
	if (repetido) return null

	const job: AiJob = {
		id: createId(),
		criadoEm: Date.now(),
		quando: dados.hora,
		tipo: 'analise',
		estado: 'pendente',
		payload: { ...dados, titulo },
	}

	await database.aiJobs.add(job)
	return { ...job, payload: job.payload as DadosDoGatilho }
}

export async function removerGatilho(id: string, database: NexoDatabase = db): Promise<void> {
	await database.aiJobs.delete(id)
}

/** Chave de memória: "este gatilho já rodou neste dia". */
const chaveExecucao = (id: string, dia: string): string => `gatilho:${id}:${dia}`

/**
 * Roda os gatilhos que venceram.
 *
 * Chamado ao abrir o app e no tique de minuto. Um gatilho vence quando:
 *   - o dia está na lista (ou a lista está vazia);
 *   - a hora atual passou da hora dele;
 *   - ele ainda não rodou hoje.
 *
 * Devolve quantos rodaram, para o chamador decidir se sincroniza o segundo
 * plano (o retrato muda depois de cada avaliação).
 */
export async function rodarGatilhos(
	opcoes: { agora?: number } = {},
	database: NexoDatabase = db,
): Promise<{ rodados: number; comSinais: number }> {
	const agora = opcoes.agora ?? Date.now()
	const data = new Date(agora)
	const dia = toDayKey(data)
	const prefs = await lerPreferencias(database)

	if (prefs.modo === 'pausado' || prefs.modo === 'manual') return { rodados: 0, comSinais: 0 }

	const gatilhos = await listarGatilhos(database)
	let rodados = 0
	let comSinais = 0

	for (const gatilho of gatilhos) {
		const dados = gatilho.payload
		if (dados.dias.length > 0 && !dados.dias.includes(data.getDay())) continue
		if (data.getHours() < dados.hora) continue

		const chave = chaveExecucao(gatilho.id, dia)
		const jaRodou = await database.aiMemory.where('chave').equals(chave).first()
		if (jaRodou) continue

		const painel = await avaliarAgora({ agora }, database)
		rodados++

		const interessantes = painel.itens.filter((item) => item.estado === 'novo' && item.interrompe)
		if (interessantes.length > 0) comSinais++

		await database.aiMemory.put({
			id: createId(),
			chave,
			valor: { quando: agora, sinais: interessantes.length },
			atualizadoEm: agora,
		})
	}

	if (rodados > 0) {
		await sincronizarSegundoPlano(agora).catch(() => undefined)
	}

	return { rodados, comSinais }
}

/** O próximo gatilho que vai rodar, para a central poder mostrar. */
export function proximoGatilho(gatilhos: Gatilho[], agora = Date.now()): { gatilho: Gatilho; em: number } | null {
	const data = new Date(agora)
	let melhor: { gatilho: Gatilho; em: number } | null = null

	for (let salto = 0; salto < 8; salto++) {
		const dia = new Date(data)
		dia.setDate(dia.getDate() + salto)

		for (const gatilho of gatilhos) {
			const dados = gatilho.payload
			if (dados.dias.length > 0 && !dados.dias.includes(dia.getDay())) continue

			const alvo = new Date(dia)
			alvo.setHours(dados.hora, 0, 0, 0)
			if (alvo.getTime() <= agora) continue

			if (!melhor || alvo.getTime() < melhor.em) melhor = { gatilho, em: alvo.getTime() }
		}

		if (melhor) break
	}

	return melhor
}
