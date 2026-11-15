import { useEffect, useMemo, useState } from 'react'
import { Folha } from '@/ui/Folha'
import { IconeAdicionar } from '@/ui/icones'
import { LIMITE_RECENTES, PALETA, ehHex, normalizarHex } from '@/ui/paleta'
import { limparRecentes, lerRecentes, registrarCorRecente } from '@/lib/cores-recentes'

/* --------------------------------------------------------------------------
   Conversões hex ⇄ HSL
   -------------------------------------------------------------------------- */

interface Hsl {
	h: number
	s: number
	l: number
}

function hexParaHsl(hex: string): Hsl {
	const limpo = hex.replace('#', '')
	const inteiro = Number.parseInt(limpo.length === 3 ? limpo.replace(/./g, (c) => c + c) : limpo, 16)
	const r = ((inteiro >> 16) & 255) / 255
	const g = ((inteiro >> 8) & 255) / 255
	const b = (inteiro & 255) / 255

	const maior = Math.max(r, g, b)
	const menor = Math.min(r, g, b)
	const l = (maior + menor) / 2
	const d = maior - menor

	if (d === 0) return { h: 0, s: 0, l: l * 100 }

	const s = d / (1 - Math.abs(2 * l - 1))
	let h: number
	if (maior === r) h = ((g - b) / d) % 6
	else if (maior === g) h = (b - r) / d + 2
	else h = (r - g) / d + 4
	h *= 60
	if (h < 0) h += 360

	return { h, s: s * 100, l: l * 100 }
}

function hslParaHex({ h, s, l }: Hsl): string {
	const sat = s / 100
	const lum = l / 100
	const c = (1 - Math.abs(2 * lum - 1)) * sat
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = lum - c / 2

	let r = 0
	let g = 0
	let b = 0
	if (h < 60) [r, g, b] = [c, x, 0]
	else if (h < 120) [r, g, b] = [x, c, 0]
	else if (h < 180) [r, g, b] = [0, c, x]
	else if (h < 240) [r, g, b] = [0, x, c]
	else if (h < 300) [r, g, b] = [x, 0, c]
	else [r, g, b] = [c, 0, x]

	const canal = (v: number): string =>
		Math.round((v + m) * 255)
			.toString(16)
			.padStart(2, '0')

	return `#${canal(r)}${canal(g)}${canal(b)}`
}

/* --------------------------------------------------------------------------
   Seletor
   -------------------------------------------------------------------------- */

interface SeletorDeCorProps {
	aberto: boolean
	onFechar: () => void
	/** Cor atual, para abrir o seletor já nela. Pode ser índice, hex ou vazio. */
	corAtual: string
	onEscolher: (hex: string) => void
	/** Título da folha. Muda conforme o que se está colorindo. */
	titulo?: string
}

/**
 * Seletor de cor.
 *
 * Nasceu de um problema real: o `<input type="color">` não abre no WebView do
 * Android, então "escolher outra cor" simplesmente não funcionava. Aqui os três
 * canais (matiz, saturação e brilho) são controles próprios — funcionam em
 * qualquer ambiente — e o hex continua editável para quem já tem o código.
 *
 * ## As recentes
 *
 * As últimas quatro cores escolhidas à mão ficam guardadas e aparecem no topo,
 * para reuso. Sem elas, a mesma cor personalizada era reescolhida no seletor a
 * cada projeto novo.
 */
export function SeletorDeCor({
	aberto,
	onFechar,
	corAtual,
	onEscolher,
	titulo = 'Nova cor',
}: SeletorDeCorProps) {
	const [hsl, setHsl] = useState<Hsl>(() => hexParaHsl(corAtual))
	const [hexDigitado, setHexDigitado] = useState(corAtual)
	const [hexTravado, setHexTravado] = useState(false)
	const [recentes, setRecentes] = useState<string[]>([])

	// Ao abrir, parte sempre da cor em uso.
	useEffect(() => {
		if (!aberto) return
		const base = normalizarHex(corAtual) ?? '#8f4c35'
		setHsl(hexParaHsl(base))
		setHexDigitado(base)
		setHexTravado(false)
		void lerRecentes().then(setRecentes)
	}, [aberto, corAtual])

	const hex = useMemo(() => hslParaHex(hsl), [hsl])

	// Mantém o campo de texto sincronizado enquanto os canais se movem.
	useEffect(() => {
		if (!hexTravado) setHexDigitado(hex)
	}, [hex, hexTravado])

	const atualizar = (patch: Partial<Hsl>): void => {
		setHsl((atual) => ({ ...atual, ...patch }))
		setHexTravado(false)
	}

	function aplicarHex(texto: string): void {
		setHexDigitado(texto)
		const normalizado = normalizarHex(texto)
		if (normalizado) setHsl(hexParaHsl(normalizado))
	}
	function usar(valor: string): void {
		const normalizado = normalizarHex(valor)
		if (!normalizado) return
		void registrarCorRecente(normalizado).then(setRecentes)
		onEscolher(normalizado)
		onFechar()
	}

	return (
		<Folha titulo={titulo} aberta={aberto} onFechar={onFechar}>
			<div className="seletor-cor">
				<div className="seletor-cor__mostra" style={{ background: hex }} aria-hidden="true">
					<span className="seletor-cor__hex-grande">{hex.toUpperCase()}</span>
				</div>

				{/*
				 * Recentes: as últimas quatro cores escolhidas à mão.
				 * Ficam antes da paleta porque a paleta é fixa e já está abaixo;
				 * o que o usuário acabou de criar é o palpite mais útil.
				 */}
				{recentes.length > 0 ? (
					<div>
						<span className="campo-rotulo">Recentes</span>
						<div className="amostra-cores" style={{ padding: '4px 0 0' }} role="group" aria-label="Cores recentes">
							{recentes.slice(0, LIMITE_RECENTES).map((cor) => (
								<button
									key={cor}
									type="button"
									className="amostra-cor"
									style={{ background: cor }}
									aria-label={`Usar ${cor}`}
									aria-pressed={cor === normalizarHex(hexDigitado)}
									onClick={() => usar(cor)}
								/>
							))}
							<button
								type="button"
								className="botao-icone botao-icone--pequeno"
								aria-label="Limpar cores recentes"
								title="Limpar recentes"
								onClick={() => void limparRecentes().then(() => setRecentes([]))}
							>
								×
							</button>
						</div>
					</div>
				) : null}

				<div>
					<span className="campo-rotulo">Paleta</span>
					<div className="amostra-cores" style={{ padding: '4px 0 0' }} role="group" aria-label="Paleta de cores">
						{PALETA.map((cor) => (
							<button
								key={cor.hex}
								type="button"
								className="amostra-cor"
								style={{ background: cor.hex }}
								aria-label={cor.rotulo}
								aria-pressed={cor.hex === normalizarHex(hexDigitado)}
								onClick={() => usar(cor.hex)}
							/>
						))}
					</div>
				</div>

				<label className="seletor-cor__canal">
					<span className="campo-rotulo">Matiz</span>
					<input
						type="range"
						min={0}
						max={360}
						step={1}
						value={Math.round(hsl.h)}
						onChange={(evento) => atualizar({ h: Number(evento.target.value) })}
						className="seletor-cor__slider seletor-cor__slider--matiz"
					/>
				</label>

				<label className="seletor-cor__canal">
					<span className="campo-rotulo">Saturação</span>
					<input
						type="range"
						min={0}
						max={100}
						step={1}
						value={Math.round(hsl.s)}
						onChange={(evento) => atualizar({ s: Number(evento.target.value) })}
						className="seletor-cor__slider seletor-cor__slider--saturacao"
						style={{
							background: `linear-gradient(to right, ${hslParaHex({ ...hsl, s: 0 })}, ${hslParaHex({ ...hsl, s: 100 })})`,
						}}
					/>
				</label>

				<label className="seletor-cor__canal">
					<span className="campo-rotulo">Brilho</span>
					<input
						type="range"
						min={0}
						max={100}
						step={1}
						value={Math.round(hsl.l)}
						onChange={(evento) => atualizar({ l: Number(evento.target.value) })}
						className="seletor-cor__slider seletor-cor__slider--brilho"
						style={{
							background: `linear-gradient(to right, #000, ${hslParaHex({ ...hsl, l: 50 })}, #fff)`,
						}}
					/>
				</label>

				<div>
					<label className="campo-rotulo" htmlFor="cor-hex">
						Código hexadecimal
					</label>
					<input
						id="cor-hex"
						className="campo"
						value={hexDigitado}
						onChange={(evento) => aplicarHex(evento.target.value)}
						onFocus={() => setHexTravado(true)}
						onBlur={() => setHexTravado(false)}
						placeholder="#3366ff"
						autoComplete="off"
						autoCapitalize="characters"
						spellCheck={false}
						maxLength={7}
					/>
					{!ehHex(hexDigitado) ? (
						<p className="nota">Use seis dígitos, por exemplo #3366FF.</p>
					) : null}
				</div>

				<div className="formulario__acoes">
					<button type="button" className="botao" onClick={onFechar}>
						Cancelar
					</button>
					<button
						type="button"
						className="botao botao--primario"
						disabled={!ehHex(hexDigitado)}
						/*
						 * Aplica o hex DIGITADO, não o do roundtrip HSL.
						 *
						 * Antes era `usar(hex)`, onde `hex` vinha de HSL→hex. HSL
						 * perde precisão na ida e na volta, então uma cor fora do
						 * gamut ou um cinza saíam levemente diferentes do que o
						 * usuário digitou — a queixa de "a cor não sai na
						 * tonalidade escolhida". O valor digitado é a verdade.
						 */
						onClick={() => usar(hexDigitado)}
					>
						Usar esta cor
					</button>
				</div>
			</div>
		</Folha>
	)
}

/**
 * Botão que abre o seletor.
 *
 * Só o símbolo. O rótulo "Nova" foi removido a pedido: entre doze amostras
 * redondas, um quadrado com a palavra dentro quebrava o alinhamento da linha.
 */
export function BotaoNovaCor({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			className="amostra-cor amostra-cor--nova"
			onClick={onClick}
			aria-label="Escolher outra cor"
			title="Outra cor"
		>
			<IconeAdicionar size={20} />
		</button>
	)
}
