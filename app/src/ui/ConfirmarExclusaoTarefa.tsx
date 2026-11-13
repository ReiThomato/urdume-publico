import { Folha } from '@/ui/Folha'
import { IconeApagar } from '@/ui/icones'

export interface ConfirmarExclusaoTarefaProps {
	/** Tarefa escolhida no atalho de lixeira; `null` mantém a folha fechada. */
	tarefa: { id: string; title: string } | null
	onFechar: () => void
	onExcluir: (tarefa: { id: string; title: string }) => Promise<void> | void
}

/**
 * Confirmação de exclusão de uma tarefa.
 *
 * Existia em três cópias (Início, Tarefas, Projeto) com textos e botões
 * diferentes: uma delas não tinha ícone, outra não oferecia desfazer. Aqui é uma
 * só, e quem chama decide o efeito de excluir — o Início adiciona o desfazer,
 * Tarefas e Projeto apenas apagam.
 */
export function ConfirmarExclusaoTarefa({ tarefa, onFechar, onExcluir }: ConfirmarExclusaoTarefaProps) {
	return (
		<Folha titulo="Excluir tarefa" aberta={tarefa !== null} onFechar={onFechar}>
			<div className="formulario">
				<p className="nota">
					Excluir <strong>{tarefa?.title}</strong>? Ela sai de todas as visões deste aparelho.
				</p>
				<div className="formulario__acoes">
					<button type="button" className="botao" onClick={onFechar}>
						Manter
					</button>
					<button
						type="button"
						className="botao botao--perigo-solido"
						onClick={() => {
							if (!tarefa) return
							void onExcluir(tarefa)
						}}
					>
						<IconeApagar size={18} />
						Excluir
					</button>
				</div>
			</div>
		</Folha>
	)
}
