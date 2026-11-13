import { tentar } from '@/lib/escrita'

/**
 * Aviso de falha de escrita, visível na tela inteira.
 *
 * A captura é feita no `Shell`, que é o ponto por onde passam todas as telas.
 * Os componentes continuam chamando `void toggleTask(...)`; em vez de reescrever
 * 13 chamadas e esquecer uma na próxima, a falha sobe até aqui. O erro aparece
 * como faixa no rodapé, acima da navegação, com o texto de quem falhou.
 *
 * Não é mágica: só captura o que passar por `escrever`. Chamadas que engolem o
 * erro com `.catch(() => {})` continuam silenciosas — por isso a regra é usar
 * `escrever` em toda escrita nova.
 */
type Ouvinte = (mensagem: string) => void

const ouvintes = new Set<Ouvinte>()

export function aoFalharEscrita(ouvinte: Ouvinte): () => void {
	ouvintes.add(ouvinte)
	return () => {
		ouvintes.delete(ouvinte)
	}
}

function anunciarFalha(mensagem: string): void {
	for (const ouvinte of ouvintes) ouvinte(mensagem)
}

/**
 * Envolve uma escrita: devolve uma promessa que nunca rejeita, para o `void` do
 * `onClick` não virar `unhandledrejection`, e avisa a interface quando falha.
 */
export async function escrever(acao: () => Promise<unknown>): Promise<void> {
	const resultado = await tentar(acao)
	if (!resultado.ok && resultado.erro) {
		anunciarFalha(resultado.erro)
	}
}
