import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { IconeFechar } from '@/ui/icones'

export interface FolhaProps {
	titulo: string
	aberta: boolean
	onFechar: () => void
	children: ReactNode
	/**
	 * Muda quando o conteúdo da folha troca (ex.: escolha → formulário).
	 * Refaz o foco inicial: sem isso, ao voltar de etapa o foco caía no <body>
	 * e a digitação se perdia (DEF-15 do QA).
	 */
	passo?: string | number
	/** Linha de apoio abaixo do título (data, contagem, contexto). */
	sobre?: string
	/** Ações fixas no rodapé da folha (botão primário de salvar, etc.). */
	rodape?: ReactNode
}

/**
 * Folha modal usada por criação, edição e confirmação.
 *
 * Fecha em Escape e no clique do fundo, devolve o foco ao elemento que abriu,
 * prende o Tab dentro dela e rola por dentro — com o teclado do Android aberto
 * o topo do formulário não pode sair da tela.
 */
export function Folha({ titulo, aberta, onFechar, children, passo, sobre, rodape }: FolhaProps) {
	const painelRef = useRef<HTMLDivElement>(null)
	const anteriorRef = useRef<HTMLElement | null>(null)
	// `onFechar` costuma ser recriado a cada render do pai. Guardar numa ref evita
	// que o efeito de foco rode de novo (e roube o foco de quem está digitando).
	const fecharRef = useRef(onFechar)
	fecharRef.current = onFechar

	// Arrastar a folha para baixo fecha. O puxador e a faixa do cabeçalho são a
	// alça: arrastar o corpo rolaria o conteúdo em vez de fechar, que é o
	// comportamento esperado de uma folha com formulário longo.
	const arrastoRef = useRef<{ inicioY: number; deslocamento: number } | null>(null)

	useEffect(() => {
		if (!aberta) return

		anteriorRef.current = document.activeElement as HTMLElement | null
		const painel = painelRef.current

		let quadros = 0
		let cancelado = false

		const focarCampo = (): void => {
			if (cancelado) return
			const alvo =
				painel?.querySelector<HTMLElement>('[data-foco-inicial]') ??
				painel?.querySelector<HTMLElement>(
					'input:not([type="hidden"]):not([type="date"]):not([type="time"]), textarea, select',
				)
			if (alvo) {
				alvo.focus()
				if (document.activeElement === alvo) return
			}
			if (quadros++ < 20) requestAnimationFrame(focarCampo)
			else painel?.querySelector<HTMLElement>('button:not([data-ignorar-foco])')?.focus()
		}

		focarCampo()

		const aoTeclar = (evento: KeyboardEvent): void => {
			if (evento.key === 'Escape') {
				evento.preventDefault()
				fecharRef.current()
				return
			}

			if (evento.key !== 'Tab' || !painel) return

			const itens = Array.from(
				painel.querySelectorAll<HTMLElement>(
					'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
				),
			).filter((item) => item.offsetParent !== null)

			if (itens.length === 0) return

			const primeiro = itens[0]!
			const ultimo = itens[itens.length - 1]!

			if (!painel.contains(document.activeElement)) {
				evento.preventDefault()
				;(evento.shiftKey ? ultimo : primeiro).focus()
				return
			}

			if (evento.shiftKey && document.activeElement === primeiro) {
				evento.preventDefault()
				ultimo.focus()
			} else if (!evento.shiftKey && document.activeElement === ultimo) {
				evento.preventDefault()
				primeiro.focus()
			}
		}

		document.addEventListener('keydown', aoTeclar)
		const overflowAnterior = document.body.style.overflow
		document.body.style.overflow = 'hidden'

		return () => {
			cancelado = true
			document.removeEventListener('keydown', aoTeclar)
			document.body.style.overflow = overflowAnterior
			anteriorRef.current?.focus?.()
		}
	}, [aberta, passo])

	if (!aberta) return null

	const iniciarArrasto = (evento: React.PointerEvent): void => {
		// Só o ponteiro principal (dedo ou botão esquerdo): evita fechar por
		// engano com um clique de botão direito no desktop.
		if (!evento.isPrimary || evento.button !== 0) return
		arrastoRef.current = { inicioY: evento.clientY, deslocamento: 0 }
		;(evento.currentTarget as HTMLElement).setPointerCapture?.(evento.pointerId)
	}

	const moverArrasto = (evento: React.PointerEvent): void => {
		const arrasto = arrastoRef.current
		if (!arrasto) return
		// Só para baixo; puxar para cima não estica a folha além da tela.
		arrasto.deslocamento = Math.max(0, evento.clientY - arrasto.inicioY)
		if (painelRef.current) {
			painelRef.current.style.transform =
				arrasto.deslocamento > 0 ? `translateY(${arrasto.deslocamento}px)` : ''
		}
	}

	const terminarArrasto = (): void => {
		const arrasto = arrastoRef.current
		arrastoRef.current = null
		if (!arrasto || !painelRef.current) return

		const painel = painelRef.current
		painel.style.transition = 'transform 160ms cubic-bezier(0.2, 0, 0, 1)'
		// 90 px ou um terço da tela: abaixo disso, devolve à posição e não fecha —
		// o usuário encostou na alça sem querer.
		const passou = arrasto.deslocamento > 90

		if (passou) {
			painel.style.transform = 'translateY(100%)'
			window.setTimeout(() => {
				fecharRef.current()
				if (painel) {
					painel.style.transform = ''
					painel.style.transition = ''
				}
			}, 150)
			return
		}

		painel.style.transform = ''
		window.setTimeout(() => {
			if (painel) painel.style.transition = ''
		}, 170)
	}

	return (
		<div className="folha-fundo" onClick={onFechar} role="presentation">
			<div
				className="folha"
				role="dialog"
				aria-modal="true"
				aria-label={titulo}
				ref={painelRef}
				onClick={(evento) => evento.stopPropagation()}
			>
				{/* Alça de arrasto: área de toque generosa (toda a faixa do
				    cabeçalho), teclado e leitor de tela continuam com o botão
				    Fechar ao lado. */}
				<div
					className="folha__alca"
					onPointerDown={iniciarArrasto}
					onPointerMove={moverArrasto}
					onPointerUp={terminarArrasto}
					onPointerCancel={terminarArrasto}
					role="presentation"
				>
					<div className="folha__puxador" aria-hidden="true" />
				</div>
				<div className="folha__cabecalho">
					<div className="folha__texto">
						<h2 className="folha__titulo">{titulo}</h2>
						{sobre ? <p className="folha__sobre">{sobre}</p> : null}
					</div>
					<button
						type="button"
						className="botao-icone"
						aria-label="Fechar"
						data-ignorar-foco
						onClick={onFechar}
					>
						<IconeFechar size={22} />
					</button>
				</div>

				<div className="folha__corpo">{children}</div>
				{rodape ? <div className="folha__rodape">{rodape}</div> : null}
			</div>
		</div>
	)
}
