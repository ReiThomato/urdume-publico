import { IconeFogo, IconeInsights } from '@/ui/icones'
import { useHabitosCalculados, useResumoHabitos } from '@/db/habitos'
import { useProgresso } from '@/db/progresso'

/**
 * Blocos de progresso.
 *
 * Números vêm dos dados que já existem: `doneAt` das tarefas e os registros
 * diários dos hábitos. Sem gráfico decorativo — cada barra é um dia com
 * conclusão de verdade.
 */
export function BlocoProgresso() {
	const progresso = useProgresso()

	if (!progresso) {
		return (
			<div className="cartao esqueleto" aria-hidden="true">
				<div className="esqueleto__linha">
					<span className="esqueleto__titulo" />
					<span className="esqueleto__meta" />
				</div>
			</div>
		)
	}

	const maior = Math.max(1, ...progresso.porDia.map((d) => d.total))

	return (
		<div className="cartao progresso">
			<div className="progresso__numeros">
				<div className="progresso__numero">
					<span className="progresso__valor tabular">{progresso.concluidasHoje}</span>
					<span className="progresso__rotulo">hoje</span>
				</div>
				<div className="progresso__numero">
					<span className="progresso__valor tabular">{progresso.concluidasSemana}</span>
					<span className="progresso__rotulo">na semana</span>
				</div>
				<div className="progresso__numero">
					<span className="progresso__valor tabular">{progresso.abertas}</span>
					<span className="progresso__rotulo">abertas</span>
				</div>
				<div className="progresso__numero">
					<span
						className={
							progresso.atrasadas
								? 'progresso__valor progresso__valor--alerta tabular'
								: 'progresso__valor tabular'
						}
					>
						{progresso.atrasadas}
					</span>
					<span className="progresso__rotulo">atrasadas</span>
				</div>
			</div>

			<div className="progresso__barras" role="img" aria-label="Tarefas concluídas nos últimos 7 dias">
				{progresso.porDia.map((dia, indice) => (
					<div key={dia.dia} className="progresso__barra-area">
						<div
							className={dia.total === 0 ? 'progresso__barra progresso__barra--zero' : 'progresso__barra'}
							style={{ height: `${Math.max(6, (dia.total / maior) * 100)}%` }}
							title={`${dia.total} em ${dia.dia}`}
						/>
						<span className="progresso__dia" aria-hidden="true">
							{indice === 6
								? 'hoje'
								: new Date(`${dia.dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'narrow' })}
						</span>
					</div>
				))}
			</div>

			{progresso.sequencia > 1 ? (
				<p className="sequencia" style={{ fontSize: 'var(--text-sm)' }}>
					<IconeFogo size={16} />
					{progresso.sequencia} dias seguidos concluindo algo
				</p>
			) : null}
		</div>
	)
}

/** Resumo enxuto de hábitos, usado em telas de apoio. */
export function BlocoHabitos() {
	const calculados = useHabitosCalculados()
	const resumo = useResumoHabitos()

	if (!calculados || !resumo) {
		return (
			<div className="cartao esqueleto" aria-hidden="true">
				<div className="esqueleto__linha">
					<span className="esqueleto__titulo" />
					<span className="esqueleto__meta" />
				</div>
			</div>
		)
	}

	const melhor = [...calculados].sort((a, b) => b.consistencia - a.consistencia)[0]

	return (
		<div className="cartao progresso">
			<div className="resumo-hoje" style={{ padding: 0, background: 'transparent', color: 'inherit' }}>
				<span className="resumo-hoje__numero tabular">
					{resumo.feitosHoje}/{resumo.devidosHoje}
				</span>
				<span className="resumo-hoje__texto" style={{ color: 'var(--on-surface-variant)' }}>
					<span>hábitos de hoje</span>
					<span className="sequencia">
						<IconeInsights size={14} />
						melhor sequência: {resumo.melhorSequencia}
					</span>
				</span>
			</div>
			{melhor ? (
				<p className="nota">
					Mais consistente: <strong>{melhor.title}</strong> — {melhor.consistencia}% nos últimos 30 dias.
				</p>
			) : null}
		</div>
	)
}
