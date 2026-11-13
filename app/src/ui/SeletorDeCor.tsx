import { useEffect, useMemo, useState } from 'react'
import { Folha } from '@/ui/Folha'
import { IconeAdicionar } from '@/ui/icones'

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

function hexValido(texto: string): boolean {
	return /^#?[0-9a-f]{6}$/i.test(texto.trim())
}

/* --------------------------------------------------------------------------
   Seletor
   -------------------------------------------------------------------------- */

export interface SeletorDeCorProps {
	aberto: boolean
	onFechar: () => void
	/** Cor-semente atual, para abrir o seletor já nela. */
	corAtual: string
	onEscolher: (hex: string) => void
}

/**
 * Seletor de cor-semente para o tema.
 *
 * Nasceu de um problema real: o `<input type="color">` não abre no WebView do
 * Android, então "escolher outra cor" simplesmente não funcionava. Aqui os três
 * canais (matiz, saturação e brilho) são controles próprios — funcionam em
 * qualquer ambiente — e o hex continua editável para quem já tem o código.
 */
export function SeletorDeCor({ aberto, onFechar, corAtual, onEscolher }: SeletorDeCorProps) {
	const [hsl, setHsl] = useState<Hsl>(() => hexParaHsl(corAtual))
	const [hexDigitado, setHexDigitado] = useState(corAtual)
	const [hexTravado, setHexTravado] = useState(false)

	// Ao abrir, parte sempre da cor em uso.
	useEffect(() => {
		if (!aberto) return
		setHsl(hexParaHsl(corAtual))
		setHexDigitado(corAtual)
		setHexTravado(false)
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
		const normalizado = texto.trim().startsWith('#') ? texto.trim() : `#${texto.trim()}`
		if (hexValido(normalizado)) setHsl(hexParaHsl(normalizado))
	}

	return (
		<Folha titulo="Nova cor do tema" aberta={aberto} onFechar={onFechar}>
			<div className="seletor-cor">
				<div className="seletor-cor__mostra" style={{ background: hex }} aria-hidden="true">
					<span className="seletor-cor__hex-grande">{hex.toUpperCase()}</span>
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
						data-foco-inicial
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
					{!hexValido(hexDigitado) ? (
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
						disabled={!hexValido(hexDigitado)}
						onClick={() => {
							onEscolher(hex)
							onFechar()
						}}
					>
						Usar esta cor
					</button>
				</div>
			</div>
		</Folha>
	)
}

/** Botão que abre o seletor — o "+" que faltava na paleta. */
export function BotaoNovaCor({ onClick }: { onClick: () => void }) {
	return (
		<button type="button" className="amostra-cor amostra-cor--nova" onClick={onClick} title="Adicionar uma cor">
			<IconeAdicionar size={20} />
			<span className="amostra-cor__rotulo">Nova</span>
		</button>
	)
}
