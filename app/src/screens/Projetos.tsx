import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Priority, Project, Task } from '@/db/db'
import { createProject, softDeleteProject, updateProject, useProjects } from '@/db/repo'
import { useCategorias } from '@/db/repo'
import { ordenarResumos, ROTULO_DA_ORDEM } from '@/lib/projetos'
import type { OrdemDeProjetos } from '@/lib/projetos'
import { Link } from '@/app/router'
import { Folha } from '@/ui/Folha'
import { Topo } from '@/ui/AppShell'
import { PALETA, corDoIndice } from '@/ui/paleta'
import {
	ROTULO_DA_FAIXA,
	faixaDoProjeto,
	resumirProjeto,
	textoDaData,
	textoDoPrazo,
	type FaixaDeProjeto,
	type ResumoDoProjeto,
} from '@/lib/projetos'
import { IconeAdicionar, IconeBandeira, IconeEditar, IconePasta } from '@/ui/icones'

/**
 * Projetos — a central de gerenciamento.
 *
 * Antes esta ideia existia como "listas": um chip no topo de Tarefas, sem
 * prazo, sem andamento e sem visão geral. Aqui cada projeto mostra o que
 * entrega, quanto falta, o prazo e o próximo passo — e a lista continua
 * funcionando como lista quando não tem nada disso.
 *
 * A tela é ordenada por urgência, não por ordem manual: quem abre a central
 * quer saber o que está atrasado antes de saber o que veio primeiro.
 */

const ORDEM_DAS_FAIXAS: FaixaDeProjeto[] = ['atrasados', 'semana', 'depois', 'sem-prazo', 'concluidos']

/**
 * Estado do projeto como selo.
 *
 * Era visível só dentro do projeto, na folha de edição. Na central, um projeto
 * pausado parecia igual a um ativo — e "concluído" era o único que se
 * distinguia, porque caía noutra faixa. Agora cada cartão diz em que pé está,
 * com cor e palavra (a cor sozinha não serve para quem não distingue matizes).
 */
const ESTADOS: Record<NonNullable<Project['status']>, { rotulo: string; classe: string }> = {
	ativo: { rotulo: 'Ativo', classe: 'selo--ativo' },
	pausado: { rotulo: 'Pausado', classe: 'selo--pausado' },
	concluido: { rotulo: 'Concluído', classe: 'selo--concluido' },
}

function useTodasAsTarefas(): Task[] | undefined {
	return useLiveQuery(async () => {
		const todas = await db.tasks.toArray()
		return todas.filter((t) => !t.deletedAt)
	}, [])
}

function CartaoDeProjeto({
	resumo,
	onEditar,
}: {
	resumo: ResumoDoProjeto
	onEditar: (projeto: Project) => void
}) {
	const { projeto } = resumo
	const cor = corDoIndice(Number(projeto.color ?? 0)).hex
	const prazo = textoDoPrazo(resumo)
	const estado = ESTADOS[projeto.status ?? 'ativo']

	return (
		<div className="projeto-cartao">
			{/* O cartão em si é um link; o lápis é um botão fora dele, para não
			    aninhar botão dentro de âncora (o toque no lápis abriria o projeto). */}
			<div className="projeto-cartao__topo">
				<span className="projeto-cartao__marca" style={{ background: cor }} aria-hidden="true" />
				<Link route={{ name: 'projeto', id: projeto.id }} className="projeto-cartao__titulo-area">
					<h2 className="projeto-cartao__titulo">{projeto.name}</h2>
					{projeto.etapa ? <p className="projeto-cartao__etapa">{projeto.etapa}</p> : null}
				</Link>
				<span className={`selo ${estado.classe}`}>{estado.rotulo}</span>
				<button
					type="button"
					className="botao-icone botao-icone--pequeno"
					aria-label={`Editar ${projeto.name}`}
					title="Editar projeto"
					onClick={() => onEditar(projeto)}
				>
					<IconeEditar size={17} />
				</button>
			</div>

			{projeto.descricao ? <p className="projeto-cartao__descricao">{projeto.descricao}</p> : null}

			<Link route={{ name: 'projeto', id: projeto.id }} className="projeto-cartao__corpo">
				<div className="projeto-cartao__barra" aria-hidden="true">
					<span style={{ width: `${resumo.progresso}%`, background: cor }} />
				</div>

				<div className="projeto-cartao__rodape">
					<span className="projeto-cartao__contagem">
						{resumo.concluidas}/{resumo.total} · {resumo.progresso}%
					</span>
					{prazo ? (
						<span
							className="projeto-cartao__prazo"
							data-vencido={resumo.prazoVencido ? 'sim' : 'nao'}
						>
							{prazo}
						</span>
					) : null}
					{resumo.atrasadas > 0 ? (
						<span className="projeto-cartao__atraso">
							{resumo.atrasadas} {resumo.atrasadas === 1 ? 'atrasada' : 'atrasadas'}
						</span>
					) : null}
					{resumo.marcos.length > 0 ? (
						<span className="projeto-cartao__marcos">
							<IconeBandeira size={13} />
							{resumo.marcosFeitos}/{resumo.marcos.length}
						</span>
					) : null}
					{resumo.proxima ? <span className="projeto-cartao__proxima">{resumo.proxima.title}</span> : null}
				</div>

				{/* Próxima entrega do projeto: responde "o que vem agora?" sem abrir
				    o projeto. Só aparece quando existe marco pendente. */}
				{resumo.proximoMarco ? (
					<div className="projeto-cartao__proximo-marco">
						<span className="projeto-cartao__proximo-rotulo">Próxima entrega</span>
						<span className="projeto-cartao__proximo-titulo">{resumo.proximoMarco.titulo}</span>
						{resumo.proximoMarco.data ? (
							<span className="projeto-cartao__proximo-data">
								{textoDaData(resumo.proximoMarco.data)}
							</span>
						) : null}
					</div>
				) : null}
			</Link>
		</div>
	)
}

/** Edição do projeto a partir da central, sem precisar entrar nele. */
function EditarProjetoRapido({
	projeto,
	onFechar,
}: {
	projeto: Project | null
	onFechar: () => void
}) {
	const [nome, setNome] = useState('')
	const [etapa, setEtapa] = useState('')
	const [prazo, setPrazo] = useState('')
	const [status, setStatus] = useState<NonNullable<Project['status']>>('ativo')
	const [cor, setCor] = useState(0)
	const [categoria, setCategoria] = useState('')
	const [prioridade, setPrioridade] = useState<Priority>(0)
	const [confirmando, setConfirmando] = useState(false)
	const categorias = useCategorias()

	// Recarrega os campos quando outro projeto é escolhido.
	const idAtual = projeto?.id
	useMemo(() => {
		if (!projeto) return
		setNome(projeto.name)
		setEtapa(projeto.etapa ?? '')
		setPrazo(projeto.prazo ?? '')
		setStatus(projeto.status ?? 'ativo')
		setCor(Number(projeto.color ?? 0))
		setCategoria(projeto.categoria ?? '')
		setPrioridade(projeto.priority ?? 0)
		setConfirmando(false)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [idAtual])

	return (
		<Folha
			titulo="Editar projeto"
			aberta={projeto !== null}
			onFechar={onFechar}
			passo={confirmando ? 'excluir' : 'editar'}
		>
			{confirmando ? (
				<div className="formulario">
					<p className="nota">
						Excluir <strong>{projeto?.name}</strong> remove as tarefas, os marcos e as páginas que
						estão nele. Não dá para desfazer.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmando(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								if (!projeto) return
								void softDeleteProject(projeto.id)
								onFechar()
							}}
						>
							Excluir projeto
						</button>
					</div>
				</div>
			) : (
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						if (!projeto || !nome.trim()) return
						void updateProject(projeto.id, {
							name: nome.trim(),
							etapa: etapa.trim() || null,
							prazo: prazo || null,
							status,
							color: String(cor),
							categoria: categoria.trim() || null,
							priority: prioridade,
						})
						onFechar()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="central-projeto-nome">
							Nome
						</label>
						<input
							id="central-projeto-nome"
							data-foco-inicial
							className="campo"
							value={nome}
							onChange={(evento) => setNome(evento.target.value)}
							maxLength={80}
						/>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="central-projeto-etapa">
							Etapa atual
						</label>
						<input
							id="central-projeto-etapa"
							className="campo"
							value={etapa}
							onChange={(evento) => setEtapa(evento.target.value)}
							placeholder="Ex.: Aguardando aprovação"
							maxLength={60}
						/>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="central-projeto-prazo">
							Prazo
						</label>
						<input
							id="central-projeto-prazo"
							type="date"
							className="campo"
							value={prazo}
							onChange={(evento) => setPrazo(evento.target.value)}
						/>
					</div>

					<div>
						<span className="campo-rotulo">Estado</span>
						<div className="segmentado" role="group" aria-label="Estado do projeto">
							{(['ativo', 'pausado', 'concluido'] as const).map((valor) => (
								<button
									key={valor}
									type="button"
									className="segmentado__item"
									aria-pressed={status === valor}
									onClick={() => setStatus(valor)}
								>
									{ESTADOS[valor].rotulo}
								</button>
							))}
						</div>
					</div>

					<div>
						<span className="campo-rotulo">Cor</span>
						<div className="amostra-cores" role="group" aria-label="Cor do projeto">
							{PALETA.slice(0, 8).map((item) => (
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

					<div>
						<span className="campo-rotulo">Prioridade</span>
						<div className="segmentado" role="group" aria-label="Prioridade do projeto">
							{([0, 1, 2, 3] as const).map((valor) => (
								<button
									key={valor}
									type="button"
									className="segmentado__item"
									aria-pressed={prioridade === valor}
									onClick={() => setPrioridade(valor)}
								>
									{valor === 0 ? 'Nenhuma' : valor === 1 ? 'Baixa' : valor === 2 ? 'Média' : 'Alta'}
								</button>
							))}
						</div>
						<p className="nota">
							Prioridade pesa na ordenação. Arrastar o projeto muda a ordem manual; a
							prioridade vem por cima quando a lista está em “Prioridade”.
						</p>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="central-projeto-categoria">
							Categoria
						</label>
						<input
							id="central-projeto-categoria"
							className="campo"
							value={categoria}
							onChange={(evento) => setCategoria(evento.target.value)}
							placeholder="Ex.: Trabalho, Casa, Estudos"
							list="categorias-existentes"
							maxLength={40}
						/>
						<datalist id="categorias-existentes">
							{categorias.map((item) => (
								<option key={item} value={item} />
							))}
						</datalist>
						<p className="nota">
							Escreva ou escolha uma que já existe. Vazio significa sem categoria.
						</p>
					</div>

					<div className="formulario__acoes" style={{ justifyContent: 'space-between' }}>
						<button type="button" className="botao botao--perigo" onClick={() => setConfirmando(true)}>
							Excluir
						</button>
						<button type="submit" className="botao botao--primario" disabled={!nome.trim()}>
							Salvar
						</button>
					</div>
				</form>
			)}
		</Folha>
	)
}

export function Projetos() {
	const projetos = useProjects()
	const tarefas = useTodasAsTarefas()
	const [criando, setCriando] = useState(false)
	const [editando, setEditando] = useState<Project | null>(null)
	const [ordem, setOrdem] = useState<OrdemDeProjetos>('prazo')
	const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas')
	const categorias = useCategorias()

	const [nome, setNome] = useState('')
	const [descricao, setDescricao] = useState('')
	const [prazo, setPrazo] = useState('')
	const [cor, setCor] = useState(1)

	const resumos = useMemo<ResumoDoProjeto[]>(() => {
		if (!projetos) return []
		const porProjeto = new Map<string, Task[]>()
		for (const tarefa of tarefas ?? []) {
			if (!tarefa.projectId) continue
			const atual = porProjeto.get(tarefa.projectId) ?? []
			atual.push(tarefa)
			porProjeto.set(tarefa.projectId, atual)
		}
		return projetos.map((projeto) => resumirProjeto(projeto, porProjeto.get(projeto.id) ?? []))
	}, [projetos, tarefas])

	/** Filtro por categoria: "todas" mostra tudo, "sem" mostra quem não tem. */
	const filtrados = useMemo(() => {
		if (categoriaFiltro === 'todas') return resumos
		if (categoriaFiltro === 'sem') {
			return resumos.filter((r) => !r.projeto.categoria?.trim())
		}
		return resumos.filter((r) => r.projeto.categoria?.trim() === categoriaFiltro)
	}, [resumos, categoriaFiltro])

	const faixas = useMemo(() => {
		const mapa = new Map<FaixaDeProjeto, ResumoDoProjeto[]>()
		for (const resumo of filtrados) {
			const faixa = faixaDoProjeto(resumo)
			const atual = mapa.get(faixa) ?? []
			atual.push(resumo)
			mapa.set(faixa, atual)
		}
		return ORDEM_DAS_FAIXAS.map((faixa) => ({
			faixa,
			itens: ordenarResumos(mapa.get(faixa) ?? [], ordem),
		})).filter((grupo) => grupo.itens.length > 0)
	}, [filtrados, ordem])

	const totalAtrasados = resumos.filter((r) => r.prazoVencido).length
	// Contagem por estado, para o topo dizer o que existe sem precisar abrir nada.
	const porEstado = {
		ativo: resumos.filter((r) => (r.projeto.status ?? 'ativo') === 'ativo').length,
		pausado: resumos.filter((r) => r.projeto.status === 'pausado').length,
		concluido: resumos.filter((r) => r.projeto.status === 'concluido').length,
	}

	async function salvar(): Promise<void> {
		const texto = nome.trim()
		if (!texto) return
		const criado: Project = await createProject({ name: texto })
		await updateProject(criado.id, {
			color: String(cor),
			descricao: descricao.trim() || null,
			prazo: prazo || null,
			status: 'ativo',
		})
		setNome('')
		setDescricao('')
		setPrazo('')
		setCriando(false)
	}

	return (
		<div className="tela">
			<Topo
				titulo="Projetos"
				sobre={
					projetos === undefined
						? 'Carregando…'
						: `${projetos.length} ${projetos.length === 1 ? 'projeto' : 'projetos'}${
								totalAtrasados > 0 ? ` · ${totalAtrasados} atrasado${totalAtrasados === 1 ? '' : 's'}` : ''
							}`
				}
				acoes={
					<button
						type="button"
						className="botao-icone"
						aria-label="Novo projeto"
						onClick={() => setCriando(true)}
					>
						<IconeAdicionar size={22} />
					</button>
				}
			/>

			<div className="conteudo">
				{projetos === undefined ? (
					<div className="secao" style={{ paddingTop: 'var(--s-2)' }}>
						<div className="cartao esqueleto" aria-hidden="true">
							{[0, 1].map((i) => (
								<div key={i} className="esqueleto__linha">
									<span className="esqueleto__titulo" />
									<span className="esqueleto__meta" />
								</div>
							))}
						</div>
					</div>
				) : projetos.length === 0 ? (
					<div className="secao" style={{ paddingTop: 'var(--s-2)' }}>
						<div className="cartao cartao--vazio">
							<span className="vazio__icone" aria-hidden="true">
								<IconePasta size={28} />
							</span>
							<p>
								Nenhum projeto ainda. Um projeto junta tarefas, um prazo e as páginas de desenho
								que pertencem a ele.
							</p>
							<button type="button" className="botao botao--primario" onClick={() => setCriando(true)}>
								<IconeAdicionar size={20} />
								Criar projeto
							</button>
						</div>
					</div>
				) : (
					<>
						{/* Resumo por estado: dá para ver o que está ativo, pausado e
						    concluído antes de rolar a lista. */}
						<div className="secao">
							<div className="chips" style={{ paddingLeft: 0, paddingRight: 0 }}>
								{(['ativo', 'pausado', 'concluido'] as const).map((valor) => (
									<span key={valor} className={`chip chip--pequeno selo ${ESTADOS[valor].classe}`}>
										{ESTADOS[valor].rotulo}
										<span className="chip__contagem">{porEstado[valor]}</span>
									</span>
								))}
							</div>

							{/* Categoria: filtra sem esconder o que não tem. */}
							{categorias.length > 0 ? (
								<div className="chips" role="group" aria-label="Filtrar por categoria" style={{ paddingLeft: 0, paddingRight: 0 }}>
									<button
										type="button"
										className="chip chip--pequeno"
										aria-pressed={categoriaFiltro === 'todas'}
										onClick={() => setCategoriaFiltro('todas')}
									>
										Todas
									</button>
									{categorias.map((item) => (
										<button
											key={item}
											type="button"
											className="chip chip--pequeno"
											aria-pressed={categoriaFiltro === item}
											onClick={() => setCategoriaFiltro(item)}
										>
											{item}
										</button>
									))}
									<button
										type="button"
										className="chip chip--pequeno"
										aria-pressed={categoriaFiltro === 'sem'}
										onClick={() => setCategoriaFiltro('sem')}
									>
										Sem categoria
									</button>
								</div>
							) : null}

							{/* Ordenação: a pergunta muda (o que vence antes? onde tem mais
							    trabalho? o que mexi por último?), então a lista deixa escolher. */}
							<div className="projeto-ordem" role="group" aria-label="Ordenar projetos">
								<span className="projeto-ordem__rotulo">Ordenar por</span>
								<div className="segmentado">
									{(Object.keys(ROTULO_DA_ORDEM) as OrdemDeProjetos[]).map((valor) => (
										<button
											key={valor}
											type="button"
											className="segmentado__item"
											aria-pressed={ordem === valor}
											onClick={() => setOrdem(valor)}
										>
											{ROTULO_DA_ORDEM[valor]}
										</button>
									))}
								</div>
							</div>
						</div>

						{faixas.map((grupo) => (
							<section className="secao" key={grupo.faixa} aria-label={ROTULO_DA_FAIXA[grupo.faixa]}>
								<div className="secao-cabecalho">
									<h2 className="secao-titulo">
										{ROTULO_DA_FAIXA[grupo.faixa]}
										<span className="secao-titulo__contagem">{grupo.itens.length}</span>
									</h2>
								</div>
								<div className="projeto-lista">
									{grupo.itens.map((resumo) => (
										<CartaoDeProjeto key={resumo.projeto.id} resumo={resumo} onEditar={setEditando} />
									))}
								</div>
							</section>
						))}
					</>
				)}
			</div>

			<Folha titulo="Novo projeto" aberta={criando} onFechar={() => setCriando(false)}>
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						void salvar()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="projeto-nome">
							Nome
						</label>
						<input
							id="projeto-nome"
							data-foco-inicial
							className="campo"
							value={nome}
							onChange={(evento) => setNome(evento.target.value)}
							placeholder="Ex.: Reforma do quarto"
							maxLength={80}
						/>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="projeto-descricao">
							O que este projeto entrega
						</label>
						<textarea
							id="projeto-descricao"
							className="campo campo--area"
							value={descricao}
							onChange={(evento) => setDescricao(evento.target.value)}
							placeholder="Uma linha que ajude a lembrar por que ele existe."
							rows={2}
							maxLength={200}
						/>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="projeto-prazo">
							Prazo
						</label>
						<input
							id="projeto-prazo"
							type="date"
							className="campo"
							value={prazo}
							onChange={(evento) => setPrazo(evento.target.value)}
						/>
						<p className="nota">Opcional. Sem prazo, o projeto entra em "Sem prazo".</p>
					</div>

					<div>
						<span className="campo-rotulo">Cor</span>
						<div className="amostra-cores" role="group" aria-label="Cor do projeto">
							{PALETA.slice(0, 8).map((item) => (
								<button
									key={item.indice}
									type="button"
									className="amostra-cor"
									style={{ background: corDoIndice(item.indice).hex }}
									aria-label={item.rotulo}
									aria-pressed={cor === item.indice}
									onClick={() => setCor(item.indice)}
								/>
							))}
						</div>
					</div>

					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setCriando(false)}>
							Cancelar
						</button>
						<button type="submit" className="botao botao--primario" disabled={!nome.trim()}>
							Criar projeto
						</button>
					</div>
				</form>
			</Folha>

			<EditarProjetoRapido projeto={editando} onFechar={() => setEditando(null)} />
		</div>
	)
}
