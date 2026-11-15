import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from '@/app/router'
import { IconeInsights } from '@/ui/icones'
import { BarraInferior } from '@/ui/BarraInferior'

interface AppShellProps {
	children: ReactNode
	/** Esconder a barra (telas que usam a área inteira, como a conversa). */
	semNavegacao?: boolean
	conteudoClassName?: string
}

export function AppShell({ children, semNavegacao, conteudoClassName }: AppShellProps) {
	const { route } = useRouter()

	const titulo = useMemo(() => {
		switch (route.name) {
			case 'inicio':
				return 'Urdume'
			case 'tarefas':
				return 'Tarefas — Urdume'
			case 'habitos':
				return 'Hábitos — Urdume'
			case 'habito':
				return 'Hábito — Urdume'
			case 'calendario':
				return 'Agenda — Urdume'
			case 'projetos':
				return 'Projetos — Urdume'
			case 'projeto':
				return 'Projeto — Urdume'
			case 'jarvis':
				return 'Jarvis — Urdume'
			case 'conversa':
				return 'Conversar — Urdume'
			case 'ajustes':
				return 'Ajustes — Urdume'
			case 'ajustes-aparencia':
				return 'Aparência — Urdume'
			case 'ajustes-acessibilidade':
				return 'Acessibilidade — Urdume'
			case 'ajustes-ia':
				return 'Inteligência — Urdume'
			case 'ajustes-dados':
				return 'Dados — Urdume'
			case 'ajustes-aparelho':
				return 'Aparelho — Urdume'
			case 'ajustes-sobre':
				return 'Sobre — Urdume'
			case 'ajustes-navegacao':
				return 'Navegação — Urdume'
			default:
				return 'Urdume'
		}
	}, [route])

	useEffect(() => {
		document.title = titulo
	}, [titulo])

	return (
		<div className="shell">
			<a className="pular-para-conteudo" href="#conteudo">
				Pular para o conteúdo
			</a>

			{/*
			  A altura REALMENTE visível.

			  `dvh` acompanha a barra do navegador, não o teclado: com o teclado
			  aberto no WebView do Android ele continua medindo a tela inteira, e
			  o rodapé de qualquer lista (Tarefas, Projetos, Hábitos, Agenda,
			  Páginas, Ajustes) fica atrás dele sem forma de rolar até o fim.

			  Aqui a medida é publicada uma vez para o app inteiro e o `.shell`
			  usa `--altura-visivel` quando ela existe. Só escreve enquanto o
			  teclado está aberto (`innerHeight - height > 120`), então em uso
			  normal o layout continua sendo `dvh` — nada muda onde já funcionava.
			*/}
			<AlturaVisivel />

			<main id="conteudo" className={['shell-main', conteudoClassName].filter(Boolean).join(' ')}>
				{children}
			</main>

			{semNavegacao ? null : <BarraInferior />}
		</div>
	)
}

/**
 * Publica `--altura-visivel` (e `--teclado-aberto`) no elemento raiz.
 *
 * Mede `visualViewport` — a única fonte que reflete o teclado no WebView do
 * Android — e só escreve quando o teclado está de fato aberto. Em uso normal
 * as variáveis somem e o CSS volta ao `100dvh`, que é equivalente.
 *
 * Usado por `AppShell`; a Conversa tem a própria versão porque lá a conta
 * também desconta a barra inferior.
 */
function AlturaVisivel() {
	useEffect(() => {
		const janela = window.visualViewport
		const raiz = document.documentElement
		if (!janela) return

		const aplicar = (): void => {
			// 120 px separa "barra de endereço recolhida" de "teclado aberto":
			// teclados de celular medem 240–360 px em retrato.
			const tecladoAberto = window.innerHeight - janela.height > 120
			if (tecladoAberto) {
				raiz.style.setProperty('--altura-visivel', `${Math.round(janela.height)}px`)
				raiz.setAttribute('data-teclado', 'aberto')
			} else {
				raiz.style.removeProperty('--altura-visivel')
				raiz.removeAttribute('data-teclado')
			}
		}

		aplicar()
		janela.addEventListener('resize', aplicar)
		janela.addEventListener('scroll', aplicar)
		return () => {
			janela.removeEventListener('resize', aplicar)
			janela.removeEventListener('scroll', aplicar)
			raiz.style.removeProperty('--altura-visivel')
			raiz.removeAttribute('data-teclado')
		}
	}, [])

	return null
}

/** Atalho para o cabeçalho de tela, com o mesmo padrão em todas as telas. */
export function Topo({
	titulo,
	sobre,
	acoes,
	antes,
	marca,
}: {
	titulo: string
	sobre?: string
	acoes?: ReactNode
	antes?: ReactNode
	/** Marca acima do título (só no Início, onde o app diz o próprio nome). */
	marca?: ReactNode
}) {
	const referencia = useRef<HTMLElement | null>(null)

	/**
	 * Publica a altura real do cabeçalho em `--topo-h`.
	 *
	 * A ilha do Jarvis é um overlay posicionado logo abaixo do cabeçalho, para
	 * não cobrir o título. Cravar um número (64 px) erraria no Início, que tem
	 * a marca acima do título, e com texto grande em Acessibilidade. Medir é o
	 * que mantém os dois casos certos.
	 *
	 * `ResizeObserver` e não `scroll`: a altura muda quando a fonte muda ou a
	 * tela troca, não quando a página rola.
	 */
	useEffect(() => {
		const elemento = referencia.current
		if (!elemento) return

		const raiz = document.documentElement
		const medir = (): void => {
			raiz.style.setProperty('--topo-h', `${Math.ceil(elemento.getBoundingClientRect().height)}px`)
		}

		medir()
		const observador = new ResizeObserver(medir)
		observador.observe(elemento)
		return () => {
			observador.disconnect()
			raiz.style.removeProperty('--topo-h')
		}
	}, [])

	return (
		<header ref={referencia} className={marca ? 'topo topo--com-marca' : 'topo'}>
			{antes}
			{marca ? <div className="topo__marca">{marca}</div> : null}
			<div className="topo__linha">
				<div className="topo__texto">
					<h1 className="topo__titulo">{titulo}</h1>
					{sobre ? <p className="topo__sobre">{sobre}</p> : null}
				</div>
				{acoes ? <div className="topo__acoes">{acoes}</div> : null}
			</div>
		</header>
	)
}

export { IconeInsights }