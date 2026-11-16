import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O agendamento chega ao plugin nativo?
 *
 * `agenda.test.ts` prova que a LISTA de avisos está certa. Isso não prova que
 * ela vira notificação no aparelho: entre uma coisa e outra ficam o canal, a
 * permissão, a escolha de alarme exato, o ícone e o `channelId`.
 *
 * Este teste troca `@capacitor/local-notifications` e `@capacitor/core` por
 * dublês que registram as chamadas. Se um campo sumir do corpo enviado ao
 * plugin, o teste falha — e é exatamente o tipo de defeito que só apareceria
 * no celular, com o app fechado.
 */

const agendadas: Array<Record<string, unknown>> = []
const canais: Array<Record<string, unknown>> = []
let permissao: { display: string }
let alarmeExato: { exact_alarm: string }
let nativo = true

/*
 * O plugin é obtido via `registerPlugin` (não por import direto), então o dublê
 * precisa entrar AQUI: é o objeto que o módulo chama em tempo de execução.
 */
const duble = {
	checkPermissions: async () => permissao,
	requestPermissions: async () => permissao,
	createChannel: async (canal: Record<string, unknown>) => {
		canais.push(canal)
	},
	schedule: async ({ notifications }: { notifications: Array<Record<string, unknown>> }) => {
		agendadas.push(...notifications)
		return { notifications }
	},
	getPending: async () => ({ notifications: [] }),
	cancel: async () => undefined,
	checkExactNotificationSetting: async () => alarmeExato,
	addListener: async () => ({ remove: async () => undefined }),
}

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: () => nativo,
	},
	registerPlugin: () => duble,
}))

const { agendar, garantirCanal, CANAL } = await import('@/lib/jarvis/notificacoes')

beforeEach(() => {
	agendadas.length = 0
	canais.length = 0
	permissao = { display: 'granted' }
	alarmeExato = { exact_alarm: 'granted' }
	nativo = true
})

afterEach(() => {
	vi.clearAllMocks()
})

const umAviso = {
	id: 12345,
	titulo: 'Ligar para o fornecedor',
	corpo: 'Tarefa marcada para agora · Site do ateliê.',
	em: Date.now() + 600_000,
	chave: 'agenda:tarefa:abc:2026-11-15',
}

describe('o aviso vira notificação no sistema', () => {
	it('agenda com id, canal, ícone e alarme exato', async () => {
		const r = await agendar([umAviso])

		expect(r.erro).toBeNull()
		expect(r.agendadas).toBe(1)

		const enviada = agendadas[0]!
		expect(enviada.id).toBe(umAviso.id)
		expect(enviada.title).toBe(umAviso.titulo)
		expect(enviada.body).toBe(umAviso.corpo)
		// Sem `channelId`, o Android usa o canal padrão e o aviso perde a
		// importância alta — some na gaveta em vez de aparecer no topo.
		expect(enviada.channelId).toBe(CANAL)
		// Sem `smallIcon` válido, o Android descarta a notificação.
		expect(enviada.smallIcon).toBeTruthy()
		// `allowWhileIdle` é o que faz tocar com o aparelho dormindo.
		const quando = enviada.schedule as { at: Date; allowWhileIdle?: boolean }
		expect(quando.at).toBeInstanceOf(Date)
		expect(quando.allowWhileIdle).toBe(true)
	})

	it('sem permissão, não agenda e diz o motivo', async () => {
		permissao = { display: 'denied' }

		const r = await agendar([umAviso])

		expect(r.agendadas).toBe(0)
		expect(r.erro).toMatch(/permiss/i)
		expect(agendadas).toHaveLength(0)
	})

	it('sem alarme exato, agenda mesmo assim e avisa que será inexato', async () => {
		alarmeExato = { exact_alarm: 'denied' }

		const r = await agendar([umAviso])

		// Agendar inexato é melhor que não avisar: o Android entrega com atraso.
		expect(r.agendadas).toBe(1)
		expect(r.inexato).toBe(true)
		/*
		 * `false` é o valor enviado; ele não pode ser `true` (seria pedir um
		 * alarme exato sem permissão, e o Android recusaria a notificação).
		 */
		expect(agendadas[0]!.isExactNotification).not.toBe(true)
	})

	it('o canal é criado com importância alta', async () => {
		await garantirCanal()

		expect(canais).toHaveLength(1)
		expect(canais[0]!.id).toBe(CANAL)
		// 4 = IMPORTANCE_HIGH. Com 3 (default) o aviso não aparece no topo.
		expect(canais[0]!.importance).toBe(4)
	})

	it('no navegador, não finge que agendou', async () => {
		nativo = false

		const r = await agendar([umAviso])

		expect(r.agendadas).toBe(0)
		expect(r.erro).toBeTruthy()
		expect(agendadas).toHaveLength(0)
	})
})
