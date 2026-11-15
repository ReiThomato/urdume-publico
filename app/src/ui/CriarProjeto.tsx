import { useEffect, useState } from 'react'
import type { Priority, Project } from '@/db/db'
import { createProject, useCategorias } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import { EscolherCor } from '@/ui/EscolherCor'

/**
 * Criação de projeto — UM componente para os três pontos de entrada.
 *
 * Antes havia três formulários para a mesma coisa: a central de Projetos
 * criava com sete campos, o FAB e o chip "Lista" de Tarefas criavam com um ou
 * dois. Quem criava pelo caminho mais visível (o FAB) recebia um projeto
 * incompleto e precisava abrir a edição depois — o oposto do que a própria
 * folha de Projetos anunciava.
 *
 * Os campos são os mesmos de `EditarProjeto`, na mesma ordem: criar e editar
 * passam a parecer o mesmo formulário, porque são.
 */
export interface CriarProjetoProps {
	aberto: boolean
	onFechar: () => void
	/** Chamado com o projeto criado (para navegar ou selecionar a lista). */
	onCriado?: (projeto: Project) => void
	/** Nome já digitado em outro campo (ex.: título da folha de criação). */
	nomeInicial?: string
	/** Cor inicial (o chip de lista já trazia uma escolhida). */
	corInicial?: number
}

export function CriarProjeto({ aberto, onFechar, onCriado, nomeInicial, corInicial }: CriarProjetoProps) {
	const [nome, setNome] = useState('')
	const [descricao, setDescricao] = useState('')
	const [etapa, setEtapa] = useState('')
	const [prazo, setPrazo] = useState('')
	const [status, setStatus] = useState<NonNullable<Project['status']>>('ativo')
	// Índice da paleta OU hex livre; `createProject` grava como texto nos dois casos.
	const [cor, setCor] = useState<number | string>(1)
	const [categoria, setCategoria] = useState('')
	const [prioridade, setPrioridade] = useState<Priority>(0)
	const [salvando, setSalvando] = useState(false)
	const [erro, setErro] = useState<string | null>(null)

	const categorias = useCategorias()

	// Cada abertura parte de um formulário limpo — e o nome/cor de quem abriu
	// (FAB com título já digitado, chip de lista com cor escolhida) é respeitado.
	useEffect(() => {
		if (!aberto) return
		setNome(nomeInicial ?? '')
		setDescricao('')
		setEtapa('')
		setPrazo('')
		setStatus('ativo')
		setCor(corInicial ?? 1)
		setCategoria('')
		setPrioridade(0)
		setErro(null)
		setSalvando(false)
	}, [aberto, nomeInicial, corInicial])

	async function salvar(): Promise<void> {
		const texto = nome.trim()
		if (!texto) return

		setSalvando(true)
		setErro(null)
		try {
			const criado = await createProject({
				name: texto,
				color: String(cor),
				descricao: descricao.trim() || null,
				etapa: etapa.trim() || null,
				prazo: prazo || null,
				status,
				categoria: categoria.trim() || null,
				priority: prioridade,
			})
			onCriado?.(criado)
			onFechar()
		} catch (causa) {
			setErro(causa instanceof Error ? causa.message : 'Não foi possível criar o projeto.')
		} finally {
			setSalvando(false)
		}
	}

	return (
		<Folha
			titulo="Novo projeto"
			sobre="Já nasce com categoria, prioridade e estado"
			aberta={aberto}
			onFechar={onFechar}
		>
			<form
				className="formulario"
				onSubmit={(evento) => {
					evento.preventDefault()
					if (!salvando) void salvar()
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
					<label className="campo-rotulo" htmlFor="projeto-categoria">
						Categoria
					</label>
					<input
						id="projeto-categoria"
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
						<label className="campo-rotulo" htmlFor="projeto-prazo">
							Prazo
						</label>
						<input
							id="projeto-prazo"
							type="date"
							className="campo campo--compacto"
							value={prazo}
							onChange={(evento) => setPrazo(evento.target.value)}
						/>
					</div>
					<div>
						<label className="campo-rotulo" htmlFor="projeto-etapa">
							Etapa atual
						</label>
						<input
							id="projeto-etapa"
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

				{erro ? (
					<p className="erro" role="alert">
						{erro}
					</p>
				) : null}

				<div className="formulario__acoes">
					<button type="button" className="botao" onClick={onFechar}>
						Cancelar
					</button>
					<button type="submit" className="botao botao--primario" disabled={!nome.trim() || salvando}>
						{salvando ? 'Criando…' : 'Criar projeto'}
					</button>
				</div>
			</form>
		</Folha>
	)
}
