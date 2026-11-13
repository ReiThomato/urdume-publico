import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { ensinar, esquecer, listarConhecimento, LIMITE_CARACTERES, textosDeConhecimento } from '@/lib/jarvis/conhecimento'
import { enfileirar, idadeDoContexto, limparFila, listarFila, registrarFalha, removerDaFila, LIMITE_FILA } from '@/lib/jarvis/fila'
import { instrucaoDeEstilo, montarResumo } from '@/lib/jarvis/ia'
import { montarRetrato } from '@/lib/jarvis/retrato'
import { avaliarSinais } from '@/lib/jarvis/sinais'
import { PREFERENCIAS_PADRAO } from '@/lib/jarvis/relevancia'

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-conhecimento-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('conhecimento ensinado', () => {
	it('grava e lista fatos', async () => {
		const r = await ensinar('não marco nada aos domingos', banco)
		expect(r.ok).toBe(true)

		const fatos = await listarConhecimento(banco)
		expect(fatos).toHaveLength(1)
		expect(fatos[0]!.texto).toBe('não marco nada aos domingos')
	})

	it('recusa fato vazio e fato repetido', async () => {
		expect((await ensinar('   ', banco)).ok).toBe(false)

		await ensinar('Não marco domingo', banco)
		const repetido = await ensinar('nao marco domingo', banco)
		expect(repetido.ok).toBe(false)
		expect(repetido.erro).toContain('já tinha')
	})

	it('recusa acima do limite de caracteres', async () => {
		const enorme = 'a'.repeat(LIMITE_CARACTERES + 1)
		expect((await ensinar(enorme, banco)).ok).toBe(false)
	})

	it('respeita o limite de 30 fatos', async () => {
		for (let i = 0; i < 30; i++) await ensinar(`fato número ${i}`, banco)
		const excedente = await ensinar('mais um', banco)
		expect(excedente.ok).toBe(false)
		expect(excedente.erro).toContain('30')
	})

	it('esquece um fato', async () => {
		await ensinar('prefiro manhã', banco)
		const [fato] = await listarConhecimento(banco)

		await esquecer(fato!.id, banco)
		expect(await listarConhecimento(banco)).toHaveLength(0)
	})

	it('o conhecimento entra no resumo enviado à IA', async () => {
		await ensinar('o cliente só responde de manhã', banco)
		const retrato = montarRetrato({
			tasks: [], projects: [], events: [], habits: [], habitLogs: [], reminders: [],
			hoje: '2026-11-12', agora: Date.now(),
		})

		const resumo = montarResumo({
			retrato,
			sinais: avaliarSinais(retrato),
			nomesDeProjeto: {},
			conhecimento: await textosDeConhecimento(banco),
		})

		expect(resumo).toContain('o cliente só responde de manhã')
		expect(resumo).toContain('O que o usuário me ensinou')
	})
})

describe('fila de pedidos sem internet', () => {
	it('guarda o pedido com o contexto do momento', async () => {
		const item = await enfileirar('o que faço hoje?', {
			dia: '2026-11-12',
			retratoEm: Date.now() - 3 * 3_600_000,
			origem: 'usuario',
		}, banco)

		expect(item).not.toBeNull()
		const fila = await listarFila(banco)
		expect(fila).toHaveLength(1)
		expect(fila[0]!.pedido).toBe('o que faço hoje?')
	})

	it('não duplica o mesmo pedido pendente', async () => {
		await enfileirar('mesma pergunta', { dia: '2026-11-12', retratoEm: Date.now(), origem: 'usuario' }, banco)
		await enfileirar('mesma pergunta', { dia: '2026-11-12', retratoEm: Date.now(), origem: 'usuario' }, banco)

		expect(await listarFila(banco)).toHaveLength(1)
	})

	it('descarta o mais antigo acima do limite', async () => {
		for (let i = 0; i < LIMITE_FILA + 2; i++) {
			await enfileirar(`pedido ${i}`, { dia: '2026-11-12', retratoEm: Date.now(), origem: 'usuario' }, banco)
			await new Promise((r) => setTimeout(r, 2))
		}

		const fila = await listarFila(banco)
		expect(fila.length).toBeLessThanOrEqual(LIMITE_FILA)
		expect(fila.some((item) => item.pedido === 'pedido 0')).toBe(false)
	})

	it('remove da fila ao responder', async () => {
		const item = await enfileirar('x', { dia: '2026-11-12', retratoEm: Date.now(), origem: 'usuario' }, banco)
		await removerDaFila(item!.id, banco)
		expect(await listarFila(banco)).toHaveLength(0)
	})

	it('desiste depois de 3 falhas', async () => {
		const item = await enfileirar('x', { dia: '2026-11-12', retratoEm: Date.now(), origem: 'usuario' }, banco)

		await registrarFalha(item!.id, banco)
		await registrarFalha(item!.id, banco)
		expect(await listarFila(banco)).toHaveLength(1)

		await registrarFalha(item!.id, banco)
		expect(await listarFila(banco)).toHaveLength(0)
	})

	it('sabe dizer a idade do contexto', () => {
		const base = { id: '1', criadoEm: 0, pedido: 'x', dia: '2026-11-12', origem: 'usuario' as const, tentativas: 0 }
		expect(idadeDoContexto({ ...base, retratoEm: Date.now() - 1000 })).toContain('menos de uma hora')
		expect(idadeDoContexto({ ...base, retratoEm: Date.now() - 5 * 3_600_000 })).toContain('5 h')
		expect(idadeDoContexto({ ...base, retratoEm: Date.now() - 26 * 3_600_000 })).toContain('ontem')
	})

	it('limpa tudo', async () => {
		await enfileirar('x', { dia: '2026-11-12', retratoEm: Date.now(), origem: 'usuario' }, banco)
		await limparFila(banco)
		expect(await listarFila(banco)).toHaveLength(0)
	})
})

describe('personalidade', () => {
	it('traduz tom e detalhe em instrução', () => {
		const direto = instrucaoDeEstilo({
			tom: 'direto', detalhe: 'curto', iniciativa: 'equilibrada',
		})
		expect(direto).toContain('direta')
		expect(direto).toContain('2 frases')

		const calmo = instrucaoDeEstilo({
			tom: 'calmo', detalhe: 'explicado', iniciativa: 'reservada', foco: 'prazos',
		})
		expect(calmo).toContain('calma')
		expect(calmo).toContain('6 frases')
		expect(calmo).toContain('prazos')
	})

	it('sem personalidade, não inventa instrução', () => {
		expect(instrucaoDeEstilo(undefined)).toBe('')
	})

	it('o padrão existe e é coerente', () => {
		expect(PREFERENCIAS_PADRAO.personalidade.tom).toBe('direto')
		expect(PREFERENCIAS_PADRAO.personalidade.detalhe).toBe('curto')
	})
})
