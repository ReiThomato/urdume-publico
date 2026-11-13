import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { GRUPO_DO_RUNNER } from '@/lib/jarvis/ponte'

/**
 * Contrato entre o app e o runner.
 *
 * O runner lê os dados de um SharedPreferences cujo NOME é o `label` do
 * BackgroundRunner. O app grava no grupo `GRUPO_DO_RUNNER`. Se os dois
 * divergirem, o app roda, o runner roda, e nada aparece — sem erro.
 *
 * Este teste existe para essa divergência falhar no CI em vez de falhar no
 * celular do usuário, às 8h da manhã.
 */
describe('ponte entre app e runner', () => {
	it('o grupo do app é o mesmo label do BackgroundRunner', () => {
		const config = readFileSync(new URL('../../../capacitor.config.ts', import.meta.url), 'utf-8')
		const achado = /label:\s*'([^']+)'/.exec(config)
		expect(achado, 'capacitor.config.ts sem label do BackgroundRunner').not.toBeNull()
		expect(achado![1]).toBe(GRUPO_DO_RUNNER)
	})

	it('o runner declara o evento configurado e não usa IndexedDB', () => {
		const runner = readFileSync(new URL('../../../public/runners/jarvis.js', import.meta.url), 'utf-8')

		expect(runner).toContain("addEventListener('jarvisTick'")

		// Usa o código sem comentários: o cabeçalho do arquivo CITA indexedDB
		// para explicar por que ele não é usado, e procurar no texto inteiro
		// daria falso positivo (aconteceu na primeira versão deste teste).
		const semComentarios = runner
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/(^|\s)\/\/.*$/gm, '')

		expect(semComentarios).not.toContain('indexedDB')
		expect(semComentarios).not.toContain('Dexie')
		expect(semComentarios).not.toContain('document.')
	})

	it('o runner lê as chaves que o app grava', () => {
		const runner = readFileSync(new URL('../../../public/runners/jarvis.js', import.meta.url), 'utf-8')

		// O app grava estas três em `ponte.ts`. O runner deixou de ler
		// `jarvis.plano`: quem agenda os avisos é o app, com `Date` nativo, e o
		// runner não tem como fazer isso sem errar o fuso.
		expect(runner).toContain("'jarvis.retrato'")
		expect(runner).toContain("'jarvis.config'")
	})

	/**
	 * O `CapacitorKV` é o ponto onde o erro é mais caro e mais silencioso: a
	 * API nativa é `set(chave, valor)`; passar um objeto faz o motor recusar
	 * dentro do `try/catch`, e o runner passa a ler um armazenamento que nada
	 * escreve. Foi exatamente o que aconteceu na primeira versão.
	 */
	it('o runner usa a assinatura de dois argumentos do CapacitorKV', () => {
		const runner = readFileSync(new URL('../../../public/runners/jarvis.js', import.meta.url), 'utf-8')

		expect(runner).not.toMatch(/CapacitorKV\.set\(\s*\{/)
		expect(runner).not.toMatch(/CapacitorKV\.get\(\s*\{/)
		expect(runner).toMatch(/CapacitorKV\.set\(\s*chave\s*,\s*texto\s*\)/)
	})
})
