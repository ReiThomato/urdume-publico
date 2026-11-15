import { useEffect, useState } from 'react'
import type { Reminder } from '@/db/db'
import { updateReminder } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import { IconeApagar } from '@/ui/icones'
import { chaveDoDia } from '@/lib/date'

/**
 * Edição de lembrete.
 *
 * Nasceu da auditoria (D9): `updateReminder` e `softDeleteReminder` existiam no
 * repositório e nenhuma tela chamava — um lembrete criado com a hora errada
 * ficava errado para sempre, e o único jeito de "resolver" era marcá-lo como
 * feito. A exclusão NÃO mora aqui: fica na folha de confirmação da tela, para
 * o desfazer valer nos dois caminhos (editor e menu ⋮).
 */
export function EditarLembrete({
	lembrete,
	onFechar,
	onExcluir,
}: {
	/** Lembrete escolhido; `null` mantém a folha fechada. */
	lembrete: Reminder | null
	onFechar: () => void
	/** Abre a confirmação de exclusão da tela. */
	onExcluir: (lembrete: Reminder) => void
}) {
	const [texto, setTexto] = useState('')
	const [quando, setQuando] = useState('')
	const [salvando, setSalvando] = useState(false)

	useEffect(() => {
		if (!lembrete) return
		setTexto(lembrete.text)
		setQuando(paraCampoLocal(lembrete.dueAt ?? null))
	}, [lembrete])

	if (!lembrete) return null

	async function salvar(): Promise<void> {
		const limpo = texto.trim()
		if (!limpo || !lembrete) return
		setSalvando(true)
		try {
			const dueAt = quando ? new Date(quando).getTime() : null
			await updateReminder(lembrete.id, {
				text: limpo,
				dueAt: Number.isFinite(dueAt) ? dueAt : null,
				// Mudar a hora reabre o aviso: sem isto, o lembrete corrigido
				// continuaria com `notificadoEm` do horário antigo e o aviso não
				// apareceria de novo.
				notificadoEm: null,
			})
			onFechar()
		} finally {
			setSalvando(false)
		}
	}

	return (
		<Folha titulo="Editar lembrete" aberta={lembrete !== null} onFechar={onFechar}>
			<form
				className="formulario"
				onSubmit={(evento) => {
					evento.preventDefault()
					if (!salvando) void salvar()
				}}
			>
				<div>
					<label className="campo-rotulo" htmlFor="lembrete-texto">
						Lembrete
					</label>
					<input
						id="lembrete-texto"
						data-foco-inicial
						className="campo"
						value={texto}
						onChange={(evento) => setTexto(evento.target.value)}
						placeholder="Do que precisa lembrar?"
						maxLength={280}
					/>
				</div>

				<div>
					<label className="campo-rotulo" htmlFor="lembrete-quando">
						Avisar em (opcional)
					</label>
					<input
						id="lembrete-quando"
						className="campo"
						type="datetime-local"
						value={quando}
						onChange={(evento) => setQuando(evento.target.value)}
					/>
					<p className="nota">Sem data, o lembrete fica na lista sem aviso.</p>
				</div>

				<div className="formulario__acoes" style={{ justifyContent: 'space-between' }}>
					<button
						type="button"
						className="botao botao--perigo"
						onClick={() => onExcluir(lembrete)}
					>
						<IconeApagar size={18} />
						Excluir
					</button>
					<button type="submit" className="botao botao--primario" disabled={!texto.trim() || salvando}>
						Salvar
					</button>
				</div>
			</form>
		</Folha>
	)
}

/**
 * `datetime-local` trabalha com hora LOCAL sem fuso: `toISOString()` devolveria
 * UTC e o campo mostraria a hora errada por um fuso inteiro.
 */
function paraCampoLocal(ms: number | null): string {
	if (ms === null || !Number.isFinite(ms)) return ''
	const data = new Date(ms)
	const duas = (valor: number): string => String(valor).padStart(2, '0')
	return `${chaveDoDia(data)}T${duas(data.getHours())}:${duas(data.getMinutes())}`
}

/** Exportado para o teste conferir o formato do campo. */
export { paraCampoLocal as _paraCampoLocal }
