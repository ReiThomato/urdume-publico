import { useCallback, useEffect } from 'react'
import { getSetting, setSetting, useSetting } from '@/db/repo'

/**
 * Acessibilidade: tamanho de texto, contraste e movimento.
 *
 * A ideia é não depender do sistema: quem precisa de letra maior ajusta dentro
 * do app (Android 7+ nem sempre respeita o tamanho do sistema no WebView), e o
 * alto contraste passa a existir como opção explícita (WCAG 1.4.6, nível AAA).
 */
export type TamanhoTexto = 'normal' | 'grande' | 'maior'

export function useAcessibilidade(): {
	tamanho: TamanhoTexto
	altoContraste: boolean
	reduzirMovimento: boolean
	mudar: (patch: { tamanho?: TamanhoTexto; altoContraste?: boolean; reduzirMovimento?: boolean }) => void
} {
	const tamanho = useSetting<TamanhoTexto>('a11y.tamanho', 'normal')
	const altoContraste = useSetting<boolean>('a11y.altoContraste', false)
	const reduzirMovimento = useSetting<boolean>('a11y.reduzirMovimento', false)

	const mudar = useCallback(
		(patch: { tamanho?: TamanhoTexto; altoContraste?: boolean; reduzirMovimento?: boolean }) => {
			if (patch.tamanho) void setSetting('a11y.tamanho', patch.tamanho)
			if (patch.altoContraste !== undefined) void setSetting('a11y.altoContraste', patch.altoContraste)
			if (patch.reduzirMovimento !== undefined) void setSetting('a11y.reduzirMovimento', patch.reduzirMovimento)
		},
		[],
	)

	useEffect(() => {
		const raiz = document.documentElement
		raiz.setAttribute('data-texto', tamanho ?? 'normal')
		raiz.setAttribute('data-contraste', altoContraste ? 'alto' : 'normal')
		raiz.setAttribute('data-movimento', reduzirMovimento ? 'reduzido' : 'normal')
	}, [tamanho, altoContraste, reduzirMovimento])

	return {
		tamanho: tamanho ?? 'normal',
		altoContraste: altoContraste ?? false,
		reduzirMovimento: reduzirMovimento ?? false,
		mudar,
	}
}

/** Aplica os atributos antes do primeiro render, evitando "pulo" de layout. */
export async function aplicarAcessibilidadeSalva(): Promise<void> {
	const tamanho = (await getSetting<TamanhoTexto>('a11y.tamanho', 'normal')) ?? 'normal'
	const contraste = (await getSetting<boolean>('a11y.altoContraste', false)) ?? false
	const movimento = (await getSetting<boolean>('a11y.reduzirMovimento', false)) ?? false
	const raiz = document.documentElement
	raiz.setAttribute('data-texto', tamanho)
	raiz.setAttribute('data-contraste', contraste ? 'alto' : 'normal')
	raiz.setAttribute('data-movimento', movimento ? 'reduzido' : 'normal')
}

/** Seção de acessibilidade em Ajustes. */
export function SecaoAcessibilidade() {
	const { tamanho, altoContraste, reduzirMovimento, mudar } = useAcessibilidade()

	return (
		<section className="secao" aria-labelledby="secao-a11y">
			<div className="secao-cabecalho">
				<h2 className="secao-titulo" id="secao-a11y">
					Acessibilidade
				</h2>
			</div>
			<div className="linha-grupo">
				<div className="linha-ajuste">
					<span className="linha-ajuste__texto">
						<span className="linha-ajuste__titulo">Tamanho do texto</span>
						<span className="linha-ajuste__descricao">Aumenta letra e espaçamento em todo o app</span>
					</span>
					<div className="segmentado" role="group" aria-label="Tamanho do texto">
						{(['normal', 'grande', 'maior'] as const).map((valor) => (
							<button
								key={valor}
								type="button"
								className="segmentado__item"
								aria-pressed={tamanho === valor}
								onClick={() => mudar({ tamanho: valor })}
							>
								{valor === 'normal' ? 'A' : valor === 'grande' ? 'A+' : 'A++'}
							</button>
						))}
					</div>
				</div>

				<div className="linha-ajuste">
					<span className="linha-ajuste__texto">
						<span className="linha-ajuste__titulo">Alto contraste</span>
						<span className="linha-ajuste__descricao">Texto e bordas mais fortes (WCAG AAA)</span>
					</span>
					<button
						type="button"
						role="switch"
						aria-checked={altoContraste}
						className="interruptor"
						aria-label="Alto contraste"
						onClick={() => mudar({ altoContraste: !altoContraste })}
					>
						<span className="interruptor__bolinha" aria-hidden="true" />
					</button>
				</div>

				<div className="linha-ajuste">
					<span className="linha-ajuste__texto">
						<span className="linha-ajuste__titulo">Reduzir movimento</span>
						<span className="linha-ajuste__descricao">Sem animações de entrada e transição</span>
					</span>
					<button
						type="button"
						role="switch"
						aria-checked={reduzirMovimento}
						className="interruptor"
						aria-label="Reduzir movimento"
						onClick={() => mudar({ reduzirMovimento: !reduzirMovimento })}
					>
						<span className="interruptor__bolinha" aria-hidden="true" />
					</button>
				</div>
			</div>
		</section>
	)
}
