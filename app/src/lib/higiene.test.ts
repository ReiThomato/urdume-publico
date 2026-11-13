import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Higiene de versão.
 *
 * Protege os três sintomas relatados depois de instalar uma versão nova:
 *
 *   - interface antiga aparecendo primeiro  → service worker/cache;
 *   - dados apagados voltando               → backup automático do Android;
 *   - nada mudando entre versões            → versionCode fixo em 1.
 *
 * Os dois primeiros são de plataforma e estão cobertos por teste de contrato
 * (arquivo de manifesto e de build). Este testa a rede de segurança em JS.
 */

const cachesApagados: string[] = []

vi.stubGlobal('caches', {
	keys: async () => ['workbox-precache-v2', 'outro'],
	delete: async (chave: string) => {
		cachesApagados.push(chave)
		return true
	},
})

const armazenamento = new Map<string, string>()
const storageFalso: Storage = {
	getItem: (chave: string) => armazenamento.get(chave) ?? null,
	setItem: (chave: string, valor: string) => {
		armazenamento.set(chave, valor)
	},
	removeItem: (chave: string) => {
		armazenamento.delete(chave)
	},
	clear: () => armazenamento.clear(),
	key: (indice: number) => [...armazenamento.keys()][indice] ?? null,
	get length() {
		return armazenamento.size
	},
}
vi.stubGlobal('localStorage', storageFalso)

// O Vite injeta isso no build real.
vi.stubGlobal('__APP_VERSION__', '0.5.0')

const { conferirVersao, versaoDaBuild } = await import('@/lib/higiene')

beforeEach(() => {
	cachesApagados.length = 0
	armazenamento.clear()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('higiene de versão', () => {
	it('na primeira abertura não apaga nada, só grava a versão', async () => {
		const resultado = await conferirVersao()

		expect(resultado.versaoNova).toBe(false)
		expect(cachesApagados).toHaveLength(0)
		expect(armazenamento.get('urdume.versao.vista')).toBe('0.5.0')
	})

	it('versão igual não limpa cache nem reescreve', async () => {
		armazenamento.set('urdume.versao.vista', '0.5.0')
		const resultado = await conferirVersao()

		expect(resultado.versaoNova).toBe(false)
		expect(cachesApagados).toHaveLength(0)
	})

	it('versão diferente limpa os caches, e só eles', async () => {
		armazenamento.set('urdume.versao.vista', '0.4.0')
		const resultado = await conferirVersao()

		expect(resultado.versaoNova).toBe(true)
		expect(resultado.limpouCaches).toBe(true)
		expect(cachesApagados.sort()).toEqual(['outro', 'workbox-precache-v2'])
		expect(armazenamento.get('urdume.versao.vista')).toBe('0.5.0')
	})

	it('expõe a versão da build', () => {
		expect(versaoDaBuild()).toBe('0.5.0')
	})
})

/**
 * Contrato de plataforma. Estes testes falham se alguém desfizer a correção
 * sem perceber — foi exatamente o que aconteceu por três rodadas.
 */
describe('configuração de plataforma', () => {
	it('o APK não permite restauração automática de dados', async () => {
		const fs = await import('node:fs')
		const manifesto = fs.readFileSync(
			new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url),
			'utf-8',
		)

		// Com allowBackup em true, o Android devolve o banco antigo numa
		// instalação nova: tarefas apagadas reaparecem sem o app pedir.
		expect(manifesto).toContain('android:allowBackup="false"')
		expect(manifesto).toContain('android:dataExtractionRules="@xml/regras_de_dados"')
	})

	it('existem regras explícitas excluindo o banco do backup', async () => {
		const fs = await import('node:fs')
		const regras = fs.readFileSync(
			new URL('../../android/app/src/main/res/xml/regras_de_dados.xml', import.meta.url),
			'utf-8',
		)

		expect(regras).toContain('<cloud-backup>')
		expect(regras).toContain('<device-transfer>')
		expect(regras).toContain('domain="database"')
	})

	it('o versionCode existe e o applicationId é o da variante', async () => {
		const fs = await import('node:fs')
		const gradle = fs.readFileSync(
			new URL('../../android/app/build.gradle', import.meta.url),
			'utf-8',
		)

		// Esta é a PRIMEIRA entrega da variante, então versionCode 1 está
		// certo. O que não pode acontecer é o applicationId do app privado:
		// instalar a variante passaria a substituí-lo no mesmo celular.
		const achado = /versionCode\s+(\d+)/.exec(gradle)
		expect(achado, 'build.gradle sem versionCode').not.toBeNull()
		expect(gradle).toContain('applicationId "app.urdume.publico"')
		expect(gradle).not.toContain('app.nexo.pessoal')
	})

	it('o service worker não é registrado dentro do APK', async () => {
		const fs = await import('node:fs')
		const main = fs.readFileSync(new URL('../main.tsx', import.meta.url), 'utf-8')

		// `registerSW` só pode rodar no site: no APK ele serve o bundle antigo.
		expect(main).toContain('if (!NATIVO)')
		expect(main).toContain('registerSW({ immediate: true })')
		expect(main).toContain('limparCacheDeSiteAntigo')
	})
})
