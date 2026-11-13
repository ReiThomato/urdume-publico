import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { toDayKey } from '@/db/repo'
import { contarInterrupcao, lerRetrato } from './leitura'
import { avaliar } from './relevancia'
import type { ContextoDeAvaliacao } from './relevancia'
import { avaliarTudo } from './sinais'
import type { Nivel, Sinal } from './sinais'
import { gravarMemoria, lerMemoriasComPrefixo, lerPreferencias } from './estado'

/**
 * O motor de avaliação.
 *
 * Roda em três ocasiões, e só nelas:
 *
 *   1. **ao abrir o app** — olha o que acumulou enquanto estava fechado;
 *   2. **no tique** — 3×/dia (08h, 13h, 18h), se o app estiver aberto;
 *   3. **na escrita** — mas só registra o fato; não avalia na hora. Avaliar em
 *      cada toque seria caro e produziria interrupção no meio da digitação.
 *
 * O resultado de cada rodada fica em `aiMemory` sob `painel:<dia>`: o painel lê
 * de lá sem recalcular, e a pausa só precisa apagar/ignorar essa chave.
 *
 * Nesta camada NÃO existe chamada de IA. Tudo é aritmética local; a IA entra
 * depois, sobre o agregado, e só quando um sinal pede julgamento.
 */

export interface ItemDoPainel {
	sinal: Sinal
	relevancia: number
	interrompe: boolean
	/** Por que não interrompeu (para o painel explicar o próprio silêncio). */
	motivo: string | null
	/** Foi tratado: aceito, dispensado, ignorado. */
	estado: 'novo' | 'aceito' | 'dispensado' | 'ignorado'
	em: number
	/**
	 * Títulos de sinais deste mesmo assunto que foram agregados a este cartão.
	 *
	 * Quatro sinais sobre o mesmo projeto são um assunto, não quatro. Agrupar
	 * preserva a informação (aparece como linha secundária) sem transformar o
	 * painel numa parede de cartões iguais.
	 */
	relacionados?: string[]
	/** Quantos sinais foram absorvidos por este item. */
	agregados?: number
}

export interface PainelDoDia {
	dia: string
	geradoEm: number
	/** Resumo curto para o topo do painel. */
	resumo: string
	itens: ItemDoPainel[]
	interrupcoes: number
	/** O que foi silenciado, com o motivo agregado. */
	silenciados: Array<{ id: string; titulo: string; motivo: string }>
}

const chavePainel = (dia: string): string => `painel:${dia}`

type MemoriasDeAvaliacao = {
	ultimaVez: Record<string, number>
	silencio: Record<string, { ignorados: number; ate: number }>
	confianca: Record<string, number>
}

/** Carrega o que a avaliação precisa da memória, em um punhado de consultas. */
async function carregarMemorias(database: NexoDatabase): Promise<MemoriasDeAvaliacao> {
	const [ultimaVez, silencio, confianca] = await Promise.all([
		lerMemoriasComPrefixo<number>('visto:', database),
		lerMemoriasComPrefixo<{ ignorados: number; ate: number }>('silencio:', database),
		lerMemoriasComPrefixo<number>('confianca:', database),
	])
	return { ultimaVez, silencio, confianca }
}

/**
 * Avalia agora e devolve o painel. Não notifica, não chama IA.
 *
 * `forcar` ignora a checagem de "já avaliou neste tique". Usado pelo painel
 * quando o usuário pede para recalcular.
 */
export async function avaliarAgora(
	opcoes: { agora?: number; forcar?: boolean } = {},
	database: NexoDatabase = db,
): Promise<PainelDoDia> {
	const agora = opcoes.agora ?? Date.now()
	const dia = toDayKey(new Date(agora))
	const prefs = await lerPreferencias(database)

	// Pausado: devolve o painel vazio e apaga o que estava pendente. Uma pausa
	// que não interrompe o que promete interromper não é uma pausa.
	if (prefs.modo === 'pausado') {
		await apagarPainel(dia, database)
		return {
			dia,
			geradoEm: agora,
			resumo: 'Jarvis pausado.',
			itens: [],
			interrupcoes: 0,
			silenciados: [],
		}
	}

	const retrato = await lerRetrato(
		{ agora, hoje: dia, projetosIgnorados: prefs.projetosIgnorados },
		database,
	)

	const sinais = avaliarTudo(retrato)
	const memorias = await carregarMemorias(database)
	const existente = await lerMemoria<PainelDoDia | null>(chavePainel(dia), null, database)

	const contexto: ContextoDeAvaliacao = {
		interrupcoesHoje: retrato.uso.interrupcoesHoje,
		agora,
		hora: retrato.hora,
		ultimaVez: memorias.ultimaVez,
		silencio: memorias.silencio,
		confianca: memorias.confianca,
	}

	const itens: ItemDoPainel[] = []
	const silenciados: PainelDoDia['silenciados'] = []
	let interrupcoes = contexto.interrupcoesHoje

	for (const sinal of sinais) {
		const veredito = avaliar(
			{
				nivel: sinal.nivel,
				magnitude: sinal.magnitude,
				urgencia: sinal.urgencia,
				chave: sinal.chave,
				id: sinal.id,
			},
			prefs,
			contexto,
		)

		// Um sinal que já foi avaliado nesta janela não entra de novo: é a trava
		// de deduplicação, e a que impede o painel de "piscar" ao reavaliar.
		if (!opcoes.forcar && memorias.ultimaVez[sinal.chave] && veredito.motivo === 'cooldown') {
			continue
		}

		const conservar = existente?.itens.find(
			(item) => item.sinal.chave === sinal.chave || item.relacionados?.includes(sinal.chave),
		)

		itens.push({
			sinal,
			relevancia: veredito.relevancia,
			interrompe: veredito.interrompe,
			motivo: veredito.motivo,
			estado: conservar?.estado ?? 'novo',
			em: conservar?.em ?? agora,
		})

		if (veredito.interrompe) {
			interrupcoes++
			contexto.interrupcoesHoje = interrupcoes
			// Persiste o consumo: sem isto o orçamento nunca acumula e cada
			// avaliação recomeçaria com 3 interrupções disponíveis, o que anula
			// a trava na prática (foi um bug real da primeira versão).
			await contarInterrupcao(dia, database)
			// Só marca como visto quando de fato interrompeu: um sinal que ficou
			// no painel continua podendo interromper mais tarde, no próximo tique.
			await gravarMemoria(`visto:${sinal.chave}`, agora, database)
		}

		if (!veredito.interrompe && veredito.motivo && veredito.motivo !== 'abaixo-do-corte') {
			silenciados.push({ id: sinal.id, titulo: sinal.titulo, motivo: veredito.motivo })
		}
	}

	const agrupados = agrupar(itens)

	const painel: PainelDoDia = {
		dia,
		geradoEm: agora,
		resumo: resumir(agrupados),
		itens: agrupados,
		interrupcoes,
		silenciados,
	}

	await gravarMemoria(chavePainel(dia), painel, database)
	return painel
}

/**
 * Junta cartões do mesmo assunto.
 *
 * O assunto é a entidade: os `entidades` de cada sinal. Quatro avisos sobre o
 * projeto "Reforma do estúdio" colapsam num cartão com o primeiro e uma linha
 * "mais 3". O que não tem entidade (contagens globais) não é agrupado — dois
 * avisos de atraso falam de tarefas diferentes e merecem ficar separados.
 */
function agrupar(itens: ItemDoPainel[]): ItemDoPainel[] {
	const usados = new Set<string>()
	const saida: ItemDoPainel[] = []

	for (const item of itens) {
		if (item.sinal.entidades.length !== 1) {
			saida.push(item)
			continue
		}

		const alvo = item.sinal.entidades[0]!
		if (usados.has(alvo)) continue

		// O primeiro cartão do assunto é o mais relevante: a lista já vem
		// ordenada por nível.
		const irmãos = itens.filter(
			(outro) => outro !== item && outro.sinal.entidades.length === 1 && outro.sinal.entidades[0] === alvo,
		)

		if (irmãos.length > 0) usados.add(alvo)

		saida.push(
			irmãos.length === 0
				? item
				: {
						...item,
						relacionados: irmãos.map((outro) => outro.sinal.chave),
						agregados: irmãos.length,
						// Interrompe se qualquer um dos irmãos interromperia: o
						// assunto é um só, e o cartão carrega o nível mais alto.
						interrompe: item.interrompe || irmãos.some((outro) => outro.interrompe),
					},
		)
	}

	return saida
}

/** Resumo de uma linha: a contagem do que merece atenção hoje. */
function resumir(itens: ItemDoPainel[]): string {
	const urgentes = itens.filter((item) => item.sinal.nivel === 'urgente').length
	const atencao = itens.filter((item) => item.sinal.nivel === 'atencao').length
	const oportunidades = itens.filter((item) => item.sinal.nivel === 'oportunidade').length

	if (urgentes > 0) {
		return `${urgentes} ${urgentes === 1 ? 'assunto pede' : 'assuntos pedem'} atenção agora · ${itens.length} no total.`
	}
	if (atencao > 0) return `${atencao} ${atencao === 1 ? 'ponto' : 'pontos'} para observar hoje · ${itens.length} no total.`
	if (oportunidades > 0) {
		return `${oportunidades} ${oportunidades === 1 ? 'oportunidade' : 'oportunidades'} hoje · ${itens.length} no total.`
	}
	return 'Nada pendente agora.'
}

export async function lerMemoria<T>(chave: string, padrao: T, database: NexoDatabase): Promise<T> {
	const linha = await database.aiMemory.where('chave').equals(chave).first()
	return linha ? (linha.valor as T) : padrao
}

/** Painel do dia, se já foi calculado. */
export async function lerPainel(dia: string, database: NexoDatabase = db): Promise<PainelDoDia | null> {
	return lerMemoria<PainelDoDia | null>(chavePainel(dia), null, database)
}

export async function apagarPainel(dia: string, database: NexoDatabase = db): Promise<void> {
	const linha = await database.aiMemory.where('chave').equals(chavePainel(dia)).first()
	if (linha) await database.aiMemory.delete(linha.id)
}

/**
 * O usuário agiu sobre um item do painel.
 *
 * `aceito` sobe a confiança do tipo; `dispensado` (o "não é isso") desce;
 * `ignorado` conta para o silêncio de 14 dias. Nenhum desses caminhos muda
 * permissão — só frequência. É a diferença entre aprender e se auto-habilitar.
 */
export async function marcarItem(
	dia: string,
	chaveDoItem: string,
	estado: 'aceito' | 'dispensado' | 'ignorado',
	database: NexoDatabase = db,
): Promise<PainelDoDia | null> {
	const painel = await lerPainel(dia, database)
	if (!painel) return null

	const item = painel.itens.find((entrada) => entrada.sinal.chave === chaveDoItem)
	if (!item) return painel

	item.estado = estado
	const tipo = item.sinal.id

	const confianca = await lerMemoriasComPrefixo<number>('confianca:', database)
	const atual = confianca[tipo] ?? 0.85

	if (estado === 'aceito') {
		await gravarMemoria(`confianca:${tipo}`, Math.min(1, atual + 0.05), database)
	} else if (estado === 'dispensado') {
		await gravarMemoria(`confianca:${tipo}`, Math.max(0.5, atual - 0.15), database)
	} else {
		const memoria = await lerMemoriasComPrefixo<{ ignorados: number; ate: number }>('silencio:', database)
		const silencio = memoria[tipo] ?? { ignorados: 0, ate: 0 }
		const ignorados = silencio.ignorados + 1
		const silenciar = ignorados >= 3

		await gravarMemoria(
			`silencio:${tipo}`,
			{
				ignorados: silenciar ? 0 : ignorados,
				ate: silenciar ? Date.now() + 14 * 86_400_000 : silencio.ate,
			},
			database,
		)
	}

	await gravarMemoria(chavePainel(dia), painel, database)
	return painel
}

/**
 * Avaliação automática: respeita o modo e as análises desligadas.
 *
 * É o que o Shell chama ao abrir e no tique. Devolve `null` quando não era
 * para rodar — e nesse caso nada foi gravado.
 */
export async function avaliarSePermitido(
	opcoes: { agora?: number } = {},
	database: NexoDatabase = db,
): Promise<PainelDoDia | null> {
	const prefs = await lerPreferencias(database)
	if (prefs.modo === 'pausado' || prefs.modo === 'manual') return null
	if (!prefs.analisesAutomaticas) return null

	const agora = opcoes.agora ?? Date.now()
	const dia = toDayKey(new Date(agora))
	const existente = await lerPainel(dia, database)

	if (existente) {
		// Reaproveita o painel só se ele ainda descreve o banco. Duas condições:
		// (1) foi gerado há menos de 30 min — o tique não recalcula a cada
		// navegação; (2) nada foi escrito desde então. Sem a segunda, quem cria
		// uma tarefa continuaria vendo o retrato de antes até o próximo tique,
		// que é justamente o que faz o assistente parecer desconectado.
		const recente = agora - existente.geradoEm < 30 * 60_000
		const fatosNovos = await database.aiJournal.where('em').above(existente.geradoEm).count()
		if (recente && fatosNovos === 0) return existente
	}

	return avaliarAgora({ agora }, database)
}

/** Contagem por nível, para o resumo do Início. */
export function contarPorNivel(painel: PainelDoDia | null): Record<Nivel, number> {
	const contagem: Record<Nivel, number> = { informativo: 0, oportunidade: 0, atencao: 0, urgente: 0 }
	if (!painel) return contagem
	for (const item of painel.itens) contagem[item.sinal.nivel]++
	return contagem
}

/** Ids estáveis para o React não remontar as linhas. */
export function chaveDoItem(item: ItemDoPainel): string {
	return `${item.sinal.id}:${item.sinal.chave}`
}

/** Tique: a hora local cai numa das janelas de avaliação? */
export function ehHoraDeTique(hora: number): boolean {
	return hora === 8 || hora === 13 || hora === 18
}

