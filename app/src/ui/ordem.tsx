import { useMemo, useState } from 'react'
import type { Task } from '@/db/db'
import { IconeFiltrar, IconeOrdenar, IconeFechar, IconeEtiqueta, IconePasta } from '@/ui/icones'

export type Ordem = 'manual' | 'hora' | 'prioridade' | 'prazo' | 'alfabetica'

const NOMES_ORDEM: Record<Ordem, string> = {
	manual: 'Manual',
	hora: 'Hora',
	prioridade: 'Prioridade',
	prazo: 'Prazo',
	alfabetica: 'A–Z',
}

/** Aplica a ordem escolhida sobre uma lista de tarefas. */
export function ordenar(tarefas: Task[], ordem: Ordem): Task[] {
	const copia = [...tarefas]
	switch (ordem) {
		case 'hora':
			// Sem hora vai para o fim, mantendo a ordem manual entre elas.
			return copia.sort((a, b) => (a.startMin ?? 99999) - (b.startMin ?? 99999) || a.order - b.order)
		case 'prioridade':
			return copia.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.order - b.order)
		case 'prazo':
			return copia.sort(
				(a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.order - b.order,
			)
		case 'alfabetica':
			return copia.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
		default:
			return copia.sort((a, b) => a.order - b.order)
	}
}

export interface Filtro {
	etiqueta: string | null
	projetoId: string | null
	soAtrasadas: boolean
}

export const FILTRO_VAZIO: Filtro = { etiqueta: null, projetoId: null, soAtrasadas: false }

export function temFiltroAtivo(f: Filtro): boolean {
	return Boolean(f.etiqueta || f.projetoId || f.soAtrasadas)
}

/** Aplica o filtro; a contagem é feita para mostrar quantos saíram. */
export function filtrar(tarefas: Task[], filtro: Filtro, hoje: string): Task[] {
	return tarefas.filter((t) => {
		if (filtro.etiqueta && !(t.tags ?? []).includes(filtro.etiqueta)) return false
		if (filtro.projetoId && t.projectId !== filtro.projetoId) return false
		if (filtro.soAtrasadas && !(t.dueDate && t.dueDate < hoje && !t.done)) return false
		return true
	})
}

/**
 * Barra de ordem e filtro.
 *
 * Dois chips que abrem um painel curto: a lista de ordens e os filtros. Fica em
 * linha com o cabeçalho porque é ajuste, não conteúdo — e sem ocupar uma seção
 * inteira quando está fechada.
 */
export function BarraDeOrdem({
	ordem,
	onOrdem,
	filtro,
	onFiltro,
	etiquetas,
	projetos,
}: {
	ordem: Ordem
	onOrdem: (ordem: Ordem) => void
	filtro: Filtro
	onFiltro: (filtro: Filtro) => void
	etiquetas: string[]
	projetos: { id: string; name: string }[]
}) {
	const [painel, setPainel] = useState<'ordem' | 'filtro' | null>(null)
	const ativos = useMemo(() => {
		let total = 0
		if (filtro.etiqueta) total++
		if (filtro.projetoId) total++
		if (filtro.soAtrasadas) total++
		return total
	}, [filtro])

	return (
		<div style={{ marginBottom: 'var(--s-2)' }}>
			<div className="barra-ordem">
				<button
					type="button"
					className="chip chip--pequeno"
					aria-expanded={painel === 'ordem'}
					onClick={() => setPainel((atual) => (atual === 'ordem' ? null : 'ordem'))}
				>
					<IconeOrdenar size={16} />
					{NOMES_ORDEM[ordem]}
				</button>

				<button
					type="button"
					className={ativos > 0 ? 'chip chip--pequeno chip--ativo' : 'chip chip--pequeno'}
					aria-expanded={painel === 'filtro'}
					onClick={() => setPainel((atual) => (atual === 'filtro' ? null : 'filtro'))}
				>
					<IconeFiltrar size={16} />
					{ativos > 0 ? `${ativos} filtro(s)` : 'Filtrar'}
				</button>

				{ativos > 0 ? (
					<button
						type="button"
						className="chip chip--pequeno"
						onClick={() => {
							onFiltro(FILTRO_VAZIO)
							setPainel(null)
						}}
					>
						<IconeFechar size={16} />
						Limpar
					</button>
				) : null}
			</div>

			{painel === 'ordem' ? (
				<div className="linha-grupo" style={{ margin: '0 var(--s-4)', padding: 'var(--s-2)' }}>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
						{(Object.keys(NOMES_ORDEM) as Ordem[]).map((valor) => (
							<button
								key={valor}
								type="button"
								className="chip chip--pequeno"
								aria-pressed={ordem === valor}
								onClick={() => {
									onOrdem(valor)
									setPainel(null)
								}}
							>
								{NOMES_ORDEM[valor]}
							</button>
						))}
					</div>
				</div>
			) : null}

			{painel === 'filtro' ? (
				<div className="linha-grupo" style={{ margin: '0 var(--s-4)', padding: 'var(--s-3)' }}>
					<p className="campo-rotulo">Situação</p>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
						<button
							type="button"
							className="chip chip--pequeno"
							aria-pressed={filtro.soAtrasadas}
							onClick={() => onFiltro({ ...filtro, soAtrasadas: !filtro.soAtrasadas })}
						>
							Só atrasadas
						</button>
					</div>

					{projetos.length > 0 ? (
						<>
							<p className="campo-rotulo">Lista</p>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
								{projetos.map((projeto) => (
									<button
										key={projeto.id}
										type="button"
										className="chip chip--pequeno"
										aria-pressed={filtro.projetoId === projeto.id}
										onClick={() =>
											onFiltro({
												...filtro,
												projetoId: filtro.projetoId === projeto.id ? null : projeto.id,
											})
										}
									>
										<IconePasta size={14} />
										{projeto.name}
									</button>
								))}
							</div>
						</>
					) : null}

					{etiquetas.length > 0 ? (
						<>
							<p className="campo-rotulo">Etiqueta</p>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
								{etiquetas.map((etiqueta) => (
									<button
										key={etiqueta}
										type="button"
										className="chip chip--pequeno"
										aria-pressed={filtro.etiqueta === etiqueta}
										onClick={() =>
											onFiltro({
												...filtro,
												etiqueta: filtro.etiqueta === etiqueta ? null : etiqueta,
											})
										}
									>
										<IconeEtiqueta size={14} />
										{etiqueta}
									</button>
								))}
							</div>
						</>
					) : null}
				</div>
			) : null}
		</div>
	)
}
