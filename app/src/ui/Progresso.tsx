import { IconeFogo } from '@/ui/icones'
import { useProgresso } from '@/db/progresso'

/**
 * Blocos de progresso.
 *
 * ## O gráfico empilhado
 *
 * A primeira versão contava só tarefas, e o desenho era uma barra por dia com
 * um único valor. Duas séries ficavam escondidas: hábitos e tarefas têm ritmos
 * diferentes (hábito é diário e pequeno; tarefa é irregular e maior), e somar
 * tudo numa barra só faz um dia de três hábitos parecer igual a um dia de três
 * tarefas concluídas.
 *
 * Empilhar resolve sem inventar dado: a base e o topo mostram de onde veio o
 * total, e a legenda nomeia cada parte. Cores vêm do tema, não de valores
 * fixos — o mesmo gráfico funciona nos dois modos e no alto contraste.
 *
 * ## Acessibilidade
 *
 * O gráfico é decorativo: o leitor de tela recebe o resumo em texto
 * (`role="img"` com `aria-label`), e cada barra tem o seu `title`. Quem não vê
 * cor continua sabendo os números.
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

	// O maior total define a altura do gráfico — as duas séries somadas, que é
	// o que a barra desenha.
	const maior = Math.max(1, ...progresso.porDia.map((d) => d.total))

	const resumo = progresso.porDia
		.map((d) => `${d.dia}: ${d.tarefas} tarefas, ${d.habitos} hábitos`)
		.join('; ')

	return (
		<div className="cartao progresso">
			<div className="progresso__numeros">
				<div className="progresso__numero">
					<span className="progresso__valor tabular">{progresso.concluidasHoje}</span>
					<span className="progresso__rotulo">tarefas hoje</span>
				</div>
				<div className="progresso__numero">
					<span className="progresso__valor tabular">{progresso.habitosHoje}</span>
					<span className="progresso__rotulo">hábitos hoje</span>
				</div>
				<div className="progresso__numero">
					<span className="progresso__valor tabular">{progresso.concluidasSemana}</span>
					<span className="progresso__rotulo">tarefas na semana</span>
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

			<div className="progresso__legenda" aria-hidden="true">
				<span className="progresso__chave progresso__chave--tarefa">Tarefas</span>
				<span className="progresso__chave progresso__chave--habito">Hábitos</span>
			</div>

			<div className="progresso__barras" role="img" aria-label={`Concluídos nos últimos 7 dias. ${resumo}`}>
				{progresso.porDia.map((dia, indice) => {
					const alturaTarefa = dia.tarefas / maior
					const alturaHabito = dia.habitos / maior

					return (
						<div key={dia.dia} className="progresso__barra-area">
							<div
								className="progresso__barra progresso__barra--empilhada"
								title={`${dia.tarefas} tarefas e ${dia.habitos} hábitos em ${dia.dia}`}
							>
								{/* A base é o hábito — é o que se repete todo dia previsível;
								    a tarefa vem em cima, porque é o que varia. */}
								<div
									className={
										dia.habitos === 0
											? 'progresso__parte progresso__parte--habito progresso__parte--zero'
											: 'progresso__parte progresso__parte--habito'
									}
									style={{ ['--valor' as string]: String(Math.max(0, alturaHabito)) }}
								/>
								<div
									className={
										dia.tarefas === 0
											? 'progresso__parte progresso__parte--tarefa progresso__parte--zero'
											: 'progresso__parte progresso__parte--tarefa'
									}
									style={{ ['--valor' as string]: String(Math.max(0, alturaTarefa)) }}
								/>
							</div>
							<span className="progresso__dia" aria-hidden="true">
								{indice === 6
									? 'hoje'
									: new Date(`${dia.dia}T12:00:00`).toLocaleDateString('pt-BR', {
											weekday: 'narrow',
										})}
							</span>
						</div>
					)
				})}
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
