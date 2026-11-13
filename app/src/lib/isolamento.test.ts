import { describe, expect, it } from 'vitest'

/**
 * Isolamento da variante pública.
 *
 * Este é o teste que protege os dados do autor do projeto original. A variante
 * nasceu como cópia: se o `appId` e o nome do banco ficarem iguais, instalar a
 * pública no mesmo celular **substitui** o app original — e, pior, as duas
 * passam a disputar o mesmo IndexedDB, de modo que a pública leria e
 * reescreveria as tarefas reais. Uma linha esquecida aqui custa os dados de
 * alguém.
 *
 * Também confere o inverso do pedido: nada da parte privada (servidor,
 * sincronização, endereço próprio) pode ter sobrado na cópia.
 */

const ler = async (caminho: string): Promise<string> => {
	const fs = await import('node:fs')
	return fs.readFileSync(new URL(`../../../${caminho}`, import.meta.url), 'utf-8')
}

const existe = async (caminho: string): Promise<boolean> => {
	const fs = await import('node:fs')
	return fs.existsSync(new URL(`../../../${caminho}`, import.meta.url))
}

describe('identidade própria', () => {
	it('o applicationId não é o do app original', async () => {
		const config = await ler('app/capacitor.config.ts')

		// `app.nexo.pessoal` é o id do app privado. Reutilizá-lo faz o Android
		// tratar a variante como atualização do mesmo app.
		expect(config).not.toContain("appId: 'app.nexo.pessoal'")
		expect(config).toContain("appId: 'app.urdume.publico'")
	})

	it('o banco IndexedDB tem nome próprio', async () => {
		const banco = await ler('app/src/db/db.ts')

		// Dois apps com o mesmo banco no mesmo WebView leem as mesmas tarefas.
		expect(banco).not.toContain("constructor(name = 'nexo')")
		expect(banco).toContain("constructor(name = 'urdume-publico')")
	})

	it('o nome visível e o pacote do projeto são da variante', async () => {
		const pkg = await ler('app/package.json')
		const config = await ler('app/capacitor.config.ts')

		expect(pkg).toContain('"name": "urdume-publico"')
		expect(pkg).not.toContain('"name": "nexo"')
		expect(config).toContain("appName: 'Urdume Público'")
	})
})

describe('o que a variante não tem', () => {
	it('nenhum vestígio do tldraw', async () => {
		const pkg = await ler('app/package.json')
		expect(pkg).not.toContain('tldraw')

		// Pastas e telas que só existiam pelo editor.
		expect(await existe('app/src/quadro')).toBe(false)
		expect(await existe('app/src/screens/Quadro.tsx')).toBe(false)
		expect(await existe('app/src/screens/Paginas.tsx')).toBe(false)
	})

	it('nenhum código importa tldraw', async () => {
		const fs = await import('node:fs')
		const pasta = new URL('../', import.meta.url)
		const achados: string[] = []

		const varrer = (dir: URL): void => {
			for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
				// O próprio teste cita o nome do pacote; não é uso.
				if (entrada.name === 'isolamento.test.ts') continue
				const alvo = new URL(`${entrada.name}${entrada.isDirectory() ? '/' : ''}`, dir)
				if (entrada.isDirectory()) {
					varrer(alvo)
					continue
				}
				if (!/\.(ts|tsx)$/.test(entrada.name)) continue
				const texto = fs.readFileSync(alvo, 'utf-8')
				if (/from 'tldraw'|from "tldraw"|tldraw\.css/.test(texto)) achados.push(alvo.pathname)
			}
		}

		varrer(pasta)
		expect(achados).toEqual([])
	})

	it('nenhuma parte da sincronização', async () => {
		expect(await existe('app/src/lib/sync')).toBe(false)
		expect(await existe('app/src/ui/SecaoSync.tsx')).toBe(false)
	})

	it('nenhum endereço privado do autor', async () => {
		const arquivos = [
			'app/src/db/db.ts',
			'app/src/lib/jarvis/provedores.ts',
			'app/capacitor.config.ts',
		]

		for (const arquivo of arquivos) {
			const texto = await ler(arquivo)
			// Nada de servidor pessoal, túnel, Tailscale do autor ou conta.
			expect(texto).not.toMatch(/cloud\.thomato\.com\.br/)
			expect(texto).not.toMatch(/redmi-12/)
			expect(texto).not.toMatch(/api-cdn\.deploy\.com/)
			expect(texto).not.toMatch(/ReiThomato/)
		}
	})
})

describe('provedores de IA abertos', () => {
	it('oferece pelo menos OpenAI, Gemini e Claude', async () => {
		const { LISTA_DE_PROVEDORES } = await import('./jarvis/provedores')
		const ids = LISTA_DE_PROVEDORES.map((p) => p.id)

		expect(ids).toContain('openai')
		expect(ids).toContain('gemini')
		expect(ids).toContain('claude')
	})

	it('todo provedor tem os três campos que a tela mostra', async () => {
		const { LISTA_DE_PROVEDORES } = await import('./jarvis/provedores')

		for (const provedor of LISTA_DE_PROVEDORES) {
			expect(provedor.nome.length, `${provedor.id} sem nome`).toBeGreaterThan(2)
			expect(provedor.ondePegarChave, `${provedor.id} sem onde pegar a chave`).toContain('.')
			expect(provedor.modelo.length, `${provedor.id} sem modelo`).toBeGreaterThan(2)
		}
	})

	it('nenhum provedor aponta para servidor privado', async () => {
		const { LISTA_DE_PROVEDORES } = await import('./jarvis/provedores')

		for (const provedor of LISTA_DE_PROVEDORES) {
			expect(provedor.url).toMatch(/^https:\/\//)
			expect(provedor.url).not.toMatch(/deploy\.com/)
			expect(provedor.url).not.toMatch(/\d+\.\d+\.\d+\.\d+/)
		}
	})
})
