import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Project, Task } from '@/db/db'
import {
	restaurarTask,
	softDeleteTask,
	softDeleteTasks,
	restaurarTasks,
	toggleTask,
} from '@/db/repo'
import { useProjects } from '@/db/repo'
import { chaveDoDia, diaDeHoje } from '@/lib/date'
import { TarefaItem } from '@/ui/TarefaItem'
import { EditarTarefa } from '@/ui/EditarTarefa'
import { EditarProjeto } from '@/ui/EditarProjeto'
import { CriarProjeto } from '@/ui/CriarProjeto'
import { Folha } from '@/ui/Folha'
import { useEscrita } from '@/lib/escrita'
import { DURACAO_DO_DESFAZER, ExcluirComDesfazer, FaixaDesfazer, useDesfazerExclusao } from '@/ui/ExcluirComDesfazer'
import { corDe } from '@/ui/paleta'
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
import { estaAtrasada } from '@/lib/tarefas'

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
	cor: number | string | null
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
	const [editandoLista, setEditandoLista] = useState<string | null>(null)
	const [confirmandoLimpar, setConfirmandoLimpar] = useState(false)
	const [excluindoTarefa, setExcluindoTarefa] = useState<Task | null>(null)
	const [desfazer, setDesfazer] = useState<{ id: string; titulo: string } | null>(null)
	// Escritas com aviso de erro: a tela não fecha como se tivesse salvo quando
	// o banco recusa (cota cheia, transação abortada).
	const { executar, erro: erroEscrita } = useEscrita()
	// "Limpar concluídas" também tem desfazer: o dado já era exclusão suave.
	const desfazerLimpeza = useDesfazerExclusao()
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
				cor: projeto.color ?? null,
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

	/*
	 * Três faixas, sutis.
	 *
	 * Antes a lista aberta era uma pilha só: atrasada, hoje e "semana que vem"
	 * ficavam na mesma altura, e o único sinal era a data em corpo pequeno.
	 * Agrupar custa três cabeçalhos de 20 px — não é uma seção por grupo, é um
	 * rótulo discreto — e responde à pergunta que se faz ao abrir a tela: o
	 * que ficou para trás, o que é de hoje, o que ainda pode esperar.
	 */
	const faixas = useMemo(() => {
		const atrasadas: Task[] = []
		const deHoje: Task[] = []
		const adiante: Task[] = []
		const semDia: Task[] = []

		for (const tarefa of abertas) {
			if (estaAtrasada(tarefa, hoje)) atrasadas.push(tarefa)
			else if (tarefa.dueDate === hoje) deHoje.push(tarefa)
			else if (tarefa.dueDate) adiante.push(tarefa)
			else semDia.push(tarefa)
		}

		return [
			{ chave: 'atrasadas' as const, titulo: 'Atrasadas', itens: atrasadas },
			{ chave: 'hoje' as const, titulo: 'Hoje', itens: deHoje },
			{ chave: 'adiante' as const, titulo: 'Adiante', itens: adiante },
			{ chave: 'sem-dia' as const, titulo: 'Sem dia', itens: semDia },
		].filter((faixa) => faixa.itens.length > 0)
	}, [abertas, hoje])

	const escondidas = grupo.tarefas.filter((t) => !t.done).length - abertas.length

	const concluidas = useMemo(
		() => grupo.tarefas.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
		[grupo],
	)

	const atrasadas = abertas.filter((t) => estaAtrasada(t, hoje)).length

	function concluir(id: string, titulo: string): void {
		escrever(() => toggleTask(id, true))
		setDesfazer({ id, titulo })
		window.clearTimeout(desfazerTimer.current)
		desfazerTimer.current = window.setTimeout(() => setDesfazer(null), DURACAO_DO_DESFAZER)
	}

	const nomesDeProjeto = new Map((projetos ?? []).map((p) => [p.id, p]))
	// `EditarProjeto` trabalha com o projeto inteiro; a tela guarda só o id da
	// lista selecionada.
	const projetoEditando: Project | null = editandoLista ? (nomesDeProjeto.get(editandoLista) ?? null) : null

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
						{item.cor !== null ? (
							<span
								className="chip__ponto"
								style={{ background: corDe(item.cor).hex }}
								aria-hidden="true"
							/>
						) : null}
						{item.nome}
						<span aria-hidden="true" style={{ opacity: 0.6, fontWeight: 600 }}>
							{item.abertas}
						</span>
					</button>
				))}
			</div>

			<div className="conteudo">
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
						{faixas.map((faixa) => (
							<div className="faixa-tarefas" key={faixa.chave}>
								{/* Um rótulo, não uma seção: 20 px e a contagem. Se só há uma
								    faixa (o caso comum do dia), o rótulo não aparece — seria
								    dizer "Hoje" para uma lista que já é a tela inteira. */}
								{faixas.length > 1 ? (
									<p className={`faixa-tarefas__rotulo faixa-tarefas__rotulo--${faixa.chave}`}>
										{faixa.titulo}
										<span className="faixa-tarefas__contagem">{faixa.itens.length}</span>
									</p>
								) : null}
								<ul className="linha-grupo">
									{faixa.itens.map((tarefa) => {
										const projeto = tarefa.projectId
											? nomesDeProjeto.get(tarefa.projectId)
											: undefined
										return (
											<TarefaItem
												key={tarefa.id}
												tarefa={tarefa}
												lista={
													projeto
														? { id: projeto.id, nome: projeto.name, cor: projeto.color }
														: undefined
												}
												mostrarData={grupo.key === 'todas'}
												atrasada={estaAtrasada(tarefa, hoje)}
												onConcluir={concluir}
												onEditar={setEditando}
												onExcluir={setExcluindoTarefa}
											/>
										)
									})}
								</ul>
							</div>
						))}
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
			</div>


			{/* Criar lista/projeto: o MESMO formulário completo da central. Antes
			    este caminho criava com nome e cor e o chip criava com nome — os
			    dois deixavam o projeto incompleto, ao contrário do que a folha de
			    Projetos anunciava. */}
			<CriarProjeto
				aberto={criandoLista}
				onFechar={() => setCriandoLista(false)}
				onCriado={(criado) => setListaAtiva(criado.id)}
			/>

			{erroEscrita ? (
				<p className="aviso aviso--erro" role="alert" style={{ margin: '0 var(--s-4) var(--s-3)' }}>
					{erroEscrita}
				</p>
			) : null}

			<Folha titulo="Limpar concluídas" aberta={confirmandoLimpar} onFechar={() => setConfirmandoLimpar(false)}>
				<div className="formulario">
					<p className="nota">
						As {concluidas.length} concluídas desta lista serão removidas. Dá para desfazer logo
						depois.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmandoLimpar(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								const ids = concluidas.map((t) => t.id)
								setConfirmandoLimpar(false)
								void executar(async () => {
									// Uma escrita só (antes: uma transação por tarefa).
									await softDeleteTasks(ids)
									desfazerLimpeza.anunciar({
										texto: `Removidas: ${ids.length} ${
											ids.length === 1 ? 'concluída' : 'concluídas'
										}`,
										restaurar: () => restaurarTasks(ids),
									})
								}, 'Não foi possível limpar as concluídas.')
							}}
						>
							Limpar
						</button>
					</div>
				</div>
			</Folha>

			{desfazerLimpeza.pendente ? (
				<FaixaDesfazer
					texto={desfazerLimpeza.pendente.texto}
					onDesfazer={desfazerLimpeza.desfazer}
					onFechar={desfazerLimpeza.fechar}
				/>
			) : null}

			<EditarTarefa
				tarefa={editando}
				aberta={editando !== null}
				onFechar={() => setEditando(null)}
				projetos={(projetos ?? []).map((p) => ({ id: p.id, name: p.name }))}
				etiquetasConhecidas={[...new Set((tarefas ?? []).flatMap((t) => t.tags ?? []))].sort()}
			/>

			{/* Exclusão a partir do atalho da linha: confirmação + desfazer, o
			    mesmo componente do Início, Projeto e Agenda. */}
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

			{/* Editar lista usa o MESMO formulário do projeto: antes era um
			    `EditarLista` com nome e cor só, e o usuário que aprendeu a
			    editar aqui não encontrava categoria, prazo nem etapa. */}
			<EditarProjeto
				projeto={projetoEditando}
				aberto={projetoEditando !== null}
				onFechar={() => setEditandoLista(null)}
				onExcluido={() => setListaAtiva('todas')}
			/>
		</div>
	)
}
