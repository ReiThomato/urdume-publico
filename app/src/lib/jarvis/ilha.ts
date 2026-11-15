import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { lerFilaDeRecados } from './recados'
import type { SugestaoPensada } from './recados'
import { avaliarAgora, lerMemoria } from './motor'
import type { ItemDoPainel } from './motor'
import { gravarMemoria, lerPreferencias } from './estado'
import type { AcaoDaIA } from './ia'

/**
 * O que a ilha mostra, de todas as fontes — e por que é persistido.
 *
 * ## Duas fontes
 *
 * 1. **O que ela pensou** (`ilha:fila`) — texto do modelo e ações propostas.
 *    Depende de chave de API e de rede.
 * 2. **O que as regras viram** (painel do dia) — aritmética pura, sempre
 *    disponível. É o que garante a ilha existindo sem chave, sem rede e sem
 *    gastar um centavo.
 *
 * ## O problema que a persistência resolve
 *
 * A primeira versão lia o painel direto. Parecia certo e criava um defeito
 * cruel: o motor marca um sinal como **visto** no instante em que ele
 * interrompe, e na avaliação seguinte o mesmo sinal cai em *cooldown* e **sai
 * do painel**. Resultado: a ilha aparecia, recolhia em 15 s e, na releitura
 * seguinte, o recado não existia mais — apagado sem o usuário ter tocado em
 * nada. Era a mesma falha de antes ("recolher apagava"), só que causada pelo
 * motor em vez do componente.
 *
 * Por isso as regras que a ilha mostrou são **copiadas** para `ilha:regras` e
 * vivem lá até o usuário dispensar. O painel tem o ciclo de vida dele
 * (cooldown, orçamento); a ilha tem o seu.
 */

export interface RecadoDaIlha {
	id: string
	/** De onde veio: muda de onde ele é removido ao dispensar. */
	origem: 'ia' | 'regra'
	titulo: string
	/** Texto principal: a fala do modelo ou título + detalhe do sinal. */
	mensagem: string
	nivel: 'informativo' | 'oportunidade' | 'atencao' | 'urgente'
	/** Ações que a IA propôs. Vazio quando veio de regra. */
	acoes: AcaoDaIA[]
	/** O sinal de origem, para o painel marcar como tratado. */
	sinal: string
	/**
	 * Entidade alvo, quando houver.
	 *
	 * É o que dá ESCOPO à recusa: "não sugerir tarefas para o projeto Reforma"
	 * é diferente de "não sugerir nada sobre projetos". Sem o alvo, uma recusa
	 * legítima silenciaria a família inteira.
	 */
	entidade?: string
	/** Instante, para ordenar. */
	em: number
}

/** Quantos recados a ilha aceita na fila de uma vez. */
export const LIMITE_DA_ILHA = 6

/** Memória das regras já mostradas (persistente até o usuário dispensar). */
export const CHAVE_REGRAS = 'ilha:regras'

/** Quantas regras ficam guardadas, no máximo. */
const LIMITE_DE_REGRAS = 12

/**
 * Sinais que o usuário já dispensou da ilha.
 *
 * Sem isto, dispensar não dispensava: o painel do dia continuava com o item
 * como `novo` e a leitura seguinte o trazia de volta. O usuário tocava em
 * "Agora não" e o mesmo cartão reaparecia 20 s depois — pior que não ter botão.
 */
const CHAVE_DISPENSADAS = 'ilha:dispensadas'

/**
 * Quanto tempo um "Agora não" silencia aquele assunto.
 *
 * Antes era para sempre (dentro do dia, com a mesma chave). O problema: quem
 * tocou sem querer ficava sem aquele assunto até a chave mudar — e a única saída
 * era caçar o diagnóstico. Duas horas é o que faz sentido para "não agora":
 * depois disso, se o assunto continua valendo, ele volta.
 */
export const HORAS_DE_SILENCIO = 2

function idDeRegra(sinal: string): string {
	return `regra:${sinal}`
}

function deSugestao(sugestao: SugestaoPensada): RecadoDaIlha {
	return {
		id: `${sugestao.em}:${sugestao.sinal}`,
		origem: 'ia',
		titulo: sugestao.titulo,
		mensagem: sugestao.mensagem,
		nivel: sugestao.nivel ?? 'oportunidade',
		acoes: sugestao.acoes,
		sinal: sugestao.sinal,
		em: sugestao.em,
	}
}

function deItem(item: ItemDoPainel): RecadoDaIlha {
	return {
		id: idDeRegra(item.sinal.chave),
		origem: 'regra',
		titulo: item.sinal.titulo,
		// Título + detalhe, na ordem em que uma pessoa falaria: primeiro o
		// assunto, depois o porquê. Só o detalhe deixava a ilha começando pelo
		// meio da frase.
		mensagem: `${item.sinal.titulo}. ${item.sinal.detalhe}`,
		nivel: item.sinal.nivel,
		acoes: [],
		sinal: item.sinal.chave,
		// O primeiro alvo do sinal, quando existe.
		...(item.sinal.entidades.length > 0 ? { entidade: item.sinal.entidades[0] } : {}),
		em: item.em,
	}
}

async function lerRegras(database: NexoDatabase): Promise<RecadoDaIlha[]> {
	const salvas = await lerMemoria<RecadoDaIlha[]>(CHAVE_REGRAS, [], database)
	return Array.isArray(salvas) ? salvas : []
}

/**
 * Acrescenta as regras novas ao que já estava guardado.
 *
 * Devolve a lista final. Uma regra que já está guardada não é tocada — o texto
 * dela é o do momento em que apareceu, e reescrever a cada leitura faria o
 * cartão mudar sozinho na tela.
 */
async function guardarRegrasNovas(
	itens: ItemDoPainel[],
	guardadas: RecadoDaIlha[],
	database: NexoDatabase,
): Promise<RecadoDaIlha[]> {
	const existentes = new Set(guardadas.map((recado) => recado.id))
	const dispensadas = await lerMemoria<Record<string, number>>(CHAVE_DISPENSADAS, {}, database)
	const agora = Date.now()

	/*
	 * Só conta como dispensado o que ainda está dentro da janela. O mapa é
	 * `chave do sinal → quando foi dispensado`; o que passou de
	 * `HORAS_DE_SILENCIO` volta a aparecer sozinho.
	 */
	const jaDispensados = new Set(
		Object.entries(dispensadas ?? {})
			.filter(([, em]) => typeof em === 'number' && agora - em < HORAS_DE_SILENCIO * 3_600_000)
			.map(([chave]) => chave),
	)

	const novas = itens
		.filter((item) => !existentes.has(idDeRegra(item.sinal.chave)))
		.filter((item) => !jaDispensados.has(item.sinal.chave))
		.map(deItem)

	if (novas.length === 0) return guardadas

	const todas = [...guardadas, ...novas].slice(-LIMITE_DE_REGRAS)
	await gravarMemoria(CHAVE_REGRAS, todas, database).catch(() => undefined)
	return todas
}

/**
 * Monta a fila da ilha.
 *
 * Ordem: primeiro o que a IA pensou (tem mais contexto), depois as regras, da
 * mais recente para a mais antiga. Um assunto que já virou fala da IA não
 * aparece de novo como regra.
 */
export async function lerRecadosDaIlha(
	agora = Date.now(),
	database: NexoDatabase = db,
): Promise<RecadoDaIlha[]> {
	const prefs = await lerPreferencias(database)
	if (prefs.modo === 'pausado') return []

	const [fila, regrasSalvas] = await Promise.all([
		lerFilaDeRecados(database),
		lerRegras(database),
	])

	/*
	 * Avaliação de EXIBIÇÃO, não o painel salvo.
	 *
	 * O painel salvo já foi consumido pelo motor: os sinais que interromperam
	 * estão marcados como `visto` e o painel seguinte volta sem eles. Ler o
	 * painel salvo fazia a ilha aparecer uma vez e nunca mais.
	 *
	 * `paraExibir` monta a lista de agora sem consumir orçamento nem marcar
	 * `visto` — a ilha mostra, e quem paga o preço da atenção é a notificação,
	 * que tem as travas dela.
	 */
	/*
	 * Avaliação de exibição, com dois planos.
	 *
	 * Se `avaliarAgora` falhar (banco travado, cota cheia, migração pendente),
	 * a ilha NÃO pode ficar muda: cai para o painel salvo do dia. E o motivo da
	 * falha fica registrado em `ilha:erro`, que a tela de diagnóstico mostra —
	 * sem isso, "a ilha não aparece" seria um mistério sem rastro.
	 */
	let painel: { itens: ItemDoPainel[] } | null = await avaliarAgora({ agora }, database).catch(async (causa) => {
		await gravarMemoria(
			'ilha:erro',
			{ em: agora, mensagem: causa instanceof Error ? causa.message : String(causa) },
			database,
		).catch(() => undefined)
		return null
	})

	if (!painel) {
		const dia = new Date(agora)
		const chaveDia = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`
		painel = await lerMemoria<{ itens: ItemDoPainel[] } | null>(`painel:${chaveDia}`, null, database)
	}

	const pensados = fila.map(deSugestao)

	// A fala da IA é mais rica: se ela já comentou o assunto, a regra não entra.
	const vistos = new Set(pensados.map((recado) => recado.sinal))

	/*
	 * O filtro da ilha é MAIS PERMISSIVO que o da notificação.
	 *
	 * `interrompe` existe para decidir se o celular pode tocar, acender a tela e
	 * tirar o usuário do que ele estava fazendo — um recurso escasso, com
	 * orçamento diário. A ilha não faz nada disso: é um cartão silencioso no
	 * topo do app, que só aparece para quem já está com o app aberto. Amarrar as
	 * duas ao mesmo veredito deixava a ilha muda justamente quando o orçamento
	 * do dia tinha acabado.
	 *
	 * O que continua barrando: tipo desligado pelo usuário e tipo silenciado por
	 * repetição.
	 */
	const candidatas = (painel?.itens ?? [])
		.filter((item) => item.estado === 'novo')
		.filter((item) => item.sinal.nivel === 'urgente' || item.sinal.nivel === 'atencao')
		.filter((item) => item.motivo !== 'gatilho-desligado' && item.motivo !== 'repetido')
		.filter((item) => !vistos.has(item.sinal.chave))
		.sort((a, b) => b.relevancia - a.relevancia)

	const regras = await guardarRegrasNovas(candidatas, regrasSalvas, database)

	// Uma regra guardada perde a vez se a IA passou a falar do mesmo assunto.
	const regrasVisiveis = regras.filter((recado) => !vistos.has(recado.sinal))

	return [...pensados, ...regrasVisiveis].slice(0, LIMITE_DA_ILHA)
}

/**
 * Remove um recado da ilha de vez.
 *
 * A IA e a regra moram em lugares diferentes: a fala em `ilha:fila`, a regra em
 * `ilha:regras`. O id diz de onde remover, sem o chamador precisar saber.
 */
export async function descartarRecado(
	id: string,
	database: NexoDatabase = db,
): Promise<void> {
	if (id.startsWith('regra:')) {
		const guardadas = await lerRegras(database)
		const alvo = guardadas.find((recado) => recado.id === id)

		// Marca o sinal como dispensado: o painel do dia pode continuar
		// listando-o como `novo`, e sem esta marca ele voltaria na releitura.
		if (alvo) {
			// Guarda a chave e o instante: o silêncio expira em `HORAS_DE_SILENCIO`.
			const dispensadas = await lerMemoria<Record<string, number>>(CHAVE_DISPENSADAS, {}, database)
			const mapa = dispensadas && typeof dispensadas === 'object' ? dispensadas : {}
			mapa[alvo.sinal] = Date.now()
			await gravarMemoria(CHAVE_DISPENSADAS, mapa, database)
		}

		await gravarMemoria(
			CHAVE_REGRAS,
			guardadas.filter((recado) => recado.id !== id),
			database,
		)
		return
	}

	// Fala da IA: `em:sinal` na fila de recados.
	const { consumirRecado } = await import('./recados')
	await consumirRecado(id, database)
}

/** Só para os testes: limpa o que a ilha guardou. */
export async function limparRecadosDaIlha(database: NexoDatabase = db): Promise<void> {
	await gravarMemoria(CHAVE_REGRAS, [], database)
	await gravarMemoria(CHAVE_DISPENSADAS, {}, database)
}

/**
 * Reabilita um assunto que foi dispensado.
 *
 * Existe pelo caso real: um "Agora não" dado por engano, ou um teste, deixava
 * aquele assunto fora da ilha até a chave do sinal mudar. Sem um caminho de
 * volta, a única saída seria esperar o dia seguinte.
 */
export async function reabilitarAssunto(
	sinal: string,
	database: NexoDatabase = db,
): Promise<void> {
	const dispensadas = await lerMemoria<Record<string, number>>(CHAVE_DISPENSADAS, {}, database)
	const mapa = dispensadas && typeof dispensadas === 'object' ? { ...dispensadas } : {}
	delete mapa[sinal]
	await gravarMemoria(CHAVE_DISPENSADAS, mapa, database)
}

/** Lista o que está dispensado — o diagnóstico mostra e permite reabilitar. */
export async function lerDispensados(database: NexoDatabase = db): Promise<string[]> {
	const dispensadas = await lerMemoria<Record<string, number>>(CHAVE_DISPENSADAS, {}, database)
	const agora = Date.now()
	return Object.entries(dispensadas ?? {})
		.filter(([, em]) => typeof em === 'number' && agora - em < HORAS_DE_SILENCIO * 3_600_000)
		.map(([chave]) => chave)
}
