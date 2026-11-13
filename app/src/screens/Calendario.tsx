import { useMemo, useRef, useState, useEffect } from 'react'
import { useRouter } from '@/app/router'
import { softDeleteTask, toggleTask, useAllTasks, useDayCounts, useTasksByDay } from '@/db/repo'
import {
	capitalizar,
	chaveDoDia,
	diaDaChave,
	diaDeHoje,
	formatarDiaLongo,
	formatarMes,
	gradeDoMes,
	DIAS_DA_SEMANA,
} from '@/lib/date'
import { Topo } from '@/ui/AppShell'
import { IconeAdicionar, IconeAnterior, IconeCalendario, IconeEvento, IconeExpandir, IconeProximo } from '@/ui/icones'
import { LinhaDoDia } from '@/ui/LinhaDoDia'
import { EditarEvento } from '@/ui/EditarEvento'
import { ConfirmarExclusaoTarefa } from '@/ui/ConfirmarExclusaoTarefa'
import { useEventosDoDia, useEventosEntre } from '@/db/use-eventos'
import type { Evento } from '@/db/db'
import { TarefaItem } from '@/ui/TarefaItem'
import { EditarTarefa } from '@/ui/EditarTarefa'
import { useProjects } from '@/db/repo'
import type { Task } from '@/db/db'
import { Folha } from '@/ui/Folha'
import { escrever } from '@/lib/falhas'

export interface CalendarioProps {
	dia?: string
	onCriar: (opcoes?: {
		tipo?: 'tarefa' | 'projeto' | 'lembrete' | 'evento' | 'habito'
		dia?: string
	}) => void
}

/**
 * Agenda — mês + dia selecionado.
 *
 * O dia é selecionável de verdade: tocar num número seleciona e mostra o que
 * existe nele; o botão "+" cria uma tarefa ou um evento NAQUELE dia. O nome do
 * mês abre um campo de data, então dá para saltar para qualquer mês/ano sem
 * apertar seta.
 */
export function Calendario({ dia, onCriar }: CalendarioProps) {
	const { navigate } = useRouter()
	const hoje = useMemo(() => diaDeHoje(), [])
	const chaveHoje = chaveDoDia(hoje)

	const [diaLocal, setDiaLocal] = useState<string | null>(null)
	const selecionado = diaLocal ?? dia ?? chaveHoje
	// A rota manda: navegar de outra tela para `/calendario/<dia>` troca o dia
	// em vez de manter o dia antigo preso no estado local.
	useEffect(() => {
		if (dia) setDiaLocal(dia)
	}, [dia])
	const [saltando, setSaltando] = useState(false)
	const [desfazer, setDesfazer] = useState<{ id: string; titulo: string } | null>(null)
	const desfazerTimer = useRef<number | undefined>(undefined)
	const [salto, setSalto] = useState('')
	const [menuCriar, setMenuCriar] = useState(false)
	const [editando, setEditando] = useState<Task | null>(null)
	const [excluindoTarefa, setExcluindoTarefa] = useState<Task | null>(null)
	const [mesVisivel, setMesVisivel] = useState(() => {
		const base = diaDaChave(selecionado)
		return { ano: base.getFullYear(), mes: base.getMonth() }
	})

	const projetos = useProjects()
	const celulas = useMemo(() => gradeDoMes(mesVisivel.ano, mesVisivel.mes), [mesVisivel])
	const primeira = celulas[0]!.chave
	const ultima = celulas[celulas.length - 1]!.chave
	const contagens = useDayCounts(primeira, ultima)
	const eventosDoMes = useEventosEntre(primeira, ultima)
	// Eventos contam como item do mês: sem isso o ponto do dia só refletia
	// tarefas e a agenda "sumia" compromissos na visão geral.
	const contagensComEventos = useMemo(() => {
		if (!eventosDoMes) return contagens
		const mapa = new Map(contagens ?? [])
		for (const [chave, lista] of eventosDoMes) {
			const atual = mapa.get(chave)
			mapa.set(chave, atual ? { ...atual, total: atual.total + lista.length } : { day: chave, total: lista.length, open: 0 })
		}
		return mapa
	}, [contagens, eventosDoMes])
	const tarefasDoDia = useTasksByDay(selecionado)
	const eventosDoDia = useEventosDoDia(selecionado)
	const [eventoAberto, setEventoAberto] = useState<Evento | null>(null)

	const nomesDeProjeto = useMemo(() => new Map((projetos ?? []).map((p) => [p.id, p])), [projetos])

	function mudarMes(delta: number): void {
		setMesVisivel((atual) => {
			const base = new Date(atual.ano, atual.mes + delta, 1)
			return { ano: base.getFullYear(), mes: base.getMonth() }
		})
	}

	function escolherDia(chave: string): void {
		setDiaLocal(chave)
		const data = diaDaChave(chave)
		if (data.getMonth() !== mesVisivel.mes || data.getFullYear() !== mesVisivel.ano) {
			setMesVisivel({ ano: data.getFullYear(), mes: data.getMonth() })
		}
		// A URL carrega o dia: voltar/recarregar mantém o contexto.
		navigate({ name: 'calendario', day: chave }, { replace: true })
	}

	const irParaHoje = (): void => {
		setMesVisivel({ ano: hoje.getFullYear(), mes: hoje.getMonth() })
		escolherDia(chaveHoje)
	}

	// "novembro de 2026" quebra em duas linhas num celular de 360 px. O
	// cabeçalho usa "novembro 2026", que cabe numa linha e continua legível.
	const tituloMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
		.format(new Date(mesVisivel.ano, mesVisivel.mes, 1))
		.replace(' de ', ' ')
	const tituloCapitalizado = tituloMes.charAt(0).toUpperCase() + tituloMes.slice(1)
	const dataSelecionada = diaDaChave(selecionado)

	const abertas = (tarefasDoDia ?? []).filter((t) => !t.done)
	const feitas = (tarefasDoDia ?? []).filter((t) => t.done)
	const temConteudo = (tarefasDoDia ?? []).length > 0 || (eventosDoDia ?? []).length > 0

	return (
		<div className="tela">
			<Topo
				titulo="Agenda"
				sobre={capitalizar(formatarDiaLongo(dataSelecionada))}
				acoes={
					<>
						<button type="button" className="secao-acao" onClick={irParaHoje}>
							Hoje
						</button>
						<button
							type="button"
							className="botao-icone"
							aria-label="Criar neste dia"
							onClick={() => setMenuCriar(true)}
						>
							<IconeAdicionar size={22} />
						</button>
					</>
				}
			/>

			<div className="conteudo" style={{ paddingTop: 0 }}>
				<div className="calendario">
					<div className="calendario__cabecalho">
						<button type="button" className="botao-icone" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>
							<IconeAnterior size={22} />
						</button>

						<button
							type="button"
							className="calendario__mes-botao"
							onClick={() => setSaltando((atual) => !atual)}
							aria-expanded={saltando}
						>
							{tituloCapitalizado}
							<IconeExpandir size={18} style={{ transform: saltando ? 'rotate(180deg)' : undefined }} />
						</button>

						<button type="button" className="botao-icone" aria-label="Próximo mês" onClick={() => mudarMes(1)}>
							<IconeProximo size={22} />
						</button>
					</div>

					{saltando ? (
						<form
							className="calendario__salto"
							onSubmit={(evento) => {
								evento.preventDefault()
								if (!salto) return
								escolherDia(salto)
								setSaltando(false)
							}}
						>
							<input
								type="date"
								className="campo campo--compacto"
								aria-label="Ir para a data"
								value={salto}
								onChange={(evento) => setSalto(evento.target.value)}
							/>
							<button type="submit" className="botao botao--primario">
								Ir
							</button>
						</form>
					) : null}

					<div className="calendario__semana" aria-hidden="true">
						{DIAS_DA_SEMANA.map((rotulo) => (
							<span key={rotulo}>{rotulo}</span>
						))}
					</div>

					<div className="calendario__grade" role="grid" aria-label={tituloCapitalizado}>
						{celulas.map((celula) => {
							const contagem = contagensComEventos?.get(celula.chave)
							const ehHoje = celula.chave === chaveHoje
							const ehSelecionado = celula.chave === selecionado
							return (
								<button
									key={celula.chave}
									type="button"
									role="gridcell"
									className={[
										'dia',
										celula.noMes ? '' : 'dia--fora',
										ehHoje ? 'dia--hoje' : '',
										ehSelecionado ? 'dia--selecionado' : '',
									]
										.filter(Boolean)
										.join(' ')}
									aria-label={`${celula.data.getDate()} de ${formatarMes(celula.data)}${
										contagem ? `, ${contagem.total} item(ns)` : ', sem itens'
									}`}
									aria-selected={ehSelecionado}
									aria-current={ehHoje ? 'date' : undefined}
									onClick={() => escolherDia(celula.chave)}
								>
									<span>{celula.data.getDate()}</span>
									<span className="dia__pontos" aria-hidden="true">
										{contagem && contagem.total > 0 ? <i /> : null}
										{contagem && contagem.total > 1 ? <i /> : null}
										{contagem && contagem.total > 3 ? <i /> : null}
									</span>
								</button>
							)
						})}
					</div>
				</div>

				{desfazer ? (
					<div className="desfazer" role="status" aria-live="polite">
						<span className="desfazer__texto">Concluída: {desfazer.titulo}</span>
						<button
							type="button"
							className="botao botao--texto"
							onClick={() => {
								escrever(() => toggleTask(desfazer.id, false))
								setDesfazer(null)
								window.clearTimeout(desfazerTimer.current)
							}}
						>
							Desfazer
						</button>
					</div>
				) : null}

				<section className="secao" aria-labelledby="secao-dia" style={{ marginTop: 'var(--s-5)' }}>
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-dia">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeCalendario size={18} />
							</span>
							{selecionado === chaveHoje ? 'Hoje' : capitalizar(formatarDiaLongo(dataSelecionada))}
						</h2>
						<button type="button" className="secao-acao" onClick={() => setMenuCriar(true)}>
							<IconeAdicionar size={18} />
							Adicionar
						</button>
					</div>

					{tarefasDoDia === undefined ? (
						<div className="cartao esqueleto" aria-hidden="true">
							{[0, 1].map((i) => (
								<div key={i} className="esqueleto__linha">
									<span className="esqueleto__titulo" />
									<span className="esqueleto__meta" />
								</div>
							))}
						</div>
					) : !temConteudo ? (
						<div className="cartao cartao--vazio">
							<span className="vazio__icone" aria-hidden="true">
								<IconeCalendario size={28} />
							</span>
							<p>
								Nada em {capitalizar(formatarDiaLongo(dataSelecionada))}. Crie direto neste dia — a data já
								vem preenchida.
							</p>
							<div style={{ display: 'flex', gap: 'var(--s-2)' }}>
								<button
									type="button"
									className="botao botao--primario"
									onClick={() => onCriar({ tipo: 'tarefa', dia: selecionado })}
								>
									<IconeAdicionar size={20} />
									Tarefa
								</button>
								<button
									type="button"
									className="botao"
									onClick={() => onCriar({ tipo: 'evento', dia: selecionado })}
								>
									<IconeEvento size={20} />
									Evento
								</button>
							</div>
						</div>
					) : (
						<>
							{abertas.length > 0 ? (
								<>
									<p
										className="campo-rotulo"
										style={{ padding: 'var(--s-4) var(--s-2) var(--s-2)' }}
									>
										Tarefas sem hora
									</p>
									<ul className="linha-grupo">
										{abertas
											.filter((t) => t.startMin == null)
											.map((tarefa) => {
												const projeto = tarefa.projectId ? nomesDeProjeto.get(tarefa.projectId) : undefined
												return (
													<TarefaItem
														key={tarefa.id}
														tarefa={tarefa}
														lista={
															projeto
																? { id: projeto.id, nome: projeto.name, cor: Number(projeto.color ?? 0) }
																: undefined
														}
														onEditar={setEditando}
														onExcluir={setExcluindoTarefa}
													/>
												)
											})}
									</ul>
								</>
							) : null}

							{feitas.length > 0 ? (
								<>
									<p
										className="campo-rotulo"
										style={{ padding: 'var(--s-4) var(--s-2) var(--s-2)' }}
									>
										Concluídas
									</p>
									<ul className="linha-grupo">
										{feitas.map((tarefa) => (
											<TarefaItem
												key={tarefa.id}
												tarefa={tarefa}
												onEditar={setEditando}
												onExcluir={setExcluindoTarefa}
											/>
										))}
									</ul>
								</>
							) : null}

							{/* A linha do tempo vem DEPOIS das tarefas sem hora.
							    Antes ela abria a seção do dia: mesmo compacta, empurrava
							    "Tarefas sem hora" para fora da tela e obrigava a rolar
							    para ver o que dava para fazer naquele dia. */}
							{((eventosDoDia ?? []).length > 0 ||
								(tarefasDoDia ?? []).some((t) => t.startMin != null)) ? (
								<>
									<p
										className="campo-rotulo"
										style={{ padding: 'var(--s-4) var(--s-2) var(--s-2)' }}
									>
										Agenda do dia
									</p>
									<div className="cartao cartao--linha-do-dia">
										<LinhaDoDia
											dia={selecionado}
											tarefas={tarefasDoDia}
											onAbrirEvento={setEventoAberto}
											onConcluir={(id, titulo) => {
												escrever(() => toggleTask(id, true))
												setDesfazer({ id, titulo })
												window.clearTimeout(desfazerTimer.current)
												desfazerTimer.current = window.setTimeout(() => setDesfazer(null), 4000)
											}}
										/>
									</div>
								</>
							) : null}
						</>
					)}
				</section>

				<HistoricoDoMes ano={mesVisivel.ano} mes={mesVisivel.mes} />
			</div>

			<Folha titulo="Adicionar neste dia" sobre={capitalizar(formatarDiaLongo(dataSelecionada))} aberta={menuCriar} onFechar={() => setMenuCriar(false)}>
				<div className="opcoes-criacao">
					<button
						type="button"
						className="opcao-criacao"
						data-foco-inicial
						onClick={() => {
							setMenuCriar(false)
							onCriar({ tipo: 'tarefa', dia: selecionado })
						}}
					>
						<span className="opcao-criacao__icone" aria-hidden="true">
							<IconeAdicionar size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo">Tarefa</span>
							<span className="opcao-criacao__descricao">
								Já marcada para {capitalizar(formatarDiaLongo(dataSelecionada))}
							</span>
						</span>
					</button>

					<button
						type="button"
						className="opcao-criacao"
						onClick={() => {
							setMenuCriar(false)
							onCriar({ tipo: 'evento', dia: selecionado })
						}}
					>
						<span className="opcao-criacao__icone" aria-hidden="true">
							<IconeEvento size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo">Evento</span>
							<span className="opcao-criacao__descricao">Compromisso com hora e duração</span>
						</span>
					</button>
				</div>
			</Folha>

			<EditarTarefa
				tarefa={editando}
				aberta={editando !== null}
				onFechar={() => setEditando(null)}
				projetos={(projetos ?? []).map((p) => ({ id: p.id, name: p.name }))}
				etiquetasConhecidas={[...new Set((tarefasDoDia ?? []).flatMap((t) => t.tags ?? []))].sort()}
			/>

			<EditarEvento evento={eventoAberto} onFechar={() => setEventoAberto(null)} />

			{/* Mesma folha de exclusão das outras telas: a Agenda era o único
			    lugar com tarefas sem o atalho de lixeira. */}
			<ConfirmarExclusaoTarefa
				tarefa={excluindoTarefa}
				onFechar={() => setExcluindoTarefa(null)}
				onExcluir={async (alvo) => {
					await softDeleteTask(alvo.id)
					setExcluindoTarefa(null)
				}}
			/>
		</div>
	)
}

function HistoricoDoMes({ ano, mes }: { ano: number; mes: number }) {
	const tarefas = useAllTasks()

	const concluidas = useMemo(() => {
		return (tarefas ?? [])
			.filter((tarefa) => {
				if (!tarefa.done || !tarefa.doneAt) return false
				const quando = new Date(tarefa.doneAt)
				return quando.getFullYear() === ano && quando.getMonth() === mes
			})
			.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
	}, [tarefas, ano, mes])

	if (tarefas === undefined) return null
	if (concluidas.length === 0) return null

	return (
		<section className="secao" aria-labelledby="secao-historico" style={{ marginTop: 'var(--s-5)' }}>
			<div className="secao-cabecalho">
				<h2 className="secao-titulo" id="secao-historico">
					Concluídas em {formatarMes(new Date(ano, mes, 1))}
					<span className="secao-titulo__contagem">{concluidas.length}</span>
				</h2>
			</div>
			<ul className="linha-grupo">
				{concluidas.slice(0, 10).map((tarefa) => (
					<li key={tarefa.id} className="linha">
						<span className="linha__corpo">
							<span className="linha__titulo linha__titulo--riscado">{tarefa.title}</span>
							<span className="linha__meta">
								{tarefa.doneAt
									? new Date(tarefa.doneAt).toLocaleDateString('pt-BR', {
											day: '2-digit',
											month: 'short',
										})
									: ''}
							</span>
						</span>
					</li>
				))}
			</ul>
		</section>
	)
}
