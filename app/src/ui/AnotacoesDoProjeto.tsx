import { useEffect, useState } from 'react'
import {
	criarAnotacao,
	editarAnotacao,
	excluirAnotacao,
	useAnotacoes,
} from '@/db/repo'
import type { ProjectNote } from '@/db/db'
import { Folha } from '@/ui/Folha'
import { formatarHora } from '@/lib/date'
import { IconeAdicionar, IconeConcluido, IconeEditar, IconeApagar, IconeHorario } from '@/ui/icones'

/**
 * Anotações datadas de um projeto.
 *
 * Antes havia um único campo de texto por projeto, que servia para briefing e
 * para anotação solta ao mesmo tempo — e ficava ilegível depois de três
 * parágrafos. Aqui cada anotação tem data própria, título opcional e pode ser
 * editada ou apagada sem tocar nas outras.
 *
 * O texto antigo (`projects.notas`) não foi migrado: ele continua no bloco
 * "Resumo do projeto", no topo. Duas coisas diferentes, dois lugares — e nada
 * se perde na conversão.
 */

/** "hoje, 14:32" · "ontem, 09:10" · "12 de nov., 18:00" */
function quandoFoi(em: number, agora = Date.now()): string {
	const data = new Date(em)
	const hoje = new Date(agora)
	const mesmoDia =
		data.getDate() === hoje.getDate() &&
		data.getMonth() === hoje.getMonth() &&
		data.getFullYear() === hoje.getFullYear()

	const ontem = new Date(agora)
	ontem.setDate(ontem.getDate() - 1)
	const foiOntem =
		data.getDate() === ontem.getDate() &&
		data.getMonth() === ontem.getMonth() &&
		data.getFullYear() === ontem.getFullYear()

	const hora = formatarHora(data)
	if (mesmoDia) return `hoje, ${hora}`
	if (foiOntem) return `ontem, ${hora}`

	return `${data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${hora}`
}

/** Quebra o texto em parágrafos, preservando linhas e marcadores. */
function Paragrafos({ texto }: { texto: string }) {
	return (
		<>
			{texto.split(/\n{2,}/).map((bloco, indice) => (
				<p key={indice} className="anotacao__paragrafo">
					{bloco}
				</p>
			))}
		</>
	)
}

interface EditorProps {
	aberto: boolean
	nota: ProjectNote | null
	projectId: string
	onFechar: () => void
}

/** Folha de criação/edição. Mesma para os dois casos, para não divergirem. */
function EditorDeAnotacao({ aberto, nota, projectId, onFechar }: EditorProps) {
	const [titulo, setTitulo] = useState('')
	const [corpo, setCorpo] = useState('')
	const [data, setData] = useState('')
	const [hora, setHora] = useState('')
	const [erro, setErro] = useState<string | null>(null)
	const [salvando, setSalvando] = useState(false)

	useEffect(() => {
		if (!aberto) return
		setErro(null)
		if (!nota) {
			const agora = new Date()
			setTitulo('')
			setCorpo('')
			setData(agora.toISOString().slice(0, 10))
			setHora(`${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`)
			return
		}
		const quando = new Date(nota.em)
		setTitulo(nota.title ?? '')
		setCorpo(nota.body)
		setData(quando.toISOString().slice(0, 10))
		setHora(`${String(quando.getHours()).padStart(2, '0')}:${String(quando.getMinutes()).padStart(2, '0')}`)
	}, [aberto, nota])

	function momento(): number {
		// Data e hora separadas porque o `datetime-local` do Android é ruim; juntar
		// aqui mantém um campo só de verdade no banco.
		const [ano, mes, dia] = data.split('-').map(Number)
		const [h, m] = hora.split(':').map(Number)
		if (!ano || !mes || !dia) return Date.now()
		return new Date(ano, mes - 1, dia, h || 0, m || 0).getTime()
	}

	async function salvar(): Promise<void> {
		if (!corpo.trim()) {
			setErro('Escreva a anotação.')
			return
		}
		setSalvando(true)
		try {
			if (nota) {
				await editarAnotacao(nota.id, { title: titulo, body: corpo, em: momento() })
			} else {
				await criarAnotacao({ projectId, title: titulo, body: corpo, em: momento() })
			}
			onFechar()
		} catch (causa) {
			setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar.')
		} finally {
			setSalvando(false)
		}
	}

	return (
		<Folha titulo={nota ? 'Editar anotação' : 'Nova anotação'} aberta={aberto} onFechar={onFechar}>
			<form
				className="formulario"
				onSubmit={(evento) => {
					evento.preventDefault()
					void salvar()
				}}
			>
				<div>
					<label className="campo-rotulo" htmlFor="anotacao-titulo">
						Título <span className="campo-opcional">(opcional)</span>
					</label>
					<input
						id="anotacao-titulo"
						data-foco-inicial
						className="campo"
						value={titulo}
						onChange={(evento) => setTitulo(evento.target.value)}
						placeholder="Ex.: Reunião com o cliente"
						maxLength={80}
					/>
				</div>

				<div>
					<label className="campo-rotulo" htmlFor="anotacao-corpo">
						Anotação
					</label>
					<textarea
						id="anotacao-corpo"
						className="campo campo--area"
						value={corpo}
						onChange={(evento) => setCorpo(evento.target.value)}
						placeholder="Decisões, combinados, o que ficou de fazer."
						rows={6}
						maxLength={8000}
					/>
					<p className="nota">Uma linha em branco separa parágrafos.</p>
				</div>

				<div className="anotacao-quando">
					<div>
						<label className="campo-rotulo" htmlFor="anotacao-data">
							Data
						</label>
						<input
							id="anotacao-data"
							type="date"
							className="campo"
							value={data}
							onChange={(evento) => setData(evento.target.value)}
						/>
					</div>
					<div>
						<label className="campo-rotulo" htmlFor="anotacao-hora">
							Hora
						</label>
						<input
							id="anotacao-hora"
							type="time"
							className="campo"
							value={hora}
							onChange={(evento) => setHora(evento.target.value)}
						/>
					</div>
				</div>

				{erro ? (
					<p className="nota nota--erro" role="alert">
						{erro}
					</p>
				) : null}

				<div className="formulario__acoes">
					<button type="button" className="botao" onClick={onFechar}>
						Cancelar
					</button>
					<button type="submit" className="botao botao--primario" disabled={salvando}>
						{nota ? 'Salvar' : 'Anotar'}
					</button>
				</div>
			</form>
		</Folha>
	)
}

export function SecaoDeAnotacoes({ projectId }: { projectId: string }) {
	const notas = useAnotacoes(projectId)
	const [editando, setEditando] = useState<ProjectNote | null>(null)
	const [criando, setCriando] = useState(false)
	const [confirmando, setConfirmando] = useState<ProjectNote | null>(null)

	return (
		<section className="secao" aria-labelledby="secao-anotacoes">
			<div className="secao-cabecalho">
				<h2 className="secao-titulo" id="secao-anotacoes">
					<span className="secao-titulo__icone" aria-hidden="true">
						<IconeHorario size={17} />
					</span>
					Anotações
					{notas && notas.length > 0 ? (
						<span className="secao-titulo__contagem">{notas.length}</span>
					) : null}
				</h2>
				<button type="button" className="secao-acao" onClick={() => setCriando(true)}>
					<IconeAdicionar size={18} />
					Anotar
				</button>
			</div>

			{notas === undefined ? (
				<div className="cartao esqueleto" aria-hidden="true">
					<div className="esqueleto__linha">
						<span className="esqueleto__titulo" />
					</div>
				</div>
			) : notas.length === 0 ? (
				<div className="cartao cartao--vazio">
					<p>
						Nenhuma anotação. Cada uma guarda a data e a hora, e pode ser editada depois.
					</p>
					<button type="button" className="botao" onClick={() => setCriando(true)}>
						<IconeAdicionar size={18} />
						Primeira anotação
					</button>
				</div>
			) : (
				<ul className="anotacao-lista">
					{notas.map((nota) => (
						<li key={nota.id} className="anotacao">
							<div className="anotacao__topo">
								<span className="anotacao__quando">{quandoFoi(nota.em)}</span>
								<div className="anotacao__acoes">
									<button
										type="button"
										className="botao-icone botao-icone--pequeno"
										aria-label={`Editar anotação${nota.title ? `: ${nota.title}` : ''}`}
										onClick={() => setEditando(nota)}
									>
										<IconeEditar size={16} />
									</button>
									<button
										type="button"
										className="botao-icone botao-icone--pequeno"
										aria-label={`Apagar anotação${nota.title ? `: ${nota.title}` : ''}`}
										onClick={() => setConfirmando(nota)}
									>
										<IconeApagar size={16} />
									</button>
								</div>
							</div>

							{nota.title ? <h3 className="anotacao__titulo">{nota.title}</h3> : null}
							<div className="anotacao__corpo">
								<Paragrafos texto={nota.body} />
							</div>
						</li>
					))}
				</ul>
			)}

			<EditorDeAnotacao
				aberto={criando || editando !== null}
				nota={editando}
				projectId={projectId}
				onFechar={() => {
					setCriando(false)
					setEditando(null)
				}}
			/>

			<Folha
				titulo="Apagar anotação"
				aberta={confirmando !== null}
				onFechar={() => setConfirmando(null)}
			>
				<div className="formulario">
					<p className="nota">
						Esta anotação sai da lista. As outras não são afetadas.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmando(null)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								if (!confirmando) return
								void excluirAnotacao(confirmando.id)
								setConfirmando(null)
							}}
						>
							Apagar
						</button>
					</div>
				</div>
			</Folha>

			<p className="nota" style={{ marginTop: 'var(--s-3)' }}>
				<span aria-hidden="true">
					<IconeConcluido size={13} />
				</span>{' '}
				A anotação guarda a data que você escolher, não a data em que foi escrita — dá para
				registrar algo de ontem.
			</p>
		</section>
	)
}
