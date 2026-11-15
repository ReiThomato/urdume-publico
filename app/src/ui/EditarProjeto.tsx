import { useEffect, useState } from 'react'
import type { Priority, Project } from '@/db/db'
import { softDeleteProject, updateProject, useCategorias } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import { EscolherCor } from '@/ui/EscolherCor'
import { escrever } from '@/lib/falhas'

/**
 * Edição de um projeto — UM componente para os três lugares.
 *
 * Antes existiam dois: `EditarProjetoRapido` (na central de projetos) e
 * `EditarProjeto` (dentro do projeto). O primeiro editava categoria,
 * prioridade e cor; o segundo, descrição e etapa, mas não cor nem prioridade.
 * O mesmo botão abria formulários diferentes conforme a tela — e o que se
 * salvava dependia de onde se estava.
 *
 * Agora há um só, com todos os campos do projeto:
 * nome, o que entrega, categoria, prioridade, estado, prazo, etapa, cor e cor
 * do cartão. Apagar também vive aqui, porque é a mesma decisão.
 *
 * O texto da confirmação descreve o que `softDeleteProject` faz de fato — e
 * ela passou a apagar as anotações, que antes ficavam órfãs.
 */
export function EditarProjeto({
	projeto,
	aberto,
	onFechar,
	onExcluido,
}: {
	projeto: Project | null
	aberto: boolean
	onFechar: () => void
	/** Chamado depois de excluir; recebe o projeto para a tela montar o desfazer. */
	onExcluido?: (projeto: Project) => void
}) {
	const [nome, setNome] = useState('')
	const [descricao, setDescricao] = useState('')
	const [etapa, setEtapa] = useState('')
	const [prazo, setPrazo] = useState('')
	const [status, setStatus] = useState<NonNullable<Project['status']>>('ativo')
	const [cor, setCor] = useState<number | string>(0)
	const [categoria, setCategoria] = useState('')
	const [prioridade, setPrioridade] = useState<Priority>(0)
	const [confirmando, setConfirmando] = useState(false)

	const categorias = useCategorias()

	// Recarrega os campos quando a folha abre para outro projeto.
	useEffect(() => {
		if (!aberto || !projeto) return
		setNome(projeto.name)
		setDescricao(projeto.descricao ?? '')
		setEtapa(projeto.etapa ?? '')
		setPrazo(projeto.prazo ?? '')
		setStatus(projeto.status ?? 'ativo')
		setCor(projeto.color ?? 0)
		setCategoria(projeto.categoria ?? '')
		setPrioridade(projeto.priority ?? 0)
		setConfirmando(false)
	}, [aberto, projeto])

	return (
		<Folha
			titulo="Editar projeto"
			aberta={aberto}
			onFechar={onFechar}
			passo={confirmando ? 'excluir' : 'editar'}
			sobre="Tudo o que define o projeto, num lugar só"
		>
			{confirmando ? (
				<div className="formulario">
					<p className="nota">
						Excluir <strong>{projeto?.name}</strong> remove as tarefas, os marcos, as
						anotações e os eventos que estão nele. Dá para desfazer logo depois.
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
								const alvo = projeto
								void escrever(async () => {
									await softDeleteProject(alvo.id)
									onFechar()
									onExcluido?.(alvo)
								})
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
							descricao: descricao.trim() || null,
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
							placeholder="Uma linha que ajude a lembrar por que ele existe."
						/>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="projeto-ed-categoria">
							Categoria
						</label>
						<input
							id="projeto-ed-categoria"
							className="campo"
							value={categoria}
							onChange={(evento) => setCategoria(evento.target.value)}
							placeholder="Ex.: Trabalho, Casa, Estudos"
							list="categorias-existentes-projeto"
							maxLength={40}
						/>
						<datalist id="categorias-existentes-projeto">
							{categorias.map((item) => (
								<option key={item} value={item} />
							))}
						</datalist>
						<p className="nota">Escreva ou escolha uma que já existe. Vazio = sem categoria.</p>
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
									{valor === 'ativo' ? 'Ativo' : valor === 'pausado' ? 'Pausado' : 'Concluído'}
								</button>
							))}
						</div>
					</div>

					<div className="campo-duplo">
						<div>
							<label className="campo-rotulo" htmlFor="projeto-ed-prazo">
								Prazo
							</label>
							<input
								id="projeto-ed-prazo"
								type="date"
								className="campo campo--compacto"
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
								className="campo campo--compacto"
								value={etapa}
								onChange={(evento) => setEtapa(evento.target.value)}
								placeholder="Ex.: Aguardando aprovação"
								maxLength={60}
							/>
						</div>
					</div>

					<div>
						<span className="campo-rotulo">Cor</span>
						<EscolherCor valor={cor} onMudar={setCor} rotulo="Cor do projeto" />
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
