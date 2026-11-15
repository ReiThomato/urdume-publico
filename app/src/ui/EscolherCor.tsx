import { useState } from 'react'
import { PALETA, corDe, normalizarHex } from '@/ui/paleta'
import { BotaoNovaCor, SeletorDeCor } from '@/ui/SeletorDeCor'

interface Props {
	/** Valor atual: índice da paleta ou hex. */
	valor: number | string | null
	onMudar: (valor: number | string) => void
	/** Rótulo do grupo, para leitor de tela. */
	rotulo: string
}

/**
 * Escolha de cor de um item (projeto, hábito, evento, lista).
 *
 * ## O defeito que existia aqui
 *
 * Havia um `quantas = 8` como padrão, e os formulários de projeto não passavam
 * o parâmetro: vermelho, marrom e pedra — e depois, com a paleta maior, doze
 * cores — simplesmente não apareciam na criação nem na edição. Pior: a marcação
 * de "escolhida" era `valor === item.indice`, então uma cor escolhida por
 * qualquer outro caminho deixava a linha inteira sem seleção.
 *
 * Agora a lista é a PALETA inteira, sem recorte, e a seleção é comparada pelo
 * HEX resolvido — índice, string numérica antiga e hex livre caem todos no
 * mesmo teste.
 *
 * ## Como o valor é guardado
 *
 * Índice da paleta continua sendo número; cor livre vira hex em texto. Quem lê
 * usa `corDe`, que aceita as duas formas. Isso mantém cada registro antigo
 * válido e evita migração.
 */
export function EscolherCor({ valor, onMudar, rotulo }: Props) {
	const [seletorAberto, setSeletorAberto] = useState(false)

	const hexEmUso = corDe(valor).hex
	const livre =
		normalizarHex(typeof valor === 'string' ? valor : '') &&
		!PALETA.some((item) => item.hex.toLowerCase() === hexEmUso)
			? hexEmUso
			: null

	return (
		<>
			<div className="amostra-cores amostra-cores--paleta" role="group" aria-label={rotulo}>
				{PALETA.map((item) => (
					<button
						key={item.indice}
						type="button"
						className="amostra-cor"
						style={{ background: item.hex }}
						aria-label={item.rotulo}
						aria-pressed={isNaN(Number(valor)) ? hexEmUso === item.hex : Number(valor) === item.indice}
						onClick={() => onMudar(item.indice)}
					/>
				))}

				{/* A cor livre em uso aparece marcada, para o usuário ver qual é. */}
				{livre ? (
					<button
						type="button"
						className="amostra-cor"
						style={{ background: livre }}
						aria-label={`Cor personalizada ${livre}`}
						aria-pressed
						onClick={() => setSeletorAberto(true)}
					/>
				) : null}

				<BotaoNovaCor onClick={() => setSeletorAberto(true)} />
			</div>

			<SeletorDeCor
				aberto={seletorAberto}
				onFechar={() => setSeletorAberto(false)}
				corAtual={hexEmUso}
				onEscolher={(hex) => onMudar(hex)}
				titulo={`Cor: ${rotulo.toLowerCase()}`}
			/>
		</>
	)
}
