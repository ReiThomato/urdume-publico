import type { CSSProperties } from 'react'
import { contrasteEntre, corDe, misturar, tintaSobre } from '@/ui/paleta'
import type { CorPaleta } from '@/ui/paleta'

/**
 * Cor por lista (projeto).
 *
 * Usa primeiro a cor ESCOLHIDA no projeto — índice da paleta ou hex livre — e,
 * sem escolha, deriva do id para o mesmo projeto ter sempre o mesmo tom. A cor
 * nunca é o único sinal: ela vem junto do nome e do ícone, para quem não
 * distingue cores.
 */
export interface CorCategoria extends CorPaleta {
	/** Variável CSS com o tom, para usar em `border-color`/`color`. */
	variavel: string
	/** Tinta legível sobre o tom cheio (branco ou quase-preto). */
	tinta: string
}

function montar(cor: CorPaleta): CorCategoria {
	return {
		...cor,
		variavel: 'var(--cor-cat)',
		tinta: tintaSobre(cor.hex),
	}
}

/**
 * Cor de um projeto.
 *
 * O primeiro parâmetro é o ID (para a derivação determinística); o segundo é a
 * cor ESCOLHIDA. Quem chama tela de tarefa precisa passar a cor do projeto —
 * passar só o id fazia a agenda ignorar a cor escolhida e mostrar a derivada do
 * hash, que é o defeito que este contrato evita.
 */
export function corDoProjeto(
	id: string | null | undefined,
	escolhida?: string | number | null,
): CorCategoria {
	return montar(corDe(escolhida, id))
}

/**
 * Estilo inline que publica o tom para o CSS do elemento e dos filhos.
 *
 * Publica duas coisas, e cada uma corrige um defeito real:
 * - `--cor-cat`: o tom em si;
 * - `--tinta-sobre-cor`: a tinta calculada por contraste, que antes era um
 *   token fixo e quebrava com hex escuro escolhido à mão.
 *
 * `--cor-cat-clara` saiu: era publicada e nenhum CSS a lia. O que ela prometia
 * ("escolha tinta escura sobre tom claro") agora é feito direto por
 * `--tinta-sobre-cor`, com o valor já resolvido — sem um segundo lugar para
 * discordar do primeiro.
 */
export function estiloCor(valor: number | string | null | undefined): CSSProperties {
	const cor = corDe(valor)
	return {
		['--cor-cat' as string]: cor.hex,
		['--tinta-sobre-cor' as string]: tintaSobre(cor.hex),
	}
}

/** O mesmo estilo, para uma cor de projeto já resolvida. */
export function estiloCorProjeto(
	id: string | null | undefined,
	escolhida?: string | number | null,
): CSSProperties {
	return estiloCor(corDoProjeto(id, escolhida).hex)
}

/**
 * Tinta e tom da FAIXA do cartão de projeto.
 *
 * A faixa é a cor do projeto escurecida — a "capa da pasta". Duas decisões
 * erradas foram corrigidas aqui, em rodadas diferentes:
 *
 * 1. A tinta era `#fff` fixo. Com um hex claro escolhido à mão, a faixa fica
 *    clara e o branco reprova.
 * 2. A tinta passou a ser calculada, mas a mistura continuava FIXA em 55%.
 *    Medido no Gesso (`#ded6c6`), a faixa caía em `#817d74` — um tom médio em
 *    que nem `#1c1b1f` (4,18:1) nem branco (4,10:1) alcançam 4,5. O cartão
 *    passava a reprovar justamente na cor mais clara da paleta.
 *
 * Agora a mistura ANDA: parte da capa escurecida a 55% e vai escurecendo até
 * a tinta escolhida passar 4,5:1. A faixa continua sendo "a mesma cor, um tom
 * abaixo"; ela só desce o quanto for preciso para o texto existir.
 */
export function estiloDaFaixa(cor: string): CSSProperties {
	let efetiva = misturar(cor, '#101010', 0.55)
	let tinta = tintaSobre(efetiva)

	// Escurece em passos de 5% até o par passar. 11 passos cobrem o pior caso
	// (Gesso) com folga; no fim, `#101010` puro sempre passa com branco.
	for (let passo = 0; passo <= 11; passo++) {
		const peso = 0.55 - passo * 0.05
		const candidata = misturar(cor, '#101010', peso)
		const candidataTinta = tintaSobre(candidata)
		if (contrasteEntre(candidata, candidataTinta) >= 4.5) {
			efetiva = candidata
			tinta = candidataTinta
			break
		}
	}

	return {
		['--cor-da-faixa' as string]: efetiva,
		['--tinta-da-faixa' as string]: tinta,
	}
}
