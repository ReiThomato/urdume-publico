import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Task } from '@/db/db'
import {
	createProject,
	softDeleteProject,
	softDeleteTask,
	softDeleteTasks,
	toggleTask,
	updateProject,
} from '@/db/repo'
import { useProjects } from '@/db/repo'
import { chaveDoDia, diaDeHoje } from '@/lib/date'
import { TarefaItem } from '@/ui/TarefaItem'
import { EditarTarefa } from '@/ui/EditarTarefa'
import { Folha } from '@/ui/Folha'
import { useEscrita } from '@/lib/escrita'
import { ConfirmarExclusaoTarefa } from '@/ui/ConfirmarExclusaoTarefa'
import { PALETA, corDoIndice } from '@/ui/paleta'
import {
	IconeAdicionar,
	IconeApagar,
	IconeConcluido,
	IconeEditar,
	IconePasta,
	IconeTarefaFeita,
} from '@/ui/icones'
import { Topo } from '@/ui/AppShell'
import { BarraDeOrdem, FILTRO_VAZIO, filtrar, ordenar } from '@/ui/ordem'
import type { Filtro, Ordem } from '@/ui/ordem'
import { escrever } from '@/lib/falhas'

/**
 * Tarefas — a tela que funciona como o Grit: listas (categorias) em chips no
 * topo, as tarefas abertas da lista selecionada em cartões encostados uns nos
 * outros, e as concluídas separadas embaixo.
 *
 * Sem lista escolhida, mostra "Todas". Nada é obrigatório: uma tarefa sem lista
 * continua existindo e aparece em Todas e em Hoje.
 */

interface Grupo {
	key: string
	nome: string
	cor: number
	tarefas: Task[]
	abertas: number
}

function useTarefasEmAberto(): Task[] | undefined {
	return useLiveQuery(async () => {
		const todas = await db.tasks.toArray()
		return todas.filter((t) => !t.deletedAt)
	}, [])
}

export function Tarefas({
	listaInicial,
	onCriar,
}: {
	listaInicial?: string
	onCriar: (opcoes?: { tipo?: 'tarefa'; dia?: string }) => void
}) {
	const projetos = useProjects()
	const tarefas = useTarefasEmAberto()
	const [listaAtiva, setListaAtiva] = useState<string>(listaInicial ?? 'todas')
	const [editando, setEditando] = useState<Task | null>(null)
	const [ordem, setOrdem] = useState<Ordem>('manual')
	const [filtro, setFiltro] = useState<Filtro>(FILTRO_VAZIO)
	const [criandoLista, setCriandoLista] = useState(false)
	const [nomeLista, setNomeLista] = useState('')
	const [erroLista, setErroLista] = useState<string | null>(null)
	const [corLista, setCorLista] = useState(0)
	const [iconeLista] = useState<string>('pasta')
	const [editandoLista, setEditandoLista] = useState<string | null>(null)
	const [confirmandoLimpar, setConfirmandoLimpar] = useState(false)
	const [excluindoTarefa, setExcluindoTarefa] = useState<Task | null>(null)
	const [desfazer, setDesfazer] = useState<{ id: string; titulo: string } | null>(null)
	// Escritas com aviso de erro: a tela não fecha como se tivesse salvo quando
	// o banco recusa (cota cheia, transação abortada).
	const { executar, erro: erroEscrita } = useEscrita()
	const desfazerTimer = useRef<number | undefined>(undefined)

	const hoje = chaveDoDia(diaDeHoje())

	const grupos = useMemo<Grupo[]>(() => {
		const lista: Grupo[] = [
			{
				key: 'todas',
				nome: 'Todas',
				cor: -1,
				tarefas: tarefas ?? [],
				abertas: (tarefas ?? []).filter((t) => !t.done).length,
			},
		]

		for (const projeto of projetos ?? []) {
			const doProjeto = (tarefas ?? []).filter((t) => t.projectId === projeto.id)
			lista.push({
				key: projeto.id,
				nome: projeto.name,
				cor: Number(projeto.color ?? 0),
				tarefas: doProjeto,
				abertas: doProjeto.filter((t) => !t.done).length,
			})
		}

		const semLista = (tarefas ?? []).filter((t) => !t.projectId)
		if (semLista.length > 0) {
			lista.push({ key: 'sem-lista', nome: 'Sem lista', cor: 11, tarefas: semLista, abertas: semLista.filter((t) => !t.done).length })
		}

		return lista
	}, [projetos, tarefas])

	const grupo = grupos.find((g) => g.key === listaAtiva) ?? grupos[0]!

	// A ordem e o filtro escolhidos valem para a lista visível: `manual` usa a
	// ordem em que as tarefas foram criadas/movidas, sem impor hora.
	const abertas = useMemo(() => {
		const base = filtrar(grupo.tarefas.filter((t) => !t.done), filtro, hoje)
		return ordenar(base, ordem)
	}, [grupo, filtro, ordem, hoje])

	const escondidas = grupo.tarefas.filter((t) => !t.done).length - abertas.length

	const concluidas = useMemo(
		() => grupo.tarefas.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
		[grupo],
	)

	const atrasadas = abertas.filter((t) => t.dueDate && t.dueDate < hoje).length

	function concluir(id: string, titulo: string): void {
		escrever(() => toggleTask(id, true))
		setDesfazer({ id, titulo })
		window.clearTimeout(desfazerTimer.current)
		desfazerTimer.current = window.setTimeout(() => setDesfazer(null), 4000)
	}

	async function salvarLista(): Promise<void> {
		const nome = nomeLista.trim()
		if (!nome) return
		const existente = (projetos ?? []).find((p) => p.name.toLowerCase() === nome.toLowerCase())
		if (existente) {
			setErroLista('Já existe uma lista com esse nome.')
			return
		}
		const criado = await createProject({ name: nome })
		await updateProject(criado.id, {
			color: String(corLista),
			icone: iconeLista,
		})
		setNomeLista('')
		setCriandoLista(false)
	}

	const nomesDeProjeto = new Map((projetos ?? []).map((p) => [p.id, p]))

	return (
		<div className="tela">
			<Topo
				titulo="Tarefas"
				sobre={
					tarefas === undefined
						? 'Carregando…'
						: `${(tarefas ?? []).filter((t) => t.done).length} concluídas · ${atrasadas} atrasadas`
				}
				acoes={
					<>
						<button
							type="button"
							className="botao-icone"
							aria-label="Nova lista"
							onClick={() => setCriandoLista(true)}
						>
							<IconePasta size={22} />
						</button>
					</>
				}
			/>

			<div className="chips" role="tablist" aria-label="Listas">
				{grupos.map((item) => (
					<button
						key={item.key}
						type="button"
						role="tab"
						aria-selected={item.key === grupo.key}
						className="chip"
						aria-pressed={item.key === grupo.key}
						onClick={() => setListaAtiva(item.key)}
					>
						{item.cor >= 0 ? (
							<span
								className="chip__ponto"
								style={{ background: corDoIndice(item.cor).hex }}
								aria-hidden="true"
							/>
						) : null}
						{item.nome}
						<span aria-hidden="true" style={{ opacity: 0.6, fontWeight: 600 }}>
							{item.abertas}
						</span>
					</button>
				))}
				<button type="button" className="chip chip--acao" onClick={() => setCriandoLista(true)}>
					<IconeAdicionar size={18} />
					Lista
				</button>
			</div>

			<div className="conteudo" style={{ paddingTop: 'var(--s-3)' }}>
				{grupo.key !== 'todas' && grupo.key !== 'sem-lista' ? (
					<div className="secao">
						<div className="secao-cabecalho">
							<span className="secao-titulo__contagem">
								{grupo.abertas} {grupo.abertas === 1 ? 'tarefa aberta' : 'tarefas abertas'}
							</span>
							<button
								type="button"
								className="secao-acao"
								onClick={() => setEditandoLista(grupo.key)}
							>
								<IconeEditar size={17} />
								Editar lista
							</button>
						</div>
					</div>
				) : null}

				<section className="secao" aria-label={`Tarefas de ${grupo.nome}`}>
					{grupo.abertas > 0 ? (
						<BarraDeOrdem
							ordem={ordem}
							onOrdem={setOrdem}
							filtro={filtro}
							onFiltro={setFiltro}
							etiquetas={[...new Set((tarefas ?? []).flatMap((t) => t.tags ?? []))].sort()}
							projetos={(projetos ?? []).map((p) => ({ id: p.id, name: p.name }))}
						/>
					) : null}
					{tarefas === undefined ? (
						<div className="cartao esqueleto" aria-hidden="true">
							{[0, 1, 2].map((i) => (
								<div key={i} className="esqueleto__linha">
									<span className="esqueleto__titulo" />
									<span className="esqueleto__meta" />
								</div>
							))}
						</div>
					) : abertas.length === 0 ? (
						<div className="cartao cartao--vazio">
							<span className="vazio__icone" aria-hidden="true">
								<IconeTarefaFeita size={30} />
							</span>
							<p>
								{concluidas.length > 0
									? 'Tudo feito por aqui. Nada aberto nesta lista.'
									: 'Nenhuma tarefa nesta lista ainda.'}
							</p>
							<button type="button" className="botao botao--primario" onClick={() => onCriar()}>
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
										mostrarData={grupo.key === 'todas'}
										atrasada={Boolean(tarefa.dueDate && tarefa.dueDate < hoje)}
										onConcluir={concluir}
										onEditar={setEditando}
										onExcluir={setExcluindoTarefa}
									/>
								)
							})}
						</ul>
						{escondidas > 0 ? (
							<p className="nota" style={{ padding: '8px 4px' }}>
								{escondidas} {escondidas === 1 ? 'tarefa escondida' : 'tarefas escondidas'} pelo filtro.
							</p>
						) : null}
						</>
					)}
				</section>

				{concluidas.length > 0 ? (
					<section className="secao" aria-label="Concluídas">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeConcluido size={18} />
								</span>
								Concluídas
								<span className="secao-titulo__contagem">{concluidas.length}</span>
							</h2>
							<button
								type="button"
								className="secao-acao"
								onClick={() => setConfirmandoLimpar(true)}
							>
								<IconeApagar size={16} />
								Limpar
							</button>
						</div>
							<ul className="linha-grupo">
							{concluidas.slice(0, 12).map((tarefa) => (
								<TarefaItem
									key={tarefa.id}
									tarefa={tarefa}
									mostrarData
									onEditar={setEditando}
									onExcluir={setExcluindoTarefa}
								/>
							))}
						</ul>
					</section>
				) : null}

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
			</div>


			<Folha titulo="Nova lista" aberta={criandoLista} onFechar={() => setCriandoLista(false)}>
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						void salvarLista()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="lista-nome">
							Nome
						</label>
						<input
							id="lista-nome"
							data-foco-inicial
							className="campo"
							value={nomeLista}
							onChange={(evento) => {
								setNomeLista(evento.target.value)
								setErroLista(null)
							}}
							placeholder="Ex.: Trabalho, Casa, Faculdade"
							maxLength={60}
						/>
						{erroLista ? <p className="nota" style={{ color: 'var(--error)' }}>{erroLista}</p> : null}
					</div>

					<div>
						<span className="campo-rotulo">Cor</span>
						<div className="amostra-cores" role="group" aria-label="Cor da lista">
							{PALETA.map((cor) => (
								<button
									key={cor.indice}
									type="button"
									className="amostra-cor"
									style={{ background: cor.hex }}
									aria-label={cor.rotulo}
									aria-pressed={corLista === cor.indice}
									onClick={() => setCorLista(cor.indice)}
								/>
							))}
						</div>
					</div>

					<div className="formulario__acoes">
						<button type="submit" className="botao botao--primario" disabled={!nomeLista.trim()}>
							Criar lista
						</button>
					</div>
				</form>
			</Folha>

			{criandoLista ? null : null}

			{erroEscrita ? (
				<p className="aviso aviso--erro" role="alert" style={{ margin: '0 var(--s-4) var(--s-3)' }}>
					{erroEscrita}
				</p>
			) : null}

			<Folha titulo="Limpar concluídas" aberta={confirmandoLimpar} onFechar={() => setConfirmandoLimpar(false)}>
				<div className="formulario">
					<p className="nota">
						As {concluidas.length} concluídas desta lista serão removidas. Esta ação não tem desfazer.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmandoLimpar(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() =>
								void executar(async () => {
									// Uma escrita só (antes: uma transação por tarefa).
									await softDeleteTasks(concluidas.map((t) => t.id))
									setConfirmandoLimpar(false)
								}, 'Não foi possível limpar as concluídas.')
							}
						>
							Limpar
						</button>
					</div>
				</div>
			</Folha>

			<EditarTarefa
				tarefa={editando}
				aberta={editando !== null}
				onFechar={() => setEditando(null)}
				projetos={(projetos ?? []).map((p) => ({ id: p.id, name: p.name }))}
				etiquetasConhecidas={[...new Set((tarefas ?? []).flatMap((t) => t.tags ?? []))].sort()}
			/>

			{/* Exclusão a partir do atalho da linha. Antes o único caminho era
			    abrir a tarefa e descer até "Excluir". Com confirmação porque a
			    lista não tem desfazer para exclusão (só para conclusão). */}
			<ConfirmarExclusaoTarefa
				tarefa={excluindoTarefa}
				onFechar={() => setExcluindoTarefa(null)}
				onExcluir={async (alvo) => {
					await softDeleteTask(alvo.id)
					setExcluindoTarefa(null)
				}}
			/>

			{editandoLista ? (
				<EditarLista
					id={editandoLista}
					nomeInicial={nomesDeProjeto.get(editandoLista)?.name ?? ''}
					corInicial={Number(nomesDeProjeto.get(editandoLista)?.color ?? 0)}
					onFechar={() => setEditandoLista(null)}
				/>
			) : null}
		</div>
	)
}

/** Editar nome, cor e existência de uma lista. */
function EditarLista({
	id,
	nomeInicial,
	corInicial,
	onFechar,
}: {
	id: string
	nomeInicial: string
	corInicial: number
	onFechar: () => void
}) {
	const [nome, setNome] = useState(nomeInicial)
	const [cor, setCor] = useState(corInicial)
	const [confirmando, setConfirmando] = useState(false)

	return (
		<Folha
			titulo="Editar lista"
			aberta
			onFechar={onFechar}
			passo={confirmando ? 'excluir' : 'editar'}
		>
			{confirmando ? (
				<div className="formulario">
					<p className="nota">
						Excluir <strong>{nomeInicial}</strong> também remove as tarefas e páginas que estão nela.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmando(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								void softDeleteProject(id)
								onFechar()
							}}
						>
							Excluir
						</button>
					</div>
				</div>
			) : (
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						if (!nome.trim()) return
						void updateProject(id, { name: nome.trim(), color: String(cor) })
						onFechar()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="lista-ed-nome">
							Nome
						</label>
						<input
							id="lista-ed-nome"
							data-foco-inicial
							className="campo"
							value={nome}
							onChange={(evento) => setNome(evento.target.value)}
							maxLength={60}
						/>
					</div>

					<div>
						<span className="campo-rotulo">Cor</span>
						<div className="amostra-cores" role="group" aria-label="Cor da lista">
							{PALETA.map((item) => (
								<button
									key={item.indice}
									type="button"
									className="amostra-cor"
									style={{ background: item.hex }}
									aria-label={item.rotulo}
									aria-pressed={cor === item.indice}
									onClick={() => setCor(item.indice)}
								/>
							))}
						</div>
					</div>

					<div className="formulario__acoes" style={{ justifyContent: 'space-between' }}>
						<button type="button" className="botao botao--perigo" onClick={() => setConfirmando(true)}>
							<IconeApagar size={18} />
							Excluir
						</button>
						<button type="submit" className="botao botao--primario">
							Salvar
						</button>
					</div>
				</form>
			)}
		</Folha>
	)
}
