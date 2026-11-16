import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Ilha do Jarvis — exibidor flutuante, no padrão da Ilha Dinâmica.
 *
 * ## Regra que não se negocia: ela não ocupa espaço no layout
 *
 * A ilha é um **overlay**. Ela flutua sobre o conteúdo e NUNCA empurra nada.
 *
 * A versão anterior publicava a própria altura numa variável CSS e o cabeçalho
 * usava isso como `padding-top`: com um recado na tela, todo o conteúdo descia
 * ~90 px e voltava quando ela recolhia. Para o usuário isso é o oposto de
 * "notificação discreta" — é a página pulando embaixo dele, e foi reportado
 * como bug.
 *
 * Aquele `padding` existia por um motivo real (a ilha cobria o título da tela),
 * e a solução correta não é reservar espaço: é a ilha **não cobrir** o título.
 * Ela vive numa faixa própria acima da barra do app, dentro da safe area, com
 * largura de conteúdo. Se a faixa não couber, ela encolhe — nunca empurra.
 *
 * ## Dois gestos de toque
 *
 * | Gesto | Efeito |
 * |---|---|
 * | toque no cartão, fora dos botões | recolhe para a gota (pílula) |
 * | arrasto para qualquer lado (cima, baixo, esquerda, direita) | "Agora não": dispensa o recado |
 *
 * O toque e o arrasto convivem pelo mesmo motivo de sempre: um `pointerdown`
 * que não anda mais que `LIMIAR_TOQUE` é toque; se andar, é arrasto. Sem essa
 * distinção, o dedo escorregando 2 px recolheria quando o usuário queria
 * arrastar, e arrastar 30 px recolheria quando ele queria dispensar.
 *
 * Os botões continuam com prioridade absoluta: nada de gesto em cima de
 * "Agora não", "Fazer" ou "Ver".
 */

export interface Recado {
	id: string
	titulo: string
	mensagem: string
	nivel: 'informativo' | 'oportunidade' | 'atencao' | 'urgente'
	/** Quantas ações a IA propôs; define se aparece "Fazer". */
	acoes: number
}

interface Props {
	recados: Recado[]
	onAbrir: (recado: Recado) => void
	onFazer: (recado: Recado) => void
	onDispensar: (recado: Recado) => void
	/** Passa para o próximo recado sem dispensar o atual (o "+N"). */
	onProximo?: (recado: Recado) => void
	duracaoMs?: number
}

/**
 * Distância a partir da qual o gesto é arrasto, não toque.
 *
 * 10 px: abaixo disso é tremor de dedo em toque normal; acima, é intenção.
 * Valores menores faziam um toque levemente torto virar "Agora não" — o pior
 * erro possível, porque dispensa sem o usuário ter pedido.
 */
const LIMIAR_ARRASTO = 10

/** Distância para o arrasto valer como dispensa. */
const LIMIAR_DISPENSA = 56

/**
 * O robô. SVG em vez de imagem: acompanha o tema e anima o visor sem sprite.
 *
 * ## Por que ele é feito de grupos
 *
 * Cada movimento precisa de um eixo próprio, e no SVG um `transform` no mesmo
 * elemento substitui o outro — duas animações no mesmo nó brigam. Os grupos
 * resolvem: o de fora flutua (translateY), o de dentro inclina a cabeça
 * (rotate) e o visor pisca (scaleX). Sem isso, inclinar a cabeça matava a
 * flutuação.
 *
 * O `brilho` é um círculo maior, atrás da ponta da antena, que pisca em
 * vermelho de vez em quando — é o LED do robô, não um alarme.
 */
function Robo() {
	return (
		<svg className="ilha__avatar" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
			<g className="ilha__avatar-corpo">
				<g className="ilha__avatar-cabeca-grupo">
					<path
						className="ilha__avatar-cabeca"
						d="M20 6.2c-6.4 0-11.4 4.8-11.4 10.8v6.4c0 6 5 10.8 11.4 10.8s11.4-4.8 11.4-10.8v-6.4C31.4 11 26.4 6.2 20 6.2Z"
					/>
					<rect className="ilha__avatar-visor" x="12.8" y="14.6" width="14.4" height="8" rx="4" />
					<path className="ilha__avatar-antena" d="M20 6.2V3.4" />
					<circle className="ilha__avatar-brilho" cx="20" cy="2.6" r="3.6" />
					<circle className="ilha__avatar-ponta" cx="20" cy="2.6" r="1.5" />
				</g>
				<path className="ilha__avatar-base" d="M15 34.2h10" />
			</g>
		</svg>
	)
}

export function IlhaDoJarvis({
	recados,
	onAbrir,
	onFazer,
	onDispensar,
	onProximo,
	duracaoMs = 15000,
}: Props) {
	const atual = recados[0] ?? null
	const [saindo, setSaindo] = useState(false)
	const [deslocamento, setDeslocamento] = useState({ x: 0, y: 0 })
	const [pensando, setPensando] = useState(true)
	const [recolhida, setRecolhida] = useState(false)
	/*
	 * Estado, não ref: a classe `ilha--arrastando` desliga a transição do
	 * `transform`, e um ref não re-renderiza — a classe simplesmente não
	 * apareceria e o arrasto continuaria "correndo atrás do dedo".
	 */
	const [arrastando, setArrastando] = useState(false)

	const inicio = useRef<{ x: number; y: number } | null>(null)
	const timer = useRef<number | undefined>(undefined)
	const pausado = useRef(false)

	const sair = useCallback(
		(recado: Recado) => {
			setSaindo(true)
			window.setTimeout(() => {
				setSaindo(false)
				setDeslocamento({ x: 0, y: 0 })
				setRecolhida(false)
				onDispensar(recado)
			}, 200)
		},
		[onDispensar],
	)

	/**
	 * O robô "acorda": um gesto só de cabeça e um pulo curto.
	 *
	 * Vale em dois momentos, e os dois são o mesmo pedido do usuário: quando
	 * chega recado (o cartão abre sozinho) e quando ELE abre a gota. Antes o
	 * segundo caso não animava nada — a gota estalava para cartão estático.
	 *
	 * O timer é único e sempre reiniciado, para dois toques seguidos não
	 * deixarem a classe presa.
	 */
	const acordarRef = useRef<number | undefined>(undefined)
	const acordar = useCallback(() => {
		setPensando(true)
		if (acordarRef.current != null) window.clearTimeout(acordarRef.current)
		acordarRef.current = window.setTimeout(() => setPensando(false), 950)
	}, [])

	const rearmarRelogio = useCallback(() => {
		if (timer.current != null) window.clearTimeout(timer.current)
		if (duracaoMs <= 0) return
		timer.current = window.setTimeout(() => {
			if (!pausado.current) setRecolhida(true)
		}, duracaoMs)
	}, [duracaoMs])

	const idAtual = atual?.id ?? null

	useEffect(() => {
		if (!atual) return
		setSaindo(false)
		setDeslocamento({ x: 0, y: 0 })
		setRecolhida(false)
		acordar()
		rearmarRelogio()

		return () => {
			if (acordarRef.current != null) window.clearTimeout(acordarRef.current)
			if (timer.current != null) window.clearTimeout(timer.current)
		}
		// O id é a identidade: com o objeto, a releitura de 20 s reanimava o
		// cartão e a ilha "piscava" sozinha.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [idAtual, rearmarRelogio])

	/** Do arrasto para o deslocamento visual: um arrasto curto rende menos. */
	const transformar = (): string | undefined => {
		if (saindo) return 'translateY(-120%) scale(0.96)'
		const { x, y } = deslocamento
		if (x === 0 && y === 0) return undefined
		// Só a magnitude importa: a ilha acompanha o dedo em qualquer direção.
		return `translate(${x}px, ${y}px)`
	}

	const opacidade = (): number => {
		if (saindo) return 0
		const { x, y } = deslocamento
		if (x === 0 && y === 0) return 1
		const distancia = Math.hypot(x, y)
		// Some devagar até o limiar de dispensa, para o gesto ter feedback.
		return Math.max(0.35, 1 - distancia / (LIMIAR_DISPENSA * 2))
	}

	if (!atual) return null

	/* ----------------------------------------------------------- gota */

	if (recolhida && !saindo) {
		return (
			<div className="ilha-area" role="status" aria-live="polite">
				<button
					type="button"
					className={`ilha ilha--pilula ilha--${atual.nivel}`}
					aria-label={`Jarvis: ${atual.mensagem}. Toque para abrir.`}
					onClick={() => {
						setRecolhida(false)
						acordar()
						rearmarRelogio()
					}}
				>
					<span className="ilha__marca">
						<Robo />
					</span>
					<span className="ilha__nivel" aria-hidden="true" />
				</button>
			</div>
		)
	}

	/* ----------------------------------------------------------- cartão */

	const aoPressionar = (evento: React.PointerEvent<HTMLDivElement>): void => {
		// Botão dentro da ilha tem prioridade: nada de gesto em cima dos
		// controles. Sem isto, `setPointerCapture` no contêiner roubava o
		// ponteiro e o clique não chegava ao botão.
		const alvo = evento.target as HTMLElement | null
		if (alvo?.closest('button, a, input, textarea, select')) return

		inicio.current = { x: evento.clientX, y: evento.clientY }
		setArrastando(false)
		pausado.current = true
		evento.currentTarget.setPointerCapture(evento.pointerId)
	}

	const aoMover = (evento: React.PointerEvent<HTMLDivElement>): void => {
		const origem = inicio.current
		if (!origem) return

		const dx = evento.clientX - origem.x
		const dy = evento.clientY - origem.y

		// Ainda é toque: não mexe no visual nem conta como arrasto.
		if (!arrastando && Math.hypot(dx, dy) < LIMIAR_ARRASTO) return

		if (!arrastando) setArrastando(true)
		setDeslocamento({ x: dx, y: dy })
	}

	const aoSoltar = (): void => {
		const tinha = inicio.current
		const foiArrasto = arrastando
		pausado.current = false
		inicio.current = null
		setArrastando(false)

		if (!tinha) return

		const distancia = Math.hypot(deslocamento.x, deslocamento.y)

		if (foiArrasto && distancia >= LIMIAR_DISPENSA) {
			// Arrasto em QUALQUER direção dispensa — é o "Agora não" por gesto.
			sair(atual)
			return
		}

		if (foiArrasto) {
			// Arrasto curto: volta ao lugar, sem dispensar.
			setDeslocamento({ x: 0, y: 0 })
			rearmarRelogio()
			return
		}

		// Toque no cartão, fora dos botões: recolhe para a gota.
		setDeslocamento({ x: 0, y: 0 })
		setRecolhida(true)
	}

	const aoCancelar = (): void => {
		pausado.current = false
		inicio.current = null
		setArrastando(false)
		setDeslocamento({ x: 0, y: 0 })
	}

	return (
		<div className="ilha-area" role="status" aria-live="polite">
			<div
				className={[
					'ilha',
					`ilha--${atual.nivel}`,
					pensando ? 'ilha--pensando' : '',
					saindo ? 'ilha--saindo' : '',
					arrastando ? 'ilha--arrastando' : '',
				]
					.filter(Boolean)
					.join(' ')}
				style={{ transform: transformar(), opacity: opacidade() }}
				onPointerDown={aoPressionar}
				onPointerMove={aoMover}
				onPointerUp={aoSoltar}
				onPointerCancel={aoCancelar}
			>
				<span className="ilha__marca">
					<Robo />
				</span>

				<div className="ilha__corpo">
					<p className="ilha__texto">{atual.mensagem}</p>

					<div className="ilha__acoes">
						{recados.length > 1 ? (
							<button
								type="button"
								className="ilha__contagem"
								aria-label={`Próximo recado (mais ${recados.length - 1})`}
								title="Ver o próximo"
								onClick={() => onProximo?.(atual)}
							>
								+{recados.length - 1}
							</button>
						) : null}

						<button
							type="button"
							className="ilha__botao ilha__botao--discreto"
							onClick={() => sair(atual)}
						>
							Agora não
						</button>

						{atual.acoes > 0 ? (
							<button type="button" className="ilha__botao" onClick={() => onFazer(atual)}>
								Fazer
							</button>
						) : null}

						<button
							type="button"
							className="ilha__botao ilha__botao--principal"
							onClick={() => onAbrir(atual)}
						>
							Ver
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
