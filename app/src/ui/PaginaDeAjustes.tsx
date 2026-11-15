import type { ReactNode } from 'react'
import { Link } from '@/app/router'
import type { Route } from '@/app/router'
import { Topo } from '@/ui/AppShell'
import { IconeAvancar } from '@/ui/icones'

/**
 * Página interna dos Ajustes.
 *
 * O problema que isto resolve: Ajustes era UMA rolagem com sete seções
 * (aparência, acessibilidade, dados, IA, aparelho, versão).
 * Quem procurava o teto mensal da IA passava por temas, backup e aparelho;
 * e a tela crescia a cada recurso novo.
 *
 * A solução NÃO é comprimir os controles em cartões apertados: é separar por
 * assunto. A tela inicial vira um índice de linhas grandes, no padrão do
 * Material, e cada assunto ganha uma página própria com os MESMOS controles, no
 * MESMO tamanho de antes.
 *
 * Cada subpágina tem o botão de voltar no topo, mantendo o padrão das outras
 * telas internas (projeto, hábito, página).
 */
export function PaginaDeAjustes({
	titulo,
	sobre,
	children,
}: {
	titulo: string
	sobre?: string
	children: ReactNode
}) {
	return (
		<div className="tela">
			<Topo
				titulo={titulo}
				sobre={sobre}
				antes={
					<Link route={{ name: 'ajustes' }} className="botao-icone" ariaLabel="Voltar aos ajustes">
						<IconeAvancar size={22} style={{ transform: 'rotate(180deg)' }} />
					</Link>
				}
			/>
			<div className="conteudo">{children}</div>
		</div>
	)
}

/**
 * Linha de entrada para uma subpágina.
 *
 * Usa `Link` (uma âncora de verdade): funciona com teclado, leitor de tela,
 * botão voltar do Android e abrir em nova aba. Não é `div` com `onClick`.
 */
export function LinhaDeAjuste({
	rota,
	titulo,
	descricao,
	icone,
	valor,
}: {
	rota: Route
	titulo: string
	descricao: string
	icone: ReactNode
	/** Resumo do estado atual, à direita — evita entrar para conferir. */
	valor?: string
}) {
	return (
		<Link route={rota} className="linha-ajuste linha-ajuste--entrada">
			<span className="linha-ajuste__icone" aria-hidden="true">
				{icone}
			</span>
			<span className="linha-ajuste__texto">
				<span className="linha-ajuste__titulo">{titulo}</span>
				<span className="linha-ajuste__descricao">{descricao}</span>
				{valor ? <span className="linha-ajuste__valor">{valor}</span> : null}
			</span>
			<IconeAvancar size={18} className="linha-ajuste__seta" aria-hidden="true" />
		</Link>
	)
}
