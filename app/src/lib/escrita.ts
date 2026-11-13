import { useCallback, useState } from 'react'

/**
 * Executa uma escrita no banco e mostra o erro, em vez de engolir.
 *
 * Antes, as telas chamavam `void updateTask(...)` direto no `onClick`: se a
 * escrita falhasse (cota do IndexedDB cheia, transação abortada, aba duplicada),
 * a folha fechava como se tivesse salvado e o usuário só descobria depois — ou
 * nunca. Foi o problema de "falha silenciosa" do diagnóstico.
 *
 * Uso:
 *   const { executar, erro, limpando } = useEscrita()
 *   onClick={() => void executar(() => updateTask(id, patch), 'Não foi possível salvar.')}
 *
 * `erro` volta nulo a cada tentativa nova; quem chama renderiza o aviso.
 */
export function useEscrita(): {
	executar: (acao: () => Promise<unknown>, mensagem?: string) => Promise<boolean>
	erro: string | null
	limpando: boolean
	limparErro: () => void
} {
	const [erro, setErro] = useState<string | null>(null)
	const [limpando, setLimpando] = useState(false)

	const executar = useCallback(async (acao: () => Promise<unknown>, mensagem?: string): Promise<boolean> => {
		setErro(null)
		setLimpando(true)
		try {
			await acao()
			return true
		} catch (causa) {
			setErro(mensagem ?? (causa instanceof Error ? causa.message : 'Não foi possível salvar.'))
			return false
		} finally {
			setLimpando(false)
		}
	}, [])

	const limparErro = useCallback(() => setErro(null), [])

	return { executar, erro, limpando, limparErro }
}

/**
 * Auxiliar sem hook, para uso fora de componente (ou dentro de `onClick` que já
 * tem o próprio estado de erro). Devolve `true` se a escrita passou.
 */
export async function tentar(acao: () => Promise<unknown>): Promise<{ ok: boolean; erro: string | null }> {
	try {
		await acao()
		return { ok: true, erro: null }
	} catch (causa) {
		return { ok: false, erro: causa instanceof Error ? causa.message : 'Não foi possível salvar.' }
	}
}
