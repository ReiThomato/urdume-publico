import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@/app/router'
import { buscar, normalizar } from '@/db/repo'
import type { ResultadoBusca } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import {
	IconeBuscar,
	IconeCalendario,
	IconeConcluido,
	IconeHorario,
	IconePasta,
} from '@/ui/icones'

const ICONES = {
	tarefa: IconeConcluido,
	projeto: IconePasta,
	lembrete: IconeHorario,
	evento: IconeCalendario,
} as const

const ROTULOS = {
	tarefa: 'Tarefas',
	projeto: 'Listas',
	lembrete: 'Lembretes',
	evento: 'Eventos',
} as const

const ORDEM: Array<ResultadoBusca['tipo']> = ['tarefa', 'evento', 'projeto', 'lembrete']

export interface BuscaProps {
	aberta: boolean
	onFechar: () => void
}

/**
 * Busca do topo do Início.
 *
 * Procura em tarefas, subtarefas, listas, páginas (inclusive dentro do desenho)
 * e lembretes, ignorando acentos e maiúsculas. Resultado agrupado por tipo;
 * tocar abre o item.
 */
export function Busca({ aberta, onFechar }: BuscaProps) {
	const { navigate } = useRouter()
	const [consulta, setConsulta] = useState('')
	const [resultados, setResultados] = useState<ResultadoBusca[]>([])
	const [procurando, setProcurando] = useState(false)

	useEffect(() => {
		if (!aberta) {
			setConsulta('')
			setResultados([])
		}
	}, [aberta])

	useEffect(() => {
		if (!aberta) return
		const termo = normalizar(consulta.trim())

		if (termo.length < 2) {
			setResultados([])
			setProcurando(false)
			return
		}

		setProcurando(true)
		let ativo = true
		// Debounce curto: o suficiente para não consultar a cada tecla, curto o
		// bastante para o resultado parecer imediato.
		const timer = window.setTimeout(() => {
			void buscar(consulta).then((lista) => {
				if (ativo) {
					setResultados(lista)
					setProcurando(false)
				}
			})
		}, 120)

		return () => {
			ativo = false
			window.clearTimeout(timer)
		}
	}, [consulta, aberta])

	const grupos = useMemo(() => {
		const mapa = new Map<ResultadoBusca['tipo'], ResultadoBusca[]>()
		for (const item of resultados) {
			const lista = mapa.get(item.tipo) ?? []
			lista.push(item)
			mapa.set(item.tipo, lista)
		}
		return ORDEM.filter((tipo) => mapa.has(tipo)).map((tipo) => ({ tipo, itens: mapa.get(tipo)! }))
	}, [resultados])

	function abrir(item: ResultadoBusca): void {
		onFechar()
		switch (item.tipo) {
			case 'tarefa':
				navigate(item.dia ? { name: 'calendario', day: item.dia } : { name: 'tarefas' })
				break
			case 'projeto':
				navigate({ name: 'projeto', id: item.id })
				break
			case 'evento':
				navigate(item.dia ? { name: 'calendario', day: item.dia } : { name: 'calendario' })
				break
			case 'lembrete':
				navigate({ name: 'inicio' })
				break
		}
	}

	return (
		<Folha titulo="Buscar" sobre="Tarefas, listas, páginas e lembretes" aberta={aberta} onFechar={onFechar}>
			<div className="busca__campo">
				<span className="botao-icone" aria-hidden="true" style={{ pointerEvents: 'none' }}>
					<IconeBuscar size={22} />
				</span>
				<input
					className="campo"
					data-foco-inicial
					type="search"
					inputMode="search"
					value={consulta}
					onChange={(evento) => setConsulta(evento.target.value)}
					placeholder="O que você procura?"
					aria-label="Buscar"
					autoComplete="off"
					enterKeyHint="search"
				/>
			</div>

			{consulta.trim().length < 2 ? (
				<p className="nota" style={{ padding: 'var(--s-2) var(--s-5) var(--s-6)' }}>
					Digite pelo menos duas letras. A busca ignora acentos e maiúsculas e também encontra
					texto dentro dos desenhos.
				</p>
			) : procurando && grupos.length === 0 ? (
				<p className="nota" style={{ padding: 'var(--s-2) var(--s-5) var(--s-6)' }}>
					Procurando…
				</p>
			) : grupos.length === 0 ? (
				<p className="nota" style={{ padding: 'var(--s-2) var(--s-5) var(--s-6)' }}>
					Nada encontrado para “{consulta.trim()}”.
				</p>
			) : (
				grupos.map((grupo) => {
					const Icone = ICONES[grupo.tipo]
					return (
						<div key={grupo.tipo} className="busca__grupo">
							<p className="busca__grupo-titulo">{ROTULOS[grupo.tipo]}</p>
							<div className="linha-grupo">
								{grupo.itens.map((item) => (
									<button
										key={`${item.tipo}:${item.id}`}
										type="button"
										className="busca__resultado"
										onClick={() => abrir(item)}
									>
										<span className="linha__icone" aria-hidden="true">
											<Icone size={20} />
										</span>
										<span className="linha__corpo">
											<span className="busca__resultado-titulo">{item.titulo}</span>
											{item.detalhe ? (
												<span className="busca__resultado-detalhe">{item.detalhe}</span>
											) : null}
										</span>
									</button>
								))}
							</div>
						</div>
					)
				})
			)}
		</Folha>
	)
}
