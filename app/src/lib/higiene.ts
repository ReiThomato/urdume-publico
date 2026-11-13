/**
 * Higiene de versão: o que o app faz quando o pacote muda debaixo dele.
 *
 * Três sintomas do mesmo problema, todos relatados depois de instalar uma
 * versão nova:
 *
 *   1. **a interface antiga aparecia primeiro** e a nova só depois de um tempo;
 *   2. **dados já apagados voltavam** mesmo após "limpar todos os dados" e
 *      desinstalar;
 *   3. no aparelho principal, **nada parecia mudar** entre versões.
 *
 * Causas, cada uma tratada no seu lugar:
 *
 * - (1) o service worker do PWA cacheava o bundle e servia o antigo. No APK ele
 *   é desregistrado e os caches apagados em `main.tsx`;
 * - (2) `android:allowBackup="true"` fazia o Android restaurar o banco antigo
 *   numa instalação nova. Desligado no manifesto, com regras explícitas em
 *   `res/xml/regras_de_dados.xml`;
 * - (3) o `versionCode` do APK ficou em 1 em todas as entregas, então o sistema
 *   não via "versão nova".
 *
 * O que sobra para este arquivo é a rede de segurança: se o app abrir e a
 * versão gravada no aparelho não for a versão que está rodando agora, alguma
 * coisa ficou para trás. Aqui os caches do WebView são limpos uma vez, sem
 * tocar no banco — os dados do usuário continuam onde estão.
 */

const CHAVE_VERSAO = 'urdume.versao.vista'

/** Versão desta build, injetada pelo Vite a partir do package.json. */
const VERSAO_ATUAL = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/**
 * Acesso tolerante ao armazenamento local.
 *
 * Em WebView com armazenamento bloqueado (modo restrito, cota cheia), tocar em
 * `window.localStorage` lança. Aqui a falha é tratada como "não há versão
 * anterior", que só significa: não limpar nada nesta abertura.
 */
function armazem(): Storage | null {
	try {
		if (typeof localStorage === 'undefined') return null
		return localStorage
	} catch {
		return null
	}
}

export interface Higiene {
	/** A versão mudou desde a última abertura? */
	versaoNova: boolean
	/** Limpou os caches do WebView? */
	limpouCaches: boolean
	/** Versão encontrada antes. */
	anterior: string | null
}

/**
 * Compara a versão gravada com a atual e, se mudou, limpa caches de recursos.
 *
 * **Nunca toca no banco.** Apagar tarefas do usuário porque "a versão mudou"
 * seria o pior tipo de surpresa. O alvo é só o cache de arquivos do navegador,
 * que é reconstruível por definição.
 */
export async function conferirVersao(): Promise<Higiene> {
	const guardado = armazem()
	let anterior: string | null = null
	try {
		anterior = guardado?.getItem(CHAVE_VERSAO) ?? null
	} catch {
		// Armazenamento bloqueado: segue sem comparar.
	}

	const versaoNova = anterior !== null && anterior !== VERSAO_ATUAL
	let limpouCaches = false

	if (versaoNova) {
		try {
			if (typeof caches !== 'undefined') {
				const chaves = await caches.keys()
				await Promise.all(chaves.map((chave) => caches.delete(chave)))
				limpouCaches = chaves.length > 0
			}
		} catch {
			// Sem suporte: não é motivo para impedir a abertura.
		}
	}

	try {
		guardado?.setItem(CHAVE_VERSAO, VERSAO_ATUAL)
	} catch {
		// Idem.
	}

	return { versaoNova, limpouCaches, anterior }
}

/** Versão desta build, para a tela de Ajustes. */
export function versaoDaBuild(): string {
	return VERSAO_ATUAL
}
