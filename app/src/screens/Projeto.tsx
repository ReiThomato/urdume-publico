import { useEffect, useMemo, useState } from 'react'
import { Link, useRouter } from '@/app/router'
import type { Marco, Project, Task } from '@/db/db'
import {
	addMarco,
	createTask,
	editMarco,
	removeMarco as removeMarcoPorId,
	softDeleteProject,
	softDeleteTask,
	toggleMarco,
	updateProject,
	useProject,
	useTasksByProject,
} from '@/db/repo'
import { Folha } from '@/ui/Folha'
import { SecaoDeAnotacoes } from '@/ui/AnotacoesDoProjeto'
import { ConfirmarExclusaoTarefa } from '@/ui/ConfirmarExclusaoTarefa'
import { chaveDoDia, diaDeHoje } from '@/lib/date'
import { ordenarMarcos, textoDaData } from '@/lib/projetos'
import { Topo } from '@/ui/AppShell'
import { TarefaItem } from '@/ui/TarefaItem'
import { EditarTarefa } from '@/ui/EditarTarefa'
import { estiloCor } from '@/ui/cores'
import {
	IconeAdicionar,
	IconeApagar,
	IconeBandeira,
	IconeCalendario,
	IconeConcluir,
	IconeConcluido,
	IconeDescricao,
	IconeEditar,
	IconeExpandir,
	IconePasta,
	IconeRaio,
} from '@/ui/icones'
import { corDoIndice } from '@/ui/paleta'

/**
 * Um projeto por dentro: o painel de trabalho, não uma lista com outro nome.
 *
 * A tela responde, de cima para baixo, às perguntas de quem gerencia:
 * — em que pé está? (barra compacta: progresso, atrasos, urgentes)
 * — qual é a próxima entrega? (marcos)
 * — o que falta fazer? (tarefas)
 * — o que foi decidido/escrito? (notas)
 * — onde está o material? (páginas)
 *
 * O contador gigante que só repetia "N tarefas abertas" saiu: era o elemento
 * mais pesado da tela e não dizia nada que a lista já não dissesse. No lugar
 * dele, uma faixa de indicadores do tamanho de uma linha.
 */
export function ProjetoRota({ id }: { id: string }) {
	const { navigate } = useRouter()
	// `useProject` observa o banco: criar, concluir, editar ou remover um marco
	// aparece na hora, sem sair e voltar para a tela.
	const projeto = useProject(id)
	const tarefas = useTasksByProject(id)

	const [novaTarefa, setNovaTarefa] = useState('')
	const [novoMarco, setNovoMarco] = useState('')
	const [dataMarco, setDataMarco] = useState('')
	const [criandoTarefa, setCriandoTarefa] = useState(false)
	const [criandoMarco, setCriandoMarco] = useState(false)
	const [editando, setEditando] = useState<Task | null>(null)
	const [excluindoTarefa, setExcluindoTarefa] = useState<Task | null>(null)
	const [excluindo, setExcluindo] = useState(false)
	const [editandoProjeto, setEditandoProjeto] = useState(false)
	const [editandoMarco, setEditandoMarco] = useState<Marco | null>(null)
	const [notas, setNotas] = useState('')
	const [notasSalvas, setNotasSalvas] = useState(false)

	useEffect(() => {
		setNotas(projeto?.notas ?? '')
	}, [projeto?.id, projeto?.notas])

	const abertas = useMemo(() => (tarefas ?? []).filter((t) => !t.done), [tarefas])
	const concluidas = useMemo(() => (tarefas ?? []).filter((t) => t.done), [tarefas])
	const marcos = useMemo(() => ordenarMarcos(projeto?.marcos ?? []), [projeto?.marcos])

	if (projeto === undefined) {
		return (
			<div className="tela">
				<Topo titulo="Projeto" sobre="Abrindo…" />
			</div>
		)
	}

	if (projeto === null) {
		return (
			<div className="tela">
				<Topo titulo="Projeto" sobre="Não encontrado" />
				<div className="secao" style={{ paddingTop: 'var(--s-6)' }}>
					<div className="cartao cartao--vazio">
						<p>Este projeto não existe ou foi excluído.</p>
						<Link route={{ name: 'projetos' }} className="botao">
							Voltar para projetos
						</Link>
					</div>
				</div>
			</div>
		)
	}

	const cor = corDoIndice(Number(projeto.color ?? 0))
	const total = (tarefas ?? []).length
	const progresso = total === 0 ? 0 : Math.round((concluidas.length / total) * 100)
	const hoje = chaveDoDia(diaDeHoje())
	const atrasadas = abertas.filter((t) => (t.dueDate && t.dueDate < hoje) || (t.deadline && t.deadline < hoje)).length
	const urgentes = abertas.filter((t) => (t.priority ?? 0) >= 2).length
	const marcosFeitos = marcos.filter((m) => m.feito).length

	async function salvarTarefa(): Promise<void> {
		const texto = novaTarefa.trim()
		if (!texto) return
		await createTask({ title: texto, projectId: id, dueDate: hoje })
		setNovaTarefa('')
		setCriandoTarefa(false)
	}

	async function adicionarMarco(): Promise<void> {
		const titulo = novoMarco.trim()
		if (!titulo) return
		await addMarco(id, { titulo, data: dataMarco || null })
		setNovoMarco('')
		setDataMarco('')
		setCriandoMarco(false)
	}

	async function alternarMarco(marco: Marco): Promise<void> {
		await toggleMarco(id, marco.id)
	}

	async function removerMarco(marco: Marco): Promise<void> {
		await removeMarcoPorId(id, marco.id)
	}

	async function salvarNotas(): Promise<void> {
		await updateProject(id, { notas: notas.trim() || null })
		setNotasSalvas(true)
		window.setTimeout(() => setNotasSalvas(false), 2000)
	}

	return (
		<div className="tela" style={estiloCor(Number(projeto.color ?? 0))}>
			<Topo
				titulo={projeto.name}
				sobre={projeto.etapa ?? (projeto.archived ? 'Projeto arquivado' : 'Projeto')}
				antes={
					<Link route={{ name: 'projetos' }} className="botao-icone" ariaLabel="Voltar">
						<IconeExpandir size={22} style={{ transform: 'rotate(90deg)' }} />
					</Link>
				}
				acoes={
					<>
						<button
							type="button"
							className="botao-icone"
							aria-label="Editar projeto"
							onClick={() => setEditandoProjeto(true)}
						>
							<IconeEditar size={22} />
						</button>
						<button
							type="button"
							className="botao-icone"
							aria-label="Excluir projeto"
							onClick={() => setExcluindo(true)}
						>
							<IconeApagar size={22} />
						</button>
					</>
				}
			/>

			<div className="conteudo">
				{/* ------------------------------------------------ painel resumido */}
				<div className="secao">
					<div className="painel-projeto">
						<div className="painel-projeto__topo">
							<span
								className="painel-projeto__marca"
								style={{ color: cor.hex }}
								aria-hidden="true"
							>
								<IconePasta size={18} />
							</span>
							<div className="painel-projeto__barra" aria-hidden="true">
								<span style={{ width: `${progresso}%`, background: cor.hex }} />
							</div>
							<span className="painel-projeto__pct tabular">{progresso}%</span>
						</div>

						{projeto.descricao ? (
							<p className="painel-projeto__descricao">{projeto.descricao}</p>
						) : null}

						{/* Indicadores numa linha só: o que a lista de tarefas não conta
						    de relance — atraso, urgência, marcos, prazo. */}
						<div className="painel-projeto__indicadores">
							<span className="indicador">
								<span className="indicador__valor tabular">{abertas.length}</span>
								<span className="indicador__rotulo">abertas</span>
							</span>
							<span className="indicador">
								<span className="indicador__valor tabular">{concluidas.length}</span>
								<span className="indicador__rotulo">feitas</span>
							</span>
							{atrasadas > 0 ? (
								<span className="indicador indicador--erro">
									<span className="indicador__valor tabular">{atrasadas}</span>
									<span className="indicador__rotulo">atrasadas</span>
								</span>
							) : null}
							{urgentes > 0 ? (
								<span className="indicador indicador--alerta">
									<span className="indicador__valor tabular">{urgentes}</span>
									<span className="indicador__rotulo">urgentes</span>
								</span>
							) : null}
							{marcos.length > 0 ? (
								<span className="indicador">
									<span className="indicador__valor tabular">
										{marcosFeitos}/{marcos.length}
									</span>
									<span className="indicador__rotulo">marcos</span>
								</span>
							) : null}
							{projeto.prazo ? (
								<span className="indicador indicador--prazo">
									<IconeCalendario size={14} />
									<span className="indicador__rotulo">{textoDaData(projeto.prazo)}</span>
								</span>
							) : null}
						</div>
					</div>
				</div>

				{/* ------------------------------------------------------- marcos */}
				<section className="secao" aria-labelledby="secao-marcos">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-marcos">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeBandeira size={17} />
							</span>
							Marcos
							{marcos.length > 0 ? (
								<span className="secao-titulo__contagem">
									{marcosFeitos}/{marcos.length}
								</span>
							) : null}
						</h2>
						<button
							type="button"
							className="secao-acao"
							aria-expanded={criandoMarco}
							onClick={() => setCriandoMarco((aberto) => !aberto)}
						>
							<IconeAdicionar size={18} />
							Adicionar
						</button>
					</div>

					{marcos.length === 0 ? (
						<button type="button" className="marco-vazio" onClick={() => setCriandoMarco(true)}>
							<IconeBandeira size={18} />
							Um marco divide o projeto em entregas com data. Toque para criar o primeiro.
						</button>
					) : (
						<ul className="linha-grupo">
							{marcos.map((marco) => (
								<li
									key={marco.id}
									className={marco.feito ? 'marco marco--feito' : 'marco'}
								>
									<button
										type="button"
										role="checkbox"
										aria-checked={marco.feito}
										aria-label={
											marco.feito ? `Reabrir marco ${marco.titulo}` : `Concluir marco ${marco.titulo}`
										}
										className="checkbox box-checkbox"
										onClick={() => void alternarMarco(marco)}
									>
										<span className="checkbox__marca" aria-hidden="true">
											<IconeConcluir size={16} />
										</span>
									</button>
									<span className="marco__texto">
										<span className="marco__titulo">{marco.titulo}</span>
										{marco.data ? (
											<span className="marco__data">{textoDaData(marco.data)}</span>
										) : null}
									</span>
									<button
										type="button"
										className="botao-icone botao-icone--pequeno"
										aria-label={`Editar marco ${marco.titulo}`}
										onClick={() => setEditandoMarco(marco)}
									>
										<IconeEditar size={17} />
									</button>
									<button
										type="button"
										className="botao-icone botao-icone--pequeno"
										aria-label={`Remover marco ${marco.titulo}`}
										onClick={() => void removerMarco(marco)}
									>
										<IconeApagar size={17} />
									</button>
								</li>
							))}
						</ul>
					)}
				</section>

				<EditarMarco
					projetoId={id}
					marco={editandoMarco}
					onFechar={() => setEditandoMarco(null)}
				/>

				{/* -------------------------------------------------------- tarefas */}
				<section className="secao" aria-labelledby="secao-tarefas-lista">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-tarefas-lista">
							Tarefas
							<span className="secao-titulo__contagem">
								{concluidas.length}/{total}
							</span>
						</h2>
						<button
							type="button"
							className="secao-acao"
							aria-expanded={criandoTarefa}
							onClick={() => setCriandoTarefa((aberto) => !aberto)}
						>
							<IconeAdicionar size={18} />
							Adicionar
						</button>
					</div>

					{tarefas === undefined ? (
						<div className="cartao esqueleto" aria-hidden="true">
							<div className="esqueleto__linha">
								<span className="esqueleto__titulo" />
								<span className="esqueleto__meta" />
							</div>
						</div>
					) : abertas.length === 0 && concluidas.length === 0 ? (
						<div className="cartao cartao--vazio">
							<p>Nenhuma tarefa neste projeto.</p>
							<button type="button" className="botao botao--primario" onClick={() => setCriandoTarefa(true)}>
								<IconeAdicionar size={20} />
								Criar tarefa
							</button>
						</div>
					) : (
						<ul className="linha-grupo">
							{[...abertas, ...concluidas].map((tarefa) => (
								<TarefaItem
									key={tarefa.id}
									tarefa={tarefa}
									mostrarData
									onEditar={setEditando}
									onExcluir={setExcluindoTarefa}
								/>
							))}
						</ul>
					)}
				</section>

				{/* ------------------------------------------------------ anotações */}
				<SecaoDeAnotacoes projectId={id} />

				{/* --------------------------------------------------------- resumo */}
				<section className="secao" aria-labelledby="secao-notas">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-notas">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeDescricao size={17} />
							</span>
							Resumo do projeto
						</h2>
						{/* Salvar fica no cabeçalho, ao lado do título. Antes era uma
						    linha própria abaixo da caixa: os 40 px do botão empurravam
						    o quadro de páginas para longe das notas. */}
						{notasSalvas ? (
							<span className="secao-acao" role="status" aria-live="polite">
								<IconeConcluido size={16} />
								Salvo
							</span>
						) : null}
						<button type="button" className="secao-acao" onClick={() => void salvarNotas()}>
							Salvar
						</button>
					</div>

					<textarea
						className="campo campo--area"
						value={notas}
						onChange={(evento) => setNotas(evento.target.value)}
						onBlur={() => void salvarNotas()}
						placeholder="O briefing: o que este projeto entrega, para quem, e o que não pode esquecer."
						rows={3}
						maxLength={4000}
						aria-label="Resumo do projeto"
					/>
					<p className="nota">
						Um parágrafo de contexto que sempre aparece aqui. Para anotar o dia a dia, use
						as anotações acima — elas guardam data e hora.
					</p>
				</section>

							</div>

			<EditarTarefa
				tarefa={editando}
				aberta={editando !== null}
				onFechar={() => setEditando(null)}
				projetos={[{ id: projeto.id, name: projeto.name }]}
				etiquetasConhecidas={[...new Set((tarefas ?? []).flatMap((t) => t.tags ?? []))].sort()}
			/>

			<ConfirmarExclusaoTarefa
				tarefa={excluindoTarefa}
				onFechar={() => setExcluindoTarefa(null)}
				onExcluir={async (alvo) => {
					await softDeleteTask(alvo.id)
					setExcluindoTarefa(null)
				}}
			/>

			{/* Criação em FOLHA, não em formulário inline.
			    Antes o "Adicionar" abria um campo colado na lista, sem fundo
			    próprio e sem separação — e tocar de novo no botão não fechava.
			    Agora usa a mesma folha (com arrasto para baixo) dos outros
			    formulários do app. */}
			<Folha
				titulo="Novo marco"
				aberta={criandoMarco}
				onFechar={() => setCriandoMarco(false)}
			>
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						void adicionarMarco()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="marco-nome">
							Nome do marco
						</label>
						<input
							id="marco-nome"
							data-foco-inicial
							className="campo"
							value={novoMarco}
							onChange={(evento) => setNovoMarco(evento.target.value)}
							placeholder="Ex.: Layout aprovado pelo cliente"
							maxLength={120}
						/>
					</div>
					<div>
						<label className="campo-rotulo" htmlFor="marco-data">
							Data
						</label>
						<input
							id="marco-data"
							type="date"
							className="campo"
							value={dataMarco}
							onChange={(evento) => setDataMarco(evento.target.value)}
						/>
						<p className="nota">Opcional. Deixe em branco para um marco sem data.</p>
					</div>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setCriandoMarco(false)}>
							Cancelar
						</button>
						<button type="submit" className="botao botao--primario" disabled={!novoMarco.trim()}>
							Criar
						</button>
					</div>
				</form>
			</Folha>

			<Folha
				titulo="Nova tarefa"
				sobre="Adicionada a este projeto, para hoje"
				aberta={criandoTarefa}
				onFechar={() => setCriandoTarefa(false)}
			>
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						void salvarTarefa()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="projeto-tarefa-nome">
							Título
						</label>
						<input
							id="projeto-tarefa-nome"
							data-foco-inicial
							className="campo"
							value={novaTarefa}
							onChange={(evento) => setNovaTarefa(evento.target.value)}
							placeholder="O que precisa ser feito?"
							maxLength={280}
						/>
					</div>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setCriandoTarefa(false)}>
							Cancelar
						</button>
						<button type="submit" className="botao botao--primario" disabled={!novaTarefa.trim()}>
							Criar
						</button>
					</div>
				</form>
			</Folha>


			<EditarProjeto
				projeto={projeto}
				aberto={editandoProjeto}
				onFechar={() => setEditandoProjeto(false)}
			/>

			<Folha titulo="Excluir projeto" aberta={excluindo} onFechar={() => setExcluindo(false)}>
				<div className="formulario">
					<p className="nota">
						Excluir <strong>{projeto.name}</strong> remove as tarefas, as páginas e os eventos que estão
						nela. Não dá para desfazer.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setExcluindo(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								void softDeleteProject(projeto.id)
								navigate({ name: 'projetos' })
							}}
						>
							<IconeApagar size={18} />
							Excluir projeto
						</button>
					</div>
				</div>
			</Folha>
		</div>
	)
}

/**
 * Editar um marco: título e data.
 *
 * A criação já existia; faltava corrigir depois. Sem edição, o único conserto
 * para um nome errado ou uma data que mudou era apagar e criar de novo — o que
 * perde o histórico de quando ele foi concluído.
 */
function EditarMarco({
	projetoId,
	marco,
	onFechar,
}: {
	projetoId: string
	marco: Marco | null
	onFechar: () => void
}) {
	const [titulo, setTitulo] = useState('')
	const [data, setData] = useState('')

	useEffect(() => {
		if (!marco) return
		setTitulo(marco.titulo)
		setData(marco.data ?? '')
	}, [marco])

	return (
		<Folha titulo="Editar marco" aberta={marco !== null} onFechar={onFechar}>
			<form
				className="formulario"
				onSubmit={(evento) => {
					evento.preventDefault()
					if (!marco || !titulo.trim()) return
					void editMarco(projetoId, marco.id, { titulo, data: data || null })
					onFechar()
				}}
			>
				<div>
					<label className="campo-rotulo" htmlFor="marco-ed-nome">
						Nome do marco
					</label>
					<input
						id="marco-ed-nome"
						data-foco-inicial
						className="campo"
						value={titulo}
						onChange={(evento) => setTitulo(evento.target.value)}
						maxLength={120}
					/>
				</div>

				<div>
					<label className="campo-rotulo" htmlFor="marco-ed-data">
						Data
					</label>
					<input
						id="marco-ed-data"
						type="date"
						className="campo"
						value={data}
						onChange={(evento) => setData(evento.target.value)}
					/>
					<p className="nota">Opcional. Deixe em branco para um marco sem data.</p>
				</div>

				<div className="formulario__acoes">
					<button type="button" className="botao" onClick={onFechar}>
						Cancelar
					</button>
					<button type="submit" className="botao botao--primario" disabled={!titulo.trim()}>
						Salvar
					</button>
				</div>
			</form>
		</Folha>
	)
}

/** Edição do projeto: nome, entrega, prazo, etapa, estado e cor. */
function EditarProjeto({
	projeto,
	aberto,
	onFechar,
}: {
	projeto: Project
	aberto: boolean
	onFechar: () => void
}) {
	const [nome, setNome] = useState(projeto.name)
	const [descricao, setDescricao] = useState(projeto.descricao ?? '')
	const [prazo, setPrazo] = useState(projeto.prazo ?? '')
	const [etapa, setEtapa] = useState(projeto.etapa ?? '')
	const [status, setStatus] = useState<NonNullable<Project['status']>>(projeto.status ?? 'ativo')

	useEffect(() => {
		if (!aberto) return
		setNome(projeto.name)
		setDescricao(projeto.descricao ?? '')
		setPrazo(projeto.prazo ?? '')
		setEtapa(projeto.etapa ?? '')
		setStatus(projeto.status ?? 'ativo')
	}, [aberto, projeto])

	return (
		<Folha titulo="Editar projeto" aberta={aberto} onFechar={onFechar}>
			<form
				className="formulario"
				onSubmit={(evento) => {
					evento.preventDefault()
					if (!nome.trim()) return
					void updateProject(projeto.id, {
						name: nome.trim(),
						descricao: descricao.trim() || null,
						prazo: prazo || null,
						etapa: etapa.trim() || null,
						status,
					})
					onFechar()
				}}
			>
				<div>
					<label className="campo-rotulo" htmlFor="projeto-ed-nome">
						Nome
					</label>
					<input
						id="projeto-ed-nome"
						data-foco-inicial
						className="campo"
						value={nome}
						onChange={(evento) => setNome(evento.target.value)}
						maxLength={80}
					/>
				</div>

				<div>
					<label className="campo-rotulo" htmlFor="projeto-ed-desc">
						O que este projeto entrega
					</label>
					<textarea
						id="projeto-ed-desc"
						className="campo campo--area"
						value={descricao}
						onChange={(evento) => setDescricao(evento.target.value)}
						rows={2}
						maxLength={200}
					/>
				</div>

				<div>
					<label className="campo-rotulo" htmlFor="projeto-ed-prazo">
						Prazo
					</label>
					<input
						id="projeto-ed-prazo"
						type="date"
						className="campo"
						value={prazo}
						onChange={(evento) => setPrazo(evento.target.value)}
					/>
				</div>

				<div>
					<label className="campo-rotulo" htmlFor="projeto-ed-etapa">
						Etapa atual
					</label>
					<input
						id="projeto-ed-etapa"
						className="campo"
						value={etapa}
						onChange={(evento) => setEtapa(evento.target.value)}
						placeholder="Ex.: Aguardando aprovação"
						maxLength={60}
					/>
				</div>

				<div>
					<span className="campo-rotulo">Estado</span>
					<div className="segmentado" role="group" aria-label="Estado do projeto">
						{([
							{ v: 'ativo', r: 'Ativo' },
							{ v: 'pausado', r: 'Pausado' },
							{ v: 'concluido', r: 'Concluído' },
						] as const).map((op) => (
							<button
								key={op.v}
								type="button"
								className="segmentado__item"
								aria-pressed={status === op.v}
								onClick={() => setStatus(op.v)}
							>
								{op.v === 'concluido' ? <IconeRaio size={14} /> : null}
								{op.r}
							</button>
						))}
					</div>
				</div>

				<div className="formulario__acoes">
					<button type="button" className="botao" onClick={onFechar}>
						Cancelar
					</button>
					<button type="submit" className="botao botao--primario" disabled={!nome.trim()}>
						Salvar
					</button>
				</div>
			</form>
		</Folha>
	)
}
