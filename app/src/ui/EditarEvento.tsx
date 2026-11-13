import { useEffect, useState } from 'react'
import type { Evento } from '@/db/db'
import { atualizarEvento, excluirEvento } from '@/db/eventos'
import { Folha } from '@/ui/Folha'
import { PALETA, corDoIndice } from '@/ui/paleta'
import { IconeApagar } from '@/ui/icones'

/**
 * Editor de evento (título, dia, horas, cor) com exclusão.
 *
 * Nasce da auditoria: `atualizarEvento`/`excluirEvento` existiam no
 * repositório, mas nenhuma tela chamava — evento criado com hora errada
 * ficava permanente. Ocorrências de repetição chegam com id sintético
 * (`id@data`); aqui se edita/exclui o evento base.
 */
export function EditarEvento({
	evento,
	onFechar,
}: {
	/** Evento (aceita id sintático de ocorrência expandida). */
	evento: Evento | null
	onFechar: () => void
}) {
	const [titulo, setTitulo] = useState('')
	const [dia, setDia] = useState('')
	const [inicio, setInicio] = useState('')
	const [fim, setFim] = useState('')
	const [cor, setCor] = useState(0)
	const [confirmando, setConfirmando] = useState(false)
	const [salvando, setSalvando] = useState(false)

	useEffect(() => {
		if (!evento) return
		setTitulo(evento.title)
		setCor(evento.cor ?? 0)
		setConfirmando(false)

		const começo = new Date(evento.startAt)
		const chave = `${começo.getFullYear()}-${String(começo.getMonth() + 1).padStart(2, '0')}-${String(começo.getDate()).padStart(2, '0')}`
		setDia(chave)
		const hhmm = (ms: number): string =>
			`${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`
		setInicio(evento.diaInteiro ? '' : hhmm(evento.startAt))
		setFim(evento.diaInteiro ? '' : hhmm(evento.endAt))
	}, [evento])

	if (!evento) return null

	const idBase = evento.id.split('@')[0]!

	async function salvar(): Promise<void> {
		const texto = titulo.trim()
		if (!texto) return
		setSalvando(true)
		try {
			const [ano, mes, diaNum] = dia.split('-').map(Number)
			const [hi, mi] = inicio.split(':').map(Number)
			const [hf, mf] = fim.split(':').map(Number)

			const temHora = Boolean(inicio)
			const comecoMs = temHora
				? new Date(ano!, (mes ?? 1) - 1, diaNum!, hi ?? 9, mi ?? 0).getTime()
				: new Date(ano!, (mes ?? 1) - 1, diaNum!, 0, 0).getTime()
			let fimMs = temHora
				? new Date(ano!, (mes ?? 1) - 1, diaNum!, hf ?? 10, mf ?? 0).getTime()
				: new Date(ano!, (mes ?? 1) - 1, diaNum!, 23, 59, 59, 999).getTime()
			if (fimMs <= comecoMs) fimMs = comecoMs + 15 * 60_000

			await atualizarEvento(idBase, {
				title: texto,
				startAt: comecoMs,
				endAt: fimMs,
				diaInteiro: !temHora,
				cor,
			})
			onFechar()
		} finally {
			setSalvando(false)
		}
	}

	return (
		<Folha
			titulo="Editar evento"
			aberta={evento !== null}
			onFechar={onFechar}
			passo={confirmando ? 'excluir' : 'editar'}
		>
			{confirmando ? (
				<div className="formulario">
					<p className="nota">
						Excluir <strong>{evento.title}</strong>? Se o evento se repete, a regra inteira sai da agenda.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmando(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								void excluirEvento(idBase)
								onFechar()
							}}
						>
							Excluir
						</button>
					</div>
				</div>
			) : (
				<form
					className="formulario"
					onSubmit={(e) => {
						e.preventDefault()
						if (!salvando) void salvar()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="evento-titulo">
							Título
						</label>
						<input
							id="evento-titulo"
							data-foco-inicial
							className="campo"
							value={titulo}
							onChange={(e) => setTitulo(e.target.value)}
							maxLength={120}
						/>
					</div>

					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}>
						<div>
							<label className="campo-rotulo" htmlFor="evento-dia">
								Dia
							</label>
							<input
								id="evento-dia"
								type="date"
								className="campo"
								value={dia}
								onChange={(e) => setDia(e.target.value)}
							/>
						</div>
						<div>
							<span className="campo-rotulo">Horário</span>
							<div style={{ display: 'flex', gap: 'var(--s-2)' }}>
								<input
									type="time"
									className="campo"
									aria-label="Início"
									value={inicio}
									onChange={(e) => setInicio(e.target.value)}
								/>
								<input
									type="time"
									className="campo"
									aria-label="Fim"
									value={fim}
									onChange={(e) => setFim(e.target.value)}
								/>
							</div>
							<p className="nota">Sem hora, o evento ocupa o dia inteiro.</p>
						</div>
					</div>

					<div>
						<span className="campo-rotulo">Cor</span>
						<div className="amostra-cores" role="group" aria-label="Cor do evento">
							{PALETA.slice(0, 7).map((item) => (
								<button
									key={item.indice}
									type="button"
									className="amostra-cor"
									style={{ background: corDoIndice(item.indice).hex }}
									aria-label={item.rotulo}
									aria-pressed={cor === item.indice}
									onClick={() => setCor(item.indice)}
								/>
							))}
						</div>
					</div>

					<div className="formulario__acoes" style={{ justifyContent: 'space-between' }}>
						<button type="button" className="botao botao--perigo" onClick={() => setConfirmando(true)}>
							<IconeApagar size={18} />
							Excluir
						</button>
						<button type="submit" className="botao botao--primario" disabled={!titulo.trim() || salvando}>
							Salvar
						</button>
					</div>
				</form>
			)}
		</Folha>
	)
}
