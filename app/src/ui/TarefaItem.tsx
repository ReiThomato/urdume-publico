import { useRef, useState } from 'react'
import { addSubtask, progressoDeSubtarefas, toggleSubtask, toggleTask } from '@/db/repo'
import type { Task } from '@/db/db'
import {
	IconeAdicionar,
	IconeApagar,
	IconeBandeira,
	IconeConcluir,
	IconeEditar,
	IconeExpandir,
	IconeHorario,
	IconeRepetir,
} from '@/ui/icones'
import { estiloCor } from '@/ui/cores'
import { corDoIndice } from '@/ui/paleta'
import { escrever } from '@/lib/falhas'

export interface TarefaItemProps {
	tarefa: Task
	/** Nome e cor da lista à qual pertence (projeto), quando houver. */
	lista?: { nome: string; cor: number | string | null; id: string }
	onConcluir?: (id: string, titulo: string) => void
	onEditar?: (tarefa: Task) => void
	onExcluir?: (tarefa: Task) => void
	/** Mostra a data em vez da hora (listas e busca). */
	mostrarData?: boolean
	atrasada?: boolean
}

function horaTexto(min: number): string {
	return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function dataCurta(dia: string): string {
	const [ano, mes, d] = dia.split('-')
	return `${d}/${mes}${ano && ano !== String(new Date().getFullYear()) ? `/${ano.slice(2)}` : ''}`
}

/** Rótulo e marca visual da prioridade. 0 = sem prioridade. */
export const PRIORIDADES: Array<{ valor: 0 | 1 | 2 | 3; rotulo: string }> = [
	{ valor: 0, rotulo: 'Sem prioridade' },
	{ valor: 1, rotulo: 'Baixa' },
	{ valor: 2, rotulo: 'Média' },
	{ valor: 3, rotulo: 'Alta' },
]

/**
 * Linha de tarefa — o mesmo componente no Hoje, nas listas, na agenda e na
 * busca. Tocar no círculo conclui; tocar no texto abre a edição; a seta abre
 * subtarefas.
 *
 * Prioridade aparece em três lugares ao mesmo tempo, porque um só não se lê de
 * relance: uma bandeira com a cor da prioridade antes do título, uma etiqueta
 * com o nome, e o filete à esquerda muda de cor quando a tarefa é de alta
 * prioridade. Antes a prioridade existia só no banco: era impossível distinguir
 * uma tarefa urgente de uma sem prioridade sem abrir cada uma.
 */
export function TarefaItem({
	tarefa,
	lista,
	onConcluir,
	onEditar,
	onExcluir,
	mostrarData,
	atrasada,
}: TarefaItemProps) {
	const [aberta, setAberta] = useState(false)
	const [novaSubtarefa, setNovaSubtarefa] = useState('')
	const [criandoSub, setCriandoSub] = useState(false)
	const campoSub = useRef<HTMLInputElement>(null)

	const progresso = progressoDeSubtarefas(tarefa)
	const subtarefas = tarefa.subtasks ?? []
	const cor = lista ? (typeof lista.cor === 'number' ? lista.cor : Number(lista.cor ?? corDoIndice(0).indice)) : null

	const prioridade = (tarefa.priority ?? 0) as 0 | 1 | 2 | 3
	const temPrioridade = prioridade > 0

	async function criarSubtarefa(): Promise<void> {
		const texto = novaSubtarefa.trim()
		if (!texto) return
		await addSubtask(tarefa.id, texto)
		setNovaSubtarefa('')
		// Mantém o foco no campo: adicionar um passo não deve exigir tocar de novo.
		campoSub.current?.focus()
	}

	function concluir(): void {
		if (tarefa.done) {
			escrever(() => toggleTask(tarefa.id, false))
			return
		}
		if (onConcluir) onConcluir(tarefa.id, tarefa.title)
		else escrever(() => toggleTask(tarefa.id, true))
	}

	return (
		<li
			className={[
				'tarefa',
				tarefa.done ? 'tarefa--feita' : '',
				temPrioridade ? `tarefa--prioridade-${prioridade}` : '',
			]
				.filter(Boolean)
				.join(' ')}
			style={cor === null ? undefined : estiloCor(cor)}
			data-prioridade={prioridade}
		>
			<button
				type="button"
				role="checkbox"
				aria-checked={tarefa.done}
				aria-label={tarefa.done ? `Reabrir ${tarefa.title}` : `Concluir ${tarefa.title}`}
				className="checkbox"
				onClick={concluir}
			>
				<span className="checkbox__marca" aria-hidden="true">
					<IconeConcluir size={16} />
				</span>
			</button>

			<button
				type="button"
				className="tarefa__corpo"
				onClick={() => onEditar?.(tarefa)}
				aria-label={`Editar ${tarefa.title}`}
			>
				<span className="tarefa__linha-titulo">
					{temPrioridade ? (
						<span
							className="tarefa__prioridade-marca"
							data-prioridade={prioridade}
							aria-hidden="true"
						>
							<IconeBandeira size={15} />
						</span>
					) : null}
					<span className="tarefa__titulo">{tarefa.title}</span>
				</span>
				<span className="tarefa__meta">
					{temPrioridade ? (
						<span className="etiqueta etiqueta--prioridade" data-prioridade={prioridade}>
							{PRIORIDADES[prioridade]!.rotulo}
						</span>
					) : null}

					{tarefa.startMin != null ? (
						<span className="tarefa__hora">
							<IconeHorario size={14} />
							{horaTexto(tarefa.startMin)}
						</span>
					) : null}

					{mostrarData && tarefa.dueDate ? (
						<span className="tarefa__hora">{dataCurta(tarefa.dueDate)}</span>
					) : null}

					{lista ? <span className="tarefa__lista">{lista.nome}</span> : null}

					{progresso ? (
						<span className="tarefa__progresso">
							<IconeConcluir size={13} />
							{progresso}
						</span>
					) : null}

					{tarefa.recurrence ? (
						<span className="tarefa__hora" title="Repete">
							<IconeRepetir size={13} />
						</span>
					) : null}

					{atrasada && !tarefa.done ? <span className="etiqueta etiqueta--atraso">Atrasada</span> : null}

					{(tarefa.tags ?? []).slice(0, 2).map((etiqueta) => (
						<span key={etiqueta} className="etiqueta">
							{etiqueta}
						</span>
					))}
				</span>
			</button>

			<div className="tarefa__acoes">
				{/* Atalhos explícitos: antes só existiam dentro da folha de edição,
				    o que exigia abrir a tarefa para editar ou excluir. */}
				{onEditar ? (
					<button
						type="button"
						className="botao-icone botao-icone--pequeno tarefa__atalho"
						aria-label={`Editar ${tarefa.title}`}
						title="Editar"
						onClick={() => onEditar(tarefa)}
					>
						<IconeEditar size={18} />
					</button>
				) : null}

				{onExcluir ? (
					<button
						type="button"
						className="botao-icone botao-icone--pequeno tarefa__atalho tarefa__atalho--apagar"
						aria-label={`Excluir ${tarefa.title}`}
						title="Excluir"
						onClick={() => onExcluir(tarefa)}
					>
						<IconeApagar size={18} />
					</button>
				) : null}

				<button
					type="button"
					className="botao-icone botao-icone--pequeno"
					aria-expanded={aberta}
					aria-label={
						aberta ? `Recolher subtarefas de ${tarefa.title}` : `Abrir subtarefas de ${tarefa.title}`
					}
					onClick={() => setAberta((atual) => !atual)}
				>
					<span
						aria-hidden="true"
						style={{
							display: 'grid',
							placeItems: 'center',
							transform: aberta ? 'rotate(180deg)' : undefined,
							transition: 'transform var(--dur) var(--ease)',
						}}
					>
						<IconeExpandir size={20} />
					</span>
				</button>
			</div>

			{aberta ? (
				<div className="subtarefas" style={{ gridColumn: '1 / -1' }}>
					{subtarefas.length === 0 ? (
						// Antes era uma frase solta ocupando uma linha inteira ("Sem
						// passos. Adicione o que precisa acontecer antes."), que empurrava
						// a lista e não ajudava. Agora o botão de adicionar já é o convite.
						<button
							type="button"
							className="subtarefas__vazio"
							onClick={() => {
								setCriandoSub(true)
								requestAnimationFrame(() => campoSub.current?.focus())
							}}
						>
							<IconeAdicionar size={16} />
							Adicionar o primeiro passo
						</button>
					) : (
						subtarefas.map((sub) => (
							<div key={sub.id} className="subtarefa">
								<button
									type="button"
									role="checkbox"
									aria-checked={sub.done}
									aria-label={sub.done ? `Reabrir ${sub.title}` : `Concluir ${sub.title}`}
									className="checkbox checkbox--pequeno"
									onClick={() => void toggleSubtask(tarefa.id, sub.id)}
								>
									<span className="checkbox__marca" aria-hidden="true">
										<IconeConcluir size={12} />
									</span>
								</button>
								<span className={sub.done ? 'subtarefa__titulo subtarefa__titulo--feita' : 'subtarefa__titulo'}>
									{sub.title}
								</span>
							</div>
						))
					)}

					{criandoSub ? (
						<form
							className="subtarefas__form"
							onSubmit={(evento) => {
								evento.preventDefault()
								void criarSubtarefa()
							}}
						>
							<input
								ref={campoSub}
								className="campo campo--compacto"
								value={novaSubtarefa}
								onChange={(evento) => setNovaSubtarefa(evento.target.value)}
								onBlur={() => {
									// Fecha o campo só se ficou vazio: perder o que foi digitado
									// porque o foco saiu seria pior que deixar aberto.
									if (!novaSubtarefa.trim()) setCriandoSub(false)
								}}
								placeholder="Novo passo"
								aria-label={`Novo passo de ${tarefa.title}`}
								maxLength={160}
								data-foco-inicial
							/>
							<button type="submit" className="botao botao--texto" disabled={!novaSubtarefa.trim()}>
								Adicionar
							</button>
						</form>
					) : subtarefas.length > 0 ? (
						<button
							type="button"
							className="subtarefas__form"
							onClick={() => setCriandoSub(true)}
							style={{ color: 'var(--primary)', fontSize: 'var(--text-sm)', fontWeight: 700, minHeight: 40 }}
						>
							<IconeAdicionar size={18} />
							Adicionar passo
						</button>
					) : null}
				</div>
			) : null}
		</li>
	)
}

export { horaTexto, dataCurta }
