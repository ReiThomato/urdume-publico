/**
 * Marca do Urdume para dentro da interface.
 *
 * O símbolo é o mesmo vetor do kit (`Assets/marca/urdume-simbolo.svg`): um
 * cartão em contorno atravessado por um fio que sai pela quina — a trama e o
 * fio que a sustenta. Aqui ele usa `currentColor` no cartão e o acento do tema
 * no fio, para acompanhar claro/escuro e qualquer cor-semente.
 *
 * A palavra é texto com a Figtree (a mesma do wordmark do kit), não um vetor
 * colado: assim acompanha o tamanho e a fonte escolhida em Ajustes.
 */

const CARTAO =
	'M59.27 88.42 L174.69 63.89 C183.34 62.05 191.83 67.57 193.67 76.22 L209.05 148.60 C210.89 157.24 205.37 165.74 196.73 167.58 L81.31 192.11 C72.66 193.95 64.17 188.43 62.33 179.78 L46.95 107.40 C45.11 98.76 50.63 90.26 59.27 88.42 Z'

const FIO = 'M182.87 59.09 Q201.90 42.77 203.11 29.23 L204.31 15.68'

export function SimboloUrdume({ tamanho = 28 }: { tamanho?: number }) {
	return (
		<svg
			width={tamanho}
			height={tamanho}
			viewBox="0 0 256 256"
			role="img"
			aria-label="Urdume Público"
			focusable="false"
		>
			<path
				d={CARTAO}
				fill="none"
				stroke="currentColor"
				strokeWidth={22}
				strokeLinejoin="round"
			/>
			<path
				d={FIO}
				fill="none"
				stroke="var(--primary)"
				strokeWidth={20}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

/**
 * Marca completa: símbolo + palavra. Usada no topo do Início, onde o app
 * precisa dizer o próprio nome — antes o nome só existia no título do
 * navegador e no rodapé dos Ajustes.
 */
export function MarcaUrdume() {
	return (
		<span className="marca" aria-label="Urdume Público">
			<span className="marca__simbolo" aria-hidden="true">
				<SimboloUrdume tamanho={30} />
			</span>
			<span className="marca__palavra" aria-hidden="true">
				urdume
			</span>
		</span>
	)
}
