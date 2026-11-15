import { useState } from 'react'
import { Link, useRouter } from '@/app/router'
import type { Route } from '@/app/router'
import { DESTINOS, MAIS, montarBarra, normalizarBarra, CHAVE_DA_BARRA } from '@/app/navegacao'
import type { Destino, IdDeDestino } from '@/app/navegacao'
import { useSetting } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import { capitalizar, formatarDiaLongo } from '@/lib/date'
import { IconeAvancar, IconeRaio } from '@/ui/icones'

/**
 * Barra inferior.
 *
 * Cinco lugares por padrão, como os aplicativos grandes no celular. O item
 * ativo é marcado por um indicador que desliza — uma animação só, composta na
 * GPU, em vez de cada item animando o próprio fundo (dois itens animavam ao
 * mesmo tempo e o fundo "piscava" até assentar).
 *
 * O desenho é o mesmo para item fixo e item escolhido: a barra não denuncia
 * quem é quem. Quem explica isso é a tela de personalização, não o layout.
 */

/** Um item da barra. O "Mais" não é destino: abre a folha. */
function ItemDaBarra({
	rotulo,
	icone: Icone,
	ativo,
	rota,
	aoAbrir,
}: {
	rotulo: string
	icone: Destino['icone']
	ativo: boolean
	rota?: Route
	aoAbrir?: () => void
}) {
	const conteudo = (
		<>
			<span className="destino__icone" aria-hidden="true">
				<Icone size={23} />
			</span>
			<span className="destino__rotulo" aria-hidden="true">
				{rotulo}
			</span>
		</>
	)

	if (rota) {
		return (
			<Link
				route={rota}
				className="destino"
				ariaLabel={rotulo}
				ariaCurrent={ativo ? 'page' : undefined}
				title={rotulo}
			>
				{conteudo}
			</Link>
		)
	}

	return (
		<button
			type="button"
			className={ativo ? 'destino destino--ativo' : 'destino'}
			aria-label={rotulo}
			aria-current={ativo ? 'page' : undefined}
			title={rotulo}
			onClick={aoAbrir}
		>
			{conteudo}
		</button>
	)
}

export function BarraInferior() {
	const { route } = useRouter()
	const salvo = useSetting<unknown>(CHAVE_DA_BARRA, null)
	const [maisAberto, setMaisAberto] = useState(false)

	const escolhidos = normalizarBarra(salvo ?? null)
	const { barra, restantes } = montarBarra(escolhidos)

	// O "Mais" fica ativo quando a tela atual mora dentro dele.
	const naBarra = new Set(escolhidos)
	const dentroDoMais = Object.values(DESTINOS).some(
		(destino) => !naBarra.has(destino.id) && destino.id !== 'inicio' && destino.id !== 'ajustes' && destino.correspondencia(route),
	)
	const ativo = barra.findIndex((item) =>
		item.id === 'mais' ? dentroDoMais : item.correspondencia(route),
	)

	return (
		<>
			<nav className="navegacao" aria-label="Navegação principal">
				<div
					className="destinos"
					data-ativo={ativo >= 0 ? ativo : undefined}
					style={{ '--qtd-destinos': barra.length } as React.CSSProperties}
				>
					<span className="destinos__indicador" aria-hidden="true" />
					{barra.map((item) => {
						if (item.id === 'mais') {
							return (
								<ItemDaBarra
									key="mais"
									rotulo={MAIS.rotulo}
									icone={MAIS.icone}
									ativo={dentroDoMais}
									aoAbrir={() => setMaisAberto(true)}
								/>
							)
						}

						const destino = item as Destino
						return (
							<ItemDaBarra
								key={destino.id}
								rotulo={destino.rotulo}
								icone={destino.icone}
								ativo={destino.correspondencia(route)}
								rota={destino.rota}
							/>
						)
					})}
				</div>
			</nav>

			<Folha
				titulo="Mais"
				aberta={maisAberto}
				onFechar={() => setMaisAberto(false)}
				sobre={capitalizar(formatarDiaLongo(new Date()))}
			>
				<MaisConteudo restantes={restantes} onNavegar={() => setMaisAberto(false)} />
			</Folha>
		</>
	)
}

/**
 * Conteúdo da folha "Mais".
 *
 * Lista os destinos que não cabem na barra, em linhas grandes no padrão dos
 * Ajustes (ícone, título, descrição, seta). A conversa do Jarvis entra aqui
 * como atalho próprio: é uma tela, não um lugar da barra, e é o caminho mais
 * curto para "falar com a IA" sem passar pela central.
 */
function MaisConteudo({
	restantes,
	onNavegar,
}: {
	restantes: Destino[]
	onNavegar: () => void
}) {
	const DESCRICAO: Partial<Record<IdDeDestino, string>> = {
		habitos: 'O que se repete: sequência, meta e mapa de calor.',
		agenda: 'Mês, dia e os compromissos com hora.',
		jarvis: 'Modo, observações, autonomia e o que ela aprendeu.',
		tarefas: 'Listas, filtros e prioridades.',
		projetos: 'Agrupam tarefas, anotações e prazos.',
	}

	return (
		<div className="mais-folha">
			{/*
			 * Uma entrada por lugar, e só. Havia aqui um atalho "Conversar com
			 * o Jarvis" no topo e, logo abaixo, o "Jarvis" na lista de telas —
			 * dois caminhos para a mesma central, mais o FAB. Agora o "Jarvis"
			 * da lista é o único; a conversa direta fica no FAB do chat.
			 */}
			{restantes.length > 0 ? (
				<>
					<div className="linha-grupo">
						{restantes.map((destino) => {
							const Icone = destino.icone
							return (
								<Link
									key={destino.id}
									route={destino.rota}
									className="linha-ajuste linha-ajuste--entrada"
									onClick={onNavegar}
								>
									<span className="linha-ajuste__icone" aria-hidden="true">
										<Icone size={20} />
									</span>
									<span className="linha-ajuste__texto">
										<span className="linha-ajuste__titulo">{destino.rotulo}</span>
										{DESCRICAO[destino.id] ? (
											<span className="linha-ajuste__descricao">{DESCRICAO[destino.id]}</span>
										) : null}
									</span>
									<IconeAvancar size={18} className="linha-ajuste__seta" aria-hidden="true" />
								</Link>
							)
						})}
					</div>
				</>
			) : (
				<p className="nota" style={{ marginTop: 'var(--s-3)' }}>
					Todas as telas estão na barra. Para trocar quais ficam nela, abra Ajustes →
					Navegação.
				</p>
			)}

			<Link
				route={{ name: 'ajustes-navegacao' as never }}
				className="botao botao--texto mais-folha__personalizar"
				onClick={onNavegar}
			>
				<IconeRaio size={16} />
				Personalizar a barra
			</Link>
		</div>
	)
}
