import { useMemo } from 'react'
import { PaginaDeAjustes } from '@/ui/PaginaDeAjustes'
import { useSetting } from '@/db/repo'
import { CHAVE_DA_BARRA, DESTINOS, FIXOS, VAGAS_ESCOLHIVEIS, barraAtual } from '@/app/navegacao'
import type { IdDeDestino } from '@/app/navegacao'
import { setSetting } from '@/db/repo'
import { IconeAjustes, IconeFechar, IconeMais } from '@/ui/icones'

/**
 * Ajustes → Navegação.
 *
 * A barra aceita cinco lugares por padrão e seis no máximo. "Hoje", "Mais" e
 * "Ajustes" são fixos: são a espinha do app — o começo do dia, o índice de
 * tudo e a configuração. Os demais são escolhidos aqui.
 *
 * A tela mostra a barra como ela está, na ordem real, e a lista do que está
 * fora. Tocar num item fora o traz para a barra; tocar num item de dentro o
 * tira. Não há arrastar: reordenar por toque num celular é impreciso e, com
 * cinco itens, a ordem escolhida aqui é a ordem que vale — quem quiser outra
 * remove e readiciona.
 *
 * O que sai da barra NÃO some: vai para "Mais". Isso é dito na tela, porque é a
 * diferença entre "escolhi onde fica" e "perdi o acesso".
 */
export function AjustesNavegacao() {
	const salvo = useSetting<unknown>(CHAVE_DA_BARRA, null)
	const escolhidos = useMemo(() => barraAtual(salvo ?? null), [salvo])

	// Três lugares são fixos (Hoje, Mais, Ajustes). O que sobra é vaga.
	const escolhidosNaBarra = escolhidos.filter((id) => !FIXOS.includes(id))
	const vagasLivres = VAGAS_ESCOLHIVEIS - escolhidosNaBarra.length
	const fora = Object.values(DESTINOS)
		.filter((destino) => !escolhidos.includes(destino.id))
		.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

	async function mudar(id: IdDeDestino, incluir: boolean): Promise<void> {
		const proximo = incluir
			? [...escolhidos, id] as IdDeDestino[]
			: escolhidos.filter((atual: IdDeDestino) => atual !== id)
		await setSetting(CHAVE_DA_BARRA, proximo)
	}

	return (
		<PaginaDeAjustes
			titulo="Navegação"
			// O padrão são 5 lugares; o 6º é opção explícita. Mostrar "de 6" logo
			// de cara sugeriria que a barra nasce com uma vaga sobrando.
			/*
			 * A contagem é do que o usuário ESCOLHEU, não da barra inteira.
			 * Havia aqui uma mistura: com três escolhas e três fixos a prévia
			 * mostrava seis itens e o subtítulo dizia "5 de 5". O número que
			 * importa é quantas vagas ele usou — as fixas não são escolha.
			 */
			sobre={
				escolhidosNaBarra.length === VAGAS_ESCOLHIVEIS
					? `${escolhidosNaBarra.length} de ${VAGAS_ESCOLHIVEIS} · máximo`
					: `${escolhidosNaBarra.length} de 2 lugares`
			}
		>
			<section className="secao" aria-labelledby="secao-barra-atual">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-barra-atual">
						<span className="secao-titulo__icone" aria-hidden="true">
							<IconeAjustes size={18} />
						</span>
						Como está a barra
					</h2>
				</div>

				{/*
				 * A prévia é a própria barra, na ordem real. Mostrar uma lista
				 * vertical aqui faria o usuário montar uma coisa e ver outra na
				 * tela — a divergência de padrão que esta rodada corrige.
				 */}
				<div className="prev-bar">
					{escolhidos
						.filter((id) => id !== 'ajustes')
						.map((id) => {
							const destino = DESTINOS[id]
							const Icone = destino.icone
							const fixo = FIXOS.includes(id)
							return (
								<button
									key={id}
									type="button"
									className="prev-bar__item"
									disabled={fixo}
									aria-label={fixo ? `${destino.rotulo}, fixo` : `Tirar ${destino.rotulo} da barra`}
									onClick={() => void mudar(id, false)}
								>
									<span className="prev-bar__icone" aria-hidden="true">
										<Icone size={22} />
									</span>
									<span className="prev-bar__rotulo">{destino.rotulo}</span>
									{fixo ? (
										<span className="prev-bar__fixo">fixo</span>
									) : (
										<span className="prev-bar__tirar" aria-hidden="true">
											<IconeFechar size={11} />
										</span>
									)}
								</button>
							)
						})}
					{/*
					 * O "Mais" é FIXO: entra sempre, na penúltima posição, e não
					 * tem botão de tirar. Antes ele aparecia como "fantasma" e
					 * desaparecia com seis itens, o que dava a impressão de que
					 * podia ser substituído.
					 */}
					<span className="prev-bar__item prev-bar__item--fixo">
						<span className="prev-bar__icone" aria-hidden="true">
							<IconeMais size={22} />
						</span>
						<span className="prev-bar__rotulo">Mais</span>
						<span className="prev-bar__fixo">fixo</span>
					</span>
					<span className="prev-bar__item prev-bar__item--fixo">
						<span className="prev-bar__icone" aria-hidden="true">
							<IconeAjustes size={22} />
						</span>
						<span className="prev-bar__rotulo">Ajustes</span>
						<span className="prev-bar__fixo">fixo</span>
					</span>
				</div>

				<p className="nota" style={{ marginTop: 'var(--s-3)' }}>
					<strong>Hoje</strong>, <strong>Mais</strong> e <strong>Ajustes</strong> não mudam de lugar: são o começo
					do dia e a configuração. O que não está na barra continua em <strong>Mais</strong>.
				</p>
			</section>

			<section className="secao" aria-labelledby="secao-fora">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-fora">
						Fora da barra
					</h2>
					<span className="nota">
						{vagasLivres > 0
							? `${vagasLivres} ${vagasLivres === 1 ? 'lugar livre' : 'lugares livres'}`
							: 'Barra cheia'}
					</span>
				</div>

				{fora.length === 0 ? (
					<p className="nota">Todas as telas já estão na barra.</p>
				) : (
					<div className="linha-grupo">
						{fora.map((destino) => {
							const Icone = destino.icone
							const cabe = vagasLivres > 0
							return (
								<button
									key={destino.id}
									type="button"
									className="linha-ajuste linha-ajuste--entrada"
									disabled={!cabe}
									onClick={() => void mudar(destino.id, true)}
								>
									<span className="linha-ajuste__icone" aria-hidden="true">
										<Icone size={20} />
									</span>
									<span className="linha-ajuste__texto">
										<span className="linha-ajuste__titulo">{destino.rotulo}</span>
										<span className="linha-ajuste__descricao">
											{cabe ? 'Tocar para pôr na barra' : 'Tire um item antes de pôr este'}
										</span>
									</span>
								</button>
							)
						})}
					</div>
				)}
			</section>

			<p className="nota" style={{ marginTop: 'var(--s-4)' }}>
				Padrão: cinco lugares. O máximo é seis. <strong>Hoje</strong>, <strong>Mais</strong> e{' '}
				<strong>Ajustes</strong> são fixos — nunca saem, nunca são substituídos.
			</p>
		</PaginaDeAjustes>
	)
}
