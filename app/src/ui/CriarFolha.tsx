import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@/app/router'
import {
	createProject,
	createReminder,
	createTask,
	useProjects,
} from '@/db/repo'
import { criarEvento } from '@/db/eventos'
import { criarHabito } from '@/db/habitos'
import { PALETA, corDoIndice } from '@/ui/paleta'
import { pedirPermissaoDeAviso, agendarLembrete } from '@/lib/avisos'
import { chaveDoDia, diaDaChave, diaDeHoje, formatarDiaCurto } from '@/lib/date'
import { interpretar } from '@/lib/interpretar'
import { Folha } from '@/ui/Folha'
import {
	IconeAdicionar,
	IconeCalendario,
	IconeEvento,
	IconeFogo,
	IconeHorario,
	IconePasta,
} from '@/ui/icones'

export type TipoCriacao = 'tarefa' | 'projeto' | 'lembrete' | 'evento' | 'habito'

type Etapa = 'escolha' | TipoCriacao

export interface CriarFolhaProps {
	aberta: boolean
	onFechar: () => void
	/** Tipo pré-escolhido pelo botão que abriu a folha. */
	tipo?: TipoCriacao
	/** Dia pré-selecionado (calendário / tiras do Início). */
	dia?: string
}

/**
 * Folha única de criação.
 *
 * Na tarefa, o título é interpretado enquanto digita ("amanhã 15h", "#projeto",
 * "@etiqueta", "!alta", "todo dia"): o reconhecido aparece em chips e pode ser
 * ignorado com um toque. Nada além do título é obrigatório. O dia vem da tela
 * que abriu a folha, então criar a partir do calendário já nasce na data certa.
 */
export function CriarFolha({ aberta, onFechar, tipo, dia }: CriarFolhaProps) {
	const { navigate } = useRouter()
	const [etapa, setEtapa] = useState<Etapa>(tipo ?? 'escolha')
	const [titulo, setTitulo] = useState('')
	const [projetoVinculo, setProjetoVinculo] = useState('')
	const [quandoLembrete, setQuandoLembrete] = useState('')
	const [horaManual, setHoraManual] = useState('')
	const [duracaoManual, setDuracaoManual] = useState('')
	const [ignorarAuto, setIgnorarAuto] = useState(false)
	const [diaEvento, setDiaEvento] = useState('')
	const [inicioEvento, setInicioEvento] = useState('')
	const [fimEvento, setFimEvento] = useState('')
	const [repetirEvento, setRepetirEvento] = useState(false)
	const [recEvento, setRecEvento] = useState<'diaria' | 'semanal' | 'mensal'>('semanal')
	const [metaHabito, setMetaHabito] = useState('')
	const [unidadeHabito, setUnidadeHabito] = useState('')
	const [corEscolhida, setCorEscolhida] = useState(0)
	const [prioridade, setPrioridade] = useState(0)
	const [diaTarefa, setDiaTarefa] = useState('')
	const [erro, setErro] = useState<string | null>(null)
	const [salvando, setSalvando] = useState(false)

	const projetos = useProjects()

	useEffect(() => {
		setEtapa(tipo ?? 'escolha')
		if (!aberta) {
			setTitulo('')
			setProjetoVinculo('')
			setQuandoLembrete('')
			setHoraManual('')
			setDuracaoManual('')
			setIgnorarAuto(false)
			setDiaEvento('')
			setInicioEvento('')
			setFimEvento('')
			setRepetirEvento(false)
			setRecEvento('semanal')
			setMetaHabito('')
			setUnidadeHabito('')
			setCorEscolhida(0)
			setPrioridade(0)
			setDiaTarefa('')
			setErro(null)
			setSalvando(false)
		} else {
			// O dia da tela que abriu vence: criar no calendário já nasce ali.
			if (dia) {
				setDiaEvento(dia)
				setDiaTarefa(dia)
			}
		}
	}, [aberta, tipo, dia])

	/** Interpretação do texto digitado, ao vivo. */
	const auto = useMemo(() => {
		if (ignorarAuto || etapa !== 'tarefa') return null
		const resultado = interpretar(titulo)
		return resultado.entendido.length ? resultado : null
	}, [titulo, ignorarAuto, etapa])

	const fechar = (): void => {
		if (salvando) return
		onFechar()
	}

	async function salvar(): Promise<void> {
		const bruto = titulo.trim()
		if (!bruto) {
			setErro('Escreva um título.')
			return
		}

		setSalvando(true)
		setErro(null)

		try {
			switch (etapa) {
				case 'tarefa': {
					const lido = auto ?? interpretar(bruto)
					const porNome = lido.projeto
						? (projetos ?? []).find((p) => p.name.toLowerCase() === lido.projeto!.toLowerCase())
						: undefined
					const etiquetas = [lido.etiqueta, lido.projeto && !porNome ? lido.projeto : null].filter(
						Boolean,
					) as string[]

					await createTask({
						title: lido.titulo || bruto,
						// `||` e não `??`: os três valores são strings e o vazio é
						// frequente (tela sem dia escolhido). Com `??`, string vazia
						// "passa" e a tarefa nasce com `dueDate: ''` — sem dia, fora
						// de Hoje e invisível para a agenda de avisos.
						dueDate: lido.dia || diaTarefa || dia || chaveDoDia(diaDeHoje()),
						projectId: projetoVinculo || porNome?.id || null,
						startMin: horaManual
							? Number(horaManual.split(':')[0]) * 60 + Number(horaManual.split(':')[1])
							: (lido.hora ?? null),
						durationMin: duracaoManual ? Number(duracaoManual) : (lido.duracao ?? null),
						priority: (prioridade || lido.prioridade || 0) as 0 | 1 | 2 | 3,
						tags: etiquetas,
						recurrence: lido.recorrencia
							? { tipo: lido.recorrencia.tipo, intervalo: lido.recorrencia.intervalo }
							: null,
					})
					break
				}
				case 'evento': {
					const base = diaEvento || dia || chaveDoDia(diaDeHoje())
					const inicio = inicioEvento ? new Date(`${base}T${inicioEvento}`) : new Date(`${base}T09:00`)
					const fim = fimEvento ? new Date(`${base}T${fimEvento}`) : new Date(inicio.getTime() + 3600000)
					await criarEvento({
						title: bruto,
						startAt: inicio.getTime(),
						endAt: Math.max(fim.getTime(), inicio.getTime() + 900000),
						cor: corEscolhida,
						recurrence: repetirEvento ? { tipo: recEvento, intervalo: 1 } : null,
					})
					break
				}
				case 'habito':
					await criarHabito({
						title: bruto,
						cor: corEscolhida,
						targetValue: metaHabito ? Number(metaHabito.replace(',', '.')) : 0,
						targetUnit: unidadeHabito.trim(),
						startMin: horaManual
							? Number(horaManual.split(':')[0]) * 60 + Number(horaManual.split(':')[1])
							: null,
					})
					onFechar()
					navigate({ name: 'habitos' })
					return
				case 'projeto':
					await createProject({ name: bruto })
					break
				case 'lembrete': {
					const lembrete = await createReminder({
						text: bruto,
						dueAt: quandoLembrete ? new Date(quandoLembrete).getTime() : null,
					})
					if (quandoLembrete) {
						// Agenda o alarme nativo agora, sem esperar o rearme de
						// 1,5 s do ciclo: o usuário costuma criar o lembrete e sair.
						await pedirPermissaoDeAviso()
						await agendarLembrete(new Date(quandoLembrete).getTime(), bruto, lembrete.id)
					}
					break
				}
				default:
					return
			}

			onFechar()
		} catch (causa) {
			setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar.')
		} finally {
			setSalvando(false)
		}
	}

	const titulos: Record<Etapa, string> = {
		escolha: 'Criar',
		tarefa: 'Nova tarefa',
		evento: 'Novo evento',
		projeto: 'Nova lista',
		lembrete: 'Novo lembrete',
		habito: 'Novo hábito',
	}

	const diaDeReferencia = diaTarefa || dia || chaveDoDia(diaDeHoje())

	const sugestoes = auto
		? [
				auto.dia ? formatarDiaCurto(diaDaChave(auto.dia)) : null,
				auto.hora !== undefined
					? `${String(Math.floor(auto.hora / 60)).padStart(2, '0')}:${String(auto.hora % 60).padStart(2, '0')}`
					: null,
				auto.duracao ? `${auto.duracao} min` : null,
				auto.recorrencia
					? auto.recorrencia.tipo === 'diaria'
						? 'todo dia'
						: auto.recorrencia.tipo === 'semanal'
							? 'toda semana'
							: auto.recorrencia.tipo === 'dias-uteis'
								? 'dias úteis'
								: 'todo mês'
					: null,
				auto.prioridade ? 'prioridade' : null,
				auto.projeto ? `#${auto.projeto}` : null,
				auto.etiqueta ? `@${auto.etiqueta}` : null,
			].filter(Boolean)
		: []

	return (
		<Folha
			titulo={titulos[etapa]}
			aberta={aberta}
			onFechar={fechar}
			passo={etapa}
			sobre={
				etapa === 'tarefa' || etapa === 'evento'
					? `Para ${formatarDiaCurto(diaDaChave(diaDeReferencia))}`
					: undefined
			}
		>
			{etapa === 'escolha' ? (
				<div className="opcoes-criacao">
					<button
						type="button"
						className="opcao-criacao"
						data-foco-inicial
						onClick={() => setEtapa('tarefa')}
					>
						<span className="opcao-criacao__icone" aria-hidden="true">
							<IconeAdicionar size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo">Tarefa</span>
							<span className="opcao-criacao__descricao">
								Para {formatarDiaCurto(diaDaChave(dia ?? chaveDoDia(diaDeHoje())))}
							</span>
						</span>
					</button>

					<button type="button" className="opcao-criacao" onClick={() => setEtapa('evento')}>
						<span className="opcao-criacao__icone" aria-hidden="true">
							<IconeEvento size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo">Evento</span>
							<span className="opcao-criacao__descricao">Compromisso com hora e duração</span>
						</span>
					</button>

					<button type="button" className="opcao-criacao" onClick={() => setEtapa('habito')}>
						<span className="opcao-criacao__icone" aria-hidden="true">
							<IconeFogo size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo">Hábito</span>
							<span className="opcao-criacao__descricao">Algo que se repete e tem sequência</span>
						</span>
					</button>

					<button type="button" className="opcao-criacao" onClick={() => setEtapa('lembrete')}>
						<span className="opcao-criacao__icone" aria-hidden="true">
							<IconeHorario size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo">Lembrete</span>
							<span className="opcao-criacao__descricao">Um aviso curto, com ou sem hora</span>
						</span>
					</button>

					<button type="button" className="opcao-criacao" onClick={() => setEtapa('projeto')}>
						<span className="opcao-criacao__icone" aria-hidden="true">
							<IconePasta size={22} />
						</span>
						<span className="opcao-criacao__texto">
							<span className="opcao-criacao__titulo">Lista</span>
							<span className="opcao-criacao__descricao">Agrupa tarefas com uma cor</span>
						</span>
					</button>

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
						<label className="campo-rotulo" htmlFor="criar-titulo">
							{etapa === 'lembrete' ? 'Lembrete' : etapa === 'projeto' ? 'Nome da lista' : 'Título'}
						</label>
						<input
							id="criar-titulo"
							data-foco-inicial
							className="campo"
							value={titulo}
							onChange={(evento) => {
								setTitulo(evento.target.value)
								setIgnorarAuto(false)
							}}
							placeholder={
								etapa === 'tarefa'
									? 'Ex.: pagar luz amanhã 10h !alta #casa'
									: etapa === 'evento'
										? 'Ex.: dentista'
										: etapa === 'habito'
											? 'Ex.: ler 20 páginas'
											: etapa === 'projeto'
												? 'Ex.: Trabalho'
												: 'Do que precisa lembrar?'
							}
							autoComplete="off"
							maxLength={280}
						/>
					</div>

					{etapa === 'tarefa' && sugestoes.length ? (
						<div className="auto-chips">
							{sugestoes.map((texto) => (
								<span key={String(texto)} className="chip chip--auto">
									{texto}
								</span>
							))}
							<button
								type="button"
								className="auto-chips__limpar"
								onClick={() => setIgnorarAuto(true)}
								title="Ignorar o que foi reconhecido"
							>
								limpar
							</button>
						</div>
					) : null}

					{etapa === 'tarefa' ? (
						<>
							<div>
								<label className="campo-rotulo" htmlFor="criar-dia">
									Dia
								</label>
								<input
									id="criar-dia"
									className="campo campo--compacto"
									type="date"
									value={diaTarefa}
									onChange={(evento) => setDiaTarefa(evento.target.value)}
								/>
							</div>

							<div className="campo-duplo">
								<div>
									<label className="campo-rotulo" htmlFor="criar-hora">
										Hora
									</label>
									<input
										id="criar-hora"
										className="campo campo--compacto"
										type="time"
										value={horaManual}
										onChange={(evento) => setHoraManual(evento.target.value)}
									/>
								</div>
								<div>
									<label className="campo-rotulo" htmlFor="criar-duracao">
										Duração (min)
									</label>
									<input
										id="criar-duracao"
										className="campo campo--compacto"
										type="number"
										min={5}
										step={5}
										placeholder="30"
										value={duracaoManual}
										onChange={(evento) => setDuracaoManual(evento.target.value)}
									/>
								</div>
							</div>

							<div>
								<span className="campo-rotulo">Prioridade</span>
								<div className="segmentado" role="group" aria-label="Prioridade">
									{[
										{ valor: 0, rotulo: 'Nenhuma' },
										{ valor: 1, rotulo: 'Baixa' },
										{ valor: 2, rotulo: 'Média' },
										{ valor: 3, rotulo: 'Alta' },
									].map((op) => (
										<button
											key={op.valor}
											type="button"
											className="segmentado__item"
											aria-pressed={prioridade === op.valor}
											onClick={() => setPrioridade(op.valor)}
										>
											{op.rotulo}
										</button>
									))}
								</div>
							</div>

							<div>
								<label className="campo-rotulo" htmlFor="criar-projeto">
									Lista (opcional)
								</label>
								<select
									id="criar-projeto"
									className="campo"
									value={projetoVinculo}
									onChange={(evento) => setProjetoVinculo(evento.target.value)}
								>
									<option value="">Sem lista</option>
									{(projetos ?? []).map((projeto) => (
										<option key={projeto.id} value={projeto.id}>
											{projeto.name}
										</option>
									))}
								</select>
							</div>
						</>
					) : null}

					{etapa === 'evento' ? (
						<>
							<div className="campo-duplo">
								<div>
									<label className="campo-rotulo" htmlFor="evento-dia">
										Dia
									</label>
									<input
										id="evento-dia"
										className="campo campo--compacto"
										type="date"
										value={diaEvento}
										onChange={(evento) => setDiaEvento(evento.target.value)}
									/>
								</div>
								<div>
									<label className="campo-rotulo" htmlFor="evento-inicio">
										Início
									</label>
									<input
										id="evento-inicio"
										className="campo campo--compacto"
										type="time"
										value={inicioEvento}
										onChange={(evento) => setInicioEvento(evento.target.value)}
									/>
								</div>
							</div>

							<div>
								<label className="campo-rotulo" htmlFor="evento-fim">
									Fim
								</label>
								<input
									id="evento-fim"
									className="campo campo--compacto"
									type="time"
									value={fimEvento}
									onChange={(evento) => setFimEvento(evento.target.value)}
								/>
							</div>

							<div>
								<span className="campo-rotulo">Cor</span>
								<div className="amostra-cores" style={{ padding: '4px 0 0' }} role="group" aria-label="Cor do evento">
									{PALETA.map((item) => (
										<button
											key={item.indice}
											type="button"
											className="amostra-cor"
											style={{ background: item.hex }}
											aria-label={item.rotulo}
											aria-pressed={corEscolhida === item.indice}
											onClick={() => setCorEscolhida(item.indice)}
										/>
									))}
								</div>
							</div>

							<div className="linha-ajuste" style={{ padding: 0 }}>
								<span className="linha-ajuste__texto">
									<span className="linha-ajuste__titulo">Repetir</span>
									<span className="linha-ajuste__descricao">Compromisso fixo na agenda</span>
								</span>
								<button
									type="button"
									role="switch"
									aria-checked={repetirEvento}
									className="interruptor"
									aria-label="Repetir evento"
									onClick={() => setRepetirEvento((atual) => !atual)}
								>
									<span className="interruptor__bolinha" aria-hidden="true" />
								</button>
							</div>

							{repetirEvento ? (
								<div className="segmentado" role="group" aria-label="Frequência do evento">
									{[
										{ v: 'diaria' as const, r: 'Diário' },
										{ v: 'semanal' as const, r: 'Semanal' },
										{ v: 'mensal' as const, r: 'Mensal' },
									].map((op) => (
										<button
											key={op.v}
											type="button"
											className="segmentado__item"
											aria-pressed={recEvento === op.v}
											onClick={() => setRecEvento(op.v)}
										>
											{op.r}
										</button>
									))}
								</div>
							) : null}
						</>
					) : null}

					{etapa === 'habito' ? (
						<>
							<div className="campo-duplo">
								<div>
									<label className="campo-rotulo" htmlFor="habito-meta">
										Meta diária (opcional)
									</label>
									<input
										id="habito-meta"
										className="campo campo--compacto"
										type="number"
										min={0}
										value={metaHabito}
										onChange={(evento) => setMetaHabito(evento.target.value)}
										placeholder="Ex.: 20"
									/>
								</div>
								<div>
									<label className="campo-rotulo" htmlFor="habito-unidade">
										Unidade
									</label>
									<input
										id="habito-unidade"
										className="campo campo--compacto"
										value={unidadeHabito}
										onChange={(evento) => setUnidadeHabito(evento.target.value)}
										placeholder="páginas, litros"
										maxLength={16}
									/>
								</div>
							</div>

							<div>
								<label className="campo-rotulo" htmlFor="habito-hora">
									Horário habitual (opcional)
								</label>
								<input
									id="habito-hora"
									className="campo campo--compacto"
									type="time"
									value={horaManual}
									onChange={(evento) => setHoraManual(evento.target.value)}
								/>
							</div>

							<div>
								<span className="campo-rotulo">Cor</span>
								<div className="amostra-cores" style={{ padding: '4px 0 0' }} role="group" aria-label="Cor do hábito">
									{PALETA.map((item) => (
										<button
											key={item.indice}
											type="button"
											className="amostra-cor"
											style={{ background: item.hex }}
											aria-label={item.rotulo}
											aria-pressed={corEscolhida === item.indice}
											onClick={() => setCorEscolhida(item.indice)}
										/>
									))}
								</div>
							</div>

							<p className="nota">
								Dias da semana, histórico e sequência ficam na tela de Hábitos, depois de criar.
							</p>
						</>
					) : null}

					{etapa === 'lembrete' ? (
						<>
							<label className="campo-rotulo" htmlFor="criar-quando">
								Avisar em (opcional)
							</label>
							<input
								id="criar-quando"
								className="campo"
								type="datetime-local"
								value={quandoLembrete}
								onChange={(evento) => setQuandoLembrete(evento.target.value)}
							/>
							<p className="nota">
								Sem data, o lembrete fica na lista sem aviso. Com data, o Urdume avisa na hora marcada
								enquanto estiver aberto.
							</p>
						</>
					) : null}

					{erro ? (
						<p className="erro" role="alert">
							{erro}
						</p>
					) : null}

					<div className="formulario__acoes">
						<button type="button" className="botao botao--texto" onClick={() => setEtapa('escolha')}>
							Voltar
						</button>
						<button type="submit" className="botao botao--primario" disabled={salvando || !titulo.trim()}>
							{salvando ? 'Salvando…' : 'Criar'}
							<IconeCalendario size={18} style={{ display: 'none' }} />
						</button>
					</div>
				</form>
			)}
		</Folha>
	)
}

export function ProjetoSelect({ value, onChange }: { value: string; onChange: (valor: string) => void }) {
	const projetos = useProjects()

	return (
		<select id="criar-projeto" className="campo" value={value} onChange={(evento) => onChange(evento.target.value)}>
			<option value="">Sem lista</option>
			{(projetos ?? []).map((projeto) => (
				<option key={projeto.id} value={projeto.id}>
					{projeto.name}
				</option>
			))}
		</select>
	)
}

export { corDoIndice }
