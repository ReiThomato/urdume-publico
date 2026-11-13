import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Alarme exato — a diferença medida no aparelho.
 *
 * No Redmi 12 (MIUI, Android 15), em 12/11/2026:
 *
 *   - alarme EXATO, app fechado, tela bloqueada → chegou;
 *   - alarme INEXATO no bucket `rare` → o sistema reagendou para +2d23h e
 *     nunca chegou.
 *
 * Estes testes garantem que o app nunca volte a agendar sem exatidão quando
 * ela está disponível, e que nunca a peça quando não está — porque pedir sem
 * ter trava o app numa tela de Ajustes (reproduzido: a promessa não resolve).
 */

const agendarNativo = vi.fn(async (opcoes: { notifications: Array<Record<string, unknown>> }) => ({
	notifications: opcoes.notifications.map((entrada) => ({ id: entrada.id as number })),
}))

let exatoConcedido = true

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => true },
	registerPlugin: () => ({
		checkPermissions: async () => ({ display: 'granted' }),
		requestPermissions: async () => ({ display: 'granted' }),
		checkExactNotificationSetting: async () => ({
			exact_alarm: exatoConcedido ? 'granted' : 'denied',
		}),
		createChannel: async () => undefined,
		schedule: agendarNativo,
		getPending: async () => ({ notifications: [] }),
		cancel: async () => undefined,
		addListener: async () => ({ remove: async () => undefined }),
	}),
}))

const { agendar } = await import('@/lib/jarvis/notificacoes')

const aviso = { id: 1, titulo: 'T', corpo: 'C', em: Date.now() + 60_000, chave: 'k' }

beforeEach(() => {
	agendarNativo.mockClear()
	exatoConcedido = true
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('exatidão do alarme', () => {
	it('pede alarme exato quando o sistema permite', async () => {
		await agendar([aviso])

		const enviado = agendarNativo.mock.calls[0]![0].notifications[0]!
		expect(enviado.isExactNotification).toBe(true)
	})

	it('não pede exatidão sem permissão — isso travaria o app', async () => {
		exatoConcedido = false
		await agendar([aviso])

		const enviado = agendarNativo.mock.calls[0]![0].notifications[0]!
		expect(enviado.isExactNotification).toBe(false)
	})

	it('informa quando o aviso vai sair inexato', async () => {
		exatoConcedido = false
		const resultado = await agendar([aviso])

		expect(resultado.inexato).toBe(true)
		expect(resultado.agendadas).toBe(1)
	})

	it('o valor de exatidão nunca é fixo no código', async () => {
		const fs = await import('node:fs')
		const bruto = fs.readFileSync(new URL('./notificacoes.ts', import.meta.url), 'utf-8')

		// Sem comentários: o cabeçalho CITA `isExactNotification: true` para
		// explicar por que ele trava o app, e procurar no texto inteiro daria
		// falso positivo (o mesmo problema do teste da ponte, no passado).
		const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')

		// A regressão que estes testes protegem: alguém trocar o cálculo por
		// `true` fixo. Com permissão negada, `true` abre Ajustes e pendura.
		expect(fonte).not.toMatch(/isExactNotification:\s*true/)
		expect(fonte).toMatch(/isExactNotification:\s*exato/)
	})

	it('o manifesto declara USE_EXACT_ALARM', async () => {
		const fs = await import('node:fs')
		const manifesto = fs.readFileSync(
			new URL('../../../android/app/src/main/AndroidManifest.xml', import.meta.url),
			'utf-8',
		)

		// Sem esta permissão o Android 12+ entrega inexato em instalação nova, e
		// no MIUI isso significa aviso adiado por dias.
		expect(manifesto).toContain('android.permission.USE_EXACT_ALARM')
	})
})
