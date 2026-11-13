/**
 * Identificador local. `crypto.randomUUID` existe em navegadores modernos e no
 * Node 19+, mas o fallback evita quebrar em contexto inseguro (http em rede local),
 * onde a API fica indisponível.
 */
export function createId(): string {
	const cryptoApi = globalThis.crypto

	if (typeof cryptoApi?.randomUUID === 'function') {
		return cryptoApi.randomUUID()
	}

	const bytes = new Uint8Array(16)
	if (typeof cryptoApi?.getRandomValues === 'function') {
		cryptoApi.getRandomValues(bytes)
	} else {
		for (let i = 0; i < bytes.length; i += 1) {
			bytes[i] = Math.floor(Math.random() * 256)
		}
	}

	// Marca versão 4 e variante RFC 4122.
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
