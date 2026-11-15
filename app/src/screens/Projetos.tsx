import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Priority, Project, Task } from '@/db/db'
import { restaurarProject, useProjects } from '@/db/repo'
import { useCategorias } from '@/db/repo'
import { ordenarResumos, ROTULO_DA_ORDEM } from '@/lib/projetos'
import type { OrdemDeProjetos } from '@/lib/projetos'
import { Link } from '@/app/router'
import { Topo } from '@/ui/AppShell'
import { CriarProjeto } from '@/ui/CriarProjeto'
import { EditarProjeto } from '@/ui/EditarProjeto'
import { FaixaDesfazer, useDesfazerExclusao } from '@/ui/ExcluirComDesfazer'
import { corDe, tintaSobre } from '@/ui/paleta'
import { estiloDaFaixa } from '@/ui/cores'
import { escrever } from '@/lib/falhas'
import {
	ROTULO_DA_FAIXA,
	faixaDoProjeto,
	resumirProjeto,
	textoDaData,
	textoDoPrazo,
	type FaixaDeProjeto,
	type ResumoDoProjeto,
} from '@/lib/projetos'
import { IconeAdicionar, IconeBandeira, IconeEditar, IconeFechar, IconePasta } from '@/ui/icones'

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

/** Rótulo da prioridade, no mesmo vocabulário das tarefas. */
const PRIORIDADES: Record<Priority, { rotulo: string }> = {
	0: { rotulo: 'Sem prioridade' },
	1: { rotulo: 'Baixa' },
	2: { rotulo: 'Média' },
	3: { rotulo: 'Alta' },
}

function useTodasAsTarefas(): Task[] | undefined {
	return useLiveQuery(async () => {
		const todas = await db.tasks.toArray()
		return todas.filter((t) => !t.deletedAt)
	}, [])
}

/**
 * Anotações por projeto, numa consulta só.
 *
 * O cartão da central passou a mostrar o que existe DENTRO da pasta — quantas
 * anotações — porque "projeto" sem isso é só um nome com uma barra de
 * progresso. Fazer uma consulta por cartão seria caro numa carteira de vinte
 * projetos; aqui é uma leitura só.
 */
interface AnexosDoProjeto {
	anotacoes: number
}

function useAnexosDosProjetos(): Map<string, AnexosDoProjeto> | undefined {
	return useLiveQuery(async () => {
		const notas = await db.projectNotes.toArray()
		const mapa = new Map<string, AnexosDoProjeto>()

		const obter = (id: string): AnexosDoProjeto => {
			const atual = mapa.get(id) ?? { anotacoes: 0 }
			mapa.set(id, atual)
			return atual
		}

		for (const nota of notas) {
			if (nota.deletedAt) continue
			obter(nota.projectId).anotacoes += 1
		}

		return mapa
	}, [])
}

function CartaoDeProjeto({
	resumo,
	anexos,
	onEditar,
}: {
	resumo: ResumoDoProjeto
	anexos?: AnexosDoProjeto
	onEditar: (projeto: Project) => void
}) {
	const { projeto } = resumo
	const cor = corDe(projeto.color, projeto.id).hex
	const prazo = textoDoPrazo(resumo)
	const estado = ESTADOS[projeto.status ?? 'ativo']
	const dataDoPrazo = textoDaData(projeto.prazo)

	/*
	 * A pasta inteira é o alvo do toque.
	 *
	 * Antes só o título e a faixa de progresso eram links; tocar na borda, no
	 * respiro ou na etiqueta de categoria não abria nada. O dono do app pediu
	 * que a pasta abrisse o projeto em qualquer ponto — e a etiqueta de
	 * categoria, que era um botão de filtro dentro do cartão, virou texto:
	 * um alvo dentro de outro alvo confunde o toque e rouba o gesto de abrir.
	 */
	return (
		<div className="projeto-cartao-area">
			<Link
				route={{ name: 'projeto', id: projeto.id }}
				className="projeto-cartao"
				style={
					{
						'--cor-cat': cor,
						'--tinta-da-cor': tintaSobre(cor),
						// A faixa do topo é a cor escurecida; a tinta dela é calculada
						// sobre a cor EFETIVA, não branca fixa (ver `estiloDaFaixa`).
						...estiloDaFaixa(cor),
					} as CSSProperties
				}
				ariaLabel={`Abrir ${projeto.name}`}
			>
				{/*
				 * Duas faixas, como nas referências.
				 *
				 * A primeira é a "aba da pasta": fundo escuro, o ícone e o número
				 * que importa. A segunda é o CORPO na cor cheia do projeto, com o
				 * título. Antes a cor era misturada a 16% com a superfície —
				 * qualquer cor virava um cinza rosado e a escolha do usuário
				 * desaparecia. Cor de identificação tem de aparecer, não sugerir.
				 */}
				<span className="projeto-cartao__faixa">
					<span className="projeto-cartao__aba">
						<span className="projeto-cartao__aba-icone" aria-hidden="true">
							<IconePasta size={19} />
						</span>
						<span className="projeto-cartao__aba-numero tabular">{resumo.abertas}</span>
						<span className="projeto-cartao__aba-rotulo">
							{resumo.abertas === 1 ? 'aberta' : 'abertas'}
						</span>
					</span>

					{estado.rotulo !== 'Ativo' ? (
						<span className={`selo ${estado.classe}`}>{estado.rotulo}</span>
					) : null}
				</span>

				{/*
				 * O corpo é o cartão inteiro: tocar em qualquer ponto dele abre o
				 * projeto. O lápis fica fora, sobreposto, porque um botão dentro
				 * de âncora é HTML inválido.
				 */}
				<span className="projeto-cartao__corpo">
					<span className="projeto-cartao__cabecalho">
						<span className="projeto-cartao__titulo">{projeto.name}</span>
						{prazo ? (
							<span
								className="projeto-cartao__prazo"
								data-vencido={resumo.prazoVencido ? 'sim' : 'nao'}
							>
								{prazo}
							</span>
						) : null}
					</span>

					{projeto.etapa?.trim() ? (
						<span className="projeto-cartao__etapa">{projeto.etapa}</span>
					) : projeto.descricao ? (
						<span className="projeto-cartao__etapa">{projeto.descricao}</span>
					) : null}

					{/* Faixa de bolinhas: uma tarefa, um ponto. Feitas ficam cheias. */}
					{resumo.total > 0 ? (
						<span
							className="projeto-cartao__pontos"
							role="img"
							aria-label={`${resumo.concluidas} de ${resumo.total} tarefas concluídas`}
						>
							{pontosDeProgresso(resumo.concluidas, resumo.total).map((feito, indice) => (
								<span
									key={indice}
									className="projeto-cartao__ponto"
									data-feito={feito ? 'sim' : 'nao'}
								/>
							))}
						</span>
					) : null}

					{/* Números do projeto, no formato do painel: rótulo, valor, meta.
					    "Abertas" não entra: ele já é o número da aba, e repetir o
					    mesmo dado em dois lugares gasta a atenção sem informar. */}
					<span className="projeto-cartao__numeros">
						<span className="projeto-cartao__numero">
							<span className="projeto-cartao__numero-rotulo">Feitas</span>
							<span className="projeto-cartao__numero-valor tabular">{resumo.concluidas}</span>
						</span>
						{resumo.atrasadas > 0 ? (
							<span className="projeto-cartao__numero">
								<span className="projeto-cartao__numero-rotulo">Atrasadas</span>
								<span className="projeto-cartao__numero-valor tabular">{resumo.atrasadas}</span>
							</span>
						) : null}
						{resumo.marcos.length > 0 ? (
							<span className="projeto-cartao__numero">
								<span className="projeto-cartao__numero-rotulo">Marcos</span>
								<span className="projeto-cartao__numero-valor tabular">
									{resumo.marcosFeitos}/{resumo.marcos.length}
								</span>
							</span>
						) : null}
						{anexos && anexos.anotacoes > 0 ? (
							<span className="projeto-cartao__numero">
								<span className="projeto-cartao__numero-rotulo">Notas</span>
								<span className="projeto-cartao__numero-valor tabular">{anexos.anotacoes}</span>
							</span>
						) : null}
					</span>

					<span className="projeto-cartao__rodape">
						{projeto.categoria?.trim() ? (
							<span className="projeto-cartao__categoria">{projeto.categoria.trim()}</span>
						) : null}
						{(projeto.priority ?? 0) > 0 ? (
							<span className="projeto-cartao__prioridade">
								<IconeBandeira size={12} />
								{PRIORIDADES[projeto.priority ?? 0].rotulo}
							</span>
						) : null}
						{dataDoPrazo && prazo ? (
							<span className="projeto-cartao__data">{dataDoPrazo}</span>
						) : null}
					</span>

					{resumo.proximoMarco || resumo.proxima ? (
						<span className="projeto-cartao__proximo">
							<span className="projeto-cartao__proximo-rotulo">
								{resumo.proximoMarco ? 'Próxima entrega' : 'Próximo passo'}
							</span>
							<span className="projeto-cartao__proximo-titulo">
								{resumo.proximoMarco?.titulo ?? resumo.proxima?.title}
							</span>
							{resumo.proximoMarco?.data ? (
								<span className="projeto-cartao__proximo-data">
									{textoDaData(resumo.proximoMarco.data)}
								</span>
							) : null}
						</span>
					) : null}
				</span>
			</Link>

			{/* O lápis fica FORA do link: botão dentro de âncora é HTML inválido
			    e o toque no lápis abriria o projeto junto. */}
			<button
				type="button"
				className="botao-icone botao-icone--pequeno projeto-cartao__editar"
				aria-label={`Editar ${projeto.name}`}
				title="Editar projeto"
				onClick={() => onEditar(projeto)}
			>
				<IconeEditar size={17} />
			</button>
		</div>
	)
}

/**
 * Bolinhas de progresso.
 *
 * Com até 14 tarefas, cada bolinha é uma tarefa: a leitura é imediata. Acima
 * disso viram 14 marcadores proporcionais — contar 40 bolinhas não informa
 * nada e some numa tela de 360 px.
 */
export function pontosDeProgresso(concluidas: number, total: number): boolean[] {
	if (total <= 0) return []
	const quantos = Math.min(14, total)
	const cheios = Math.round((concluidas / total) * quantos)
	return Array.from({ length: quantos }, (_, indice) => indice < cheios)
}

export function Projetos() {
	const projetos = useProjects()
	const tarefas = useTodasAsTarefas()
	const [criando, setCriando] = useState(false)
	const [editando, setEditando] = useState<Project | null>(null)
	const [ordem, setOrdem] = useState<OrdemDeProjetos>('prazo')
	const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas')
	/**
	 * Filtro por estado.
	 *
	 * Os chips de estado eram só um resumo (span, sem clique): mostravam
	 * quantos estavam pausados e não deixavam esconder o resto. Agora são
	 * filtro de verdade, junto com o de categoria.
	 */
	const [estadoFiltro, setEstadoFiltro] = useState<'todos' | NonNullable<Project['status']>>('todos')
	const categorias = useCategorias()
	const desfazerExclusao = useDesfazerExclusao()

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
	const anexos = useAnexosDosProjetos()

	/** Filtro por categoria: "todas" mostra tudo, "sem" mostra quem não tem. */
	const filtrados = useMemo(() => {
		const porCategoria = (() => {
			if (categoriaFiltro === 'todas') return resumos
			if (categoriaFiltro === 'sem') {
				return resumos.filter((r) => !r.projeto.categoria?.trim())
			}
			return resumos.filter((r) => r.projeto.categoria?.trim() === categoriaFiltro)
		})()

		if (estadoFiltro === 'todos') return porCategoria
		return porCategoria.filter((r) => (r.projeto.status ?? 'ativo') === estadoFiltro)
	}, [resumos, categoriaFiltro, estadoFiltro])

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
	/**
	 * Contagem por situação.
	 *
	 * O seletor mostra só o rótulo ("Ativo"), para caber inteiro e dividir a
	 * largura; a contagem vai no `aria-label`, onde ela ainda informa quem usa
	 * leitor de tela sem ocupar espaço na faixa.
	 */
	const porEstado = {
		ativo: resumos.filter((r) => (r.projeto.status ?? 'ativo') === 'ativo').length,
		pausado: resumos.filter((r) => r.projeto.status === 'pausado').length,
		concluido: resumos.filter((r) => r.projeto.status === 'concluido').length,
	}
	const temFiltro = categoriaFiltro !== 'todas' || estadoFiltro !== 'todos'

	/**
	 * Criar projeto: o mesmo formulário da folha de Tarefas e do FAB.
	 *
	 * Antes esta tela tinha o próprio formulário de sete campos, e o FAB e o
	 * chip de Tarefas criavam com um ou dois. Agora há um componente só
	 * (`CriarProjeto`), com todos os campos, em todos os pontos de entrada.
	 */

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
								Nenhum projeto ainda. Um projeto junta tarefas, prazos, marcos e as
								anotações que pertencem a ele.
							</p>
							<button type="button" className="botao botao--primario" onClick={() => setCriando(true)}>
								<IconeAdicionar size={20} />
								Criar projeto
							</button>
						</div>
					</div>
				) : (
					<>
						{/*
						 * Filtros.
						 *
						 * Um título só, "Ordenar por", acima de TODOS os
						 * seletores — é o que o dono pediu e é o que o padrão
						 * da tela estabelece. Os blocos abaixo (situação,
						 * categoria, ordem) não têm título próprio: são
						 * autoexplicativos pelos valores que mostram ("Ativo",
						 * "Trabalho", "Prazo").
						 *
						 * O seletor de categoria ficava escondido quando não
						 * havia nenhuma categoria cadastrada — com um projeto
						 * recém-criado, a lista vinha vazia e o seletor inteiro
						 * desaparecia, o que parecia "sumiu a categoria". Agora
						 * ele aparece sempre, com "Todas" e "Sem categoria",
						 * mesmo sem categoria no banco.
						 *
						 * Todos os controles ocupam a largura do contêiner e
						 * dividem o espaço entre os itens: nada alinhado à
						 * esquerda deixando vazio à direita.
						 */}
						<div className="filtros-projetos">
							<p className="filtros-projetos__titulo">Ordenar por</p>

							<div className="segmentado" role="group" aria-label="Situação dos projetos">
								{(['todos', 'ativo', 'pausado', 'concluido'] as const).map((valor) => (
									<button
										key={valor}
										type="button"
										className="segmentado__item"
										aria-pressed={estadoFiltro === valor}
										aria-label={
											valor === 'todos'
												? `Todos, ${resumos.length}`
												: `${ESTADOS[valor].rotulo}, ${porEstado[valor]}`
										}
										onClick={() => setEstadoFiltro(valor)}
									>
										{valor === 'todos' ? 'Todos' : ESTADOS[valor].rotulo}
									</button>
								))}
							</div>

							<div className="segmentado" role="group" aria-label="Categoria do projeto">
								<button
									type="button"
									className="segmentado__item"
									aria-pressed={categoriaFiltro === 'todas'}
									onClick={() => setCategoriaFiltro('todas')}
								>
									Todas
								</button>
								{categorias.map((item) => (
									<button
										key={item}
										type="button"
										className="segmentado__item"
										aria-pressed={categoriaFiltro === item}
										onClick={() => setCategoriaFiltro(item)}
									>
										{item}
									</button>
								))}
								<button
									type="button"
									className="segmentado__item"
									aria-pressed={categoriaFiltro === 'sem'}
									onClick={() => setCategoriaFiltro('sem')}
								>
									Sem
								</button>
							</div>

							<div className="segmentado" role="group" aria-label="Ordenar projetos">
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

							{temFiltro ? (
								<button
									type="button"
									className="botao botao--texto filtros-projetos__limpar"
									onClick={() => {
										setCategoriaFiltro('todas')
										setEstadoFiltro('todos')
									}}
								>
									<IconeFechar size={14} />
									Limpar {categoriaFiltro !== 'todas' ? 'categoria' : 'situação'}
								</button>
							) : null}
						</div>

						{faixas.length === 0 ? (
							<div className="secao">
								<div className="cartao cartao--vazio">
									<p>Nenhum projeto com esses filtros.</p>
									<button
										type="button"
										className="botao"
										onClick={() => {
											setCategoriaFiltro('todas')
											setEstadoFiltro('todos')
										}}
									>
										Limpar filtros
									</button>
								</div>
							</div>
						) : (
							faixas.map((grupo) => (
								<section className="secao" key={grupo.faixa} aria-label={ROTULO_DA_FAIXA[grupo.faixa]}>
									<div className="secao-cabecalho">
										<h2 className="secao-titulo">
											{ROTULO_DA_FAIXA[grupo.faixa]}
											<span className="secao-titulo__contagem">{grupo.itens.length}</span>
										</h2>
									</div>
									<div className="projeto-lista">
										{grupo.itens.map((resumo) => (
											<CartaoDeProjeto
												key={resumo.projeto.id}
												resumo={resumo}
												anexos={anexos?.get(resumo.projeto.id)}
												onEditar={setEditando}
											/>
										))}
									</div>
								</section>
							))
						)}
					</>
				)}
			</div>

			<CriarProjeto aberto={criando} onFechar={() => setCriando(false)} />

			{/* Excluir projeto pela edição: o editor avisa a tela para oferecer o
			    desfazer, que restaura o projeto E o que desceu com ele. */}
			<EditarProjeto
				projeto={editando}
				aberto={editando !== null}
				onFechar={() => setEditando(null)}
				onExcluido={(projeto) =>
					desfazerExclusao.anunciar({
						texto: `Excluído: ${projeto.name}`,
						restaurar: () => escrever(() => restaurarProject(projeto.id)),
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
