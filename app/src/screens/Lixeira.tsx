import { useState } from 'react'
import { PaginaDeAjustes } from '@/ui/PaginaDeAjustes'
import { Folha } from '@/ui/Folha'
import { useLixeira } from '@/lib/lixeira'
import type { ItemDaLixeira } from '@/lib/lixeira'
import { apagarDeVez, restaurarDaLixeira } from '@/lib/lixeira'
import { IconeApagar } from '@/ui/icones'

/**
 * Lixeira.
 *
 * Antes não existia. A exclusão do app é suave desde o começo — o registro
 * ficava no banco com `deletedAt` — mas nenhuma tela mostrava esses registros.
 * A faixa de desfazer durava 4 s; depois disso o item estava perdido de vez,
 * ocupando espaço e sem caminho de volta. Aqui ele aparece, com data, e o
 * usuário escolhe: devolver à lista ou apagar mesmo.
 *
 * "Apagar de vez" pede confirmação e diz o que vai junto (um projeto leva as
 * tarefas e páginas dele). Restaurar não pede: é sempre o caminho seguro.
 */

const ROTULO: Record<ItemDaLixeira['tipo'], string> = {
	tarefa: 'Tarefa',
	projeto: 'Projeto',
	lembrete: 'Lembrete',
	evento: 'Evento',
	habito: 'Hábito',
}

function dataCurta(em: number): string {
	if (!em) return 'sem data'
	const data = new Date(em)
	return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function Lixeira() {
	const itens = useLixeira()
	const [confirmando, setConfirmando] = useState<ItemDaLixeira | null>(null)
	const [mensagem, setMensagem] = useState<string | null>(null)
	const [erro, setErro] = useState<string | null>(null)
	const [ocupado, setOcupado] = useState(false)

	async function restaurar(item: ItemDaLixeira): Promise<void> {
		setOcupado(true)
		setErro(null)
		try {
			await restaurarDaLixeira(item.tipo, item.id)
			setMensagem(`"${item.titulo}" voltou para a lista.`)
		} catch (causa) {
			setErro(causa instanceof Error ? causa.message : 'Não foi possível restaurar.')
		} finally {
			setOcupado(false)
		}
	}

	async function apagar(): Promise<void> {
		if (!confirmando) return
		setOcupado(true)
		setErro(null)
		try {
			await apagarDeVez(confirmando.tipo, confirmando.id)
			setMensagem(`"${confirmando.titulo}" foi apagado de vez.`)
			setConfirmando(null)
		} catch (causa) {
			setErro(causa instanceof Error ? causa.message : 'Não foi possível apagar.')
		} finally {
			setOcupado(false)
		}
	}

	const total = itens?.length ?? 0

	return (
		<PaginaDeAjustes
			titulo="Lixeira"
			sobre={total === 0 ? 'Nada excluído' : `${total} ${total === 1 ? 'item' : 'itens'} excluído${total === 1 ? '' : 's'}`}
		>
			{mensagem ? (
				<p className="aviso aviso--ok" role="status">
					{mensagem}
				</p>
			) : null}
			{erro ? (
				<p className="aviso aviso--erro" role="alert">
					{erro}
				</p>
			) : null}

			{itens === undefined ? (
				<p className="nota">Lendo a lixeira…</p>
			) : total === 0 ? (
				<div className="cartao cartao--vazio">
					<span className="vazio__icone" aria-hidden="true">
						<IconeApagar size={22} />
					</span>
					<p>
						Nada aqui. Tudo o que você excluir aparece nesta tela e pode voltar —
						até você apagar de vez.
					</p>
				</div>
			) : (
				<ul className="lixeira-lista">
					{itens.map((item) => (
						<li key={`${item.tipo}:${item.id}`} className="lixeira-item">
							<div className="lixeira-item__texto">
								<span className="lixeira-selo">{ROTULO[item.tipo]}</span>
								<span className="lixeira-item__titulo">{item.titulo}</span>
								<span className="nota">
									Excluído em {dataCurta(item.excluidoEm)}
									{item.detalhe ? ` · ${item.detalhe}` : ''}
								</span>
							</div>
							<div className="lixeira-item__acoes">
								<button
									type="button"
									className="botao botao--texto"
									disabled={ocupado}
									onClick={() => void restaurar(item)}
								>
									Restaurar
								</button>
								<button
									type="button"
									className="botao botao--texto botao--perigo"
									disabled={ocupado}
									onClick={() => {
										setMensagem(null)
										setConfirmando(item)
									}}
								>
									Apagar
								</button>
							</div>
						</li>
					))}
				</ul>
			)}

			<p className="nota" style={{ marginTop: 'var(--s-4)' }}>
				Restaurar devolve o item à tela de origem. Apagar de vez não tem volta — por
				isso ele sempre pergunta antes.
			</p>

			<Folha
				titulo={`Apagar "${confirmando?.titulo ?? ''}" de vez?`}
				aberta={confirmando !== null}
				onFechar={() => setConfirmando(null)}
				sobre="Esta ação não tem desfazer"
			>
				<div className="formulario">
					<p>
						O registro sai do banco deste aparelho. Se você sincroniza com outro
						aparelho, ele pode voltar no próximo ciclo — apague lá também se quiser
						que suma de vez.
					</p>
					{confirmando?.tipo === 'projeto' ? (
						<p className="nota">
							As tarefas e páginas deste projeto que já estavam excluídas vão junto.
						</p>
					) : null}
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmando(null)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							disabled={ocupado}
							onClick={() => void apagar()}
						>
							{ocupado ? 'Apagando…' : 'Apagar de vez'}
						</button>
					</div>
				</div>
			</Folha>
		</PaginaDeAjustes>
	)
}
