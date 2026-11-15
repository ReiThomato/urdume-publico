/**
 * Chaves guardadas no aparelho.
 *
 * O app já se chamou Rabisco e depois Nexo. Cada troca de nome deixou chaves
 * antigas no `localStorage` do usuário — e é onde estão o tema já resolvido (o
 * que evita a piscada na abertura) e a prancheta de cores. Renomear sem ler as
 * antigas faria o app "esquecer" essas preferências a cada mudança de nome.
 *
 * Regra deste arquivo:
 * - a chave NOVA é a que se escreve;
 * - a leitura procura a nova e depois as antigas;
 * - quando encontra uma antiga, copia para a nova (`migrar`) e segue.
 *
 * Nada aqui apaga dado do usuário: a chave antiga fica onde está, inofensiva.
 */

/** Uma chave com o nome atual e os nomes que ela já teve. */
interface ChaveComHistorico {
	atual: string
	antigas: string[]
}

export const CHAVES = {
	/** Variáveis CSS do tema já resolvidas (lidas no index.html, antes do React). */
	coresDoTema: { atual: 'urdume.tema.cores', antigas: ['nexo.tema.cores', 'rabisco.tema.cores'] },
	/** Espelho síncrono das preferências de tema. */
	espelhoDoTema: { atual: 'urdume.tema', antigas: ['nexo.tema'] },
	/**
	 * Últimas formações de cor aplicadas (semente + tipo de roda + harmonia).
	 * É a "prancheta" de quem está montando o tema; vive no mesmo lugar do
	 * espelho porque precisa existir antes do banco abrir.
	 */
	formacoesRecentes: { atual: 'urdume.tema.formacoes', antigas: ['nexo.tema.formacoes'] },
} satisfies Record<string, ChaveComHistorico>

/** Lê a chave nova; se não existir, tenta as antigas (na ordem). */
export function lerChave(chave: ChaveComHistorico): string | null {
	try {
		const novo = localStorage.getItem(chave.atual)
		if (novo !== null) return novo
		for (const antiga of chave.antigas) {
			const valor = localStorage.getItem(antiga)
			if (valor !== null) return valor
		}
		return null
	} catch {
		// Modo privado ou armazenamento bloqueado: o app funciona sem espelho.
		return null
	}
}

/** Grava na chave nova. Nunca lança: sem armazenamento, o app segue. */
export function gravarChave(chave: ChaveComHistorico, valor: string): void {
	try {
		localStorage.setItem(chave.atual, valor)
	} catch {
		// Sem localStorage: nada a salvar.
	}
}

/** Remove a chave nova (a antiga fica, para não apagar histórico). */
export function apagarChave(chave: ChaveComHistorico): void {
	try {
		localStorage.removeItem(chave.atual)
	} catch {
		// Sem localStorage: nada a remover.
	}
}

/**
 * Copia o valor de uma chave antiga para a nova, se a nova ainda não existe.
 *
 * Chamado uma vez na abertura. É idempotente: se a nova já tem valor, não faz
 * nada — a escolha mais recente do usuário sempre vence a cópia.
 */
export function migrarChave(chave: ChaveComHistorico): void {
	try {
		if (localStorage.getItem(chave.atual) !== null) return
		for (const antiga of chave.antigas) {
			const valor = localStorage.getItem(antiga)
			if (valor === null) continue
			localStorage.setItem(chave.atual, valor)
			return
		}
	} catch {
		// Sem localStorage: nada a migrar.
	}
}

/** Migra todas as chaves conhecidas. Seguro chamar em toda abertura. */
export function migrarChavesAntigas(): void {
	for (const chave of Object.values(CHAVES)) migrarChave(chave)
}
