import { useMemo } from 'react'
import type { Evento, Task } from '@/db/db'
import { useEventosDoDia } from '@/db/use-eventos'
import { corDoProjeto } from '@/ui/cores'
import { corDoIndice } from '@/ui/paleta'
import { IconeHorario } from '@/ui/icones'

/**
 * Linha do dia: tarefas e eventos na mesma régua de tempo.
 *
 * É o que transforma o calendário em "como está meu dia" em vez de "que dia é
 * hoje". Itens com hora ficam na posição relativa; sem hora, em pílulas acima.
 * A régua cresce das 7h às 22h por padrão e se estende quando há algo fora.
 */
export function LinhaDoDia({
	dia,
	tarefas,
	onConcluir,
	onAbrirEvento,
}: {
	dia: string
	tarefas: Task[]
	onConcluir: (id: string, titulo: string) => void
	/** Toque num evento abre o editor (id pode ser sintático: id@data). */
	onAbrirEvento?: (evento: Evento) => void
}) {
	const eventos = useEventosDoDia(dia)

	const comHora = useMemo(() => {
		const itens: Array<
			| { tipo: 'tarefa'; inicio: number; fim: number; tarefa: Task }
			| { tipo: 'evento'; inicio: number; fim: number; evento: Evento }
		> = []

		for (const tarefa of tarefas) {
			if (tarefa.startMin == null) continue
			itens.push({
				tipo: 'tarefa',
				inicio: tarefa.startMin,
				fim: tarefa.startMin + (tarefa.durationMin ?? 30),
				tarefa,
			})
		}

		for (const evento of eventos ?? []) {
			if (evento.diaInteiro) continue
			const inicio = inicioEmMinutos(evento)
			const fim = Math.max(inicio + 15, fimEmMinutos(evento))
			itens.push({ tipo: 'evento', inicio, fim, evento })
		}

		return itens.sort((a, b) => a.inicio - b.inicio || a.fim - b.fim)
	}, [tarefas, eventos])

	const semHora = tarefas.filter((t) => t.startMin == null)
	const diaInteiro = (eventos ?? []).filter((e) => e.diaInteiro)

	if (!tarefas.length && !(eventos ?? []).length) {
		return null
	}

	if (comHora.length === 0) {
		// Nada com hora: só as pílulas, sem uma régua vazia ocupando a tela.
		return (
			<>
				{diaInteiro.length || semHora.length ? (
					<div className="agenda-sem-hora" style={{ padding: 'var(--s-3)' }}>
						{diaInteiro.map((evento) => (
							<div
								key={evento.id}
								className="pilula-tarefa"
								style={{ ['--cor-cat' as string]: corDoIndice(evento.cor).hex }}
							>
								{evento.title}
								<span className="nota">dia inteiro</span>
							</div>
						))}
						{semHora.map((tarefa) => (
							<button
								key={tarefa.id}
								type="button"
								className="pilula-tarefa"
								style={{ ['--cor-cat' as string]: corDoProjeto(tarefa.projectId).hex }}
								onClick={() => {
									if (!tarefa.done) onConcluir(tarefa.id, tarefa.title)
								}}
							>
								{tarefa.title}
							</button>
						))}
					</div>
				) : null}
			</>
		)
	}

	// A janela começa uma hora antes do primeiro compromisso do dia, não às 07:00
	// fixas: com o primeiro às 09:00, duas horas de régua vazia apareciam antes
	// de qualquer coisa útil.
	const primeiroMinuto = Math.min(...comHora.map((i) => i.inicio))
	const inicioJanela = Math.max(0, Math.floor(primeiroMinuto / 60) * 60 - 60)
	// Termina uma hora depois do último compromisso. Antes ia até as 22:00 sempre,
	// então um dia com um evento às 9h mostrava 13 horas de régua vazia.
	const ultimoMinuto = Math.max(...comHora.map((i) => i.fim))
	const fimJanela = Math.min(24 * 60, Math.ceil(ultimoMinuto / 60) * 60 + 60)
	// Escala vertical: 0,55 px por minuto (1 h ≈ 33 px). Antes eram 0,9 (1 h ≈ 54
	// px) e a régua de um dia inteiro passava de 800 px, obrigando a rolar muito
	// para chegar às tarefas sem hora.
	const ESCALA = 0.55
	const altura = Math.max((fimJanela - inicioJanela) * ESCALA, 140)

	return (
		<>
			<div className="agenda-dia">
				<div className="agenda-dia__regua" style={{ height: `${altura}px` }}>
					{horasEntre(inicioJanela, fimJanela).map((hora) => (
						<div key={hora} className="agenda-dia__hora" style={{ top: `${(hora * 60 - inicioJanela) * ESCALA}px` }}>
							<span>{String(Math.floor(hora)).padStart(2, '0')}:00</span>
						</div>
					))}

					{comHora.map((item) =>
						item.tipo === 'evento' ? (
							<button
								key={item.evento.id}
								type="button"
								className="agenda-bloco agenda-bloco--evento"
								style={{
									['--cor-cat' as string]: corDoIndice(item.evento.cor).hex,
									top: `${(item.inicio - inicioJanela) * ESCALA}px`,
									height: `${Math.max((item.fim - item.inicio) * ESCALA, 26)}px`,
								}}
								onClick={() => onAbrirEvento?.(item.evento)}
								aria-label={`Editar ${item.evento.title}`}
							>
								<span className="agenda-bloco__hora">{formatarMinuto(item.inicio)}</span>
								<span className="agenda-bloco__titulo">{item.evento.title}</span>
							</button>
						) : (
							<button
								key={item.tarefa.id}
								type="button"
								className="agenda-bloco agenda-bloco--tarefa"
								style={{
									['--cor-cat' as string]: corDoProjeto(item.tarefa.projectId).hex,
									top: `${(item.inicio - inicioJanela) * ESCALA}px`,
									height: `${Math.max((item.fim - item.inicio) * ESCALA, 26)}px`,
								}}
								onClick={() => {
									if (!item.tarefa.done) onConcluir(item.tarefa.id, item.tarefa.title)
								}}
								aria-label={`Concluir ${item.tarefa.title}`}
							>
								<span className="agenda-bloco__hora">{formatarMinuto(item.inicio)}</span>
								<span
									className={
										item.tarefa.done
											? 'agenda-bloco__titulo agenda-bloco__titulo--feita'
											: 'agenda-bloco__titulo'
									}
								>
									{item.tarefa.title}
								</span>
							</button>
						),
					)}
				</div>
			</div>

			{diaInteiro.length ? (
				<div className="agenda-sem-hora" style={{ paddingBottom: 'var(--s-2)' }}>
					{diaInteiro.map((evento) => (
						<button
							key={evento.id}
							type="button"
							className="pilula-tarefa"
							style={{ ['--cor-cat' as string]: corDoIndice(evento.cor).hex }}
							onClick={() => onAbrirEvento?.(evento)}
							aria-label={`Editar ${evento.title}`}
						>
							{evento.title}
							<span className="nota">dia inteiro</span>
						</button>
					))}
				</div>
			) : null}
		</>
	)
}

/** Minutos desde 00:00 do início de um evento, no fuso local. */
function inicioEmMinutos(evento: Evento): number {
	const data = new Date(evento.startAt)
	return data.getHours() * 60 + data.getMinutes()
}

function fimEmMinutos(evento: Evento): number {
	const data = new Date(evento.endAt)
	const minutos = data.getHours() * 60 + data.getMinutes()
	// Evento que termina à meia-noite conta como fim do dia.
	return minutos === 0 ? 24 * 60 : minutos
}

function formatarMinuto(total: number): string {
	return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Horas cheias cobertas pela janela, das 7h às 22h por padrão. */
function horasEntre(inicio: number, fim: number): number[] {
	const horas: number[] = []
	for (let hora = Math.floor(inicio / 60); hora <= Math.ceil(fim / 60); hora++) horas.push(hora)
	return horas
}

export { formatarMinuto }
export { IconeHorario }
