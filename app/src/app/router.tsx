import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

export type Route =
	| { name: 'inicio' }
	| { name: 'tarefas'; lista?: string }
	| { name: 'habitos' }
	| { name: 'habito'; id: string }
	| { name: 'calendario'; day?: string }
	| { name: 'projetos' }
	| { name: 'projeto'; id: string }
	| { name: 'jarvis' }
	| { name: 'conversa'; semente?: string }
	| { name: 'ajustes' }
	| { name: 'nao-encontrada'; path: string }

function decode(value: string): string {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

/**
 * Leitor de rota. Aceita caminhos limpos (`/paginas`) e também o fallback em hash
 * (`/#/paginas`), útil quando o app é aberto de uma pasta estática sem reescrita.
 */
export function parseRoute(rawPath: string, rawSearch = ''): Route {
	const hashIndex = rawPath.indexOf('#')
	let path = rawPath
	let search = rawSearch

	if (hashIndex >= 0) {
		const hash = rawPath.slice(hashIndex + 1)
		path = hash.startsWith('/') ? hash : `/${hash}`
		search = ''
	}

	const [pathname = '/', inlineSearch = ''] = path.split('?')
	const query = new URLSearchParams(inlineSearch || search)

	const segments = pathname
		.replace(/\/index\.html$/, '/')
		.split('/')
		.filter(Boolean)
		.map(decode)

	const [first, second] = segments

	switch (first) {
		case undefined:
			return { name: 'inicio' }
		case 'inicio':
		case 'hoje':
			return { name: 'inicio' }
		case 'tarefas':
			return second ? { name: 'tarefas', lista: second } : { name: 'tarefas' }
		case 'habitos':
			return second ? { name: 'habito', id: second } : { name: 'habitos' }
		case 'calendario': {
			const day = second ?? query.get('dia') ?? undefined
			return day ? { name: 'calendario', day } : { name: 'calendario' }
		}
		case 'projetos':
			return { name: 'projetos' }
		case 'projeto':
			return second ? { name: 'projeto', id: second } : { name: 'projetos' }
		case 'jarvis':
			return { name: 'jarvis' }
		case 'conversa':
			return { name: 'conversa', semente: query.get('pedido') ?? undefined }
		case 'ajustes':
		case 'configuracao':
			return { name: 'ajustes' }
		default:
			return { name: 'nao-encontrada', path: pathname }
	}
}

export function routeToPath(route: Route): string {
	switch (route.name) {
		case 'inicio':
			return '/'
		case 'tarefas':
			return route.lista ? `/tarefas/${encodeURIComponent(route.lista)}` : '/tarefas'
		case 'habitos':
			return '/habitos'
		case 'habito':
			return `/habitos/${encodeURIComponent(route.id)}`
		case 'calendario':
			return route.day ? `/calendario/${route.day}` : '/calendario'
		case 'projetos':
			return '/projetos'
		case 'projeto':
			return `/projeto/${encodeURIComponent(route.id)}`
		case 'jarvis':
			return '/jarvis'
		case 'conversa':
			return route.semente
				? `/conversa?pedido=${encodeURIComponent(route.semente)}`
				: '/conversa'
		case 'ajustes':
			return '/ajustes'
		default:
			return '/'
	}
}

/** Rota ativa no documento. Compartilhada pelo provider e pelo teste unitário. */
export function readLocation(): Route {
	const { pathname, search, hash } = window.location
	return hash ? parseRoute(`/${hash.replace(/^#\/?/, '')}`, '') : parseRoute(pathname, search)
}

interface RouterContextValue {
	route: Route
	navigate: (route: Route, options?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
	const [route, setRoute] = useState<Route>(() => readLocation())

	useEffect(() => {
		const sync = (): void => setRoute(readLocation())
		window.addEventListener('popstate', sync)
		window.addEventListener('hashchange', sync)
		return () => {
			window.removeEventListener('popstate', sync)
			window.removeEventListener('hashchange', sync)
		}
	}, [])

	const navigate = useCallback((next: Route, options?: { replace?: boolean }) => {
		const target = routeToPath(next)
		const current = `${window.location.pathname}${window.location.search}`

		if (target !== current) {
			// Marca a profundidade na pilha: o botão voltar do Android usa esse
			// número para decidir entre voltar uma tela e fechar o app.
			const profundidade = (window.history.state?.nexo ?? 0) + 1
			window.history[options?.replace ? 'replaceState' : 'pushState']({ nexo: profundidade }, '', target)
			window.scrollTo({ top: 0 })
		}

		setRoute(next)
	}, [])

	const value = useMemo(() => ({ route, navigate }), [route, navigate])

	return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterContextValue {
	const context = useContext(RouterContext)
	if (!context) throw new Error('useRouter precisa estar dentro de <RouterProvider>.')
	return context
}

export interface LinkProps {
	route: Route
	children: ReactNode
	className?: string
	ariaLabel?: string
	title?: string
	ariaCurrent?: 'page' | 'step' | 'location' | 'date' | 'time' | 'true'
	onClick?: () => void
}

/** Link acessível: mantém o href real e delega a navegação ao roteador. */
export function Link({ route, children, className, ariaLabel, title, ariaCurrent, onClick }: LinkProps) {
	const { navigate } = useRouter()
	const href = routeToPath(route)

	const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
		if (event.defaultPrevented) return
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return

		event.preventDefault()
		onClick?.()
		navigate(route)
	}

	return (
		<a
			href={href}
			className={className}
			aria-label={ariaLabel}
			aria-current={ariaCurrent}
			title={title}
			onClick={handleClick}
		>
			{children}
		</a>
	)
}
