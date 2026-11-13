import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Task } from '@/db/db'
import {
	restaurarTask,
	softDeleteTask,
	toggleReminder,
	toggleTask,
	useDayCounts,
	useProjects,
	useReminders,
} from '@/db/repo'
import { useEventosDoDia } from '@/db/use-eventos'
import { alternarDiaHabito, ehMensuravel, progressoDoDia, useHabitosCalculados } from '@/db/habitos'
import {
	capitalizar,
	chaveDoDia,
	diaDeHoje,
	formatarDiaCurto,
	formatarDiaLongo,
	formatarMes,
	formatarHora,
} from '@/lib/date'
import { useBlocos } from '@/app/use-blocos'
import { definicao } from '@/app/blocos'
import { Link, useRouter } from '@/app/router'
import { MarcaUrdume } from '@/ui/Marca'
import { Busca } from '@/ui/Busca'
import { EditorBlocos, TextoDoBloco } from '@/ui/EditorBlocos'
import { EditarTarefa } from '@/ui/EditarTarefa'
import { ConfirmarExclusaoTarefa } from '@/ui/ConfirmarExclusaoTarefa'
import { BlocoProgresso } from '@/ui/Progresso'
import { PainelDoDia } from '@/ui/PainelDoDia'
import { useResumoJarvis } from '@/lib/jarvis/resumo'
import { TarefaItem } from '@/ui/TarefaItem'
import { estiloCor } from '@/ui/cores'
import {
	IconeAdicionar,
	IconeAjuste,
	IconeBuscar,
	IconeCalendario,
	IconeConcluido,
	IconeExpandir,
	IconeFogo,
	IconeHorario,
	IconePasta,
	IconeRaio,
} from '@/ui/icones'
import { corDoIndice } from '@/ui/paleta'
import { escrever } from '@/lib/falhas'

export interface InicioProps {
	onCriar: (opcoes?: {
		tipo?: 'tarefa' | 'projeto' | 'lembrete' | 'evento' | 'habito'
		dia?: string
	}) => void
}

/** Tarefas do dia (abertas e feitas), com hora primeiro. */
function useTarefasDoDia(dia: string): Task[] | undefined {
	return useLiveQuery(async () => {
		const todas = await db.tasks.where('dueDate').equals(dia).toArray()
		return todas
			.filter((t) => !t.deletedAt)
			.sort((a, b) => (a.startMin ?? 9999) - (b.startMin ?? 9999) || a.order - b.order)
	}, [dia])
}

/** Tarefas atrasadas: dia anterior a hoje, ainda abertas. */
function useAtrasadas(hoje: string): Task[] | undefined {
	return useLiveQuery(async () => {
		const todas = await db.tasks.toArray()
		return todas
			.filter((t) => !t.deletedAt && !t.done && t.dueDate && t.dueDate < hoje)
			.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
	}, [hoje])
}

export function Inicio({ onCriar }: InicioProps) {
	const { navigate } = useRouter()
	const [buscando, setBuscando] = useState(false)
	const resumoJarvis = useResumoJarvis()
	const [editandoBlocos, setEditandoBlocos] = useState(false)
	const [editandoTarefa, setEditandoTarefa] = useState<Task | null>(null)
	const [excluindoTarefa, setExcluindoTarefa] = useState<Task | null>(null)
	const [desfazerExclusao, setDesfazerExclusao] = useState<{ id: string; title: string } | null>(null)
	const [desfazer, setDesfazer] = useState<{ id: string; titulo: string } | null>(null)
	const desfazerTimer = useRef<number | undefined>(undefined)
	const [mostrarConcluidas, setMostrarConcluidas] = useState(false)

	const hoje = useMemo(() => diaDeHoje(), [])
	const chaveHoje = chaveDoDia(hoje)
	// Dia escolhido na fita. Antes tocar num dia levava para a Agenda; agora
	// troca o painel do próprio Início. Volta para hoje ao reabrir o app.
	const [diaEscolhido, setDiaEscolhido] = useState(chaveHoje)
	const fitaRef = useRef<HTMLDivElement>(null)
	/** Timer da volta automática para hoje. */
	const voltarTimer = useRef<number | undefined>(undefined)
	const tarefas = useTarefasDoDia(chaveHoje)
	const atrasadas = useAtrasadas(chaveHoje)
	const projetos = useProjects()
	const blocos = useBlocos()
	const habitos = useHabitosCalculados()
	const eventos = useEventosDoDia(chaveHoje)
	const lembretes = useReminders()

	const nomesDeProjeto = useMemo(() => new Map((projetos ?? []).map((p) => [p.id, p])), [projetos])

	const abertas = (tarefas ?? []).filter((t) => !t.done)
	const feitas = (tarefas ?? []).filter((t) => t.done)
	const habitosHoje = (habitos ?? []).filter((h) => h.valeHoje)
	const habitosFeitos = habitosHoje.filter((h) => h.concluidoHoje).length

	const etiquetasConhecidas = useMemo(() => {
		const conjunto = new Set<string>()
		for (const t of [...(tarefas ?? []), ...(atrasadas ?? [])]) for (const e of t.tags ?? []) conjunto.add(e)
		return [...conjunto].sort()
	}, [tarefas, atrasadas])

	function concluir(id: string, titulo: string): void {
		escrever(() => toggleTask(id, true))
		setDesfazer({ id, titulo })
		window.clearTimeout(desfazerTimer.current)
		desfazerTimer.current = window.setTimeout(() => setDesfazer(null), 4000)
	}

	const cumprimento = (() => {
		const hora = new Date().getHours()
		if (hora < 12) return 'Bom dia'
		if (hora < 18) return 'Boa tarde'
		return 'Boa noite'
	})()

	// Mini calendário do mês: do dia 1 ao último, sempre. Antes eram 14 dias em
	// torno de hoje, o que não deixava consultar o começo nem o fim do mês — e
	// "histórico" era justamente o que faltava. Rola para o lado.
	const diasDoMes = useMemo(() => {
		const ano = hoje.getFullYear()
		const mes = hoje.getMonth()
		// Dia 0 do mês seguinte = último dia deste (contempla fevereiro bissexto).
		const total = new Date(ano, mes + 1, 0).getDate()
		return Array.from({ length: total }, (_, i) => new Date(ano, mes, i + 1, 12))
	}, [hoje])

	// Contagem por dia do mês: é o que acende o ponto embaixo do número e faz o
	// mini calendário servir de histórico (onde houve movimento naquele dia).
	const contagens = useDayCounts(chaveDoDia(diasDoMes[0]!), chaveDoDia(diasDoMes[diasDoMes.length - 1]!))

	/**
	 * Leva a fita até hoje, centralizando o dia atual.
	 *
	 * `smooth` é uma animação de rolagem, não um salto: o usuário vê a fita
	 * voltar, o que comunica "estou te trazendo de volta" em vez de parecer que
	 * a tela recarregou.
	 */
	const irParaHoje = (behavior: ScrollBehavior = 'smooth'): void => {
		const fita = fitaRef.current
		if (!fita) return
		const atual = fita.querySelector<HTMLElement>('.tira-dia--atual')
		if (!atual) return
		const alvo = atual.offsetLeft - fita.clientWidth / 2 + atual.offsetWidth / 2
		fita.scrollTo({ left: Math.max(0, alvo), behavior })
	}

	/**
	 * A fita abre no DIA ATUAL, centralizado.
	 *
	 * Antes abria no dia 1 e o usuário tinha que rolar até hoje toda vez. O
	 * `requestAnimationFrame` espera o layout: medir `offsetLeft` antes disso
	 * devolve 0 e a fita não sai do começo.
	 */
	useEffect(() => {
		const quadro = requestAnimationFrame(() => irParaHoje('auto'))
		return () => cancelAnimationFrame(quadro)
		// Só na montagem: depois disso quem manda é o gesto do usuário.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	/**
	 * Volta para hoje depois de um tempo parado.
	 *
	 * Três gatilhos, todos necessários:
	 * - o usuário parou de mexer na fita por 12 s;
	 * - ele escolheu um dia e não fez nada por 20 s;
	 * - ele saiu da fita (rolando a página para longe) e voltou.
	 *
	 * Sem isso, quem rolava até o dia 1 fechava o app no início do mês e, ao
	 * reabrir, via a fita no dia 1 de novo — o "sempre no dia 1" que incomodava.
	 */
	const agendarVoltaParaHoje = (atraso = 12_000): void => {
		window.clearTimeout(voltarTimer.current)
		voltarTimer.current = window.setTimeout(() => {
			irParaHoje()
		}, atraso)
	}

	useEffect(() => {
		return () => window.clearTimeout(voltarTimer.current)
	}, [])

	/* --------------------------------------------------------------- blocos */

	function renderizarBloco(bloco: NonNullable<typeof blocos>[number]) {
		const def = definicao(bloco.tipo)
		const titulo = bloco.titulo || def.tituloPadrao

		// Resumo: o número que importa primeiro.
		if (bloco.tipo === 'resumo') {
			return (
				<section key={bloco.id} className="secao" aria-label={titulo}>
					<div className="resumo-hoje">
						<span className="resumo-hoje__numero tabular">
							{abertas.length === 0 && (tarefas ?? []).length > 0 ? '✓' : abertas.length}
						</span>
						<span className="resumo-hoje__texto">
							<span style={{ fontSize: 'var(--text-body)', fontWeight: 700 }}>
								{abertas.length === 0
									? (tarefas ?? []).length > 0
										? 'Dia limpo'
										: 'Nada marcado para hoje'
									: `${abertas.length} ${abertas.length === 1 ? 'tarefa' : 'tarefas'} para hoje`}
							</span>
							<span style={{ opacity: 0.85 }}>
								{cumprimento}
								{atrasadas && atrasadas.length > 0 ? ` · ${atrasadas.length} atrasada(s)` : ''}
								{habitosHoje.length > 0 ? ` · hábitos ${habitosFeitos}/${habitosHoje.length}` : ''}
							</span>
						</span>
					</div>
				</section>
			)
		}

		if (bloco.tipo === 'tarefas') {
			return (
				<section key={bloco.id} className="secao" aria-label={titulo}>
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeConcluido size={18} />
							</span>
							{titulo}
							{(tarefas ?? []).length > 0 ? (
								<span className="secao-titulo__contagem">
									{feitas.length}/{(tarefas ?? []).length}
								</span>
							) : null}
						</h2>
						<button
							type="button"
							className="secao-acao"
							onClick={() => onCriar({ tipo: 'tarefa', dia: chaveHoje })}
						>
							<IconeAdicionar size={18} />
							Adicionar
						</button>
					</div>

					{tarefas === undefined ? (
						<div className="cartao esqueleto" aria-hidden="true">
							{[0, 1, 2].map((i) => (
								<div key={i} className="esqueleto__linha">
									<span className="esqueleto__titulo" />
									<span className="esqueleto__meta" />
								</div>
							))}
						</div>
					) : (tarefas ?? []).length === 0 ? (
						<div className="cartao cartao--vazio">
							<span className="vazio__icone" aria-hidden="true">
								<IconeCalendario size={28} />
							</span>
							<p>Nada marcado para hoje. Você pode puxar uma atrasada ou criar algo novo.</p>
							<button
								type="button"
								className="botao botao--primario"
								onClick={() => onCriar({ tipo: 'tarefa', dia: chaveHoje })}
							>
								<IconeAdicionar size={20} />
								Criar tarefa
							</button>
						</div>
					) : (
						<>
							<ul className="linha-grupo">
								{abertas.map((tarefa) => {
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
											onConcluir={concluir}
											onEditar={setEditandoTarefa}
											onExcluir={setExcluindoTarefa}
										/>
									)
								})}
							</ul>

							{feitas.length > 0 ? (
								<button
									type="button"
									className="secao-acao"
									style={{ marginTop: 'var(--s-2)', marginLeft: 'var(--s-2)' }}
									aria-expanded={mostrarConcluidas}
									onClick={() => setMostrarConcluidas((v) => !v)}
								>
									<IconeExpandir
										size={18}
										style={{
											transform: mostrarConcluidas ? 'rotate(180deg)' : undefined,
											transition: 'transform var(--dur) var(--ease)',
										}}
									/>
									{feitas.length} {feitas.length === 1 ? 'concluída' : 'concluídas'}
								</button>
							) : null}

							{mostrarConcluidas ? (
								<ul className="linha-grupo" style={{ marginTop: 'var(--s-2)' }}>
									{feitas.map((tarefa) => (
										<TarefaItem
											key={tarefa.id}
											tarefa={tarefa}
											onEditar={setEditandoTarefa}
											onExcluir={setExcluindoTarefa}
										/>
									))}
								</ul>
							) : null}
						</>
					)}

					{/* Atrasadas pertencem ao bloco de tarefas: são o que ficou para trás
					    e precisa de decisão hoje. */}
					{atrasadas && atrasadas.length > 0 ? (
						<div style={{ marginTop: 'var(--s-4)' }}>
							<div className="secao-cabecalho" style={{ marginBottom: 'var(--s-2)' }}>
								<h3 className="secao-titulo" style={{ fontSize: 'var(--text-lg)' }}>
									<span
										className="secao-titulo__icone secao-titulo__icone--alerta"
										aria-hidden="true"
									>
										<IconeHorario size={18} />
									</span>
									Atrasadas
									<span className="secao-titulo__contagem">{atrasadas.length}</span>
								</h3>
							</div>
							<ul className="linha-grupo">
								{atrasadas.slice(0, 6).map((tarefa) => {
									const projeto = tarefa.projectId ? nomesDeProjeto.get(tarefa.projectId) : undefined
									return (
										<TarefaItem
											key={tarefa.id}
											tarefa={tarefa}
											mostrarData
											atrasada
											lista={
												projeto
													? { id: projeto.id, nome: projeto.name, cor: Number(projeto.color ?? 0) }
													: undefined
											}
											onConcluir={concluir}
											onEditar={setEditandoTarefa}
											onExcluir={setExcluindoTarefa}
										/>
									)
								})}
							</ul>
							{atrasadas.length > 6 ? (
								<Link route={{ name: 'tarefas' }} className="secao-acao">
									ver as outras {atrasadas.length - 6}
								</Link>
							) : null}
						</div>
					) : null}
				</section>
			)
		}

		if (bloco.tipo === 'habitos') {
			return (
				<section key={bloco.id} className="secao" aria-label={titulo}>
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span
								className="secao-titulo__icone"
								aria-hidden="true"
							>
								<IconeFogo size={18} />
							</span>
							{titulo}
							{habitosHoje.length > 0 ? (
								<span className="secao-titulo__contagem">
									{habitosFeitos}/{habitosHoje.length}
								</span>
							) : null}
						</h2>
						<Link route={{ name: 'habitos' }} className="secao-acao">
							Ver todos
						</Link>
					</div>

					{habitosHoje.length === 0 ? (
						<div className="cartao cartao--vazio">
							<p>Nenhum hábito para hoje. Crie um na tela de Hábitos.</p>
							<button
								type="button"
								className="botao"
								onClick={() => onCriar({ tipo: 'habito' })}
							>
								<IconeAdicionar size={20} />
								Criar hábito
							</button>
						</div>
					) : (
						<ul className="linha-grupo">
							{habitosHoje.map((habito) => {
								const progresso = ehMensuravel(habito) ? progressoDoDia(habito, habito.hoje) : null
								return (
									<li key={habito.id} style={estiloCor(habito.cor ?? 0)}>
										<button
											type="button"
											className="linha"
											onClick={() => void alternarDiaHabito(habito, chaveHoje)}
											aria-pressed={habito.concluidoHoje}
											aria-label={`${habito.concluidoHoje ? 'Desmarcar' : 'Marcar'} ${habito.title} hoje`}
										>
											<span
												style={{
													display: 'grid',
													placeItems: 'center',
													width: 40,
													height: 40,
													borderRadius: 999,
													flexShrink: 0,
													background: habito.concluidoHoje
														? corDoIndice(habito.cor ?? 0).hex
														: `${corDoIndice(habito.cor ?? 0).hex}33`,
													color: habito.concluidoHoje
														? 'var(--on-primary)'
														: corDoIndice(habito.cor ?? 0).hex,
												}}
												aria-hidden="true"
											>
												<IconeConcluido size={22} />
											</span>
											<span className="linha__corpo">
												<span className="linha__titulo">{habito.title}</span>
												<span className="linha__meta">
													{progresso !== null ? (
														<span>
															{habito.hoje?.value ?? 0}/{habito.targetValue}{' '}
															{habito.targetUnit || ''}
														</span>
													) : habito.concluidoHoje ? (
														<span>Feito hoje</span>
													) : (
														<span>Ainda não</span>
													)}
													{habito.sequencia > 0 ? (
														<span className="sequencia">
															<IconeFogo size={14} />
															{habito.sequencia}
														</span>
													) : null}
												</span>
											</span>
										</button>
									</li>
								)
							})}
						</ul>
					)}
				</section>
			)
		}

		if (bloco.tipo === 'agenda') {
			const doDia = eventos ?? []
			return (
				<section key={bloco.id} className="secao" aria-label={titulo}>
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeCalendario size={18} />
							</span>
							{titulo}
						</h2>
						<Link route={{ name: 'calendario', day: chaveHoje }} className="secao-acao">
							Abrir dia
						</Link>
					</div>

					{doDia.length === 0 ? (
						<div className="cartao cartao--vazio">
							<p>Nenhum compromisso hoje.</p>
							<button
								type="button"
								className="botao"
								onClick={() => onCriar({ tipo: 'evento', dia: chaveHoje })}
							>
								<IconeAdicionar size={20} />
								Criar evento
							</button>
						</div>
					) : (
						<ul className="linha-grupo">
							{doDia.map((evento) => (
								<li key={evento.id} className="linha" style={estiloCor(evento.cor)}>
									<span
										className="linha__icone"
										style={{
											background: `${corDoIndice(evento.cor).hex}33`,
											color: corDoIndice(evento.cor).hex,
										}}
										aria-hidden="true"
									>
										<IconeHorario size={20} />
									</span>
									<span className="linha__corpo">
										<span className="linha__titulo">{evento.title}</span>
										<span className="linha__meta">
											{evento.diaInteiro
												? 'Dia inteiro'
												: `${formatarHora(evento.startAt)} – ${formatarHora(evento.endAt)}`}
											{evento.local ? ` · ${evento.local}` : ''}
										</span>
									</span>
								</li>
							))}
						</ul>
					)}
				</section>
			)
		}

		if (bloco.tipo === 'projetos') {
			const ativos = (projetos ?? []).filter((p) => !p.archived)
			return (
				<section key={bloco.id} className="secao" aria-label={titulo}>
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconePasta size={18} />
							</span>
							{titulo}
						</h2>
						<button type="button" className="secao-acao" onClick={() => onCriar({ tipo: 'projeto' })}>
							<IconeAdicionar size={18} />
							Nova
						</button>
					</div>
					{ativos.length === 0 ? (
						<div className="cartao cartao--vazio">
							<p>Nenhuma lista ainda. Listas agrupam tarefas com uma cor.</p>
							<button type="button" className="botao" onClick={() => onCriar({ tipo: 'projeto' })}>
								Criar lista
							</button>
						</div>
					) : (
						<ul className="linha-grupo">
							{ativos.map((projeto) => {
								const cor = corDoIndice(Number(projeto.color ?? 0))
								return (
									<li key={projeto.id}>
										<Link route={{ name: 'projeto', id: projeto.id }} className="linha">
											<span
												className="linha__icone"
												style={{ background: `${cor.hex}33`, color: cor.hex }}
												aria-hidden="true"
											>
												<IconePasta size={20} />
											</span>
											<span className="linha__corpo">
												<span className="linha__titulo">{projeto.name}</span>
												<span className="linha__meta">Lista</span>
											</span>
											<IconeExpandir
												size={20}
												className="linha__chevron"
												style={{ transform: 'rotate(-90deg)' }}
											/>
										</Link>
									</li>
								)
							})}
						</ul>
					)}
				</section>
			)
		}

		if (bloco.tipo === 'lembretes') {
			const pendentes = (lembretes ?? []).filter((r) => !r.done)
			return (
				<section key={bloco.id} className="secao" aria-label={titulo}>
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeHorario size={18} />
							</span>
							{titulo}
						</h2>
						<button type="button" className="secao-acao" onClick={() => onCriar({ tipo: 'lembrete' })}>
							<IconeAdicionar size={18} />
							Novo
						</button>
					</div>
					{pendentes.length === 0 ? (
						<div className="cartao cartao--vazio">
							<p>Sem lembretes pendentes.</p>
						</div>
					) : (
						<ul className="linha-grupo">
							{pendentes.map((lembrete) => (
								<li key={lembrete.id} className="linha">
									<button
										type="button"
										role="checkbox"
										aria-checked={false}
										aria-label={`Resolver ${lembrete.text}`}
										className="checkbox"
										onClick={() => void toggleReminder(lembrete.id, true)}
									>
										<span className="checkbox__marca" aria-hidden="true">
											<IconeConcluido size={16} />
										</span>
									</button>
									<span className="linha__corpo">
										<span className="linha__titulo">{lembrete.text}</span>
										<span className="linha__meta">
											{lembrete.dueAt ? formatarHora(lembrete.dueAt) : 'Sem hora'}
										</span>
									</span>
								</li>
							))}
						</ul>
					)}
				</section>
			)
		}

		if (bloco.tipo === 'progresso') {
			return (
				<section key={bloco.id} className="secao" aria-label={titulo}>
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeConcluido size={18} />
							</span>
							{titulo}
						</h2>
					</div>
					<BlocoProgresso />
				</section>
			)
		}

		if (bloco.tipo === 'texto') {
			return (
				<section key={bloco.id} className="secao" aria-label={titulo}>
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeConcluido size={18} />
							</span>
							{titulo}
						</h2>
					</div>
					<TextoDoBloco bloco={bloco} />
				</section>
			)
		}

		// 'algum-dia'
		return (
			<BlocoAlgumDia
				key={bloco.id}
				titulo={titulo}
				onEditar={setEditandoTarefa}
				onExcluir={setExcluindoTarefa}
			/>
		)
	}

	return (
		<div className="tela">
			{/* Topo do Início: marca e ações na MESMA linha, sem o título "Hoje".
			    A data fica logo abaixo da marca, em corpo pequeno. Antes havia
			    marca, depois "Hoje" em 30 px e a data em três linhas de altura —
			    quase 1/6 da tela só para dizer o dia. */}
			<header className="topo topo--inicio">
				<div className="topo__linha topo__linha--marca">
					<div className="topo__marca-bloco">
						<MarcaUrdume />
						<p className="topo__data">{capitalizar(formatarDiaLongo(hoje))}</p>
					</div>
					<div className="topo__acoes">
						{/* Atalho do Jarvis: mostra a contagem só quando há algo para
						    ver. Ícone sozinho gastaria o mesmo espaço para dizer "nada". */}
						<Link
							route={{ name: 'jarvis' }}
							className="botao-icone jarvis-atalho"
							ariaLabel={
								resumoJarvis && resumoJarvis.total > 0
									? `Jarvis: ${resumoJarvis.total} itens pedem atenção`
									: 'Jarvis'
							}
							title="Jarvis"
						>
							<IconeRaio size={22} />
							{resumoJarvis && resumoJarvis.total > 0 ? (
								<span className="jarvis-atalho__contagem" aria-hidden="true">
									{resumoJarvis.total}
								</span>
							) : null}
						</Link>
						<button
							type="button"
							className="botao-icone"
							aria-label="Montar o Início"
							onClick={() => setEditandoBlocos(true)}
						>
							<IconeAjuste size={22} />
						</button>
						<button
							type="button"
							className="botao-icone"
							aria-label="Buscar"
							onClick={() => setBuscando(true)}
						>
							<IconeBuscar size={22} />
						</button>
					</div>
				</div>
			</header>

			<Busca aberta={buscando} onFechar={() => setBuscando(false)} />

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

			<div className="conteudo" style={{ paddingTop: 0 }}>
				{/* Fita de dias: escolhe o dia do painel. Rola para o lado e mostra
				    14 dias (antes eram 5 e cada um levava para a Agenda). */}
				<div className="secao">
					{/* Cabeçalho do mini calendário: o mês por extenso e o atalho para
					    hoje, já que a fita agora começa no dia 1. */}
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeCalendario size={18} />
							</span>
							{capitalizar(formatarMes(hoje))}
						</h2>
						{diaEscolhido !== chaveHoje ? (
							<button type="button" className="secao-acao" onClick={() => { setDiaEscolhido(chaveHoje); irParaHoje() }}>
								Hoje
							</button>
						) : null}
					</div>
					<div
						className="tira-dias"
						role="tablist"
						aria-label="Escolher o dia"
						ref={fitaRef}
						onScroll={() => agendarVoltaParaHoje()}
						onPointerUp={() => agendarVoltaParaHoje()}
					>
						{diasDoMes.map((data) => {
							const chave = chaveDoDia(data)
							const atual = chave === chaveHoje
							const escolhido = chave === diaEscolhido
							const rotulo = formatarDiaCurto(data).split(',')[0] ?? ''
							return (
								<button
									key={chave}
									type="button"
									role="tab"
									aria-selected={escolhido}
									className={[
										'tira-dia',
										atual ? 'tira-dia--atual' : '',
										escolhido && !atual ? 'tira-dia--escolhido' : '',
									]
										.filter(Boolean)
										.join(' ')}
									aria-label={`${formatarDiaCurto(data)}${atual ? ', hoje' : ''}`}
									onClick={() => {
										setDiaEscolhido(chave)
										agendarVoltaParaHoje(20_000)
									}}
									onDoubleClick={() => navigate({ name: 'calendario', day: chave })}
								>
									<span className="tira-dia__semana" aria-hidden="true">
										{rotulo.replace('.', '')}
									</span>
									<span className="tira-dia__numero" aria-hidden="true">
										{data.getDate()}
									</span>
									<span
										className="tira-dia__marca"
										aria-hidden="true"
										data-tem={(contagens?.get(chave)?.total ?? 0) > 0 ? 'sim' : 'nao'}
									/>
								</button>
							)
						})}
					</div>
				</div>

				{/* Só quando outro dia foi escolhido: em "hoje" o painel do dia
				    seria uma segunda cópia do bloco de tarefas de hoje, que já está
				    logo abaixo. */}
				{diaEscolhido !== chaveHoje ? (
					<PainelDoDia
						dia={diaEscolhido}
						hoje={chaveHoje}
						onEditarTarefa={setEditandoTarefa}
						onCriar={(dia) => onCriar({ tipo: 'tarefa', dia })}
					/>
				) : null}

				{blocos === undefined ? (
					<div className="secao">
						<div className="cartao esqueleto" aria-hidden="true">
							{[0, 1].map((i) => (
								<div key={i} className="esqueleto__linha">
									<span className="esqueleto__titulo" />
									<span className="esqueleto__meta" />
								</div>
							))}
						</div>
					</div>
				) : (blocos ?? []).length === 0 ? (
					<div className="secao">
						<div className="cartao cartao--vazio">
							<span className="vazio__icone" aria-hidden="true">
								<IconeAjuste size={28} />
							</span>
							<p>Seu Início está vazio. Monte do seu jeito: tarefas, hábitos, recados, metas.</p>
							<button
								type="button"
								className="botao botao--primario"
								onClick={() => setEditandoBlocos(true)}
							>
								<IconeAjuste size={20} />
								Montar Início
							</button>
						</div>
					</div>
				) : (
					(blocos ?? []).map((bloco) => renderizarBloco(bloco))
				)}

				{(blocos ?? []).length > 0 ? (
					<p className="nota" style={{ padding: 'var(--s-6) var(--s-4) var(--s-4)', textAlign: 'center' }}>
						Toque em <strong>Ajustar</strong> no topo para renomear, reordenar ou adicionar blocos —
						inclusive um quadro de recados.
					</p>
				) : null}
			</div>


			<EditorBlocos aberto={editandoBlocos} onFechar={() => setEditandoBlocos(false)} blocos={blocos ?? []} />

			<EditarTarefa
				tarefa={editandoTarefa}
				aberta={editandoTarefa !== null}
				onFechar={() => setEditandoTarefa(null)}
				projetos={(projetos ?? []).map((p) => ({ id: p.id, name: p.name }))}
				etiquetasConhecidas={etiquetasConhecidas}
			/>

			{/* Excluir a partir do Início. A folha de confirmação é a mesma das
			    outras telas; a diferença é o desfazer de 4 s, porque o toque no
			    ícone de lixeira é fácil de errar no celular. */}
			<ConfirmarExclusaoTarefa
				tarefa={excluindoTarefa}
				onFechar={() => setExcluindoTarefa(null)}
				onExcluir={async (alvo) => {
					await softDeleteTask(alvo.id)
					setExcluindoTarefa(null)
					window.clearTimeout(desfazerTimer.current)
					setDesfazer(null)
					setDesfazerExclusao(alvo)
					desfazerTimer.current = window.setTimeout(() => setDesfazerExclusao(null), 4000)
				}}
			/>

			{desfazerExclusao ? (
				<div className="desfazer" role="status" aria-live="polite">
					<span className="desfazer__texto">Excluída: {desfazerExclusao.title}</span>
					<button
						type="button"
						className="botao botao--texto"
						onClick={() => {
							escrever(() => restaurarTask(desfazerExclusao.id))
							setDesfazerExclusao(null)
							window.clearTimeout(desfazerTimer.current)
						}}
					>
						Desfazer
					</button>
				</div>
			) : null}
		</div>
	)
}

/* ---------------------------------------------------- blocos sob demanda */

function BlocoAlgumDia({
	titulo,
	onEditar,
	onExcluir,
}: {
	titulo: string
	onEditar: (tarefa: Task) => void
	onExcluir: (tarefa: Task) => void
}) {
	const tarefas = useLiveQuery(async () => {
		const todas = await db.tasks.toArray()
		return todas.filter((t) => !t.deletedAt && !t.done && t.someday).slice(0, 8)
	}, [])

	return (
		<section className="secao" aria-label={titulo}>
			<div className="secao-cabecalho">
				<h2 className="secao-titulo">
					<span className="secao-titulo__icone" aria-hidden="true">
						<IconeCalendario size={18} />
					</span>
					{titulo}
					<span className="secao-titulo__contagem">{(tarefas ?? []).length}</span>
				</h2>
			</div>
			{(tarefas ?? []).length === 0 ? (
				<div className="cartao cartao--vazio">
					<p>Ideias sem data ficam aqui, sem cobrar.</p>
				</div>
			) : (
				<ul className="linha-grupo">
					{(tarefas ?? []).map((tarefa) => (
						<TarefaItem
							key={tarefa.id}
							tarefa={tarefa}
							onEditar={onEditar}
							onExcluir={onExcluir}
						/>
					))}
				</ul>
			)}
		</section>
	)
}
