import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { gravarMemoria, lerMemoria, podarMemoria, lerPreferencias } from '@/lib/jarvis/estado'

/**
 * Memória do Jarvis.
 *
 * O que importa aqui não é "grava e lê": é a diferença entre o que pode
 * envelhecer (contabilidade: confiança, silêncio, sugestão do dia) e o que é
 * permanente (o que o usuário ensinou). Sem essa distinção a memória só
 * engorda; com ela errada, o app esquece o que deveria lembrar.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-estado-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('memória', () => {
	it('grava e lê um valor', async () => {
		await gravarMemoria('fato:aluguel', 'todo dia 5', banco)
		expect(await lerMemoria('fato:aluguel', null, banco)).toBe('todo dia 5')
	})

	it('gravar de novo substitui em vez de duplicar', async () => {
		await gravarMemoria('confianca:tarefa_atrasada', 0.8, banco)
		await gravarMemoria('confianca:tarefa_atrasada', 0.9, banco)

		const linhas = await banco.aiMemory.where('chave').equals('confianca:tarefa_atrasada').toArray()
		expect(linhas).toHaveLength(1)
		expect(linhas[0]!.valor).toBe(0.9)
	})

	it('devolve o padrão quando a chave não existe', async () => {
		expect(await lerMemoria('nada:aqui', 'padrão', banco)).toBe('padrão')
	})

	it('preferências ausentes são preenchidas com o padrão', async () => {
		const prefs = await lerPreferencias(banco)
		expect(prefs.modo).toBeTruthy()
		expect(prefs.personalidade.tom).toBeTruthy()
	})

	it('preferência antiga sem personalidade não deixa campo indefinido', async () => {
		await banco.settings.put({ key: 'jarvis.prefs', value: { modo: 'pausado' } })
		const prefs = await lerPreferencias(banco)

		expect(prefs.modo).toBe('pausado')
		expect(prefs.personalidade.tom).toBeTruthy()
		expect(prefs.silencio).toBeTruthy()
	})
})

describe('poda da memória operacional', () => {
	it('remove contabilidade velha e preserva fato ensinado pelo usuário', async () => {
		const velho = Date.now() - 40 * 86_400_000

		await gravarMemoria('visto:tarefa_atrasada:2026-10-01', 1, banco)
		await gravarMemoria('silencio:projeto_parado', { ignorados: 3, ate: 0 }, banco)
		await gravarMemoria('sugestao:2026-10-01', { acoes: [] }, banco)
		await gravarMemoria('fato:aluguel', 'todo dia 5', banco)
		await gravarMemoria('confianca:tarefa_atrasada', 0.9, banco)

		// Envelhece todas as linhas de uma vez.
		for (const linha of await banco.aiMemory.toArray()) {
			await banco.aiMemory.put({ ...linha, atualizadoEm: velho })
		}

		await podarMemoria(30, banco)

		const restantes = (await banco.aiMemory.toArray()).map((linha) => linha.chave).sort()
		// `fato:` é aprendizado permanente; `confianca:` descreve o comportamento
		// recente e é recalculado, por isso fica (a lista de prefixos é explícita).
		expect(restantes).toEqual(['confianca:tarefa_atrasada', 'fato:aluguel'])
	})

	it('mantém o que é recente', async () => {
		await gravarMemoria('visto:tarefa_atrasada:hoje', 1, banco)

		await podarMemoria(30, banco)

		expect((await banco.aiMemory.toArray()).map((linha) => linha.chave)).toEqual(['visto:tarefa_atrasada:hoje'])
	})
})
