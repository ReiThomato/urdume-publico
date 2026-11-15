import { useEffect, useState } from 'react'
import type { Evento } from '@/db/db'
import { atualizarEvento, excluirEvento } from '@/db/eventos'
import { Folha } from '@/ui/Folha'
import { EscolherCor } from '@/ui/EscolherCor'
import { IconeApagar } from '@/ui/icones'
import { chaveDoDia } from '@/lib/date'
import { tentar } from '@/lib/escrita'

/**
 * Editor de evento (título, dia, horas, cor) com exclusão.
 *
 * Nasce da auditoria: `atualizarEvento`/`excluirEvento` existiam no
 * repositório, mas só a Agenda chamava. O evento aparece no Início, no painel
 * do dia, na busca e na linha do dia — e em todos esses lugares a linha não era
 * clicável. Aqui é UM editor para todos eles: tocar no evento abre esta folha,
 * que edita e exclui com confirmação.
 *
 * Ocorrências de repetição chegam com id sintético (`id@data`); aqui se
 * edita/exclui o evento base, e o texto da confirmação avisa disso.
 */
export function EditarEvento({
	evento,
	onFechar,
	onExcluido,
}: {
	/** Evento (aceita id sintático de ocorrência expandida). */
	evento: Evento | null
	onFechar: () => void
	/** Chamado depois de excluir, para a tela mostrar o desfazer. */
	onExcluido?: (evento: Evento) => void
}) {
	const [titulo, setTitulo] = useState('')
	const [dia, setDia] = useState('')
	const [inicio, setInicio] = useState('')
	const [fim, setFim] = useState('')
	const [local, setLocal] = useState('')
	const [notas, setNotas] = useState('')
	const [cor, setCor] = useState<number | string>(0)
	const [confirmando, setConfirmando] = useState(false)
	const [salvando, setSalvando] = useState(false)
	const [erro, setErro] = useState<string | null>(null)

	useEffect(() => {
		if (!evento) return
		setTitulo(evento.title)
		setCor(evento.cor ?? 0)
		setLocal(evento.local ?? '')
		setNotas(evento.notes ?? '')
		setConfirmando(false)
		setErro(null)
		setDia(chaveDoDia(new Date(evento.startAt)))

		const hhmm = (ms: number): string =>
			`${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`
		setInicio(evento.diaInteiro ? '' : hhmm(evento.startAt))
		setFim(evento.diaInteiro ? '' : hhmm(evento.endAt))
	}, [evento])

	if (!evento) return null

	const idBase = evento.id.split('@')[0]!

	/** Exclui com confirmação; só oferece o desfazer se a escrita passou. */
	async function excluir(): Promise<void> {
		const resultado = await tentar(() => excluirEvento(idBase))
		if (!resultado.ok) {
			setErro(resultado.erro ?? 'Não foi possível excluir o evento.')
			return
		}
		setErro(null)
		onFechar()
		onExcluido?.(evento!)
	}

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
				local: local.trim() || null,
				notes: notas.trim() || null,
			})
			onFechar()
		} catch (causa) {
			// Antes a folha fechava mesmo quando a escrita falhava.
			setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar o evento.')
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
					{erro ? (
						<p className="erro" role="alert">
							{erro}
						</p>
					) : null}
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmando(false)}>
							Manter
						</button>
						<button type="button" className="botao botao--perigo-solido" onClick={() => void excluir()}>
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
						<label className="campo-rotulo" htmlFor="evento-local">
							Local (opcional)
						</label>
						<input
							id="evento-local"
							className="campo"
							value={local}
							onChange={(e) => setLocal(e.target.value)}
							placeholder="Ex.: Consultório, sala 3"
							maxLength={120}
						/>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="evento-notas">
							Notas (opcional)
						</label>
						<textarea
							id="evento-notas"
							className="campo campo--area"
							value={notas}
							onChange={(e) => setNotas(e.target.value)}
							rows={2}
							maxLength={400}
							placeholder="O que levar, com quem falar, o que confirmar."
						/>
					</div>

					<div>
						<span className="campo-rotulo">Cor</span>
						<EscolherCor valor={cor} onMudar={setCor} rotulo="Cor do evento" />
					</div>

					{erro ? (
						<p className="erro" role="alert">
							{erro}
						</p>
					) : null}

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
