import { useSyncExternalStore } from 'react'

/**
 * Estado da rede, sem plugin nativo.
 *
 * `navigator.onLine` é a única fonte disponível sem dependência nova, e ela é
 * limitada: responde "existe interface de rede", não "a internet funciona". Um
 * Wi-Fi de hotel com portal cativo aparece como online.
 *
 * Por isso a decisão de tentar a IA nunca depende só disto:
 *
 * - `navigator.onLine === false` → **não tenta**. É informação confiável: sem
 *   interface, não há chamada.
 * - `navigator.onLine === true` → tenta, e trata a falha. Se a rede existe mas
 *   não roteia, o erro vem da chamada e o pedido vai para a fila.
 *
 * A segunda linha é a que importa: achar que "online" garante resposta é o erro
 * que faz o app parecer quebrado em rede ruim.
 */

let online = typeof navigator === 'undefined' ? true : navigator.onLine

const ouvintes = new Set<() => void>()

function avisar(): void {
	for (const ouvinte of ouvintes) ouvinte()
}

if (typeof window !== 'undefined') {
	window.addEventListener('online', () => {
		online = true
		avisar()
	})
	window.addEventListener('offline', () => {
		online = false
		avisar()
	})
}

function inscrever(ouvinte: () => void): () => void {
	ouvintes.add(ouvinte)
	return () => ouvintes.delete(ouvinte)
}

const ler = (): boolean => online

/** Hook: `true` quando o aparelho declara ter rede. */
export function useOnline(): boolean {
	return useSyncExternalStore(inscrever, ler, () => true)
}

/** Versão sem hook, para uso fora de componente. */
export function estaOnline(): boolean {
	if (typeof navigator === 'undefined') return true
	return navigator.onLine
}

/**
 * Erro que merece fila, em vez de "deu erro".
 *
 * Falha de rede, tempo esgotado e 5xx são transitórios: o pedido continua
 * válido. 401 é chave errada — enfileirar não resolve e só confunde.
 */
export function erroTransitorio(status: number | null, mensagem: string | null): boolean {
	if (!estaOnline()) return true
	if (status == null) return true
	if (status >= 500) return true

	const texto = (mensagem ?? '').toLowerCase()
	return /network|fetch|timeout|abort|failed to fetch|load failed/.test(texto)
}
