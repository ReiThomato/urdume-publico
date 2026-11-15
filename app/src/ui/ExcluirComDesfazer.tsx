import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Folha } from '@/ui/Folha'
import { IconeApagar } from '@/ui/icones'
import { tentar } from '@/lib/escrita'
import { escrever } from '@/lib/falhas'

/**
 * Exclusão com desfazer — UMA implementação para todas as telas.
 *
 * Antes cada tela tinha a sua: o Início apagava e mostrava "Excluída: X —
 * Desfazer" por 4 s (`Inicio.tsx`); Tarefas, Projeto e a Agenda apagavam no
 * primeiro toque, sem confirmação e sem volta. A mesma lixeira dava quatro
 * resultados diferentes conforme a tela — e o desfazer, quando existia, era
 * código copiado que só o Início tinha.
 *
 * A regra agora é uma: confirmar antes, apagar com exclusão suave e oferecer
 * 4 s para restaurar O REGISTRO (não uma cópia). Quem chama diz como apagar e
 * como restaurar; o componente cuida da folha, do tempo e da faixa.
 */

/** Item que pode ser excluído. `titulo` é o que aparece na confirmação. */
export interface AlvoParaExcluir {
	id: string
	titulo: string
}

export interface PedidoDeDesfazer {
	texto: string
	restaurar: () => Promise<unknown>
}

/**
 * Quanto tempo a faixa de desfazer fica na tela.
 *
 * 4 s era curto demais para um gesto destrutivo: quem excluiu por engano e
 * levou dois segundos para entender o que aconteceu já tinha perdido a janela.
 * 8 s é o padrão que o Material usa para snackbars com ação — tempo de ler e
 * reagir sem prender a tela. Passado isso, o item não some: fica na Lixeira.
 */
export const DURACAO_DO_DESFAZER = 8000

/**
 * Estado da faixa de desfazer, para telas que excluem por dentro de um
 * formulário (e por isso não usam a folha de `ExcluirComDesfazer`).
 */
export function useDesfazerExclusao(duracaoMs = DURACAO_DO_DESFAZER): {
	pendente: PedidoDeDesfazer | null
	anunciar: (pedido: PedidoDeDesfazer) => void
	fechar: () => void
	desfazer: () => void
} {
	const [pendente, setPendente] = useState<PedidoDeDesfazer | null>(null)
	const timer = useRef<number | undefined>(undefined)
	// Espelho do estado para o desfazer não depender de um updater com efeito
	// colateral (o React pode chamar o updater duas vezes no modo estrito).
	const atualRef = useRef<PedidoDeDesfazer | null>(null)

	const cancelarTimer = (): void => {
		window.clearTimeout(timer.current)
		timer.current = undefined
	}

	const anunciar = useCallback(
		(pedido: PedidoDeDesfazer): void => {
			cancelarTimer()
			atualRef.current = pedido
			setPendente(pedido)
			timer.current = window.setTimeout(() => {
				atualRef.current = null
				setPendente(null)
			}, duracaoMs)
		},
		[duracaoMs],
	)

	const fechar = useCallback((): void => {
		cancelarTimer()
		atualRef.current = null
		setPendente(null)
	}, [])

	const desfazer = useCallback((): void => {
		cancelarTimer()
		const alvo = atualRef.current
		atualRef.current = null
		// A faixa some primeiro: o desfazer é uma escrita e pode demorar um
		// quadro; deixar o botão na tela convida ao toque duplo.
		setPendente(null)
		// `escrever` nunca rejeita e sobe a falha para a faixa do Shell: uma
		// restauração que falha não pode virar `unhandledrejection`.
		if (alvo) void escrever(alvo.restaurar)
	}, [])

	// Sair da tela sem fechar a faixa deixaria um timer escrevendo depois.
	useEffect(() => cancelarTimer, [])

	return { pendente, anunciar, fechar, desfazer }
}

/** A faixa escura no rodapé: "Excluída: X — Desfazer". */
export function FaixaDesfazer({
	texto,
	onDesfazer,
	onFechar,
}: {
	texto: string
	onDesfazer: () => void
	onFechar: () => void
}) {
	return (
		<div className="desfazer" role="status" aria-live="polite">
			<span className="desfazer__texto">{texto}</span>
			<button type="button" className="botao botao--texto" onClick={onDesfazer}>
				Desfazer
			</button>
			{/* Usa a classe de botão de texto porque `.desfazer` troca a cor do
			    texto para a paleta inversa; um botão-ícone comum ficaria ilegível
			    sobre o fundo escuro. */}
			<button
				type="button"
				className="botao botao--texto"
				aria-label="Fechar aviso de exclusão"
				onClick={onFechar}
			>
				<span aria-hidden="true">×</span>
			</button>
		</div>
	)
}

export interface ExcluirComDesfazerProps {
	/** Item escolhido; `null` mantém folha e faixa fechadas. */
	alvo: AlvoParaExcluir | null
	/** Título da folha. */
	titulo?: string
	/** Texto da confirmação; recebe o alvo para citar o nome. */
	descricao: (alvo: AlvoParaExcluir) => ReactNode
	/** Texto da faixa depois de excluir. */
	textoDoDesfazer?: (alvo: AlvoParaExcluir) => string
	rotuloConfirmar?: string
	/**
	 * Apaga de verdade. Precisa ser exclusão suave: o desfazer usa
	 * `onDesfazer` para trazer o MESMO registro de volta.
	 */
	onExcluir: (alvo: AlvoParaExcluir) => Promise<unknown>
	/** Restaura o registro excluído. */
	onDesfazer: (alvo: AlvoParaExcluir) => Promise<unknown>
	/** Chamado depois de excluir (para a tela navegar, fechar uma lista…). */
	onExcluido?: (alvo: AlvoParaExcluir) => void
	onFechar: () => void
	duracaoMs?: number
}

/**
 * Folha de confirmação + faixa de desfazer, juntas.
 *
 * Manter as duas no mesmo componente é o que garante que "confirmar" e
 * "desfazer" nunca se separem: era exatamente essa separação que fazia uma tela
 * apagar no primeiro toque enquanto outra pedia confirmação.
 */
export function ExcluirComDesfazer({
	alvo,
	titulo = 'Excluir',
	descricao,
	textoDoDesfazer,
	rotuloConfirmar = 'Excluir',
	onExcluir,
	onDesfazer,
	onExcluido,
	onFechar,
	duracaoMs,
}: ExcluirComDesfazerProps) {
	const { pendente, anunciar, fechar, desfazer } = useDesfazerExclusao(duracaoMs)
	const [erro, setErro] = useState<string | null>(null)
	const [apagando, setApagando] = useState(false)

	const confirmar = async (item: AlvoParaExcluir): Promise<void> => {
		// O erro é preso AQUI, não na faixa global: se a exclusão falhar, a folha
		// continua aberta com o aviso, e não aparece um "Desfazer" para algo que
		// nunca saiu da tela.
		const resultado = await tentar(() => onExcluir(item))
		if (!resultado.ok) {
			setErro(resultado.erro ?? 'Não foi possível excluir.')
			return
		}

		setErro(null)
		onFechar()
		onExcluido?.(item)
		// O texto carrega o nome: a folha já fechou e `alvo` veio a `null`.
		anunciar({
			texto: textoDoDesfazer?.(item) ?? `Excluída: ${item.titulo}`,
			restaurar: async () => onDesfazer(item),
		})
	}

	return (
		<>
			<Folha titulo={titulo} aberta={alvo !== null} onFechar={onFechar}>
				<div className="formulario">
					<p className="nota">{alvo ? descricao(alvo) : null}</p>
					{erro ? (
						<p className="erro" role="alert">
							{erro}
						</p>
					) : null}
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={onFechar}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							disabled={apagando}
							onClick={() => {
								if (!alvo || apagando) return
								setApagando(true)
								void confirmar(alvo).finally(() => setApagando(false))
							}}
						>
							<IconeApagar size={18} />
							{rotuloConfirmar}
						</button>
					</div>
				</div>
			</Folha>

			{pendente ? <FaixaDesfazer texto={pendente.texto} onDesfazer={desfazer} onFechar={fechar} /> : null}
		</>
	)
}
