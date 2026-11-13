import { db } from '@/db/db'
import type { NexoDatabase } from '@/db/db'
import { comoProvedor, PROVEDOR_PADRAO, PROVEDORES } from './provedores'
import type { IdProvedor } from './provedores'
import { gravarMemoria, lerMemoria } from './estado'

/**
 * Chave da API — tabela PRÓPRIA, fora do backup.
 *
 * A decisão do usuário foi "a chave fica no aparelho". Isso é aceitável para
 * uso pessoal, mas cria um risco concreto: `exportBackup` copia a tabela
 * `settings` inteira. Se a chave morasse lá, o primeiro backup exportado (que
 * costuma ir por e-mail ou Drive) entregaria a chave junto.
 *
 * Por isso: tabela `aiSecrets`, e o export filtra as chaves por lista de
 * permissão. Há teste garantindo que a chave não aparece no JSON.
 *
 * **Uma chave por provedor.** Uma chave da OpenAI não autentica no Gemini nem
 * na Anthropic; guardar uma só faria o app trocar de provedor e falhar com
 * "chave recusada" sem o usuário entender por quê.
 *
 * O que esta tabela NÃO faz: criptografia de verdade. O IndexedDB não oferece
 * isso, e escrever "AES" com a chave ao lado seria teatro. A proteção real é
 * (1) não sair no backup, (2) não aparecer na tela depois de salva, (3) o
 * aparelho ter bloqueio de tela. A tela de Ajustes diz isso com essas palavras.
 */

const CHAVE_PADRAO = 'deepseek'
const CHAVE_PROVEDOR = 'jarvis.provedor'

const chaveDe = (provedor: IdProvedor): string => `api:${provedor}`

/**
 * Resolve o argumento opcional que pode ser provedor OU banco.
 *
 * As funções passaram a ter dois opcionais (provedor e banco), e as telas
 * chamavam `salvarChaveApi(lista, db)` antes disso existir. Aceitar os dois na
 * segunda posição evita reescrever oito chamadas e, mais importante, evita que
 * um call site esquecido passe o banco como se fosse provedor — o que gravaria
 * a chave num registro chamado `api:[object Object]`.
 */
function resolver(
	provedorOuBanco: IdProvedor | NexoDatabase | undefined,
	banco: NexoDatabase | undefined,
): { provedor: IdProvedor | undefined; database: NexoDatabase } {
	if (typeof provedorOuBanco === 'string') {
		if (provedorOuBanco in PROVEDORES) {
			return { provedor: provedorOuBanco as IdProvedor, database: banco ?? db }
		}
	} else if (provedorOuBanco) {
		return { provedor: undefined, database: provedorOuBanco }
	}
	return { provedor: undefined, database: banco ?? db }
}

/** Qual provedor está ativo. */
export async function lerProvedor(database: NexoDatabase = db): Promise<IdProvedor> {
	return comoProvedor(await lerMemoria<unknown>(CHAVE_PROVEDOR, null, database))
}

export async function salvarProvedor(
	provedor: IdProvedor,
	database: NexoDatabase = db,
): Promise<void> {
	await gravarMemoria(CHAVE_PROVEDOR, provedor, database)
}

export async function salvarChaveApi(
	valor: string,
	provedorOuBanco?: IdProvedor | NexoDatabase,
	banco?: NexoDatabase,
): Promise<void> {
	const { provedor, database } = resolver(provedorOuBanco, banco)
	const limpa = valor.trim()
	if (!limpa) throw new Error('A chave está vazia.')

	const qual = provedor ?? (await lerProvedor(database))
	await database.aiSecrets.put({ chave: chaveDe(qual), valor: limpa, atualizadoEm: Date.now() })
}

/**
 * Lê a chave.
 *
 * Compatibilidade: a versão anterior guardava com a chave `deepseek`, sem
 * prefixo. Quem já salvou uma chave não perde — o fallback lê o registro antigo
 * e o migra na primeira leitura do provedor DeepSeek.
 */
export async function lerChaveApi(
	provedorOuBanco?: IdProvedor | NexoDatabase,
	banco?: NexoDatabase,
): Promise<string | null> {
	const { provedor, database } = resolver(provedorOuBanco, banco)
	const qual = provedor ?? (await lerProvedor(database))
	const linha = await database.aiSecrets.get(chaveDe(qual))
	if (linha?.valor) return linha.valor

	// Registro da versão antiga: só valia para a DeepSeek.
	if (qual === 'deepseek') {
		const antiga = await database.aiSecrets.get(CHAVE_PADRAO)
		if (antiga?.valor) {
			await database.aiSecrets.put({
				chave: chaveDe('deepseek'),
				valor: antiga.valor,
				atualizadoEm: antiga.atualizadoEm,
			})
			return antiga.valor
		}
	}

	return null
}

export async function temChaveApi(
	provedorOuBanco?: IdProvedor | NexoDatabase,
	banco?: NexoDatabase,
): Promise<boolean> {
	return (await lerChaveApi(provedorOuBanco, banco)) != null
}

/** Só o final, para a tela confirmar qual chave está salva sem mostrá-la. */
export async function pistaDaChave(
	provedorOuBanco?: IdProvedor | NexoDatabase,
	banco?: NexoDatabase,
): Promise<string | null> {
	const chave = await lerChaveApi(provedorOuBanco, banco)
	if (!chave) return null
	return `••••${chave.slice(-4)}`
}

export async function apagarChaveApi(
	provedorOuBanco?: IdProvedor | NexoDatabase,
	banco?: NexoDatabase,
): Promise<void> {
	const { provedor, database } = resolver(provedorOuBanco, banco)
	const qual = provedor ?? (await lerProvedor(database))
	await database.aiSecrets.delete(chaveDe(qual))
}

/** Exportado para o teste conferir que o padrão inicial é o da lista. */
export const PROVEDOR_INICIAL: IdProvedor = PROVEDOR_PADRAO
