import { Capacitor } from '@capacitor/core'
import { listarLembretesVencidos, marcarLembreteNotificado } from '@/db/repo'
import { agendar, garantirCanal } from '@/lib/jarvis/notificacoes'

/**
 * Aviso local de lembrete vencido (RF-32), sem push de servidor.
 *
 * Duas camadas, e a diferença importa:
 *
 * 1. **No horário certo, com o app fechado** — quem faz é a agenda
 *    (`src/lib/jarvis/agenda.ts`), agendando o lembrete no instante `dueAt` com
 *    a notificação nativa. Isso não depende deste arquivo.
 * 2. **Quando o app está aberto e o lembrete venceu enquanto ele estava
 *    fechado** — este arquivo varre os vencidos não avisados e mostra a faixa
 *    interna. É rede de segurança, não o caminho principal.
 *
 * Antes, a camada 2 usava `new Notification(...)`, a API do navegador. Dentro
 * do WebView do Capacitor ela **não existe** — o `try/catch` engolia o erro e
 * o lembrete era marcado como notificado sem nunca ter aparecido. O usuário
 * perdia o aviso e o app achava que tinha avisado.
 */

export interface AvisoLocal {
	id: string
	texto: string
}

const INTERVALO_MS = 60_000

/** A API do navegador só serve quando o app roda como site. */
export function avisosPermitidos(): boolean {
	if (Capacitor.isNativePlatform()) return false
	return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/**
 * Pede permissão apenas por ação do usuário (Ajustes, criação de lembrete).
 *
 * No aparelho delega ao plugin nativo (que abre o diálogo do Android 13+); no
 * site, à API do navegador.
 */
export async function pedirPermissaoDeAviso(): Promise<boolean> {
	if (Capacitor.isNativePlatform()) {
		await garantirCanal()
		const { pedirPermissao } = await import('@/lib/jarvis/notificacoes')
		return (await pedirPermissao()) === 'concedida'
	}

	if (typeof Notification === 'undefined') return false
	if (Notification.permission === 'granted') return true
	if (Notification.permission === 'denied') return false

	const resultado = await Notification.requestPermission()
	return resultado === 'granted'
}

async function mostrar(lembrete: { id: string; text: string }): Promise<void> {
	if (avisosPermitidos()) {
		try {
			new Notification('Urdume', { body: lembrete.text, tag: `urume-lembrete-${lembrete.id}` })
		} catch {
			// Alguns navegadores móveis exigem service worker; o aviso interno cobre.
		}
	}

	await marcarLembreteNotificado(lembrete.id)
}

/**
 * Verifica agora e depois a cada minuto. Devolve a lista de vencidos para a
 * tela mostrar um aviso, e a função de limpeza para desmontar.
 */
export function iniciarAvisos(aoVencer?: (texto: string) => void): () => void {
	let ativo = true

	const verificar = async (): Promise<void> => {
		const vencidos = await listarLembretesVencidos()
		for (const lembrete of vencidos) {
			if (!ativo) return
			await mostrar(lembrete)
			aoVencer?.(lembrete.text)
		}
	}

	void verificar()
	const intervalo = window.setInterval(() => void verificar(), INTERVALO_MS)

	return () => {
		ativo = false
		window.clearInterval(intervalo)
	}
}

/**
 * Reagenda um lembrete avulso imediatamente.
 *
 * A agenda já cobre isso a cada sincronização; a chamada existe para o caso do
 * usuário criar um lembrete e sair do app antes do rearme automático, que tem
 * 1,5 s de espera.
 */
export async function agendarLembrete(dueAt: number, texto: string, id: string): Promise<void> {
	if (!Capacitor.isNativePlatform()) return
	const { idDeNotificacao } = await import('@/lib/jarvis/ponte')
	await agendar([
		{
			id: idDeNotificacao(`agenda:lembrete:${id}`),
			titulo: 'Lembrete',
			corpo: texto,
			em: dueAt,
			chave: `agenda:lembrete:${id}`,
		},
	])
}
