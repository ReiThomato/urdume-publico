import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { IconeFechar } from '@/ui/icones'

/**
 * Quantas folhas estão abertas agora.
 *
 * `--folha-altura` é escrita em `document.documentElement`, que é um só para o
 * app inteiro. Duas folhas abertas ao mesmo tempo acontecem (Tarefas: "Nova
 * lista" + confirmação de exclusão; Agenda: menu de criação + edição), e antes
 * cada `useEffect` escrevia o valor e cada limpeza o APAGAVA — inclusive a da
 * folha que fechava com outra ainda aberta. A que sobrava caía no fallback e
 * voltava a esconder o rodapé atrás do teclado.
 *
 * Com o contador, só a ÚLTIMA folha a fechar limpa a propriedade. O valor em si
 * é o mesmo para todas (vem de `visualViewport`), então não há corrida.
 */
let folhasAbertas = 0

/**
 * Fechar a folha mais recente ao apertar "voltar" no Android.
 *
 * Antes, o botão nativo navegava a tela por baixo (ou saía do app) com a folha
 * ainda aberta: o usuário era obrigado a acertar o X ou arrastar a alça, e o
 * arrasto só funcionava no cabeçalho. O `Shell` registra um listener de
 * `backButton`; ele chama esta função primeiro e só navega se ninguém fechar.
 *
 * Uma pilha de fechadores, e não um booleano: há folhas sobrepostas (a folha
 * de criação e a confirmação de exclusão). O voltar fecha a de cima.
 */
const fechadores: Array<() => void> = []

/** Registra o fechamento de uma folha. Devolve a função de desregistro. */
export function registrarFechadorDeFolha(fechar: () => void): () => void {
	fechadores.push(fechar)
	return () => {
		const indice = fechadores.lastIndexOf(fechar)
		if (indice >= 0) fechadores.splice(indice, 1)
	}
}

/** Fecha a folha mais recente. Devolve `true` se havia alguma aberta. */
export function fecharFolhaDoTopo(): boolean {
	const fechar = fechadores[fechadores.length - 1]
	if (!fechar) return false
	fechar()
	return true
}

interface FolhaProps {
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


	useEffect(() => {
		if (!aberta) return

		anteriorRef.current = document.activeElement as HTMLElement | null
		const painel = painelRef.current

		/**
		 * Teclado do Android.
		 *
		 * O WebView não encolhe o layout quando o teclado abre: `100dvh`
		 * continua medindo a tela inteira, então a folha ficava com o rodapé
		 * (Salvar, Excluir) escondido atrás do teclado — e como o `body` está
		 * com `overflow: hidden`, não havia como rolar até ele. Eram os botões
		 * "que não existem" em Editar hábito e em outros formulários longos.
		 *
		 * `visualViewport` é a única medida do que está realmente visível. A
		 * diferença vira uma faixa reservada no fundo da folha, para ela subir
		 * acima do teclado em vez de ficar por baixo dele.
		 */
		const janela = window.visualViewport
		const raiz = document.documentElement
		const ajustarAltura = (): void => {
			if (!janela) {
				raiz.style.removeProperty('--folha-altura')
				raiz.style.removeProperty('--folha-teclado')
				return
			}
			/*
			 * Duas medidas, e a segunda é a que faltava.
			 *
			 * `--folha-altura` limita a ALTURA da folha à área visível — mas a
			 * folha é alinhada ao rodapé da tela (`align-items: flex-end`), e o
			 * rodapé da tela fica ATRÁS do teclado. Com o teclado aberto, o
			 * conteúdo era cortado em cima e os botões "Voltar/Criar" ficavam
			 * escondidos embaixo: a altura estava certa, a posição não.
			 *
			 * `--folha-teclado` é o deslocamento que o fundo recebe para a folha
			 * subir acima do teclado. É a diferença entre a janela e a área
			 * visível — a mesma conta que os teclados de celular medem.
			 */
			const teclado = Math.max(0, window.innerHeight - janela.height)
			raiz.style.setProperty('--folha-altura', `${Math.round(janela.height)}px`)
			raiz.style.setProperty('--folha-teclado', `${Math.round(teclado)}px`)
		}

		ajustarAltura()
		folhasAbertas += 1
		janela?.addEventListener('resize', ajustarAltura)
		janela?.addEventListener('scroll', ajustarAltura)

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
			// Foco no PAINEL, não no primeiro botão.
			//
			// Folhas sem campo (o "Ver" do Jarvis, confirmações) recebiam foco
			// no primeiro botão. Efeito: o botão nascia com o anel de
			// `:focus-visible` — um contorno escuro de 2 px que parecia defeito
			// de borda, porque ninguém tinha tocado nele. O painel com
			// `tabIndex={-1}` recebe o foco e o Tab continua entrando no
			// primeiro elemento, sem desenhar anel em ação nenhuma.
			else painel?.focus()
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
		// Voltar do Android fecha esta folha em vez de navegar por trás dela.
		const desregistrar = registrarFechadorDeFolha(() => fecharRef.current())
		const overflowAnterior = document.body.style.overflow
		document.body.style.overflow = 'hidden'

		return () => {
			cancelado = true
			desregistrar()
			document.removeEventListener('keydown', aoTeclar)
			document.body.style.overflow = overflowAnterior
			janela?.removeEventListener('resize', ajustarAltura)
			janela?.removeEventListener('scroll', ajustarAltura)
			// Só a última folha a fechar apaga a medida: com outra aberta, apagar
			// fazia o rodapé dela voltar para trás do teclado.
			folhasAbertas = Math.max(0, folhasAbertas - 1)
			if (folhasAbertas === 0) {
				raiz.style.removeProperty('--folha-altura')
				raiz.style.removeProperty('--folha-teclado')
			}
			anteriorRef.current?.focus?.()
		}

	}, [aberta, passo])

	/**
	 * Arrastar para baixo fecha a folha — de QUALQUER ponto dela.
	 *
	 * POR QUE TOUCH EVENTS, E NÃO POINTER EVENTS: o painel tem
	 * `touch-action: pan-y` (necessário para a rolagem interna funcionar no
	 * WebView). Com isso o navegador trata o gesto vertical como ROLAGEM e
	 * cancela os `pointermove` no meio do caminho — testar no aparelho mostrou
	 * o arrasto nunca completando. Eventos de toque não são cancelados pelo
	 * `touch-action`, então o gesto vive neles.
	 *
	 * AS TRÊS REGRAS, cada uma por um defeito concreto:
	 *
	 * 1. **Toque não é arrasto.** Só começa depois de 12 px de movimento e se
	 *    ele for mais vertical que horizontal. Tocar numa opção continua
	 *    tocando.
	 * 2. **Não rouba a rolagem.** Se o dedo começa numa área que ainda pode
	 *    rolar (`scrollTop > 0`), o gesto é rolagem. Sem isso, rolar uma lista
	 *    longa fecharia a folha.
	 * 3. **Só para baixo.** Puxar para cima não estica a folha.
	 */
	useEffect(() => {
		if (!aberta) return
		const painel = painelRef.current
		if (!painel) return

		const LIMIAR = 12
		let inicioY = 0
		let inicioX = 0
		let podeArrastar = false
		let arrastando = false
		let deslocamento = 0

		/** Algum ancestral rolável e fora do topo? Então o gesto é rolagem. */
		const podeArrastarDe = (alvo: EventTarget | null): boolean => {
			let no = alvo as HTMLElement | null
			while (no && no !== painel) {
				const estilo = window.getComputedStyle(no)
				if (/(auto|scroll)/.test(estilo.overflowY) && no.scrollTop > 0) return false
				/*
				 * `touch-action: none` marca um gesto CAPTURADO por outro
				 * componente (a roda de cores, os sliders): o dedo dele não é
				 * "puxar a folha para baixo".
				 *
				 * Sem esta linha, arrastar a cor no disco já começava a fechar a
				 * folha — o defeito relatado como "confunde o toque com o
				 * deslizar e tenta fechar a aba". O sintoma era pior na roda:
				 * o gesto de escolher a cor e o de fechar eram o mesmo.
				 */
				if (estilo.touchAction === 'none') return false
				no = no.parentElement
			}
			return true
		}

		const aoComecar = (evento: TouchEvent): void => {
			if (evento.touches.length !== 1) return
			const toque = evento.touches[0]!
			inicioY = toque.clientY
			inicioX = toque.clientX
			deslocamento = 0
			arrastando = false
			podeArrastar = podeArrastarDe(evento.target)
		}

		const aoMover = (evento: TouchEvent): void => {
			if (evento.touches.length !== 1) return
			const toque = evento.touches[0]!
			const dy = toque.clientY - inicioY
			const dx = toque.clientX - inicioX

			if (!arrastando) {
				if (Math.abs(dy) < LIMIAR && Math.abs(dx) < LIMIAR) return
				const vertical = Math.abs(dy) > Math.abs(dx) * 1.2
				if (dy <= 0 || !vertical || !podeArrastar) {
					podeArrastar = false
					return
				}
				arrastando = true
			}

			deslocamento = Math.max(0, dy)
			painel.style.transform = `translateY(${deslocamento}px)`
			painel.style.opacity = String(Math.max(0.55, 1 - deslocamento / 480))
			// O gesto é nosso: impede que a rolagem do conteúdo aconteça junto.
			evento.preventDefault()
		}

		const aoTerminar = (): void => {
			if (!arrastando) return
			arrastando = false
			painel.style.transition = 'transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms linear'
			const limite = Math.min(120, painel.getBoundingClientRect().height * 0.22)

			if (deslocamento > limite) {
				painel.style.transform = 'translateY(100%)'
				painel.style.opacity = '0'
				window.setTimeout(() => {
					fecharRef.current()
					painel.style.transform = ''
					painel.style.opacity = ''
					painel.style.transition = ''
				}, 150)
				return
			}

			painel.style.transform = ''
			painel.style.opacity = ''
			window.setTimeout(() => {
				painel.style.transition = ''
			}, 170)
		}

		// `passive: false` no move: só assim o `preventDefault` vale quando o
		// gesto vira arrasto.
		painel.addEventListener('touchstart', aoComecar, { passive: true })
		painel.addEventListener('touchmove', aoMover, { passive: false })
		painel.addEventListener('touchend', aoTerminar)
		painel.addEventListener('touchcancel', aoTerminar)

		return () => {
			painel.removeEventListener('touchstart', aoComecar)
			painel.removeEventListener('touchmove', aoMover)
			painel.removeEventListener('touchend', aoTerminar)
			painel.removeEventListener('touchcancel', aoTerminar)
		}
	}, [aberta])

	if (!aberta) return null

	return (
		<div className="folha-fundo" onClick={onFechar} role="presentation">
			<div
				className="folha"
				role="dialog"
				aria-modal="true"
				aria-label={titulo}
				ref={painelRef}
				/* Recebe o foco quando a folha não tem campo: sem isso o foco cai
				   no <body> e o Tab começa do topo da página, atrás do modal. */
				tabIndex={-1}
				onClick={(evento) => evento.stopPropagation()}
			>
				{/* Alça de arrasto: área de toque generosa (toda a faixa do
				    cabeçalho), teclado e leitor de tela continuam com o botão
				    Fechar ao lado. */}
				<div className="folha__alca" role="presentation">
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

				<div className="folha__corpo" data-passo={passo === undefined ? undefined : String(passo)}>
					{children}
				</div>
				{rodape ? <div className="folha__rodape">{rodape}</div> : null}
			</div>
		</div>
	)
}
