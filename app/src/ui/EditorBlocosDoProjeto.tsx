import { useState } from 'react'
import type { BlocoDoProjeto, Project } from '@/db/db'
import {
	BLOCOS_DO_PROJETO,
	blocosDoProjeto,
	definicaoDoBloco,
	novIdBlocoDoProjeto,
	tiposDisponiveisNoProjeto,
} from '@/lib/blocos-projeto'
import { updateProject } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import {
	IconeAdicionar,
	IconeApagar,
	IconeConcluido,
	IconeDescer,
	IconeEditar,
	IconeOcultar,
	IconeSubir,
} from '@/ui/icones'

/**
 * Editor dos blocos de um projeto.
 *
 * Mesmo desenho do editor do Início (botões de subir/descer em vez de arrastar:
 * funciona no toque, no teclado e com leitor de tela), com uma diferença que o
 * pedido exigia: **ocultar sem remover**. Ocultar tira da tela e preserva o
 * conteúdo; remover só existe para o bloco de texto livre, que não tem dados
 * por trás.
 *
 * Grava em `Project.blocos`, não em `settings`: a configuração é do projeto, e
 * cada um pode ter uma ordem diferente.
 */
export function EditorBlocosDoProjeto({
	aberto,
	onFechar,
	projeto,
}: {
	aberto: boolean
	onFechar: () => void
	projeto: Project
}) {
	const [escolhendo, setEscolhendo] = useState(false)
	const [renomeando, setRenomeando] = useState<{ id: string; texto: string } | null>(null)
	const [escrevendo, setEscrevendo] = useState<{ id: string; texto: string } | null>(null)
	const [removendo, setRemovendo] = useState<BlocoDoProjeto | null>(null)

	const blocos = blocosDoProjeto(projeto)
	const disponiveis = tiposDisponiveisNoProjeto(projeto)

	const salvar = (novos: BlocoDoProjeto[]): void => {
		void updateProject(projeto.id, { blocos: novos })
	}

	const mover = (indice: number, direcao: -1 | 1): void => {
		const destino = indice + direcao
		if (destino < 0 || destino >= blocos.length) return
		const copia = [...blocos]
		const item = copia[indice]!
		copia[indice] = copia[destino]!
		copia[destino] = item
		salvar(copia)
	}

	const alternarVisivel = (id: string): void => {
		salvar(blocos.map((bloco) => (bloco.id === id ? { ...bloco, oculto: !bloco.oculto } : bloco)))
	}

	const adicionar = (tipo: BlocoDoProjeto['tipo']): void => {
		salvar([...blocos, { id: novIdBlocoDoProjeto(), tipo }])
		setEscolhendo(false)
	}

	const aplicarTitulo = (): void => {
		if (!renomeando) return
		salvar(
			blocos.map((bloco) =>
				bloco.id === renomeando.id ? { ...bloco, titulo: renomeando.texto.trim() } : bloco,
			),
		)
		setRenomeando(null)
	}

	const aplicarTexto = (): void => {
		if (!escrevendo) return
		salvar(blocos.map((bloco) => (bloco.id === escrevendo.id ? { ...bloco, texto: escrevendo.texto } : bloco)))
		setEscrevendo(null)
	}

	const passo = escolhendo
		? 'escolha'
		: renomeando
			? 'renomear'
			: escrevendo
				? 'escrever'
				: removendo
					? 'remover'
					: 'lista'

	return (
		<Folha titulo="Montar o projeto" aberta={aberto} onFechar={onFechar} passo={passo}>
			{escolhendo ? (
				<div className="opcoes-criacao">
					{disponiveis.length === 0 ? (
						<p className="nota">Todos os blocos já estão neste projeto.</p>
					) : (
						disponiveis.map((tipo) => {
							const def = definicaoDoBloco(tipo)
							return (
								<button
									key={tipo}
									type="button"
									className="opcao-criacao"
									onClick={() => adicionar(tipo)}
								>
									<span className="opcao-criacao__icone" aria-hidden="true">
										<IconeAdicionar size={22} />
									</span>
									<span className="opcao-criacao__texto">
										<span className="opcao-criacao__titulo">{def.nome}</span>
										<span className="opcao-criacao__descricao">{def.descricao}</span>
									</span>
								</button>
							)
						})
					)}
				</div>
			) : removendo ? (
				<div className="formulario">
					<p className="nota">
						Remover o bloco{' '}
						<strong>{removendo.titulo || definicaoDoBloco(removendo.tipo).tituloPadrao}</strong>?
						O texto escrito nele é apagado. Para só esconder, use o olho na lista.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setRemovendo(null)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								salvar(blocos.filter((bloco) => bloco.id !== removendo.id))
								setRemovendo(null)
							}}
						>
							Remover
						</button>
					</div>
				</div>
			) : renomeando ? (
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						aplicarTitulo()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="titulo-bloco-projeto">
							Nome do bloco
						</label>
						<input
							id="titulo-bloco-projeto"
							data-foco-inicial
							className="campo"
							value={renomeando.texto}
							onChange={(evento) => setRenomeando({ ...renomeando, texto: evento.target.value })}
							placeholder="Ex.: Próximos passos"
							maxLength={60}
						/>
						<p className="nota" style={{ marginTop: 6 }}>
							Vazio volta ao nome padrão do bloco.
						</p>
					</div>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setRenomeando(null)}>
							Cancelar
						</button>
						<button type="submit" className="botao botao--primario">
							Salvar nome
						</button>
					</div>
				</form>
			) : escrevendo ? (
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						aplicarTexto()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="texto-bloco-projeto">
							Texto do bloco
						</label>
						<textarea
							id="texto-bloco-projeto"
							data-foco-inicial
							className="campo campo--area"
							rows={6}
							value={escrevendo.texto}
							onChange={(evento) => setEscrevendo({ ...escrevendo, texto: evento.target.value })}
							placeholder="Links, briefing curto, o que você quiser ter à mão dentro deste projeto"
						/>
					</div>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setEscrevendo(null)}>
							Cancelar
						</button>
						<button type="submit" className="botao botao--primario">
							Salvar texto
						</button>
					</div>
				</form>
			) : (
				<div className="editor-blocos">
					<p className="nota">
						A ordem e a visibilidade valem só para este projeto. Ocultar não apaga nada:
						o conteúdo volta quando você mostrar de novo.
					</p>

					<ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
						{blocos.map((bloco, indice) => {
							const def = definicaoDoBloco(bloco.tipo)
							return (
								<li
									key={bloco.id}
									className={
										bloco.oculto
											? 'editor-blocos__item editor-blocos__item--oculto'
											: 'editor-blocos__item'
									}
								>
									<span className="linha__icone" aria-hidden="true">
										{bloco.oculto ? <IconeOcultar size={20} /> : <IconeConcluido size={20} />}
									</span>
									<span className="editor-blocos__texto">
										<span className="linha__titulo">
											{bloco.titulo || def.tituloPadrao}
										</span>
										<span className="linha__meta">
											{bloco.oculto ? `Oculto · ${def.nome}` : def.nome}
										</span>
									</span>
									<span className="editor-blocos__acoes">
										{bloco.tipo === 'texto' ? (
											<button
												type="button"
												className="botao-icone botao-icone--pequeno"
												aria-label="Escrever no bloco de texto"
												onClick={() => setEscrevendo({ id: bloco.id, texto: bloco.texto ?? '' })}
											>
												<IconeConcluido size={18} />
											</button>
										) : null}
										<button
											type="button"
											className="botao-icone botao-icone--pequeno"
											aria-label={`Renomear ${def.nome}`}
											onClick={() => setRenomeando({ id: bloco.id, texto: bloco.titulo ?? '' })}
										>
											<IconeEditar size={18} />
										</button>
										<button
											type="button"
											className="botao-icone botao-icone--pequeno"
											aria-label={`Mover ${def.nome} para cima`}
											disabled={indice === 0}
											onClick={() => mover(indice, -1)}
										>
											<IconeSubir size={18} />
										</button>
										<button
											type="button"
											className="botao-icone botao-icone--pequeno"
											aria-label={`Mover ${def.nome} para baixo`}
											disabled={indice === blocos.length - 1}
											onClick={() => mover(indice, 1)}
										>
											<IconeDescer size={18} />
										</button>
										<button
											type="button"
											className="botao-icone botao-icone--pequeno"
											aria-label={
												bloco.oculto ? `Mostrar ${def.nome}` : `Ocultar ${def.nome}`
											}
											aria-pressed={Boolean(bloco.oculto)}
											onClick={() => alternarVisivel(bloco.id)}
										>
											<IconeOcultar size={18} />
										</button>
										{bloco.tipo === 'texto' ? (
											<button
												type="button"
												className="botao-icone botao-icone--pequeno"
												aria-label={`Remover ${def.nome}`}
												onClick={() => setRemovendo(bloco)}
											>
												<IconeApagar size={18} />
											</button>
										) : null}
									</span>
								</li>
							)
						})}
					</ul>

					<button
						type="button"
						className="botao botao--primario botao--bloco"
						onClick={() => setEscolhendo(true)}
						disabled={disponiveis.length === 0 && BLOCOS_DO_PROJETO.length === blocos.length}
					>
						<IconeAdicionar size={20} />
						Adicionar bloco
					</button>
				</div>
			)}
		</Folha>
	)
}
