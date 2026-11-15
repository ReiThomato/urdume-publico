import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as PointerEventReact, ReactElement } from 'react'
import { Hct } from '@material/material-color-utilities'
import {
	PERFIS,
	corDoPonto,
	ehIntima,
	matizDaFamilia,
	matizDoRaio,
	perfilDe,
	raioDoCroma,
	raioDoTom,
} from '@/app/motor-cromatico'
import type { Deslocamentos, Harmonia, TipoDeRoda } from '@/app/motor-cromatico'

/**
 * Roda de cores — o seletor em círculo, com seis tipos.
 *
 * ## Por que existe mais de um tipo
 *
 * Uma roda só de matiz sempre entrega a mesma coisa: cor saturada. Quem gosta
 * de app calmo, pastel, terroso ou sem cor nenhuma ficava sem opção. Cada tipo
 * é um perfil de croma/tom e vale para o APP INTEIRO — não é um filtro de
 * desenho do disco.
 *
 * ## O que o dedo faz
 *
 * - **arrasta o pino grande** (a semente): o ângulo vira matiz, o raio vira
 *   croma (ou tom, na roda neutra). O app por baixo repinta no ato.
 * - **arrasta um pino pequeno** (secundária/terciária): muda só o ângulo
 *   daquela família, e ela deixa de seguir a regra de harmonia.
 * - **toca em qualquer ponto do disco**: a semente vai para lá.
 * - **teclado**: setas giram 2° (Shift: 15°); cima/baixo mudam a força.
 *
 * ## Por que o arraste não trava
 *
 * Três decisões, cada uma por um motivo medido:
 *
 * 1. **Um cálculo por quadro, não por evento.** `pointermove` dispara 120–240
 *    vezes por segundo num celular; o tema custa ~7,5 ms. Os eventos só
 *    atualizam uma ref; um `requestAnimationFrame` aplica a última posição.
 * 2. **`aplicarTema(…, { leve: true })` durante o gesto.** Não escreve em
 *    `localStorage` nem mexe em classes CSS a cada movimento.
 * 3. **O disco é desenhado UMA vez**, em 72 fatias com gradiente radial, e é
 *    memoizado: durante o arraste ele não é redesenhado. Antes eram 72 fatias
 *    recalculadas a cada render, que no Android derrubava o gesto.
 *
 * ## Toque x deslizar
 *
 * `touch-action: none` no disco diz ao navegador que o gesto é nosso. A folha
 * que contém a roda lê isso e não fecha a aba (ver `Folha.tsx`). Sem essa
 * marca, arrastar a cor fechava a folha — o defeito relatado.
 */

const LADO = 300
const CENTRO = LADO / 2
const RAIO_EXTERNO = 138
const RAIO_INTERNO = 26
/** Metade do alvo de toque de um pino (dedo ~9 mm). */
const TOQUE_DO_PINO = 22

type Pino = 'semente' | 'secundaria' | 'terciaria'

export interface RodaDeCoresProps {
	tipo: TipoDeRoda
	harmonia: Harmonia
	deslocamentos?: Deslocamentos
	semente: string
	/**
	 * Chamado a cada quadro do arraste, só para pintar a tela. NÃO deve gravar
	 * no banco: uma escrita por quadro derrubava o gesto a 16 fps.
	 *
	 * O segundo argumento é a RAIZ em que a prévia deve ser escrita — a folha
	 * que contém a roda. Repintar o `<html>` inteiro a cada quadro custava
	 * ~35 ms (medido); restringir à folha deixa o gesto em 60 fps e o app por
	 * trás recebe o tema final quando o dedo sai.
	 */
	aoArrastar: (hex: string, alvo: HTMLElement | null) => void
	/** Chamado quando um pino derivado é arrastado (graus absolutos 0–359). */
	aoArrastarFamilia: (familia: 'secundaria' | 'terciaria', graus: number) => void
	/** Fim do gesto: hora de gravar UMA vez no banco e no histórico. */
	aoSoltar: (hexFinal: string) => void
	/** Rótulo curto do que está selecionado, para o leitor de tela. */
	onPinoSelecionado?: (pino: Pino) => void
}

/** Ponto do disco a partir de (matiz, raio normalizado). */
function pontoDe(matiz: number, raio: number): { x: number; y: number } {
	const distancia = RAIO_INTERNO + raio * (RAIO_EXTERNO - RAIO_INTERNO)
	const rad = (matiz * Math.PI) / 180
	return { x: CENTRO + Math.cos(rad) * distancia, y: CENTRO + Math.sin(rad) * distancia }
}

/** Raio normalizado (0 = miolo, 1 = aro) de um ponto em px do disco. */
function raioNormalizado(dx: number, dy: number): number {
	const distancia = Math.sqrt(dx * dx + dy * dy)
	return Math.min(Math.max((distancia - RAIO_INTERNO) / (RAIO_EXTERNO - RAIO_INTERNO), 0), 1)
}

function hexDe(argb: number): string {
	return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`
}

/* --------------------------------------------------------------------------
   O disco
   -------------------------------------------------------------------------- */

/**
 * O disco é pintado com `conic-gradient` (matiz) por baixo de um
 * `radial-gradient` (força ou tom).
 *
 * A primeira versão desenhava 72 fatias SVG. Além de pesar, cada fatia tinha o
 * próprio gradiente radial, e as bordas entre fatias deixavam costuras — o
 * disco ficava com "raias". Aqui são duas camadas de gradiente compostas pelo
 * próprio navegador: sem costura, sem 72 nós no DOM, e a pintura vai para a
 * GPU.
 *
 * Na roda cromática, o `radial-gradient` cobre o centro com a cor neutra e
 * dissolve até transparente no aro, revelando o matiz por baixo. Na neutra,
 * ele é a única camada: do claro ao escuro.
 */
function camadasDoDisco(tipo: TipoDeRoda): { fundo: string; mascara?: string } {
	const perfil = perfilDe(tipo)

	if (perfil.eixo === 'tom') {
		const [claro, escuro] = perfil.tonsDoDisco
		const cor = (tom: number): string => hexDe(Hct.from(0, 0, tom).toInt())
		return {
			fundo: `radial-gradient(circle closest-side, ${cor(claro)} 0%, ${cor((claro + escuro) / 2)} 55%, ${cor(escuro)} 100%)`,
		}
	}

	/*
	 * Cores do aro, uma parada a cada 15°.
	 *
	 * O `conic-gradient` do CSS começa no topo e gira no sentido horário; os
	 * pinos usam ângulo matemático (0° = leste, horário, com y para baixo). A
	 * conversão é `matiz = (grau + 270) mod 360` — sem ela o disco fica girado
	 * 90° em relação aos pinos, e a cor sob o dedo não é a que o app aplica.
	 */
	const paradas: string[] = []
	for (let grau = 0; grau <= 360; grau += 15) {
		const matiz = (grau + 270) % 360
		paradas.push(`${hexDe(Hct.from(matiz, perfil.cromaMax, perfil.tomDoDisco).toInt())} ${grau}deg`)
	}

	const neutro = hexDe(Hct.from(0, 0, perfil.tomDoDisco).toInt())
	return {
		fundo: `conic-gradient(${paradas.join(', ')})`,
		// O neutro cobre o miolo e some rápido: passar de ~40% lava o disco
		// inteiro e o usuário vê cores pálidas em vez de "cheias na borda".
		mascara: `radial-gradient(circle closest-side, ${neutro} 0%, ${neutro} 15%, transparent 40%)`,
	}
}

/** Cache das camadas por tipo: strings de gradiente são caras de montar. */
const cacheDeCamadas = new Map<TipoDeRoda, { fundo: string; mascara?: string }>()

function camadasMemo(tipo: TipoDeRoda): { fundo: string; mascara?: string } {
	const guardadas = cacheDeCamadas.get(tipo)
	if (guardadas) return guardadas
	const novas = camadasDoDisco(tipo)
	cacheDeCamadas.set(tipo, novas)
	return novas
}

/**
 * O disco pintado.
 *
 * `memo` por tipo: arrastar o pino não recalcula gradiente nenhum, porque as
 * props não mudam.
 */
const Disco = memo(function Disco({ tipo }: { tipo: TipoDeRoda }): ReactElement {
	const camadas = camadasMemo(tipo)
	return (
		<div className="roda__campo" aria-hidden="true">
			<div className="roda__matizes" style={{ background: camadas.fundo }} />
			{camadas.mascara ? (
				<div className="roda__neutro" style={{ background: camadas.mascara }} />
			) : null}
			<div className="roda__miolo" />
		</div>
	)
})

/* --------------------------------------------------------------------------
   A roda
   -------------------------------------------------------------------------- */

export function RodaDeCores({
	tipo,
	harmonia,
	deslocamentos,
	semente,
	aoArrastar,
	aoArrastarFamilia,
	aoSoltar,
	onPinoSelecionado,
}: RodaDeCoresProps): ReactElement {
	const disco = useRef<SVGSVGElement | null>(null)
	const [pinoAtivo, setPinoAtivo] = useState<Pino | null>(null)
	/**
	 * Cor em uso durante o gesto.
	 *
	 * O arraste atualiza ESTE estado (local, barato) e avisa o pai por callback.
	 * Se a roda dependesse só da prop `semente`, cada movimento exigiria uma
	 * volta completa pelo React e pelo banco antes de o pino andar — era o que
	 * fazia o gesto parecer travado.
	 */
	const [sementeLocal, setSementeLocal] = useState(semente)

	useEffect(() => {
		setSementeLocal(semente)
		ultimaCor.current = semente
	}, [semente])

	const perfil = perfilDe(tipo)
	const hct = useMemo(
		() => Hct.fromInt(Number.parseInt(sementeLocal.replace('#', ''), 16) | 0xff000000),
		[sementeLocal],
	)

	/**
	 * Posição e cor de cada pino.
	 *
	 * A semente vem da cor escolhida; as derivadas vêm da harmonia — e, no modo
	 * `intima`, ficam visualmente vizinhas (é o que o esquema Material faz), em
	 * vez de fingir uma formação que não está sendo aplicada.
	 */
	const pinos = useMemo(() => {
		const raioSemente =
			perfil.eixo === 'tom'
				? raioDoTom(tipo, hct.tone)
				: raioDoCroma(tipo, Math.min(hct.chroma, perfil.cromaMax))
		/**
		 * As duas derivadas ficam em raios DIFERENTES.
		 *
		 * No modo `intima` as matizes são vizinhas (8° de diferença): com o mesmo
		 * raio, os dois pinos se sobrepunham e pareciam um só. Um degrau de raio
		 * resolve sem inventar uma formação que não está sendo aplicada.
		 */
		const raioApoio = perfil.eixo === 'tom' ? 0.62 : Math.max(raioDoCroma(tipo, 20), 0.36)
		const raioApoio2 = Math.min(raioApoio + 0.22, 0.96)

		const matizSecundaria = ehIntima(harmonia)
			? (hct.hue + 8) % 360
			: matizDaFamilia('secundaria', hct.hue, harmonia, deslocamentos)
		const matizTerciaria = ehIntima(harmonia)
			? (hct.hue - 8 + 360) % 360
			: matizDaFamilia('terciaria', hct.hue, harmonia, deslocamentos)

		return {
			semente: {
				matiz: hct.hue,
				raio: raioSemente,
				cor: corDoPonto(tipo, hct.hue, raioSemente).hex,
			},
			secundaria: {
				matiz: matizSecundaria,
				raio: raioApoio,
				cor: corDoPonto(tipo, matizSecundaria, raioApoio).hex,
			},
			terciaria: {
				matiz: matizTerciaria,
				raio: raioApoio2,
				cor: corDoPonto(tipo, matizTerciaria, raioApoio2).hex,
			},
		}
	}, [hct, tipo, harmonia, deslocamentos, perfil.eixo, perfil.cromaMax])

	/** Converte o ponto do dedo em (matiz, raio) dentro do disco. */
	const lerPonto = useCallback((cliente: { clientX: number; clientY: number }) => {
		const elemento = disco.current
		if (!elemento) return null
		const caixa = elemento.getBoundingClientRect()
		const escala = LADO / caixa.width
		const x = (cliente.clientX - caixa.left) * escala - CENTRO
		const y = (cliente.clientY - caixa.top) * escala - CENTRO
		return { matiz: matizDoRaio(x, y), raio: raioNormalizado(x, y) }
	}, [])

	/* ---------------------------------------------------------------------
	 * Arraste: o evento só guarda a posição; o quadro aplica.
	 * ------------------------------------------------------------------- */

	/** A folha em que a prévia é escrita, em vez do documento inteiro. */
	const raizDaPrevia = useCallback((): HTMLElement | null => {
		const painel = disco.current?.closest('.folha')
		return painel instanceof HTMLElement ? painel : null
	}, [])

	const alvo = useRef<{ matiz: number; raio: number } | null>(null)
	const quadro = useRef<number | null>(null)
	const pinoDoGesto = useRef<Pino | null>(null)
	/**
	 * Último momento em que o APP foi repintado.
	 *
	 * O pino precisa seguir o dedo a cada quadro (é o que dá a sensação de
	 * "vivo"), mas repintar o app inteiro — 60 variáveis CSS e todo o
	 * documento redesenhado — custa ~58 ms por quadro numa medição real: o
	 * arraste caía para 17 fps.
	 *
	 * A solução é separar os dois relógios: o pino anda a 60 fps (estado local
	 * do SVG), e o app por trás repinta a cada 80 ms. O olho lê como tempo
	 * real, porque a amostra sob o dedo está sempre correta, e o app alcança em
	 * menos de um piscar.
	 */
	const ultimoPintado = useRef(0)
	const PINTAR_A_CADA = 100
	/**
	 * O pino mestre, por DOM direto.
	 *
	 * Durante o arraste, `setSementeLocal` a cada quadro obriga o React a
	 * recalcular as três famílias (conversões HCT) e reconciliar o SVG: é o que
	 * sobra entre 52 e 60 fps. Aqui o grupo do pino recebe `transform` e `fill`
	 * na mão, um quadro por vez, e o estado do React só é atualizado 10 vezes
	 * por segundo (para a prévia e a leitura) e no fim do gesto.
	 */
	const pinoMestre = useRef<SVGGElement | null>(null)
	const baseDoPino = useRef<{ x: number; y: number } | null>(null)
	/**
	 * Última cor calculada sob o dedo.
	 *
	 * `sementeLocal` só é atualizada a cada 100 ms (para não reconciliar o SVG a
	 * cada quadro); no fim do gesto, quem vale é esta ref — senão a cor gravada
	 * seria a de até 100 ms antes, e o usuário veria o app "voltar" um pouco ao
	 * soltar.
	 */
	const ultimaCor = useRef(semente)

	/** Posição inicial do pino no começo do gesto (para o `transform`). */
	const fixarBaseDoPino = useCallback(() => {
		const grupo = pinoMestre.current
		if (!grupo) return
		const circulo = grupo.querySelector('circle')
		baseDoPino.current = circulo
			? { x: Number(circulo.getAttribute('cx')), y: Number(circulo.getAttribute('cy')) }
			: null
	}, [])

	/**
	 * Move e recolore o pino mestre sem passar pelo React.
	 *
	 * O grupo inteiro (área de toque, halo, aro e centro) anda junto por
	 * `transform`; as cores são escritas nos três círculos que as usam. Custa
	 * microssegundos, contra os ~4 ms de uma reconciliação do React.
	 */
	const moverPinoNaTela = useCallback((matiz: number, raio: number, hex: string) => {
		const grupo = pinoMestre.current
		const base = baseDoPino.current
		if (!grupo || !base) return
		const destino = pontoDe(matiz, raio)
		grupo.setAttribute('transform', `translate(${(destino.x - base.x).toFixed(2)} ${(destino.y - base.y).toFixed(2)})`)
		const circulos = grupo.querySelectorAll('circle')
		circulos[1]?.setAttribute('fill', hex)
		circulos[2]?.setAttribute('fill', hex)
	}, [])

	const aplicarAlvo = useCallback(() => {
		quadro.current = null
		const posicao = alvo.current
		const pino = pinoDoGesto.current
		if (!posicao || !pino) return

		if (pino === 'semente') {
			const ponto = corDoPonto(tipo, posicao.matiz, posicao.raio)
			ultimaCor.current = ponto.hex
			moverPinoNaTela(posicao.matiz, posicao.raio, ponto.hex)

			const agora = performance.now()
			if (agora - ultimoPintado.current >= PINTAR_A_CADA) {
				ultimoPintado.current = agora
				aoArrastar(ponto.hex, raizDaPrevia())
				setSementeLocal(ponto.hex)
			}
			return
		}

		// Pino derivado: só o ângulo muda. Guarda o deslocamento relativo à
		// semente, normalizado em ±180°, que é o que o tema entende.
		let graus = posicao.matiz - hct.hue
		if (graus > 180) graus -= 360
		if (graus < -180) graus += 360
		aoArrastarFamilia(pino, graus)
	}, [tipo, aoArrastar, aoArrastarFamilia, hct.hue, raizDaPrevia, moverPinoNaTela])

	const agendar = useCallback(() => {
		if (quadro.current !== null) return
		quadro.current = window.requestAnimationFrame(aplicarAlvo)
	}, [aplicarAlvo])

	useEffect(() => {
		return () => {
			if (quadro.current !== null) window.cancelAnimationFrame(quadro.current)
		}
	}, [])

	const comecar = (pino: Pino) => (evento: PointerEventReact<SVGGElement | SVGSVGElement>) => {
		evento.stopPropagation()
		evento.preventDefault()
		pinoDoGesto.current = pino
		setPinoAtivo(pino)
		onPinoSelecionado?.(pino)
		;(evento.currentTarget as Element).setPointerCapture?.(evento.pointerId)
		if (pino === 'semente') {
			pinoMestre.current?.removeAttribute('transform')
			fixarBaseDoPino()
		}

		// Tocar já move o pino para ali: no celular, esperar o arraste para
		// responder faz o toque parecer ignorado.
		const posicao = lerPonto(evento)
		if (posicao) {
			alvo.current = posicao
			agendar()
		}
	}

	const mover = (evento: PointerEventReact<SVGSVGElement>) => {
		if (!pinoDoGesto.current) return
		const posicao = lerPonto(evento)
		if (!posicao) return
		alvo.current = posicao
		agendar()
	}

	const encerrar = useCallback(() => {
		if (!pinoDoGesto.current) return
		pinoDoGesto.current = null
		alvo.current = null
		setPinoAtivo(null)
		if (quadro.current !== null) {
			window.cancelAnimationFrame(quadro.current)
			quadro.current = null
		}
		// O app recebe a cor FINAL (a da ref), mesmo que o último quadro não
		// tenha pintado nem atualizado o estado.
		pinoMestre.current?.removeAttribute('transform')
		aoArrastar(ultimaCor.current, raizDaPrevia())
		aoSoltar(ultimaCor.current)
		setSementeLocal(ultimaCor.current)
	}, [aoArrastar, aoSoltar, sementeLocal, raizDaPrevia])

	useEffect(() => {
		// Soltar fora do SVG (dedo saiu da tela): a captura de ponteiro cobre o
		// elemento, mas o encerramento real do gesto é na janela.
		window.addEventListener('pointerup', encerrar)
		window.addEventListener('pointercancel', encerrar)
		return () => {
			window.removeEventListener('pointerup', encerrar)
			window.removeEventListener('pointercancel', encerrar)
		}
	}, [encerrar])

	/* ---------------------------------------------------------------------
	 * Teclado: um círculo só de toque seria inacessível.
	 * ------------------------------------------------------------------- */

	const aoTeclar = (pino: Pino) => (evento: KeyboardEvent<SVGGElement>) => {
		const passo = evento.shiftKey ? 15 : 2
		const atual = pinos[pino]

		const girar = (delta: number): void => {
			const matiz = (atual.matiz + delta + 360) % 360
			if (pino === 'semente') {
				const hex = corDoPonto(tipo, matiz, atual.raio).hex
				setSementeLocal(hex)
				aoArrastar(hex, raizDaPrevia())
				return
			}
			let graus = matiz - hct.hue
			if (graus > 180) graus -= 360
			if (graus < -180) graus += 360
			aoArrastarFamilia(pino, graus)
		}

		if (evento.key === 'ArrowLeft') {
			evento.preventDefault()
			girar(-passo)
		} else if (evento.key === 'ArrowRight') {
			evento.preventDefault()
			girar(passo)
		} else if (evento.key === 'ArrowUp' || evento.key === 'ArrowDown') {
			// Para cima, mais perto da borda: mais cor (ou mais escuro, na neutra).
			evento.preventDefault()
			if (pino !== 'semente') return
			const delta = evento.key === 'ArrowUp' ? 0.04 : -0.04
			const raio = Math.min(Math.max(atual.raio + delta, 0), 1)
			const hex = corDoPonto(tipo, atual.matiz, raio).hex
			setSementeLocal(hex)
			aoArrastar(hex, raizDaPrevia())
		}
	}

	/* ---------------------------------------------------------------------
	 * Desenho
	 * ------------------------------------------------------------------- */

	const anel = (pino: Pino, principal: boolean): ReactElement => {
		const dado = pinos[pino]
		const { x, y } = pontoDe(dado.matiz, dado.raio)
		const raio = principal ? 15 : 10
		const rotulo =
			pino === 'semente' ? 'Cor principal' : pino === 'secundaria' ? 'Família secundária' : 'Família terciária'

		return (
			<g
				key={pino}
				ref={pino === 'semente' ? pinoMestre : undefined}
				role="slider"
				tabIndex={0}
				aria-label={rotulo}
				aria-valuemin={0}
				aria-valuemax={359}
				aria-valuenow={Math.round(dado.matiz)}
				aria-valuetext={`${Math.round(dado.matiz)} graus, ${Math.round(dado.raio * 100)}% de força`}
				className={`roda__pino${pinoAtivo === pino ? ' roda__pino--ativo' : ''}`}
				onPointerDown={comecar(pino)}
				onKeyDown={aoTeclar(pino)}
			>
				{/* Área de toque invisível maior que o desenho: 44 px de alvo. */}
				<circle cx={x} cy={y} r={TOQUE_DO_PINO} fill="transparent" />
				<circle cx={x} cy={y} r={raio + 7} fill={dado.cor} opacity={0.22} />
				<circle className="roda__pino-aro" cx={x} cy={y} r={raio} fill={dado.cor} />
				<circle className="roda__pino-centro" cx={x} cy={y} r={principal ? 4.5 : 3} />
			</g>
		)
	}

	return (
		<div className="roda">
			<div className={`roda__palco${pinoAtivo ? ' roda__palco--arrastando' : ''}`}>
				<Disco tipo={tipo} />
				<svg
					ref={disco}
					className="roda__disco"
					viewBox={`0 0 ${LADO} ${LADO}`}
					role="group"
					aria-label={`Roda ${perfil.rotulo.toLowerCase()}: arraste o pino para escolher a cor`}
					onPointerDown={comecar('semente')}
					onPointerMove={mover}
					onPointerUp={encerrar}
					onPointerCancel={encerrar}
				>

				{/* Linhas da formação: ligam a semente às derivadas durante o gesto. */}
				{!ehIntima(harmonia) && pinoAtivo !== null ? (
					<g className="roda__formacao" aria-hidden="true">
						{(['secundaria', 'terciaria'] as const).map((familia) => {
							const destino = pontoDe(pinos[familia].matiz, pinos[familia].raio)
							return (
								<line
									key={familia}
									x1={CENTRO}
									y1={CENTRO}
									x2={destino.x}
									y2={destino.y}
									stroke={pinos[familia].cor}
								/>
							)
						})}
					</g>
				) : null}

					{anel('secundaria', false)}
					{anel('terciaria', false)}
					{anel('semente', true)}
				</svg>
			</div>

			{/* Prévia: as três amostras saem da MESMA conta dos pinos. */}
			<div className="roda__previa" role="img" aria-label="Prévia das três famílias de cor">
				<span style={{ background: pinos.semente.cor }} />
				<span style={{ background: pinos.secundaria.cor }} />
				<span style={{ background: pinos.terciaria.cor }} />
			</div>
			<p className="roda__leitura" aria-hidden="true">
				<span>{Math.round(pinos.semente.matiz) % 360}°</span>
				<span>·</span>
				<span>{Math.round(pinos.semente.raio * (perfil.eixo === 'tom' ? 100 : perfil.cromaMax))}</span>
			</p>
		</div>
	)
}

/** Os tipos, para a tela de Ajustes montar os chips. */
export const TIPOS_DE_RODA = PERFIS.map((perfil) => ({
	valor: perfil.valor,
	rotulo: perfil.rotulo,
	descricao: perfil.descricao,
}))

export type { Pino }
