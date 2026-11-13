import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Reminder, Task } from '@/db/db'
import { useEventosDoDia } from '@/db/use-eventos'
import { toggleTask } from '@/db/repo'
import { formatarDiaCurto, formatarDiaLongo, formatarHora } from '@/lib/date'
import { estiloCor } from '@/ui/cores'
import { IconeAdicionar, IconeCalendario, IconeHorario, IconeAlarme } from '@/ui/icones'
import { escrever } from '@/lib/falhas'

/** Tarefas de um dia qualquer, abertas e concluídas. */
function useTarefasDoDia(dia: string): Task[] | undefined {
	return useLiveQuery(async () => {
		const todas = await db.tasks.where('dueDate').equals(dia).toArray()
		return todas
			.filter((t) => !t.deletedAt)
			.sort((a, b) => (a.startMin ?? 9999) - (b.startMin ?? 9999) || a.order - b.order)
	}, [dia])
}

/** Lembretes que vencem naquele dia. */
function useLembretesDoDia(dia: string): Reminder[] | undefined {
	return useLiveQuery(async () => {
		const todos = await db.reminders.toArray()
		return todos
			.filter((r) => {
				if (r.deletedAt || !r.dueAt) return false
				const d = new Date(r.dueAt)
				const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
				return chave === dia
			})
			.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
	}, [dia])
}

export interface PainelDoDiaProps {
	/** Dia escolhido na fita (AAAA-MM-DD). */
	dia: string
	hoje: string
	onEditarTarefa: (tarefa: Task) => void
	onCriar: (dia: string) => void
}

/**
 * Resumo do dia escolhido na fita do Início.
 *
 * Antes tocar num dia levava para a Agenda. Isso obrigava a sair do painel para
 * ver o que havia naquele dia — o oposto de "observar os afazeres". Aqui os
 * compromissos, tarefas e lembretes daquele dia aparecem no próprio Início, e a
 * Agenda continua a um toque no rodapé do bloco.
 */
export function PainelDoDia({ dia, hoje, onEditarTarefa, onCriar }: PainelDoDiaProps) {
	const tarefas = useTarefasDoDia(dia)
	const eventos = useEventosDoDia(dia)
	const lembretes = useLembretesDoDia(dia)

	const abertas = useMemo(() => (tarefas ?? []).filter((t) => !t.done), [tarefas])
	const feitas = useMemo(() => (tarefas ?? []).filter((t) => t.done), [tarefas])

	const vazio =
		tarefas !== undefined &&
		(eventos ?? []).length === 0 &&
		(lembretes ?? []).length === 0 &&
		tarefas.length === 0

	const data = new Date(`${dia}T12:00:00`)

	return (
		<section className="secao" aria-label={`Resumo de ${formatarDiaLongo(data)}`}>
			<div className="secao-cabecalho">
				<h2 className="secao-titulo">
					<span className="secao-titulo__icone" aria-hidden="true">
						<IconeCalendario size={18} />
					</span>
					{/* Curto de propósito: "Quinta-feira, 12 de novembro" quebrava em
					    duas linhas ao lado do contador e desalinhava o cabeçalho. */}
					{dia === hoje
						? 'Hoje'
						: `${formatarDiaCurto(data).split(',').slice(0, 2).join(',').replace('.', '.')}`}
					{abertas.length > 0 ? (
						<span className="secao-titulo__contagem">{abertas.length}</span>
					) : null}
				</h2>
				<button type="button" className="secao-acao" onClick={() => onCriar(dia)}>
					<IconeAdicionar size={18} />
					Adicionar
				</button>
			</div>

			{vazio ? (
				<div className="cartao cartao--vazio">
					<p>Nada marcado para este dia.</p>
					<button type="button" className="botao" onClick={() => onCriar(dia)}>
						<IconeAdicionar size={20} />
						Criar algo neste dia
					</button>
				</div>
			) : (
				<ul className="linha-grupo">
					{(eventos ?? []).map((evento) => (
						<li key={evento.id} className="linha" style={estiloCor(evento.cor)}>
							<span className="linha__icone" aria-hidden="true">
								<IconeCalendario size={20} />
							</span>
							<span className="linha__corpo">
								<span className="linha__titulo">{evento.title}</span>
								<span className="linha__meta">
									{evento.diaInteiro
										? 'Dia inteiro'
										: `${formatarHora(evento.startAt)} – ${formatarHora(evento.endAt)}`}
									{evento.local ? ` · ${evento.local}` : ''}
								</span>
							</span>
						</li>
					))}

					{abertas.map((tarefa) => (
						<li key={tarefa.id} className="linha">
							<button
								type="button"
								role="checkbox"
								aria-checked={false}
								aria-label={`Concluir ${tarefa.title}`}
								className="checkbox"
								onClick={() => escrever(() => toggleTask(tarefa.id, true))}
							>
								<span className="checkbox__marca" aria-hidden="true" />
							</button>
							<button
								type="button"
								className="linha__corpo"
								onClick={() => onEditarTarefa(tarefa)}
								style={{ textAlign: 'left' }}
							>
								<span className="linha__titulo">{tarefa.title}</span>
								<span className="linha__meta">
									{tarefa.startMin != null ? (
										<>
											<IconeHorario size={13} />
											{formatarHora(
												new Date(`${dia}T00:00:00`).getTime() + tarefa.startMin * 60000,
											)}
										</>
									) : (
										'Tarefa'
									)}
								</span>
							</button>
						</li>
					))}

					{(lembretes ?? []).map((lembrete) => (
						<li key={lembrete.id} className="linha">
							<span className="linha__icone" aria-hidden="true">
								<IconeAlarme size={20} />
							</span>
							<span className="linha__corpo">
								<span className="linha__titulo">{lembrete.text}</span>
								<span className="linha__meta">
									{lembrete.dueAt ? `Lembrete · ${formatarHora(lembrete.dueAt)}` : 'Lembrete'}
								</span>
							</span>
						</li>
					))}

					{feitas.length > 0 ? (
						<li className="linha linha--concluida">
							<span className="linha__corpo">
								<span className="linha__titulo">
									{feitas.length} {feitas.length === 1 ? 'concluída' : 'concluídas'}
								</span>
							</span>
						</li>
					) : null}
				</ul>
			)}
		</section>
	)
}
