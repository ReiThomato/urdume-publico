import { db } from '@/db/db'
import type { AiMemoryRow, AiRun, NexoDatabase } from '@/db/db'
import { createId } from '@/db/id'
import { PREFERENCIAS_PADRAO } from './relevancia'
import type { PreferenciasJarvis } from './relevancia'

/**
 * Estado e memória do Jarvis.
 *
 * Preferências ficam em `settings` (chave `jarvis.prefs`), porque precisam ir
 * no backup: perder "modo silencioso" ao trocar de aparelho seria estranho.
 * O que NÃO vai no backup é a chave da API, que tem tabela própria.
 *
 * Memória operacional fica em `aiMemory`, separada por tipo de chave:
 *   - `confianca:<sinal>`  taxa de aceitação por tipo;
 *   - `silencio:<sinal>`   ignorados seguidos e até quando está calado;
 *   - `visto:<chave>`      último instante em que um acontecimento foi avaliado;
 *   - `fato:<nome>`        preferência durável aprendida ou confirmada.
 */

const CHAVE_PREFS = 'jarvis.prefs'

/** Preferências com os campos ausentes preenchidos pelo padrão. */
export async function lerPreferencias(database: NexoDatabase = db): Promise<PreferenciasJarvis> {
	const linha = await database.settings.get(CHAVE_PREFS)
	const salvo = (linha?.value ?? {}) as Partial<PreferenciasJarvis>
	return {
		...PREFERENCIAS_PADRAO,
		...salvo,
		// Preferências antigas não têm `personalidade`: o merge garante o padrão
		// em vez de deixar campos indefinidos vazando para a tela.
		personalidade: { ...PREFERENCIAS_PADRAO.personalidade, ...(salvo.personalidade ?? {}) },
		silencio: { ...PREFERENCIAS_PADRAO.silencio, ...(salvo.silencio ?? {}) },
		gatilhosDesativados: salvo.gatilhosDesativados ?? [],
		projetosIgnorados: salvo.projetosIgnorados ?? [],
	}
}

export async function salvarPreferencias(
	patch: Partial<PreferenciasJarvis>,
	database: NexoDatabase = db,
): Promise<PreferenciasJarvis> {
	const atual = await lerPreferencias(database)
	const proximo: PreferenciasJarvis = {
		...atual,
		...patch,
		personalidade: { ...atual.personalidade, ...(patch.personalidade ?? {}) },
		silencio: { ...atual.silencio, ...(patch.silencio ?? {}) },
	}
	await database.settings.put({ key: CHAVE_PREFS, value: proximo })
	return proximo
}

/* --------------------------------------------------------------------------
   Memória genérica
   -------------------------------------------------------------------------- */

export async function lerMemoria<T>(chave: string, padrao: T, database: NexoDatabase = db): Promise<T> {
	const linha = await database.aiMemory.where('chave').equals(chave).first()
	return linha ? (linha.valor as T) : padrao
}

export async function gravarMemoria(
	chave: string,
	valor: unknown,
	database: NexoDatabase = db,
): Promise<void> {
	const existente = await database.aiMemory.where('chave').equals(chave).first()
	const linha: AiMemoryRow = {
		id: existente?.id ?? createId(),
		chave,
		valor,
		atualizadoEm: Date.now(),
	}
	await database.aiMemory.put(linha)
}

/** Todas as linhas com um prefixo, sem carregar as outras. */
export async function lerMemoriasComPrefixo<T>(
	prefixo: string,
	database: NexoDatabase = db,
): Promise<Record<string, T>> {
	// Filtra pelo índice `chave`, não pela tabela inteira. Com o diário e a
	// memória crescendo, carregar tudo e filtrar em JavaScript virava
	// travamento ao abrir o app — e a memória só cresce.
	const linhas = await database.aiMemory.where('chave').startsWith(prefixo).toArray()
	const saida: Record<string, T> = {}
	for (const linha of linhas) {
		saida[linha.chave.slice(prefixo.length)] = linha.valor as T
	}
	return saida
}

/* --------------------------------------------------------------------------
   Contabilidade de chamadas
   -------------------------------------------------------------------------- */

export interface Consumo {
	/** Chamadas feitas hoje. */
	hoje: number
	/** Custo acumulado no mês corrente, em US$. */
	mes: number
	/** Última chamada, para o painel. */
	ultima: AiRun | null
}

function diaDe(em: number): string {
	const data = new Date(em)
	return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

export async function custoDoMes(agora: number, database: NexoDatabase = db): Promise<number> {
	const inicioDoMes = new Date(new Date(agora).getFullYear(), new Date(agora).getMonth(), 1).getTime()
	const execucoes = await database.aiRuns.where('em').aboveOrEqual(inicioDoMes).toArray()
	return Math.round(execucoes.reduce((soma, run) => soma + (run.custoUsd ?? 0), 0) * 1e6) / 1e6
}

export async function consumoDeHoje(
	agora: number,
	database: NexoDatabase = db,
): Promise<Consumo> {
	const dia = diaDe(agora)
	const execucoes = await database.aiRuns.where('dia').equals(dia).toArray()
	const mes = await custoDoMes(agora, database)
	const ordenadas = [...execucoes].sort((a, b) => b.em - a.em)

	return { hoje: execucoes.length, mes, ultima: ordenadas[0] ?? null }
}

/**
 * O teto foi atingido?
 *
 * Corte DURO: ao chegar em 100%, o app para de chamar e avisa. Automações
 * locais continuam funcionando — elas não custam nada.
 */
export async function dentroDosLimites(
	prefs: PreferenciasJarvis,
	agora: number,
	database: NexoDatabase = db,
): Promise<{ permitido: boolean; motivo: string | null; consumo: Consumo; restanteMes: number | null }> {
	const consumo = await consumoDeHoje(agora, database)

	if (consumo.hoje >= prefs.chamadasPorDia) {
		return {
			permitido: false,
			motivo: `Limite de ${prefs.chamadasPorDia} chamadas por dia atingido.`,
			consumo,
			restanteMes: null,
		}
	}

	if (prefs.tetoMensalUsd > 0 && consumo.mes >= prefs.tetoMensalUsd) {
		return {
			permitido: false,
			motivo: `Teto de US$ ${prefs.tetoMensalUsd.toFixed(2)} do mês atingido.`,
			consumo,
			restanteMes: 0,
		}
	}

	return {
		permitido: true,
		motivo: null,
		consumo,
		restanteMes: prefs.tetoMensalUsd > 0 ? prefs.tetoMensalUsd - consumo.mes : null,
	}
}

export async function registrarExecucao(
	dados: Omit<AiRun, 'id' | 'dia'>,
	database: NexoDatabase = db,
): Promise<void> {
	const run: AiRun = { ...dados, id: createId(), dia: diaDe(dados.em) }
	try {
		await database.aiRuns.add(run)
	} catch (causa) {
		console.warn('Jarvis: falha ao registrar execução.', causa)
	}
}

/**
 * Poda a conversa e as ações executadas.
 *
 * Ficaram de fora na primeira versão: `aiChat` crescia para sempre (cada
 * pergunta e cada resposta é uma linha) e `aiActions` guardava lotes já
 * desfeitos ou vencidos, que nunca mais seriam usados. Sem esta poda, o
 * banco do aparelho só engorda.
 */
export async function podarConversa(dias: number, database: NexoDatabase = db): Promise<void> {
	const corte = Date.now() - dias * 86_400_000
	try {
		await database.aiChat.where('em').below(corte).delete()
	} catch (causa) {
		console.warn('Jarvis: falha ao podar a conversa.', causa)
	}
}

export async function podarAcoes(dias: number, database: NexoDatabase = db): Promise<void> {
	const corte = Date.now() - dias * 86_400_000
	try {
		// Guarda o dobro do prazo de desfazer: uma ação de 24 h ainda precisa do
		// registro para ser desfeita mesmo depois de dias de histórico podado.
		const lotes = await database.aiActions.where('em').below(corte).toArray()
		await database.aiActions.bulkDelete(lotes.map((lote) => lote.id))
	} catch (causa) {
		console.warn('Jarvis: falha ao podar ações.', causa)
	}
}

/** Poda execuções antigas (mesmo prazo do diário). */
export async function podarExecucoes(dias: number, database: NexoDatabase = db): Promise<void> {
	const corte = Date.now() - dias * 86_400_000
	try {
		await database.aiRuns.where('em').below(corte).delete()
	} catch (causa) {
		console.warn('Jarvis: falha ao podar execuções.', causa)
	}
}
