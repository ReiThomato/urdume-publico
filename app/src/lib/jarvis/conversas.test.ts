import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { createId } from '@/db/id'
import {
	MAXIMO_DE_CONVERSAS,
	SESSAO_PRINCIPAL,
	apagarSessao,
	garantirSessao,
	lerSessaoAberta,
	listarSessoes,
	mensagensDaSessao,
	novaSessao,
	sessaoDa,
} from '@/lib/jarvis/conversas'

/**
 * Conversas do Jarvis.
 *
 * O usuário pediu três, com a mais antiga saindo quando a quarta abre — e que
 * nada se perca por acidente. Os testes cobrem o limite, a saída da mais
 * antiga, a migração das mensagens que não têm `sessao` e a troca de conversa.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-conversas-${crypto.randomUUID()}`)
	await banco.open()

	relogio = Date.now()
	vi.spyOn(Date, 'now').mockImplementation(() => relogio)
})

afterEach(async () => {
	vi.restoreAllMocks()
	await banco.delete()
})

/**
 * Relógio monotônico, e UM só.
 *
 * A primeira versão usava `Math.random()` no horário das mensagens e deixava a
 * criação da conversa usar o relógio real. Isso misturava duas linhas do tempo:
 * a conversa criada "agora" parecia mais velha que uma mensagem datada no
 * futuro, e o teste falhava por sorteio. Aqui `Date.now` é substituído, então
 * mensagem e criação compartilham a mesma linha do tempo.
 */
let relogio: number
async function falar(texto: string, sessao?: string, papel: 'usuario' | 'jarvis' = 'usuario'): Promise<void> {
	// Carimba no instante atual e SÓ DEPOIS avança o relógio: assim a mensagem
	// nunca fica datada no futuro em relação à criação da conversa seguinte.
	const em = relogio
	relogio += 1000
	await banco.aiChat.put({
		id: createId(),
		em,
		papel,
		texto,
		...(sessao ? { sessao } : {}),
	})
}

describe('conversas', () => {
	it('mensagem sem sessao pertence à principal', () => {
		expect(sessaoDa({ id: 'x', em: 0, papel: 'usuario', texto: 'oi' })).toBe(SESSAO_PRINCIPAL)
	})

	it('lista as conversas com título da primeira pergunta', async () => {
		await falar('como está a reforma?')
		await falar('Está quase pronta.', undefined, 'jarvis')

		const sessoes = await listarSessoes(banco)
		expect(sessoes).toHaveLength(1)
		expect(sessoes[0]!.titulo).toBe('como está a reforma?')
		expect(sessoes[0]!.mensagens).toBe(2)
	})

	it('cria até três conversas e a quarta apaga a mais antiga', async () => {
		await falar('primeira')
		const a = await lerSessaoAberta(banco)

		const b = await novaSessao(banco)
		await falar('segunda', b)

		const c = await novaSessao(banco)
		await falar('terceira', c)

		expect((await listarSessoes(banco)).filter((s) => s.mensagens > 0)).toHaveLength(3)

		// A quarta abre e a mais antiga (a principal) sai.
		const d = await novaSessao(banco)
		await falar('quarta', d)

		const depois = (await listarSessoes(banco)).filter((s) => s.mensagens > 0)
		expect(depois).toHaveLength(MAXIMO_DE_CONVERSAS)
		expect(depois.map((s) => s.titulo)).not.toContain('primeira')
		expect(depois.map((s) => s.titulo)).toContain('quarta')
		expect(a).not.toBe(b)
	})

	it('não apaga conversa vazia para abrir espaço', async () => {
		await falar('única')

		await novaSessao(banco) // vazia
		await novaSessao(banco) // vazia
		await novaSessao(banco) // vazia

		const sessoes = (await listarSessoes(banco)).filter((s) => s.mensagens > 0)
		expect(sessoes).toHaveLength(1)
		expect(sessoes[0]!.titulo).toBe('única')
	})

	it('apagar a conversa aberta cai para a mais recente que sobrou', async () => {
		await falar('antiga')
		const b = await novaSessao(banco)
		await falar('recente', b)

		expect(await lerSessaoAberta(banco)).toBe(b)
		await apagarSessao(b, banco)

		const aberta = await lerSessaoAberta(banco)
		expect(aberta).toBe(SESSAO_PRINCIPAL)
	})

	it('mensagens da sessão não vazam para outra', async () => {
		await falar('da principal')
		const b = await novaSessao(banco)
		await falar('da nova', b)

		expect((await mensagensDaSessao(SESSAO_PRINCIPAL, 60, banco)).map((m) => m.texto)).toEqual([
			'da principal',
		])
		expect((await mensagensDaSessao(b, 60, banco)).map((m) => m.texto)).toEqual(['da nova'])
	})

	it('garantirSessao abre a conversa com histórico quando não há sessão salva', async () => {
		await falar('histórico antigo', undefined)
		const aberta = await garantirSessao(banco)
		expect(aberta).toBe(SESSAO_PRINCIPAL)
	})

	it('título longo é cortado sem quebrar palavra', async () => {
		await falar('preciso organizar todas as tarefas da reforma do quarto antes de sexta')
		const [sessao] = await listarSessoes(banco)
		expect(sessao!.titulo.length).toBeLessThanOrEqual(43)
		expect(sessao!.titulo.endsWith('…')).toBe(true)
	})
})
