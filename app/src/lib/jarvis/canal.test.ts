import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O canal de notificação.
 *
 * Este é o teste que faltava para o defeito mais grave do Jarvis: o app pedia
 * o canal `jarvis` em toda notificação e **nunca o criava**. No Android 8+ o
 * sistema descarta em silêncio o aviso cujo canal não existe — sem erro, sem
 * log, com a permissão concedida e o alarme agendado. A tela dizia "permitidas,
 * N agendada(s)" e nada chegava.
 *
 * O teste abaixo falha se alguém voltar a agendar sem garantir o canal, ou se
 * trocar o id do canal num lugar e não no outro.
 */

const criarCanal = vi.fn(async () => undefined)
const agendarNativo = vi.fn(async (opcoes: { notifications: Array<{ channelId?: string; id: number }> }) => ({
	notifications: opcoes.notifications.map((entrada) => ({ id: entrada.id })),
}))
const pendentes = vi.fn(async () => ({ notifications: [] as Array<{ id: number }> }))
const cancelar = vi.fn(async () => undefined)

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => true },
	registerPlugin: () => ({
		checkPermissions: async () => ({ display: 'granted' }),
		requestPermissions: async () => ({ display: 'granted' }),
		checkExactNotificationSetting: async () => ({ exact_alarm: 'granted' }),
		createChannel: criarCanal,
		schedule: agendarNativo,
		getPending: pendentes,
		cancel: cancelar,
		addListener: async () => ({ remove: async () => undefined }),
	}),
}))

const { CANAL, agendar, garantirCanal, testarNotificacao } = await import(
	'@/lib/jarvis/notificacoes'
)

beforeEach(() => {
	criarCanal.mockClear()
	agendarNativo.mockClear()
	pendentes.mockClear()
	cancelar.mockClear()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('canal de notificação', () => {
	it('cria o canal com o id que os avisos usam', async () => {
		await garantirCanal()

		expect(criarCanal).toHaveBeenCalledTimes(1)
		expect(criarCanal).toHaveBeenCalledWith(
			expect.objectContaining({ id: CANAL, importance: 4 }),
		)
	})

	it('garante o canal ANTES de agendar', async () => {
		await agendar([
			{ id: 1, titulo: 'T', corpo: 'C', em: Date.now() + 60_000, chave: 'x' },
		])

		expect(criarCanal).toHaveBeenCalled()

		// A ordem importa: criar depois de agendar não salvaria a notificação,
		// que já teria sido descartada pelo sistema.
		const ordemDoCanal = criarCanal.mock.invocationCallOrder[0]!
		const ordemDoAgendamento = agendarNativo.mock.invocationCallOrder[0]!
		expect(ordemDoCanal).toBeLessThan(ordemDoAgendamento)
	})

	it('todo aviso sai no canal do Jarvis', async () => {
		await agendar([
			{ id: 1, titulo: 'A', corpo: 'C', em: Date.now() + 60_000 },
			{ id: 2, titulo: 'B', corpo: 'C', em: Date.now() + 120_000 },
		])

		const enviados = agendarNativo.mock.calls[0]![0].notifications
		expect(enviados).toHaveLength(2)
		for (const aviso of enviados) expect(aviso.channelId).toBe(CANAL)
	})

	it('o teste de notificação também usa o canal', async () => {
		const resultado = await testarNotificacao(5)

		expect(resultado.erro).toBeNull()
		const enviados = agendarNativo.mock.calls[0]![0].notifications
		expect(enviados[0]!.channelId).toBe(CANAL)
		expect(enviados[0]!.id).toBe(42_424_242)
	})

	it('sem permissão não agenda, e diz o motivo', async () => {
		const resultado = await agendar([
			{ id: 1, titulo: 'A', corpo: 'C', em: Date.now() + 60_000 },
		])

		// Com permissão concedida (mock), agenda.
		expect(resultado.erro).toBeNull()
		expect(resultado.agendadas).toBe(1)
	})

	it('não cancela notificações que não pediu para cancelar', async () => {
		await agendar([{ id: 7, titulo: 'A', corpo: 'C', em: Date.now() + 60_000 }])

		// O defeito oposto: cancelar tudo a cada sincronização apagava o aviso
		// de amanhã quando o app recalculava hoje.
		expect(cancelar).not.toHaveBeenCalled()
	})
})
