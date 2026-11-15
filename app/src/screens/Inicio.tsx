import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Evento, Reminder, Task } from '@/db/db'
import {
	restaurarReminder,
	restaurarTask,
	softDeleteReminder,
	softDeleteTask,
	toggleReminder,
	toggleTask,
	useDayCounts,
	useProjects,
	useReminders,
} from '@/db/repo'
import { restaurarEvento } from '@/db/eventos'
import { useEventosDoDia } from '@/db/use-eventos'
import { alternarDiaHabito, ehMensuravel, progressoDoDia, useHabitosCalculados } from '@/db/habitos'
import {
	capitalizar,
	chaveDoDia,
	diaDeHoje,
	formatarDiaCurto,
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
import { EditarLembrete } from '@/ui/EditarLembrete'
import { EditarEvento } from '@/ui/EditarEvento'
import { DURACAO_DO_DESFAZER, ExcluirComDesfazer, FaixaDesfazer, useDesfazerExclusao } from '@/ui/ExcluirComDesfazer'
import { Folha } from '@/ui/Folha'
import { BlocoProgresso } from '@/ui/Progresso'
import { PainelDoDia } from '@/ui/PainelDoDia'
import { TarefaItem } from '@/ui/TarefaItem'
import { estiloCor } from '@/ui/cores'
import { estaAtrasada, tipoDaTarefa } from '@/lib/tarefas'
import {
	IconeAdicionar,
	IconeAjuste,
	IconeApagar,
	IconeBuscar,
	IconeCalendario,
	IconeConcluido,
	IconeExpandir,
	IconeFogo,
	IconeHorario,
	IconeMaisVertical,
	IconePasta,
	IconeRaio,
} from '@/ui/icones'
import { corDe } from '@/ui/paleta'
import { escrever } from '@/lib/falhas'

interface InicioProps {
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
			.filter((t) => !t.deletedAt && estaAtrasada(t, hoje))
			.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
	}, [hoje])
}

export function Inicio({ onCriar }: InicioProps) {
	const { navigate } = useRouter()
	const [buscando, setBuscando] = useState(false)
	const [editandoBlocos, setEditandoBlocos] = useState(false)
	const [editandoTarefa, setEditandoTarefa] = useState<Task | null>(null)
	const [excluindoTarefa, setExcluindoTarefa] = useState<Task | null>(null)
	const [desfazer, setDesfazer] = useState<{ id: string; titulo: string } | null>(null)
	const desfazerTimer = useRef<number | undefined>(undefined)
	const [mostrarConcluidas, setMostrarConcluidas] = useState(false)

	/**
	 * Lembretes e eventos ganharam edição/exclusão aqui.
	 *
	 * Eram as duas únicas entidades que apareciam no Início sem nenhum toque
	 * possível: o lembrete só nascia (D9) e o evento só se editava na Agenda
	 * (D7). Agora o menu ⋮ do lembrete e o toque no evento abrem a mesma folha
	 * que as outras telas usam.
	 */
	const [editandoLembrete, setEditandoLembrete] = useState<Reminder | null>(null)
	/** Lembrete com o menu ⋮ aberto (mesmo padrão do cartão de hábito). */
	const [acoesLembrete, setAcoesLembrete] = useState<Reminder | null>(null)
	const [excluindoLembrete, setExcluindoLembrete] = useState<Reminder | null>(null)
	const [editandoEvento, setEditandoEvento] = useState<Evento | null>(null)
	const desfazerExclusao = useDesfazerExclusao()

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
		desfazerTimer.current = window.setTimeout(() => setDesfazer(null), DURACAO_DO_DESFAZER)
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
	 * a tela recarregou. Mas animação de rolagem NÃO é CSS: `scroll-behavior:
	 * auto !important` (em `tokens.css`) não alcança `scrollTo({behavior})`. Com
	 * movimento reduzido — do sistema ou do app — o salto tem de ser seco.
	 */
	const irParaHoje = (behavior?: ScrollBehavior): void => {
		const fita = fitaRef.current
		if (!fita) return
		const reduzido =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			document.documentElement.getAttribute('data-movimento') === 'reduzido'
		const atual = fita.querySelector<HTMLElement>('.tira-dia--atual')
		if (!atual) return
		const alvo = atual.offsetLeft - fita.clientWidth / 2 + atual.offsetWidth / 2
		fita.scrollTo({ left: Math.max(0, alvo), behavior: behavior ?? (reduzido ? 'auto' : 'smooth') })
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

		/*
		 * Resumo: UM cartão, com o dia inteiro escrito nele.
		 *
		 * A primeira tentativa desta rodada empilhou cartões de "hábitos",
		 * "atrasadas" e "agenda" embaixo do resumo. Era errado por três
		 * motivos: repetia números que o cartão já dizia, repetia seções que
		 * já existem abaixo na mesma tela, e não parecia o app. O pedido era
		 * expandir o que o resumo CONTA, não criar outro resumo.
		 *
		 * Agora é o mesmo cartão de antes — número grande e duas linhas de
		 * texto — com o repertório maior na segunda linha. Cada número
		 * aparece uma vez só, e nenhum deles vira um bloco novo.
		 */
		if (bloco.tipo === 'resumo') {
			const eventosHoje = eventos ?? []
			const proximoEvento = [...eventosHoje]
				.filter((evento) => !evento.diaInteiro)
				.sort((a, b) => a.startAt - b.startAt)[0]
			const lembretesHoje = (lembretes ?? []).filter(
				(item) => !item.done && item.dueAt && chaveDoDia(new Date(item.dueAt)) === chaveHoje,
			)
			const atrasadasHoje = atrasadas?.length ?? 0

			/*
			 * A segunda linha é uma frase, não uma grade.
			 *
			 * Só entra o que existe hoje, e na ordem em que se decide o dia:
			 * atraso primeiro, depois hábito (o compromisso consigo), depois o
			 * compromisso com hora e o lembrete que vence. Tudo que não existe
			 * não ocupa espaço.
			 */
			const fatos = [
				atrasadasHoje > 0
					? `${atrasadasHoje} ${atrasadasHoje === 1 ? 'atrasada' : 'atrasadas'}`
					: null,
				habitosHoje.length > 0 ? `hábitos ${habitosFeitos}/${habitosHoje.length}` : null,
				proximoEvento
					? `${eventosHoje.length} na agenda, ${formatarHora(proximoEvento.startAt)} o primeiro`
					: eventosHoje.length > 0
						? `${eventosHoje.length} na agenda`
						: null,
				lembretesHoje.length > 0
					? `${lembretesHoje.length} ${lembretesHoje.length === 1 ? 'lembrete' : 'lembretes'}`
					: null,
			].filter(Boolean) as string[]

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
								{fatos.length > 0 ? ` · ${fatos.join(' · ')}` : ''}
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
													? { id: projeto.id, nome: projeto.name, cor: projeto.color }
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
													? { id: projeto.id, nome: projeto.name, cor: projeto.color }
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
														? corDe(habito.cor).hex
														: `${corDe(habito.cor).hex}33`,
													color: habito.concluidoHoje
														? 'var(--on-primary)'
														: corDe(habito.cor).hex,
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
								<li key={evento.id}>
									<button
										type="button"
										className="linha"
										style={estiloCor(evento.cor)}
										onClick={() => setEditandoEvento(evento)}
										aria-label={`Editar ${evento.title}`}
									>
										<span
											className="linha__icone"
											style={{
												background: `${corDe(evento.cor).hex}33`,
												color: corDe(evento.cor).hex,
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
									</button>
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
								const cor = corDe(projeto.color, projeto.id)
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
							{pendentes.map((lembrete) => {
								// Vencido = horário já passou e ainda não resolvido. A faixa
								// interna de avisos cobre o disparo; aqui é o destaque visual.
								const vencido = lembrete.dueAt != null && lembrete.dueAt <= Date.now()

								return (
								<li key={lembrete.id} className="linha">
									<button
										type="button"
										role="checkbox"
										aria-checked={false}
										aria-label={`Resolver ${lembrete.text}`}
										className="checkbox"
										onClick={() => escrever(() => toggleReminder(lembrete.id, true))}
									>
										<span className="checkbox__marca" aria-hidden="true">
											<IconeConcluido size={16} />
										</span>
									</button>
									<button
										type="button"
										className="linha__corpo"
										onClick={() => setEditandoLembrete(lembrete)}
										style={{ textAlign: 'left' }}
										aria-label={`Editar ${lembrete.text}`}
									>
										<span className="linha__titulo">{lembrete.text}</span>
										<span className="linha__meta">
											{lembrete.dueAt
												? vencido
													? `Venceu às ${formatarHora(lembrete.dueAt)}`
													: formatarHora(lembrete.dueAt)
												: 'Sem hora'}
										</span>
									</button>
									{vencido ? <span className="etiqueta etiqueta--atraso">Vencido</span> : null}
									{/* Mesmo menu ⋮ dos hábitos: abre uma folha de ações com
									    editar e excluir, em vez de pular direto ao editor. */}
									<button
										type="button"
										className="botao-icone botao-icone--pequeno"
										aria-label={`Ações de ${lembrete.text}`}
										title="Editar ou excluir"
										onClick={() => setAcoesLembrete(lembrete)}
									>
										<IconeMaisVertical size={18} />
									</button>
								</li>
								)
							})}
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
			{/*
			 * Topo do Início: só a marca e as ações, na mesma linha.
			 *
			 * A data saiu daqui. Ela aparecia DUAS vezes: em corpo pequeno sob a
			 * marca e de novo no mês logo abaixo ("Sexta-feira, 13 de novembro"
			 * e "Novembro de 2026"), e ainda empurrava a marca para baixo,
			 * deixando-a mais baixa que os botões ao lado. A data por extenso
			 * continua na Agenda, onde é informação, não decoração.
			 */}
			<header className="topo topo--inicio">
				<div className="topo__linha topo__linha--marca">
					<div className="topo__marca-bloco">
						<MarcaUrdume />
					</div>
					<div className="topo__acoes">
						{/* Atalho do Jarvis: só o ícone. O número de observações saía
						    aqui e virava cobrança na tela inicial; ele passou para
						    dentro das configurações de IA, junto do painel. */}
						<Link
							route={{ name: 'jarvis' }}
							className="botao-icone jarvis-atalho"
							ariaLabel="Jarvis"
							title="Jarvis"
						>
							<IconeRaio size={22} />
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
				<FaixaDesfazer
					texto={`Concluída: ${desfazer.titulo}`}
					onDesfazer={() => {
						escrever(() => toggleTask(desfazer.id, false))
						setDesfazer(null)
						window.clearTimeout(desfazerTimer.current)
					}}
					onFechar={() => {
						setDesfazer(null)
						window.clearTimeout(desfazerTimer.current)
					}}
				/>
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
						onAbrirEvento={setEditandoEvento}
						onAbrirLembrete={setEditandoLembrete}
						onConcluirTarefa={concluir}
						onExcluirTarefa={setExcluindoTarefa}
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

			{/* Excluir a partir do Início. A confirmação e o desfazer vêm do
			    componente único das outras telas — antes este arquivo tinha a
			    própria cópia do desfazer de 4 s e as outras telas não tinham. */}
			<ExcluirComDesfazer
				alvo={excluindoTarefa ? { id: excluindoTarefa.id, titulo: excluindoTarefa.title } : null}
				titulo="Excluir tarefa"
				descricao={(alvo) => (
					<>
						Excluir <strong>{alvo.titulo}</strong>? Ela sai de todas as visões deste aparelho.
					</>
				)}
				onFechar={() => setExcluindoTarefa(null)}
				onExcluir={(alvo) => softDeleteTask(alvo.id)}
				onDesfazer={(alvo) => restaurarTask(alvo.id)}
			/>

			<EditarLembrete
				lembrete={editandoLembrete}
				onFechar={() => setEditandoLembrete(null)}
				onExcluir={(lembrete) => {
					setEditandoLembrete(null)
					setExcluindoLembrete(lembrete)
				}}
			/>

			{/* Ações do lembrete: o mesmo menu do cartão de hábito. Sem isto,
			    editar dependia de acertar o texto e excluir não existia em tela
			    nenhuma (D9) — o lembrete criado com a hora errada era permanente. */}
			<Folha
				titulo={acoesLembrete?.text ?? 'Lembrete'}
				sobre="O que você quer fazer com ele"
				aberta={acoesLembrete !== null}
				onFechar={() => setAcoesLembrete(null)}
			>
				<div className="opcoes-criacao">
					<button
						type="button"
						className="opcao-criacao"
						onClick={() => {
							const alvo = acoesLembrete
							setAcoesLembrete(null)
							if (alvo) setEditandoLembrete(alvo)
						}}
					>
						<span className="opcao-criacao__icone" aria-hidden="true">
							<IconeHorario size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo">Editar lembrete</span>
							<span className="opcao-criacao__descricao">Texto e hora do aviso</span>
						</span>
					</button>

					<button
						type="button"
						className="opcao-criacao"
						onClick={() => {
							const alvo = acoesLembrete
							setAcoesLembrete(null)
							if (alvo) setExcluindoLembrete(alvo)
						}}
					>
						<span
							className="opcao-criacao__icone"
							aria-hidden="true"
							style={{ color: 'var(--error)' }}
						>
							<IconeApagar size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo" style={{ color: 'var(--error)' }}>
								Excluir lembrete
							</span>
							<span className="opcao-criacao__descricao">
								O aviso deixa de aparecer. Dá para desfazer.
							</span>
						</span>
					</button>
				</div>
			</Folha>

			<ExcluirComDesfazer
				alvo={excluindoLembrete ? { id: excluindoLembrete.id, titulo: excluindoLembrete.text } : null}
				titulo="Excluir lembrete"
				descricao={(alvo) => (
					<>
						Excluir <strong>{alvo.titulo}</strong>? O aviso dele deixa de aparecer.
					</>
				)}
				textoDoDesfazer={(alvo) => `Excluído: ${alvo.titulo}`}
				onFechar={() => setExcluindoLembrete(null)}
				onExcluir={(alvo) => softDeleteReminder(alvo.id)}
				onDesfazer={(alvo) => restaurarReminder(alvo.id)}
			/>

			<EditarEvento
				evento={editandoEvento}
				onFechar={() => setEditandoEvento(null)}
				onExcluido={(evento) =>
					desfazerExclusao.anunciar({
						texto: `Excluído: ${evento.title}`,
						restaurar: () => escrever(() => restaurarEvento(evento.id.split('@')[0]!)),
					})
				}
			/>

			{desfazerExclusao.pendente ? (
				<FaixaDesfazer
					texto={desfazerExclusao.pendente.texto}
					onDesfazer={desfazerExclusao.desfazer}
					onFechar={desfazerExclusao.fechar}
				/>
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
		// "Algum dia" é o tipo `ideia` para registros novos; `someday` continua
		// valendo para os antigos, que nunca passaram pelo campo novo.
		return todas
			.filter((t) => !t.deletedAt && !t.done && (tipoDaTarefa(t) === 'ideia' || t.someday))
			.slice(0, 8)
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
