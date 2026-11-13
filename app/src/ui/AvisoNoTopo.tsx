import { useCallback, useEffect, useRef, useState } from 'react'
import { IconeAviso, IconeFechar } from '@/ui/icones'

/**
 * Aviso no topo, dispensável por gesto.
 *
 * Antes o aviso interno era uma faixa no rodapé, com um botão "Fechar" e nada
 * mais. Três problemas: ficava longe do olhar (o topo é onde a atenção chega
 * primeiro), cobria conteúdo, e exigia acertar um botão pequeno.
 *
 * Aqui:
 *
 * - entra por cima do conteúdo, abaixo do cabeçalho, sem empurrar a tela;
 * - **três formas de dispensar** — arrastar para cima, arrastar para o lado,
 *   ou tocar no X. Quem tenta uma e não funciona desiste do app, então as três
 *   precisam existir;
 * - some sozinho depois de um tempo generoso, mas **pausa enquanto o dedo
 *   está em cima** — ninguém quer perder uma mensagem por estar lendo.
 *
 * Não usa biblioteca de gesto: `pointerdown/move/up` cobre toque e mouse, e o
 * código inteiro cabe abaixo.
 */

export type TipoDeAviso = 'info' | 'atencao' | 'erro'

export interface AvisoDoTopo {
	/** Muda a cada aviso novo; é o que reinicia a animação. */
	id: string
	texto: string
	tipo?: TipoDeAviso
	/** Ação opcional (ex.: "Desfazer"). */
	acao?: { rotulo: string; executar: () => void }
}

interface Props {
	aviso: AvisoDoTopo | null
	onFechar: () => void
	/** Tempo até sumir sozinho. 0 = fica até o usuário fechar. */
	duracaoMs?: number
}

/** Distância que o dedo precisa andar para valer como gesto. */
const LIMIAR = 48

export function AvisoNoTopo({ aviso, onFechar, duracaoMs = 12000 }: Props) {
	const [deslocamento, setDeslocamento] = useState({ x: 0, y: 0 })
	const [saindo, setSaindo] = useState(false)
	const inicio = useRef<{ x: number; y: number } | null>(null)
	const timer = useRef<number | undefined>(undefined)
	const pausado = useRef(false)

	const fechar = useCallback(() => {
		setSaindo(true)
		// Espera a animação de saída antes de desmontar, senão o aviso
		// desaparece de um salto.
		window.setTimeout(onFechar, 180)
	}, [onFechar])

	/** Reinicia a contagem sempre que troca de aviso. */
	useEffect(() => {
		setDeslocamento({ x: 0, y: 0 })
		setSaindo(false)
		if (timer.current != null) window.clearTimeout(timer.current)

		if (!aviso || duracaoMs <= 0) return

		timer.current = window.setTimeout(() => {
			if (!pausado.current) fechar()
		}, duracaoMs)

		return () => {
			if (timer.current != null) window.clearTimeout(timer.current)
		}
	}, [aviso?.id, duracaoMs, fechar, aviso])

	if (!aviso) return null

	const aoPressionar = (evento: React.PointerEvent<HTMLDivElement>): void => {
		inicio.current = { x: evento.clientX, y: evento.clientY }
		pausado.current = true
		evento.currentTarget.setPointerCapture(evento.pointerId)
	}

	const aoMover = (evento: React.PointerEvent<HTMLDivElement>): void => {
		if (!inicio.current) return
		const dx = evento.clientX - inicio.current.x
		const dy = evento.clientY - inicio.current.y
		// Só acompanha o eixo em que o dedo realmente andou, para o aviso não
		// tremer na diagonal.
		if (Math.abs(dx) > Math.abs(dy)) setDeslocamento({ x: dx, y: 0 })
		else setDeslocamento({ x: 0, y: Math.min(0, dy) })
	}

	const aoSoltar = (): void => {
		pausado.current = false
		if (!inicio.current) return
		inicio.current = null

		// Para cima ou para o lado: os dois dispensam.
		const saiu = Math.abs(deslocamento.x) > LIMIAR || deslocamento.y < -LIMIAR
		if (saiu) fechar()
		else setDeslocamento({ x: 0, y: 0 })
	}

	const estilo: React.CSSProperties = {
		transform: saindo
			? 'translateY(-120%)'
			: deslocamento.x !== 0 || deslocamento.y !== 0
				? `translate(${deslocamento.x}px, ${deslocamento.y}px)`
				: undefined,
		opacity: saindo ? 0 : deslocamento.x !== 0 ? Math.max(0.3, 1 - Math.abs(deslocamento.x) / 200) : 1,
	}

	return (
		<div className="aviso-topo" role="status" aria-live="polite">
			<div
				className={`aviso-topo__caixa aviso-topo__caixa--${aviso.tipo ?? 'info'}${saindo ? ' aviso-topo__caixa--saindo' : ''}`}
				style={estilo}
				onPointerDown={aoPressionar}
				onPointerMove={aoMover}
				onPointerUp={aoSoltar}
				onPointerCancel={aoSoltar}
			>
				<span className="aviso-topo__icone" aria-hidden="true">
					<IconeAviso size={18} />
				</span>

				<span className="aviso-topo__texto">{aviso.texto}</span>

				{aviso.acao ? (
					<button
						type="button"
						className="botao botao--texto botao--compacto"
						onClick={() => {
							aviso.acao?.executar()
							fechar()
						}}
					>
						{aviso.acao.rotulo}
					</button>
				) : null}

				<button
					type="button"
					className="botao-icone botao-icone--pequeno aviso-topo__fechar"
					aria-label="Fechar aviso"
					onClick={fechar}
				>
					<IconeFechar size={16} />
				</button>
			</div>

			{/* Dica visual de que dá para arrastar. Só aparece por um instante. */}
			<span className="aviso-topo__alca" aria-hidden="true" />
		</div>
	)
}
