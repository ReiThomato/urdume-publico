import { useEffect, useMemo } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Link, useRouter } from '@/app/router'
import type { Route } from '@/app/router'
import {
	IconeAjustes,
	IconeCalendario,
	IconeFogo,
	IconeInsights,
	IconePainel,
	IconePasta,
	IconeTarefaFeita,
} from '@/ui/icones'

interface Destino {
	rotulo: string
	rota: Route
	icone: ComponentType<{ size?: number | string }>
	correspondencia: (rota: Route) => boolean
}

/**
 * Navegação principal — cinco destinos, como no Grit: o trabalho (Hoje),
 * as tarefas por lista, os hábitos, a agenda e os ajustes.
 *
 * A barra é sólida e encosta no rodapé. O botão de criar é um FAB de verdade
 * dentro da tela, não um destino da barra: criar não é um lugar.
 */
const destinos: Destino[] = [
	{
		rotulo: 'Hoje',
		rota: { name: 'inicio' },
		icone: IconePainel,
		correspondencia: (rota) => rota.name === 'inicio',
	},
	{
		rotulo: 'Tarefas',
		rota: { name: 'tarefas' },
		icone: IconeTarefaFeita,
		correspondencia: (rota) => rota.name === 'tarefas',
	},
	{
		rotulo: 'Projetos',
		rota: { name: 'projetos' },
		icone: IconePasta,
		correspondencia: (rota) => rota.name === 'projetos' || rota.name === 'projeto',
	},
	{
		rotulo: 'Hábitos',
		rota: { name: 'habitos' },
		icone: IconeFogo,
		correspondencia: (rota) => rota.name === 'habitos' || rota.name === 'habito',
	},
	{
		rotulo: 'Agenda',
		rota: { name: 'calendario' },
		icone: IconeCalendario,
		correspondencia: (rota) => rota.name === 'calendario',
	},
	{
		rotulo: 'Ajustes',
		rota: { name: 'ajustes' },
		icone: IconeAjustes,
		correspondencia: (rota) => rota.name === 'ajustes',
	},
]

function ItemDestino({ destino, ativo }: { destino: Destino; ativo: boolean }) {
	const Icone = destino.icone
	return (
		<Link
			route={destino.rota}
			className="destino"
			ariaLabel={destino.rotulo}
			ariaCurrent={ativo ? 'page' : undefined}
			title={destino.rotulo}
		>
			<span className="destino__icone" aria-hidden="true">
				<Icone size={24} />
			</span>
			<span className="destino__rotulo" aria-hidden="true">
				{destino.rotulo}
			</span>
		</Link>
	)
}

export interface AppShellProps {
	children: ReactNode
	/** Esconder a barra (tela de quadro, que usa a tela inteira). */
	semNavegacao?: boolean
	conteudoClassName?: string
}

export function AppShell({ children, semNavegacao, conteudoClassName }: AppShellProps) {
	const { route } = useRouter()

	const titulo = useMemo(() => {
		switch (route.name) {
			case 'inicio':
				return 'Urdume Público'
			case 'tarefas':
				return 'Tarefas — Urdume Público'
			case 'habitos':
				return 'Hábitos — Urdume Público'
			case 'habito':
				return 'Hábito — Urdume Público'
			case 'calendario':
				return 'Agenda — Urdume Público'
			case 'projetos':
				return 'Projetos — Urdume Público'
			case 'projeto':
				return 'Projeto — Urdume Público'
			case 'jarvis':
				return 'Jarvis — Urdume Público'
			case 'conversa':
				return 'Conversar — Urdume Público'
			case 'ajustes':
				return 'Ajustes — Urdume Público'
			default:
				return 'Urdume Público'
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

			<main id="conteudo" className={['shell-main', conteudoClassName].filter(Boolean).join(' ')}>
				{children}
			</main>

			{semNavegacao ? null : (
				<nav className="navegacao" aria-label="Navegação principal">
					<div className="destinos" data-ativo={destinos.findIndex((d) => d.correspondencia(route))}>
						<span className="destinos__indicador" aria-hidden="true" />
						{destinos.map((destino) => (
							<ItemDestino
								key={destino.rotulo}
								destino={destino}
								ativo={destino.correspondencia(route)}
							/>
						))}
					</div>
				</nav>
			)}
		</div>
	)
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
	return (
		<header className={marca ? 'topo topo--com-marca' : 'topo'}>
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