import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { exportBackup, setSetting } from '@/db/repo'
import {
	apagarChaveApi,
	lerChaveApi,
	lerProvedor,
	pistaDaChave,
	salvarChaveApi,
	salvarProvedor,
	temChaveApi,
} from '@/lib/jarvis/segredo'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-segredo-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('chave da API', () => {
	it('grava, lê e apaga', async () => {
		expect(await temChaveApi(undefined, banco)).toBe(false)

		await salvarChaveApi('  sk-teste-123456  ', undefined, banco)
		expect(await lerChaveApi(undefined, banco)).toBe('sk-teste-123456')
		expect(await temChaveApi(undefined, banco)).toBe(true)
		expect(await pistaDaChave(undefined, banco)).toBe('••••3456')

		await apagarChaveApi(undefined, banco)
		expect(await lerChaveApi(undefined, banco)).toBeNull()
	})

	it('recusa chave vazia', async () => {
		await expect(salvarChaveApi('   ', undefined, banco)).rejects.toThrow(/vazia/)
	})

	it('NÃO aparece no backup exportado', async () => {
		await salvarChaveApi('sk-nao-pode-vazar-9999', undefined, banco)

		const backup = await exportBackup(banco)
		const json = JSON.stringify(backup)

		expect(json).not.toContain('sk-nao-pode-vazar-9999')
		expect(json).not.toContain('nao-pode-vazar')
	})

	it('também não vaza por uma chave de settings não prevista', async () => {
		await setSetting('algum.token.futuro', { token: 'segredo-que-nao-deve-sair' }, banco)

		const backup = await exportBackup(banco)
		expect(JSON.stringify(backup)).not.toContain('segredo-que-nao-deve-sair')
	})

	it('preserva preferências conhecidas no backup', async () => {
		await setSetting('ultimoBackup', 123, banco)

		const backup = await exportBackup(banco)
		expect(backup.settings.some((linha) => linha.key === 'ultimoBackup')).toBe(true)
	})
})

describe('um provedor por chave', () => {
	it('o padrão é a Deploy', async () => {
		expect(await lerProvedor(banco)).toBe('openai')
	})

	it('guarda chaves separadas por provedor', async () => {
		await salvarChaveApi('chave-da-deploy-1111', 'openai', banco)
		await salvarChaveApi('chave-da-deepseek-2222', 'deepseek', banco)

		expect(await lerChaveApi('openai', banco)).toBe('chave-da-deploy-1111')
		expect(await lerChaveApi('deepseek', banco)).toBe('chave-da-deepseek-2222')
	})

	it('trocar o provedor ativo troca a chave usada', async () => {
		await salvarChaveApi('chave-da-deploy-1111', 'openai', banco)
		await salvarProvedor('openai', banco)
		expect(await lerChaveApi(undefined, banco)).toBe('chave-da-deploy-1111')

		await salvarChaveApi('chave-da-deepseek-2222', 'deepseek', banco)
		await salvarProvedor('deepseek', banco)
		expect(await lerChaveApi(undefined, banco)).toBe('chave-da-deepseek-2222')
	})

	it('migra a chave antiga sem prefixo para o provedor DeepSeek', async () => {
		// Formato da versão anterior: chave crua "deepseek".
		await banco.aiSecrets.put({ chave: 'deepseek', valor: 'chave-antiga-3333', atualizadoEm: 1 })

		expect(await lerChaveApi('deepseek', banco)).toBe('chave-antiga-3333')
		// E a leitura já deixou o registro no formato novo.
		expect((await banco.aiSecrets.get('api:deepseek'))?.valor).toBe('chave-antiga-3333')
	})

	it('a chave antiga não é oferecida a outro provedor', async () => {
		await banco.aiSecrets.put({ chave: 'deepseek', valor: 'chave-antiga-3333', atualizadoEm: 1 })
		expect(await lerChaveApi('openai', banco)).toBeNull()
	})
})

