import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import {
	APP_DO_BACKUP,
	ehBackupDoApp,
	exportBackup,
	importBackup,
} from '@/db/repo'

/**
 * Compatibilidade do nome antigo no backup.
 *
 * O app se chamou Rabisco, depois Nexo, e agora Urdume. Arquivos exportados
 * pelos nomes antigos continuam existindo no aparelho do usuário — e um deles
 * é justamente o que ele guardou para não perder nada.
 *
 * A regra testada aqui: ESCREVE o nome novo, ACEITA os três. Recusar um backup
 * antigo seria a pior falha possível, e é silenciosa: o usuário só descobre
 * quando tenta restaurar.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`urdume-backup-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

function arquivo(app: string) {
	return {
		app,
		version: 1,
		exportedAt: Date.now(),
		projects: [
			{
				id: 'p1',
				name: 'Projeto restaurado',
				archived: false,
				order: 1,
				createdAt: 1,
				updatedAt: 1,
			},
		],
		tasks: [],
		reminders: [],
		pages: [],
		events: [],
		habits: [],
		habitLogs: [],
		settings: [],
	}
}

describe('nome do app no backup', () => {
	it('exporta com o nome novo', async () => {
		const dados = await exportBackup(banco)
		expect(dados.app).toBe('urdume')
		expect(APP_DO_BACKUP).toBe('urdume')
	})

	it('aceita o nome atual', () => {
		expect(ehBackupDoApp('urdume')).toBe(true)
	})

	it('aceita o nome Nexo', () => {
		expect(ehBackupDoApp('nexo')).toBe(true)
	})

	it('aceita o nome mais antigo, Rabisco', () => {
		expect(ehBackupDoApp('rabisco')).toBe(true)
	})

	it('recusa um arquivo de outro app', () => {
		expect(ehBackupDoApp('outro-app')).toBe(false)
		expect(ehBackupDoApp(undefined)).toBe(false)
		expect(ehBackupDoApp(null)).toBe(false)
	})

	it('importa backup com o nome antigo Nexo', async () => {
		await importBackup(arquivo('nexo'), banco)
		const projetos = await banco.projects.toArray()
		expect(projetos).toHaveLength(1)
		expect(projetos[0]!.name).toBe('Projeto restaurado')
	})

	it('importa backup com o nome Rabisco', async () => {
		await importBackup(arquivo('rabisco'), banco)
		expect(await banco.projects.count()).toBe(1)
	})

	it('importa backup com o nome novo', async () => {
		await importBackup(arquivo('urdume'), banco)
		expect(await banco.projects.count()).toBe(1)
	})

	it('recusa arquivo de outro app, sem tocar nos dados', async () => {
		await importBackup(arquivo('urdume'), banco)
		await expect(importBackup(arquivo('outro-app'), banco)).rejects.toThrow(/inválido/)
		// O dado anterior continua lá: a importação inválida não apagou nada.
		expect(await banco.projects.count()).toBe(1)
	})

	it('um backup exportado pode ser restaurado nele mesmo', async () => {
		await importBackup(arquivo('urdume'), banco)
		const exportado = await exportBackup(banco)
		await importBackup(JSON.parse(JSON.stringify(exportado)), banco)
		expect(await banco.projects.count()).toBe(1)
	})
})
