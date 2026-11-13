import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/**
 * Notificações locais — pequeno invólucro sobre o plugin, com degradação
 * limpa quando o app roda como site ou quando o usuário negou a permissão.
 *
 * Não existe push aqui: tudo é agendado no aparelho. Sem servidor, sem conta,
 * sem token. É o que permite funcionar offline e não vazar dado para ninguém.
 *
 * **Canal.** O Android 8+ exige um `NotificationChannel` registrado antes de
 * aceitar notificação que o cite, e o plugin **descarta em silêncio** o aviso
 * cujo canal não existe (README do plugin, campo `channelId`: "If channel with
 * the given name does not exist then the notification will not fire"). O app
 * pedia o canal `jarvis` desde a primeira versão e nunca o criava — então
 * *nenhuma* notificação do Jarvis saía, com permissão concedida, alarme
 * agendado e a tela dizendo "permitidas". Era o defeito que explicava o
 * silêncio absoluto.
 *
 * Daí `garantirCanal()` ser chamado antes de cada agendamento. Criar duas vezes
 * é inofensivo: o Android ignora a segunda e preserva as preferências que o
 * usuário tenha ajustado no canal.
 */

export interface Aviso {
	/** Id de 32 bits; o mesmo id substitui a notificação anterior. */
	id: number
	titulo: string
	corpo: string
	/** Epoch ms. */
	em: number
	/** Chave do sinal, para deduplicar. */
	chave?: string
}

/** Canal único do Jarvis. Mudar aqui exige limpar o canal no aparelho. */
export const CANAL = 'jarvis'

/** Ícone da barra de status, em `res/drawable/ic_stat_urume.xml`. */
const ICONE = 'ic_stat_urume'

/** Importância 4 = alto: toca som e aparece como heads-up. */
const IMPORTANCIA_ALTA = 4

interface Canal {
	id: string
	name: string
	description?: string
	importance?: number
	vibration?: boolean
	lights?: boolean
	visibility?: number
}

interface LocalNotificationsPlugin {
	checkPermissions(): Promise<{ display: string }>
	requestPermissions(): Promise<{ display: string }>
	checkExactNotificationSetting?(): Promise<{ exact_alarm: string }>
	changeExactNotificationSetting?(): Promise<{ exact_alarm: string }>
	createChannel?(canal: Canal): Promise<void>
	schedule(options: {
		notifications: Array<{
			id: number
			title: string
			body: string
			schedule?: { at?: Date; allowWhileIdle?: boolean }
			/** Sem permissão de alarme exato o Android adia; ver `agendar`. */
			isExactNotification?: boolean
			smallIcon?: string
			channelId?: string
			extra?: unknown
		}>
	}): Promise<{ notifications?: Array<{ id: number }> }>
	getPending(): Promise<{ notifications: Array<{ id: number }> }>
	cancel(options: { notifications: Array<{ id: number }> }): Promise<void>
	cancelAll?(): Promise<void>
	addListener(
		evento: 'localNotificationActionPerformed',
		ouvinte: (evento: unknown) => void,
	): Promise<PluginListenerHandle> & { remove?: () => Promise<void> }
}

const LocalNotifications = registerPlugin<LocalNotificationsPlugin>('LocalNotifications')

const DISPONIVEL = (): boolean => Capacitor.isNativePlatform()

export type EstadoPermissao = 'concedida' | 'negada' | 'prompt' | 'indisponivel'

export async function estadoDaPermissao(): Promise<EstadoPermissao> {
	if (!DISPONIVEL()) return 'indisponivel'
	try {
		const { display } = await LocalNotifications.checkPermissions()
		if (display === 'granted') return 'concedida'
		if (display === 'denied') return 'negada'
		return 'prompt'
	} catch {
		return 'indisponivel'
	}
}

/**
 * Pede a permissão. No Android 13+ aparece o diálogo do sistema; abaixo disso
 * volta concedida sem perguntar nada.
 */
export async function pedirPermissao(): Promise<EstadoPermissao> {
	if (!DISPONIVEL()) return 'indisponivel'
	try {
		const { display } = await LocalNotifications.requestPermissions()
		return display === 'granted' ? 'concedida' : 'negada'
	} catch {
		return 'indisponivel'
	}
}

/**
 * Houve permissão total? `granted` cobre só `POST_NOTIFICATIONS`. Sem a
 * permissão de alarme exato o Android 12+ entrega o aviso com atraso — não é
 * falha, mas a tela deve dizer a verdade em vez de prometer pontualidade.
 */
export async function estadoDoAlarmeExato(): Promise<'concedida' | 'negada' | 'indisponivel'> {
	if (!DISPONIVEL()) return 'indisponivel'
	try {
		if (!LocalNotifications.checkExactNotificationSetting) return 'indisponivel'
		const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
		if (exact_alarm === 'granted') return 'concedida'
		if (exact_alarm === 'denied') return 'negada'
		return 'indisponivel'
	} catch {
		return 'indisponivel'
	}
}

/** Abre a tela do Android "Alarmes e lembretes" para o usuário liberar. */
export async function pedirAlarmeExato(): Promise<boolean> {
	if (!DISPONIVEL()) return false
	try {
		if (!LocalNotifications.changeExactNotificationSetting) return false
		const { exact_alarm } = await LocalNotifications.changeExactNotificationSetting()
		return exact_alarm === 'granted'
	} catch {
		return false
	}
}

/* --------------------------------------------------------------------------
   Isenção de otimização de bateria
   -------------------------------------------------------------------------- */

interface BateriaPlugin {
	estado(): Promise<{ isento: boolean }>
	pedir(): Promise<{ isento: boolean }>
	/** Versão instalada do APK, lida do PackageManager. */
	versao?(): Promise<{ versionCode: number; versionName: string }>
}

/**
 * Versão real do APK instalado.
 *
 * O rodapé de Ajustes mostrava `__APP_VERSION__`, que vem do `package.json` e
 * não muda entre entregas — então ele dizia o mesmo número em todas as versões.
 * Isso impedia a única conferência que importa depois de instalar: "a versão
 * nova entrou?". Aqui a resposta vem do sistema, que é quem sabe.
 */
export async function versaoDoAplicativo(): Promise<string | null> {
	if (!DISPONIVEL()) return null
	try {
		const resultado = await Bateria.versao?.()
		if (!resultado) return null
		return `${resultado.versionName} (${resultado.versionCode})`
	} catch {
		return null
	}
}

/**
 * Plugin nativo deste projeto (`BateriaPlugin.java`).
 *
 * Não é pacote npm: é código no `android/app/src/main/java`. O registro é feito
 * em `MainActivity.onCreate`.
 */
const Bateria = registerPlugin<BateriaPlugin>('Bateria')

/**
 * O sistema está segurando o app por economia de bateria?
 *
 * Isto não é detalhe de otimização. Medido no Redmi 12: com o app no bucket
 * `RARE` do MIUI, o alarme inexato foi reagendado para **+2d23h**. A isenção é
 * o que tira o app desse bucket.
 */
export async function estadoDaBateria(): Promise<'isento' | 'restrito' | 'indisponivel'> {
	if (!DISPONIVEL()) return 'indisponivel'
	try {
		const { isento } = await Bateria.estado()
		return isento ? 'isento' : 'restrito'
	} catch {
		return 'indisponivel'
	}
}

/** Abre a tela do sistema para isentar o app. Devolve o estado depois. */
export async function pedirIsencaoDeBateria(): Promise<'isento' | 'restrito' | 'indisponivel'> {
	if (!DISPONIVEL()) return 'indisponivel'
	try {
		const resultado = await Bateria.pedir()
		return resultado.isento ? 'isento' : 'restrito'
	} catch {
		return 'indisponivel'
	}
}

/**
 * Cria o canal se ele ainda não existir.
 *
 * Chamado antes de agendar e na abertura do app. Sem isso o aviso é descartado
 * pelo sistema sem erro nenhum — foi a causa do "não recebo nada".
 */
export async function garantirCanal(): Promise<boolean> {
	if (!DISPONIVEL()) return false
	try {
		if (!LocalNotifications.createChannel) return false
		await LocalNotifications.createChannel({
			id: CANAL,
			name: 'Lembretes e prazos',
			description: 'Tarefas, prazos, hábitos, eventos e avisos do Jarvis.',
			importance: IMPORTANCIA_ALTA,
			vibration: true,
			lights: true,
			visibility: 1,
		})
		return true
	} catch (causa) {
		console.warn('Jarvis: não foi possível criar o canal de notificação.', causa)
		return false
	}
}

export interface ResultadoAgendamento {
	agendadas: number
	erro: string | null
	/** O Android avisou que entregará de forma inexata (sem permissão de alarme). */
	inexato?: boolean
}

/**
 * Agenda avisos, **sem cancelar o que não é seu**.
 *
 * Cada aviso tem id fixo derivado da chave, então reenviar o mesmo id
 * substitui em vez de duplicar — o Android já faz isso. Para remover o que saiu
 * do plano, `sincronizarSegundoPlano` compara as listas e chama `cancelarIds`.
 *
 * **Alarme exato — medido no aparelho, não suposto.** No Redmi 12 (MIUI,
 * Android 15), em 12/11/2026:
 *
 *   - alarme exato com o app fechado e a tela bloqueada: **chegou**;
 *   - alarme inexato, mesmo com o app no bucket `active`: só chegou depois de
 *     mais de um minuto e, no bucket `rare` do MIUI, o sistema reagendou para
 *     +2d23h — nunca chegou.
 *
 * Por isso a exatidão não é opcional aqui. O manifesto declara
 * `USE_EXACT_ALARM`, que o Android concede na instalação e não revoga; a
 * permissão antiga (`SCHEDULE_EXACT_ALARM`) continua como reserva para
 * aparelhos onde a nova não existe.
 *
 * **Nunca peça exatidão sem poder.** Com `isExactNotification: true` e sem a
 * permissão, o plugin abre a tela de Ajustes do Android NO MEIO do agendamento
 * e a promessa nunca resolve — o app fica travado esperando. Isso foi
 * reproduzido no aparelho: a chamada pendurou e a tela ficou preta. Por isso o
 * valor é sempre calculado, nunca fixo.
 */
export async function agendar(avisos: Aviso[]): Promise<ResultadoAgendamento> {
	if (!DISPONIVEL()) return { agendadas: 0, erro: 'Este ambiente não tem notificações nativas.' }
	if (avisos.length === 0) return { agendadas: 0, erro: null }

	const permissao = await estadoDaPermissao()
	if (permissao !== 'concedida') {
		return { agendadas: 0, erro: 'Permissão de notificação não concedida.' }
	}

	const exato = (await estadoDoAlarmeExato()) === 'concedida'

	try {
		await garantirCanal()

		const resultado = await LocalNotifications.schedule({
			notifications: avisos.map((aviso) => ({
				id: aviso.id,
				title: aviso.titulo,
				body: aviso.corpo,
				schedule: { at: new Date(aviso.em), allowWhileIdle: true },
				// Sem permissão, `true` aqui travaria o app numa tela de Ajustes.
				isExactNotification: exato,
				smallIcon: ICONE,
				channelId: CANAL,
				extra: { chave: aviso.chave },
			})),
		})

		const agendadas = resultado?.notifications?.length ?? avisos.length
		const inexato = !exato && avisos.length > 0

		return { agendadas, erro: null, inexato }
	} catch (causa) {
		return {
			agendadas: 0,
			erro: causa instanceof Error ? causa.message : 'Não foi possível agendar.',
		}
	}
}

/** Pausa real: cancela o que já estava agendado no sistema operacional. */
export async function cancelarTodas(): Promise<void> {
	if (!DISPONIVEL()) return
	try {
		const pendentes = await LocalNotifications.getPending()
		if (pendentes.notifications.length === 0) return
		await LocalNotifications.cancel({
			notifications: pendentes.notifications.map((entrada) => ({ id: entrada.id })),
		})
	} catch (causa) {
		console.warn('Jarvis: falha ao cancelar notificações.', causa)
	}
}

/** Cancela apenas ids conhecidos, deixando o resto intacto. */
export async function cancelarIds(ids: number[]): Promise<void> {
	if (!DISPONIVEL() || ids.length === 0) return
	try {
		await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) })
	} catch {
		// Best-effort.
	}
}

/** Quantas notificações estão agendadas no sistema (para a central mostrar). */
export async function contarAgendadas(): Promise<number> {
	if (!DISPONIVEL()) return 0
	try {
		const pendentes = await LocalNotifications.getPending()
		return pendentes.notifications.length
	} catch {
		return 0
	}
}

/** Ids pendentes no sistema, para conferir o que realmente ficou agendado. */
export async function idsPendentes(): Promise<number[]> {
	if (!DISPONIVEL()) return []
	try {
		const pendentes = await LocalNotifications.getPending()
		return pendentes.notifications.map((entrada) => entrada.id)
	} catch {
		return []
	}
}

/**
 * Dispara uma notificação de teste em alguns segundos.
 *
 * Existe para o usuário provar o caminho inteiro (permissão → canal → alarme →
 * bandeja) sem esperar até as 8h. Se isto não aparecer, o problema é do
 * aparelho, não do agendamento.
 */
export async function testarNotificacao(segundos = 10): Promise<ResultadoAgendamento> {
	if (!DISPONIVEL()) return { agendadas: 0, erro: 'Este ambiente não tem notificações nativas.' }

	const permissao = await estadoDaPermissao()
	if (permissao !== 'concedida') {
		return { agendadas: 0, erro: 'Permissão de notificação não concedida.' }
	}

	const criado = await garantirCanal()
	if (!criado) return { agendadas: 0, erro: 'O canal de notificação não pôde ser criado.' }

	try {
		const em = Date.now() + segundos * 1000
		await LocalNotifications.schedule({
			notifications: [
				{
					id: idDeTeste(),
					title: 'Urdume está avisando',
					body: 'Se você está lendo isto fora do app, as notificações funcionam.',
					schedule: { at: new Date(em), allowWhileIdle: true },
					smallIcon: ICONE,
					channelId: CANAL,
					extra: { chave: 'teste' },
				},
			],
		})
		return { agendadas: 1, erro: null }
	} catch (causa) {
		return {
			agendadas: 0,
			erro: causa instanceof Error ? causa.message : 'Não foi possível agendar o teste.',
		}
	}
}

/** Id fixo do teste: repetir o teste substitui o anterior em vez de empilhar. */
export function idDeTeste(): number {
	return 42_424_242
}

/**
 * Abrir o app por uma notificação. A tela trata igual a uma abertura normal: o
 * painel do dia já está calculado; só precisa recarregar.
 */
export async function aoTocarNotificacao(ouvinte: (extra: unknown) => void): Promise<() => void> {
	if (!DISPONIVEL()) return () => undefined
	try {
		const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (evento) => {
			const dados = evento as { notification?: { extra?: unknown } }
			ouvinte(dados.notification?.extra)
		})
		return () => {
			void handle.remove?.()
		}
	} catch {
		return () => undefined
	}
}
