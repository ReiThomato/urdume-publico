import { useState } from 'react'
import type { BlocoDoProjeto } from '@/db/db'
import { blocosDoProjeto } from '@/lib/blocos-projeto'
import { updateProject } from '@/db/repo'
import { IconeDescricao, IconeEditar } from '@/ui/icones'

/**
 * Bloco de texto livre dentro de um projeto.
 *
 * O conteúdo vive em `Project.blocos` (não numa tabela nova): é configuração
 * de tela, não dado de domínio. Editar aqui lê a configuração ATUAL do banco
 * antes de gravar — dois blocos de texto no mesmo projeto não podem se
 * sobrescrever, e a tela pode ter sido reordenada em outra aba.
 */
export function TextoDoBlocoDoProjeto({
	projetoId,
	bloco,
	titulo,
}: {
	projetoId: string
	bloco: BlocoDoProjeto
	titulo: string
}) {
	const [editando, setEditando] = useState(false)
	const [texto, setTexto] = useState(bloco.texto ?? '')
	const [salvando, setSalvando] = useState(false)

	async function salvar(): Promise<void> {
		setSalvando(true)
		try {
			const { db } = await import('@/db/db')
			const atual = await db.projects.get(projetoId)
			const blocos = atual ? blocosDoProjeto(atual) : []
			await updateProject(projetoId, {
				blocos: blocos.map((item) => (item.id === bloco.id ? { ...item, texto } : item)),
			})
			setEditando(false)
		} finally {
			setSalvando(false)
		}
	}

	return (
		<section className="secao" aria-label={titulo}>
			<div className="secao-cabecalho">
				<h2 className="secao-titulo">
					<span className="secao-titulo__icone" aria-hidden="true">
						<IconeDescricao size={17} />
					</span>
					{titulo}
				</h2>
				{editando ? null : (
					<button
						type="button"
						className="secao-acao"
						onClick={() => {
							setTexto(bloco.texto ?? '')
							setEditando(true)
						}}
					>
						<IconeEditar size={16} />
						Editar
					</button>
				)}
			</div>

			{editando ? (
				<div className="cartao bloco-texto__edicao">
					<textarea
						className="campo campo--area"
						rows={6}
						value={texto}
						onChange={(evento) => setTexto(evento.target.value)}
						aria-label={`Texto do bloco ${titulo}`}
						placeholder="Links, briefing curto, o que você quiser ter à mão dentro deste projeto"
					/>
					<div className="formulario__acoes">
						<button
							type="button"
							className="botao"
							onClick={() => setEditando(false)}
							disabled={salvando}
						>
							Cancelar
						</button>
						<button
							type="button"
							className="botao botao--primario"
							onClick={() => void salvar()}
							disabled={salvando}
						>
							{salvando ? 'Salvando…' : 'Salvar'}
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					className="bloco-texto"
					onClick={() => {
						setTexto(bloco.texto ?? '')
						setEditando(true)
					}}
				>
					{bloco.texto ? (
						<p className="bloco-texto__conteudo">{bloco.texto}</p>
					) : (
						<p className="nota">Toque para escrever. Recados, links, o que quiser à mão.</p>
					)}
				</button>
			)}
		</section>
	)
}
