import { useState } from 'react'
import { BLOCOS, definicao, novIdBloco } from '@/app/blocos'
import type { Bloco, TipoBloco } from '@/app/blocos'
import { setSetting } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import {
	IconeAdicionar,
	IconeApagar,
	IconeConcluido,
	IconeEditar,
	IconeSubir,
	IconeDescer,
} from '@/ui/icones'

/**
 * Editor do Início: escolher blocos, renomear, reordenar, remover e escrever
 * texto livre.
 *
 * Reordenar usa botões (acima/abaixo) em vez de arrastar: funciona no toque, no
 * teclado e com leitor de tela, e o resultado é o mesmo.
 */
export function EditorBlocos({
	aberto,
	onFechar,
	blocos,
}: {
	aberto: boolean
	onFechar: () => void
	blocos: Bloco[]
}) {
	const [escolhendo, setEscolhendo] = useState(false)
	const [renomeando, setRenomeando] = useState<{ id: string; texto: string } | null>(null)
	const [escrevendo, setEscrevendo] = useState<{ id: string; texto: string } | null>(null)
	const [removendo, setRemovendo] = useState<Bloco | null>(null)

	const salvar = (novos: Bloco[]): void => {
		void setSetting('inicio.blocos', novos)
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

	const adicionar = (tipo: TipoBloco): void => {
		salvar([...blocos, { id: novIdBloco(), tipo }])
		setEscolhendo(false)
	}

	const aplicarTitulo = (): void => {
		if (!renomeando) return
		salvar(blocos.map((b) => (b.id === renomeando.id ? { ...b, titulo: renomeando.texto.trim() } : b)))
		setRenomeando(null)
	}

	const aplicarTexto = (): void => {
		if (!escrevendo) return
		salvar(blocos.map((b) => (b.id === escrevendo.id ? { ...b, texto: escrevendo.texto } : b)))
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
		<Folha titulo="Montar o Início" aberta={aberto} onFechar={onFechar} passo={passo}>
			{escolhendo ? (
				<div className="opcoes-criacao">
					{BLOCOS.map((def) => {
						const Icone = def.icone
						return (
							<button
								key={def.tipo}
								type="button"
								className="opcao-criacao"
								onClick={() => adicionar(def.tipo)}
							>
								<span className="opcao-criacao__icone" aria-hidden="true">
									<Icone size={22} />
								</span>
								<span className="opcao-criacao__texto">
									<span className="opcao-criacao__titulo">{def.nome}</span>
									<span className="opcao-criacao__descricao">{def.descricao}</span>
								</span>
							</button>
						)
					})}
				</div>
			) : removendo ? (
				<div className="formulario">
					<p className="nota">
						Remover o bloco <strong>{removendo.titulo || definicao(removendo.tipo).tituloPadrao}</strong>?
						O conteúdo (tarefas, hábitos) continua existindo — só deixa de aparecer no Início.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setRemovendo(null)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								salvar(blocos.filter((b) => b.id !== removendo.id))
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
						<label className="campo-rotulo" htmlFor="titulo-bloco">
							Nome do bloco
						</label>
						<input
							id="titulo-bloco"
							data-foco-inicial
							className="campo"
							value={renomeando.texto}
							onChange={(evento) => setRenomeando({ ...renomeando, texto: evento.target.value })}
							placeholder="Ex.: Coisas de casa"
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
						<label className="campo-rotulo" htmlFor="texto-bloco">
							Texto do quadro
						</label>
						<textarea
							id="texto-bloco"
							data-foco-inicial
							className="campo campo--area"
							rows={6}
							value={escrevendo.texto}
							onChange={(evento) => setEscrevendo({ ...escrevendo, texto: evento.target.value })}
							placeholder="Recados, links, o que você quiser ter à mão"
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
					{blocos.length === 0 ? (
						<p className="nota">
							Sem blocos. Adicione o que você quer ver ao abrir o app — nada é fixo.
						</p>
					) : (
						<ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
							{blocos.map((bloco, indice) => {
								const def = definicao(bloco.tipo)
								const Icone = def.icone
								return (
									<li key={bloco.id} className="editor-blocos__item">
										<span className="linha__icone" aria-hidden="true">
											<Icone size={20} />
										</span>
										<span className="editor-blocos__texto">
											<span className="linha__titulo">{bloco.titulo || def.tituloPadrao}</span>
											<span className="linha__meta">{def.nome}</span>
										</span>
										<span className="editor-blocos__acoes">
											{bloco.tipo === 'texto' ? (
												<button
													type="button"
													className="botao-icone botao-icone--pequeno"
													aria-label={`Escrever no bloco ${def.nome}`}
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
												aria-label={`Remover ${def.nome}`}
												onClick={() => setRemovendo(bloco)}
											>
												<IconeApagar size={18} />
											</button>
										</span>
									</li>
								)
							})}
						</ul>
					)}

					<button
						type="button"
						className="botao botao--primario botao--bloco"
						onClick={() => setEscolhendo(true)}
					>
						<IconeAdicionar size={20} />
						Adicionar bloco
					</button>
				</div>
			)}
		</Folha>
	)
}

/** Edição inline do texto de um bloco de texto livre. */
export function TextoDoBloco({ bloco }: { bloco: Bloco }) {
	const [editando, setEditando] = useState(false)
	const [texto, setTexto] = useState(bloco.texto ?? '')

	if (editando) {
		return (
			<div className="cartao bloco-texto__edicao">
				<textarea
					className="campo campo--area"
					rows={5}
					value={texto}
					onChange={(evento) => setTexto(evento.target.value)}
					aria-label="Texto do bloco"
				/>
				<div className="formulario__acoes">
					<button type="button" className="botao" onClick={() => setEditando(false)}>
						Cancelar
					</button>
					<button
						type="button"
						className="botao botao--primario"
						onClick={() => {
							void atualizar(bloco.id, texto)
							setEditando(false)
						}}
					>
						Salvar
					</button>
				</div>
			</div>
		)
	}

	return (
		<button type="button" className="bloco-texto" onClick={() => setEditando(true)}>
			{bloco.texto ? (
				<p className="bloco-texto__conteudo">{bloco.texto}</p>
			) : (
				<p className="nota">Toque para escrever. Recados, links, o que quiser à mão.</p>
			)}
		</button>
	)
}

/**
 * Atualiza o texto de um bloco sem sobrescrever os outros: lê a lista atual do
 * storage e troca só o item editado.
 */
async function atualizar(id: string, texto: string): Promise<void> {
	const { db } = await import('@/db/db')
	const linha = await db.settings.get('inicio.blocos')
	const lista = (linha?.value as Bloco[] | undefined) ?? []
	await setSetting(
		'inicio.blocos',
		lista.map((b) => (b.id === id ? { ...b, texto } : b)),
	)
}
