import { useEffect, useMemo, useState } from 'react'
import {
	IconeApagar,
	IconeArquivar,
	IconeConcluir,
	IconeEtiqueta,
	IconeBandeira,
	IconeRepetir,
} from '@/ui/icones'
import type { Task } from '@/db/db'
import { interpretar } from '@/lib/interpretar'
import { removeSubtask, softDeleteTask, updateTask } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import { PALETA } from '@/ui/paleta'
import { escrever } from '@/lib/falhas'

/**
 * Edição de uma tarefa.
 *
 * Tudo o que foi capturado pode ser corrigido aqui: título, dia, hora, duração,
 * prazo, projeto, prioridade, etiquetas, "algum dia" e repetição. Nenhum campo
 * é obrigatório além do título — e o campo de título também aceita a escrita
 * curta ("amanhã 10h"), para não obrigar a usar a grade de campos.
 */
export function EditarTarefa({
	tarefa,
	aberta,
	onFechar,
	projetos,
	etiquetasConhecidas,
}: {
	tarefa: Task | null
	aberta: boolean
	onFechar: () => void
	projetos: { id: string; name: string }[]
	etiquetasConhecidas: string[]
}) {
	const [titulo, setTitulo] = useState('')
	const [dia, setDia] = useState('')
	const [hora, setHora] = useState('')
	const [duracao, setDuracao] = useState('')
	const [prazo, setPrazo] = useState('')
	const [projeto, setProjeto] = useState('')
	const [prioridade, setPrioridade] = useState(0)
	const [etiquetas, setEtiquetas] = useState<string[]>([])
	const [novaEtiqueta, setNovaEtiqueta] = useState('')
	const [algumDia, setAlgumDia] = useState(false)
	const [notas, setNotas] = useState('')
	const [semRepetir, setSemRepetir] = useState(true)
	const [recTipo, setRecTipo] = useState<'diaria' | 'semanal' | 'mensal' | 'dias-uteis'>('diaria')
	const [confirmandoExcluir, setConfirmandoExcluir] = useState(false)
	const [salvando, setSalvando] = useState(false)

	useEffect(() => {
		if (!aberta || !tarefa) return
		setTitulo(tarefa.title)
		setDia(tarefa.dueDate ?? '')
		setHora(
			tarefa.startMin != null
				? `${String(Math.floor(tarefa.startMin / 60)).padStart(2, '0')}:${String(tarefa.startMin % 60).padStart(2, '0')}`
				: '',
		)
		setDuracao(tarefa.durationMin ? String(tarefa.durationMin) : '')
		setPrazo(tarefa.deadline ?? '')
		setProjeto(tarefa.projectId ?? '')
		setPrioridade(tarefa.priority ?? 0)
		setEtiquetas(tarefa.tags ?? [])
		setAlgumDia(Boolean(tarefa.someday))
		setNotas(tarefa.notes ?? '')
		setSemRepetir(!tarefa.recurrence)
		setRecTipo(tarefa.recurrence?.tipo ?? 'diaria')
		setConfirmandoExcluir(false)
	}, [aberta, tarefa])

	const sugestoesDeEtiqueta = useMemo(
		() => etiquetasConhecidas.filter((e) => !etiquetas.includes(e)).slice(0, 8),
		[etiquetasConhecidas, etiquetas],
	)

	if (!tarefa) return null

	async function salvar(): Promise<void> {
		if (!tarefa) return
		const bruto = titulo.trim()
		if (!bruto) return

		setSalvando(true)
		try {
			// Reinterpreta o título SÓ quando o texto mudou: sem isso, só tocar em
			// "Salvar" numa tarefa cujo título contém "segunda", "15h" ou "#casa"
			// movia o dia, a hora ou a lista sem o usuário pedir.
			const textoMudou = bruto !== tarefa.title.trim()
			const lido = textoMudou ? interpretar(bruto) : null
			const tituloFinal = lido?.titulo || bruto

			await updateTask(tarefa.id, {
				title: tituloFinal,
				dueDate: lido?.dia ?? (algumDia ? null : dia || null),
				startMin: hora
					? Number(hora.split(':')[0]) * 60 + Number(hora.split(':')[1])
					: (lido?.hora ?? null),
				durationMin: duracao ? Number(duracao) : (lido?.duracao ?? null),
				deadline: prazo || null,
				projectId: projeto || null,
				priority: prioridade as 0 | 1 | 2 | 3,
				tags: etiquetas,
				someday: algumDia,
				notes: notas || null,
				// Guarda os campos que a UI não edita (dias da semana, limite,
				// número de vezes) em vez de descartá-los ao salvar.
				recurrence: semRepetir
					? null
					: (tarefa.recurrence
						? { ...tarefa.recurrence, tipo: recTipo }
						: { tipo: recTipo, intervalo: 1 }),
			})
			onFechar()
		} finally {
			setSalvando(false)
		}
	}

	function adicionarEtiqueta(valor: string): void {
		const limpa = valor.trim().replace(/^[#@]/, '').toLowerCase()
		if (!limpa || etiquetas.includes(limpa)) return
		setEtiquetas([...etiquetas, limpa])
		setNovaEtiqueta('')
	}

	return (
		<Folha titulo="Editar tarefa" aberta={aberta} onFechar={onFechar} passo={confirmandoExcluir ? 'excluir' : 'editar'}>
			{confirmandoExcluir ? (
				<div className="confirmacao">
					<p>
						Excluir <strong>{tarefa.title}</strong>? Se ela repete, as próximas ocorrências param de ser
						criadas.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmandoExcluir(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								escrever(() => softDeleteTask(tarefa.id))
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
					onSubmit={(evento) => {
						evento.preventDefault()
						void salvar()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="ed-titulo">
							Título
						</label>
						<input
							id="ed-titulo"
							data-foco-inicial
							className="campo"
							value={titulo}
							onChange={(evento) => setTitulo(evento.target.value)}
							placeholder="Ex.: pagar luz amanhã 10h"
							autoComplete="off"
							maxLength={280}
						/>
					</div>

					<div className="campo-duplo">
						<div>
							<label className="campo-rotulo" htmlFor="ed-dia">
								Dia
							</label>
							<input
								id="ed-dia"
								className="campo campo--compacto"
								type="date"
								value={dia}
								disabled={algumDia}
								onChange={(evento) => setDia(evento.target.value)}
							/>
						</div>
						<div>
							<label className="campo-rotulo" htmlFor="ed-prazo">
								Prazo final
							</label>
							<input
								id="ed-prazo"
								className="campo campo--compacto"
								type="date"
								value={prazo}
								onChange={(evento) => setPrazo(evento.target.value)}
							/>
						</div>
					</div>

					<div className="campo-duplo">
						<div>
							<label className="campo-rotulo" htmlFor="ed-hora">
								Hora
							</label>
							<input
								id="ed-hora"
								className="campo campo--compacto"
								type="time"
								value={hora}
								onChange={(evento) => setHora(evento.target.value)}
							/>
						</div>
						<div>
							<label className="campo-rotulo" htmlFor="ed-duracao">
								Duração (min)
							</label>
							<input
								id="ed-duracao"
								className="campo campo--compacto"
								type="number"
								min={5}
								step={5}
								value={duracao}
								onChange={(evento) => setDuracao(evento.target.value)}
							/>
						</div>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="ed-projeto">
							Projeto
						</label>
						<select
							id="ed-projeto"
							className="campo"
							value={projeto}
							onChange={(evento) => setProjeto(evento.target.value)}
						>
							<option value="">Sem projeto</option>
							{projetos.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					</div>

					<div>
						<span className="campo-rotulo">Prioridade</span>
						<div className="segmentado" role="group" aria-label="Prioridade">
							{[
								{ v: 0, r: 'Nenhuma' },
								{ v: 1, r: 'Baixa' },
								{ v: 2, r: 'Média' },
								{ v: 3, r: 'Alta' },
							].map((op) => (
								<button
									key={op.v}
									type="button"
									className="segmentado__item"
									aria-pressed={prioridade === op.v}
									onClick={() => setPrioridade(op.v)}
								>
									{op.v === 3 ? <IconeBandeira size={14} /> : null}
									{op.r}
								</button>
							))}
						</div>
					</div>

					<div>
						<span className="campo-rotulo">
							<IconeEtiqueta size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Etiquetas
						</span>
						{etiquetas.length ? (
							<div className="etiquetas-lista">
								{etiquetas.map((etq) => (
									<button
										key={etq}
										type="button"
										className="chip chip--remover"
										onClick={() => setEtiquetas(etiquetas.filter((e) => e !== etq))}
										aria-label={`Remover etiqueta ${etq}`}
									>
										{etq} ×
									</button>
								))}
							</div>
						) : null}
						<div className="campo-linha">
							<input
								className="campo campo--compacto"
								value={novaEtiqueta}
								onChange={(evento) => setNovaEtiqueta(evento.target.value)}
								placeholder="nova etiqueta"
								aria-label="Nova etiqueta"
								onKeyDown={(evento) => {
									if (evento.key === 'Enter') {
										evento.preventDefault()
										adicionarEtiqueta(novaEtiqueta)
									}
								}}
							/>
							<button
								type="button"
								className="botao botao--texto"
								onClick={() => adicionarEtiqueta(novaEtiqueta)}
							>
								Adicionar
							</button>
						</div>
						{sugestoesDeEtiqueta.length ? (
							<div className="etiquetas-sugeridas">
								{sugestoesDeEtiqueta.map((s) => (
									<button key={s} type="button" className="chip chip--auto" onClick={() => adicionarEtiqueta(s)}>
										+ {s}
									</button>
								))}
							</div>
						) : null}
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="ed-notas">
							Notas
						</label>
						<textarea
							id="ed-notas"
							className="campo campo--area"
							rows={3}
							value={notas}
							onChange={(evento) => setNotas(evento.target.value)}
							placeholder="Detalhes, links, o que precisar"
						/>
					</div>

					<div className="linha-ajuste linha-ajuste--sem-borda">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">
								<IconeArquivar size={14} /> Algum dia
							</span>
							<span className="linha-ajuste__descricao">Sai de hoje e não cobra prazo</span>
						</span>
						<button
							type="button"
							role="switch"
							aria-checked={algumDia}
							className="interruptor"
							aria-label="Algum dia"
							onClick={() => setAlgumDia((atual) => !atual)}
						>
							<span className="interruptor__bolinha" aria-hidden="true" />
						</button>
					</div>

					<div className="linha-ajuste linha-ajuste--sem-borda">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">
								<IconeRepetir size={14} /> Repetir
							</span>
							<span className="linha-ajuste__descricao">Ao concluir, cria a próxima</span>
						</span>
						<button
							type="button"
							role="switch"
							aria-checked={!semRepetir}
							className="interruptor"
							aria-label="Repetir"
							onClick={() => setSemRepetir((atual) => !atual)}
						>
							<span className="interruptor__bolinha" aria-hidden="true" />
						</button>
					</div>

					{!semRepetir ? (
						<div className="segmentado" role="group" aria-label="Frequência">
							{[
								{ v: 'diaria' as const, r: 'Diária' },
								{ v: 'dias-uteis' as const, r: 'Dias úteis' },
								{ v: 'semanal' as const, r: 'Semanal' },
								{ v: 'mensal' as const, r: 'Mensal' },
							].map((op) => (
								<button
									key={op.v}
									type="button"
									className="segmentado__item"
									aria-pressed={recTipo === op.v}
									onClick={() => setRecTipo(op.v)}
								>
									{op.r}
								</button>
							))}
						</div>
					) : null}

					{tarefa.subtasks?.length ? (
						<div>
							<span className="campo-rotulo">Subtarefas</span>
							<ul className="subtarefas__lista">
								{tarefa.subtasks.map((sub) => (
									<li key={sub.id} className="subtarefa">
										<span className={sub.done ? 'subtarefa__titulo subtarefa__titulo--feita' : 'subtarefa__titulo'}>
											{sub.title}
										</span>
										<button
											type="button"
											className="botao-icone botao-icone--pequeno"
											aria-label={`Remover subtarefa ${sub.title}`}
											onClick={() => void removeSubtask(tarefa.id, sub.id)}
										>
											<IconeApagar size={15} />
										</button>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<div className="formulario__acoes formulario__acoes--entre">
						<button
							type="button"
							className="botao botao--texto"
							onClick={() => setConfirmandoExcluir(true)}
						>
							<IconeApagar size={16} />
							Excluir
						</button>
						<div className="formulario__acoes">
							<button type="button" className="botao" onClick={onFechar}>
								Cancelar
							</button>
							<button type="submit" className="botao botao--primario" disabled={salvando || !titulo.trim()}>
								<IconeConcluir size={17} />
								{salvando ? 'Salvando…' : 'Salvar'}
							</button>
						</div>
					</div>
				</form>
			)}
		</Folha>
	)
}

export { PALETA }
