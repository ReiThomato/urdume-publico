import { useEffect, useRef } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { db } from '@/db/db'
import { registrarAbertura } from './leitura'
import { avaliarSePermitido, ehHoraDeTique } from './motor'
import { podarDiario } from './diario'
import { podarAcoes, podarConversa, podarExecucoes } from './estado'
import { lerPreferencias } from './estado'
import { sincronizarSegundoPlano, rearmarAgenda } from './segundo-plano'
import { garantirCanal } from './notificacoes'
import { agirSozinho } from './autonomia'
import { rodarGatilhos } from './gatilhos'
import { marcarItem } from './motor'

/**
 * Ciclo de vida do Jarvis.
 *
 * Quatro ganchos, todos de graça no Capacitor:
 *
 * - **ao abrir**: carimba a abertura, avalia o que acumulou (a menos que o modo
 *   seja manual/pausado) e sincroniza o segundo plano;
 * - **ao ir para segundo plano** (`appStateChange`): grava retrato + plano, que
 *   é tudo o que o runner vai conseguir ver depois;
 * - **ao mudar qualquer dado**: rearma a agenda de avisos (ver abaixo);
 * - **tique de minuto** (só com o app aberto): nas janelas de 8h, 13h e 18h,
 *   reavalia. Fora delas não gasta nada.
 *
 * O tique de minuto é `setInterval` porque, com o app aberto, é confiável. Com
 * o app em segundo plano ele morre — e é aí que entra o runner do Android, não
 * este arquivo.
 */

/**
 * Espera antes de reagendar depois de uma escrita.
 *
 * Criar uma tarefa dispara várias escritas seguidas (tarefa, vínculo com o
 * projeto, etiquetas). Sem este atraso, cada uma recalcularia a agenda inteira
 * e chamaria o plugin quatro vezes para o mesmo resultado. 1,5 s é curto o
 * suficiente para o aviso existir antes de o usuário sair da tela.
 */
const ESPERA_REARME_MS = 1500

export function useJarvisVivo(): void {
	const ultimoTique = useRef<string>('')

	useEffect(() => {
		let vivo = true
		let intervalo: number | undefined
		let pararEstado: (() => void) | undefined
		let pararDiario: (() => void) | undefined
		let rearme: number | undefined

		/** Reagenda os avisos com debounce. Idempotente por construção. */
		const pedirRearme = (): void => {
			if (!vivo) return
			if (rearme != null) window.clearTimeout(rearme)
			rearme = window.setTimeout(() => {
				// Caminho barato: só a agenda, sem avaliar os 41 sinais. Uma
				// escrita de tarefa não deve custar uma avaliação completa.
				void rearmarAgenda().catch(() => undefined)
			}, ESPERA_REARME_MS)
		}

		void (async () => {
			// Uma vez por sessão: carimba e poda.
			await registrarAbertura()

			// Canal de notificação criado já na primeira abertura, sem depender
			// de o usuário visitar a tela do Jarvis. Sem o canal, o Android
			// descarta o aviso em silêncio — foi a causa do silêncio absoluto.
			await garantirCanal().catch(() => false)

			const prefs = await lerPreferencias()
			await podarDiario({ dias: prefs.guardarDias })
			await podarExecucoes(prefs.guardarDias)
			await podarConversa(prefs.guardarDias)
			await podarAcoes(prefs.guardarDias)

			if (!vivo) return

			// Avaliação de abertura: o que acumulou enquanto o app estava fechado.
			const painel = await avaliarSePermitido()
			if (!vivo) return

			// Ações de baixo risco, se a autonomia autorizar. O resultado é
			// marcado como aceito para o mesmo sinal não voltar no tique.
			if (painel) {
				const acoes = await agirSozinho(painel).catch(() => ({ executadas: 0, tratados: [] }))
				for (const chave of acoes.tratados) {
					await marcarItem(painel.dia, chave, 'aceito').catch(() => null)
				}
			}

			await rodarGatilhos().catch(() => undefined)
			await sincronizarSegundoPlano().catch(() => undefined)

			const tiquear = async (): Promise<void> => {
				const agora = new Date()
				const hora = agora.getHours()
				if (!ehHoraDeTique(hora)) return

				const marca = `${agora.getFullYear()}-${agora.getMonth()}-${agora.getDate()}-${hora}`
				if (ultimoTique.current === marca) return
				ultimoTique.current = marca

				const doTique = await avaliarSePermitido({ agora: agora.getTime() })
				if (doTique) {
					const acoes = await agirSozinho(doTique, { agora: agora.getTime() }).catch(() => ({
						executadas: 0,
						tratados: [],
					}))
					for (const chave of acoes.tratados) {
						await marcarItem(doTique.dia, chave, 'aceito').catch(() => null)
					}
				}
				await sincronizarSegundoPlano(agora.getTime()).catch(() => undefined)
			}

			// Uma checagem por minuto é barata: compara a hora e retorna.
			intervalo = window.setInterval(() => {
				void tiquear()
				// Gatilhos têm resolução de hora; checar a cada minuto é barato e
				// garante que um gatilho não espere o próximo tique de 5 h.
				void rodarGatilhos().catch(() => undefined)
			}, 60_000)
			void tiquear()
		})()

		/*
		 * Rearme por escrita.
		 *
		 * Este é o gancho que faz "marcar tarefa para 15h" virar um alarme das
		 * 15h sem esperar o próximo tique. O diário é append-only, então
		 * observar a tabela pega qualquer mudança — de tela, de desfazer ou da
		 * própria IA — sem cada tela precisar lembrar de chamar nada.
		 *
		 * Usa o hook de escrita e não `useLiveQuery`: queremos saber que algo
		 * mudou, não renderizar. `useLiveQuery` aqui re-renderizaria o Shell
		 * inteiro a cada toque numa tarefa.
		 */
		const aoAnotarFato = (): void => pedirRearme()
		db.aiJournal.hook('creating', aoAnotarFato)
		pararDiario = () => db.aiJournal.hook('creating').unsubscribe(aoAnotarFato)

		// O app indo para segundo plano é o ÚNICO momento em que o retrato pode
		// ser gravado com dados frescos. Sem isso, o runner fica sem contexto.
		if (Capacitor.isNativePlatform()) {
			void CapacitorApp.addListener('appStateChange', (estado) => {
				if (estado.isActive) {
					void avaliarSePermitido().catch(() => undefined)
					return
				}
				void sincronizarSegundoPlano().catch(() => undefined)
			}).then((handle) => {
				pararEstado = () => void handle.remove()
			})
		}

		return () => {
			vivo = false
			if (intervalo != null) window.clearInterval(intervalo)
			if (rearme != null) window.clearTimeout(rearme)
			pararEstado?.()
			pararDiario?.()
		}
	}, [])
}
