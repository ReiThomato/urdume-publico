import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@/app/router'
import { createReminder, createTask, useProjects } from '@/db/repo'
import { criarEvento } from '@/db/eventos'
import { criarHabito } from '@/db/habitos'
import type { TipoTarefa } from '@/db/db'
import { ROTULO_DO_TIPO, TIPOS_DE_TAREFA } from '@/lib/tarefas'
import { corDoIndice } from '@/ui/paleta'
import { EscolherCor } from '@/ui/EscolherCor'
import { pedirPermissaoDeAviso, agendarLembrete } from '@/lib/avisos'
import { chaveDoDia, diaDaChave, diaDeHoje, formatarDiaCurto } from '@/lib/date'
import { interpretar } from '@/lib/interpretar'
import { Folha } from '@/ui/Folha'
import { IconeCalendario } from '@/ui/icones'
import {
	CHAVE_DA_ORDEM_DE_CRIACAO,
	ORDEM_PADRAO,
	moverOpcao,
	ordenarOpcoes,
} from '@/app/criacao'
import { setSetting, useSetting } from '@/db/repo'
import { IconeDescer, IconeSubir } from '@/ui/icones'

export type TipoCriacao = 'tarefa' | 'projeto' | 'lembrete' | 'evento' | 'habito'

type Etapa = 'escolha' | TipoCriacao

interface CriarFolhaProps {
	aberta: boolean
	onFechar: () => void
	/** Tipo pré-escolhido pelo botão que abriu a folha. */
	tipo?: TipoCriacao
	/** Dia pré-selecionado (calendário / tiras do Início). */
	dia?: string
	/**
	 * Pede a criação de projeto à tela que hospeda a folha.
	 *
	 * Projeto é o único tipo com formulário próprio (`CriarProjeto`), porque
	 * precisa dos mesmos campos da central. Repassar em vez de criar aqui evita
	 * a folha nova nascer e morrer junto com esta.
	 */
	onCriarProjeto?: () => void
}

/**
 * Folha única de criação.
 *
 * Na tarefa, o título é interpretado enquanto digita ("amanhã 15h", "#projeto",
 * "@etiqueta", "!alta", "todo dia"): o reconhecido aparece em chips e pode ser
 * ignorado com um toque. Nada além do título é obrigatório. O dia vem da tela
 * que abriu a folha, então criar a partir do calendário já nasce na data certa.
 */
export function CriarFolha({ aberta, onFechar, tipo, dia, onCriarProjeto }: CriarFolhaProps) {
	const { navigate } = useRouter()
	const [etapa, setEtapa] = useState<Etapa>(tipo ?? 'escolha')
	/**
	 * A ordem do menu de criação é do usuário.
	 *
	 * Fica em `settings` (`criacao.ordem`) e é lida com `ordenarOpcoes`, que
	 * descarta chave desconhecida e repõe o que faltar — a folha nunca abre
	 * vazia por causa de uma escolha antiga.
	 */
	const ordemSalva = useSetting<string[]>(CHAVE_DA_ORDEM_DE_CRIACAO, ORDEM_PADRAO)
	const opcoes = useMemo(() => ordenarOpcoes(ordemSalva), [ordemSalva])
	/** Modo "ordenar": a mesma lista, com setas em vez de abrir o formulário. */
	const [ordenando, setOrdenando] = useState(false)
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
	// Índice da paleta OU hex livre — os dois formulários (evento e hábito) usam.
	const [corEscolhida, setCorEscolhida] = useState<number | string>(0)
	const [prioridade, setPrioridade] = useState(0)
	const [diaTarefa, setDiaTarefa] = useState('')
	const [tipoTarefa, setTipoTarefa] = useState<TipoTarefa>('tarefa')
	const [erro, setErro] = useState<string | null>(null)
	const [salvando, setSalvando] = useState(false)

	const projetos = useProjects()

	useEffect(() => {
		setEtapa(tipo ?? 'escolha')
		setOrdenando(false)
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
			setTipoTarefa('tarefa')
			setErro(null)
			setSalvando(false)
		} else {
			// O dia da tela que abriu vence: criar no calendário já nasce ali.
			if (dia) {
				setDiaEvento(dia)
				setDiaTarefa(dia)
			} else if ((tipo ?? 'tarefa') === 'tarefa') {
				// Tarefa comum nasce com o dia VISÍVEL no campo. O padrão antigo
				// era aplicar hoje por baixo do formulário; o campo ficava vazio
				// e a tarefa vencia no dia seguinte sem o usuário ter marcado.
				setDiaTarefa(chaveDoDia(diaDeHoje()))
			}
		}
	}, [aberta, tipo, dia])

	/** Interpretação do texto digitado, ao vivo. */
	const auto = useMemo(() => {
		if (ignorarAuto || etapa !== 'tarefa') return null
		const resultado = interpretar(titulo)
		return resultado.entendido.length ? resultado : null
	}, [titulo, ignorarAuto, etapa])

	/** Move uma opção e grava imediatamente: não há botão "salvar ordem". */
	async function mover(id: Parameters<typeof moverOpcao>[1], direcao: -1 | 1): Promise<void> {
		const nova = moverOpcao(opcoes.map((opcao) => opcao.id), id, direcao)
		await setSetting(CHAVE_DA_ORDEM_DE_CRIACAO, nova)
	}

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

					/**
					 * O dia é de quem cria, não do formulário.
					 *
					 * Antes, sem dia escolhido, a tarefa nascia com `dueDate` de
					 * hoje — e no dia seguinte virava "atrasada" sem o usuário ter
					 * marcado nada. Agora:
					 * - lembrete e ideia NÃO recebem dia por omissão (só se o
					 *   usuário escolher ou escrever "amanhã");
					 * - tarefa continua nascendo hoje, porque "criar tarefa" na tela
					 *   de hoje sempre significou "fazer hoje" — mas com o dia
					 *   explícito, e a leitura usa isso para não cobrar duas vezes.
					 */
					const diaEscolhido = lido.dia || diaTarefa || dia || null

					await createTask({
						title: lido.titulo || bruto,
						tipo: tipoTarefa,
						// Sem dia = sem cobrança. O campo "Dia" já vem preenchido
						// com hoje (abaixo), então o comportamento antigo continua
						// para quem cria uma tarefa comum — mas agora é VISÍVEL e
						// pode ser limpo. Antes o app aplicava hoje por baixo, sem
						// mostrar, e a tarefa virava "atrasada" no dia seguinte.
						dueDate: diaEscolhido,
						projectId: projetoVinculo || porNome?.id || null,
						startMin: horaManual
							? Number(horaManual.split(':')[0]) * 60 + Number(horaManual.split(':')[1])
							: (lido.hora ?? null),
						durationMin: duracaoManual ? Number(duracaoManual) : (lido.duracao ?? null),
						priority: (prioridade || lido.prioridade || 0) as 0 | 1 | 2 | 3,
						tags: etiquetas,
						someday: tipoTarefa === 'ideia',
						recurrence:
							tipoTarefa === 'ideia' || !lido.recorrencia
								? null
								: { tipo: lido.recorrencia.tipo, intervalo: lido.recorrencia.intervalo },
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
					// O formulário completo é outra folha (`CriarProjeto`); este
					// caminho não deve ser alcançado.
					return
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
		projeto: 'Novo projeto',
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
					? etapa === 'tarefa' && tipoTarefa !== 'tarefa'
						? tipoTarefa === 'lembrete'
							? 'Um lembrete, sem prazo'
							: 'Uma ideia, sem data'
						: `Para ${formatarDiaCurto(diaDaChave(diaDeReferencia))}`
					: undefined
			}
		>
			{etapa === 'escolha' ? (
				<div className="opcoes-criacao">
					<div className="opcoes-criacao__topo">
						<p className="nota">
							{ordenando
								? 'Use as setas para mudar a ordem. Ela fica salva.'
								: 'O que você quer criar?'}
						</p>
						<button
							type="button"
							className="botao botao--texto"
							onClick={() => setOrdenando((atual) => !atual)}
						>
							{ordenando ? 'Pronto' : 'Ordenar'}
						</button>
					</div>
					<div className="opcoes-criacao__lista">
					{opcoes.map((opcao, indice) => {
						const Icone = opcao.icone
						if (ordenando) {
							return (
								<div key={opcao.id} className="opcao-criacao opcao-criacao--ordenando">
									<span className="opcao-criacao__icone" aria-hidden="true">
										<Icone size={22} />
									</span>
									<span className="opcao-criacao__texto">
										<span className="opcao-criacao__titulo">{opcao.titulo}</span>
									</span>
									<span className="opcao-criacao__setas">
										<button
											type="button"
											className="botao-icone botao-icone--pequeno"
											aria-label={`Mover ${opcao.titulo} para cima`}
											disabled={indice === 0}
											onClick={() => void mover(opcao.id, -1)}
										>
											<IconeSubir size={18} />
										</button>
										<button
											type="button"
											className="botao-icone botao-icone--pequeno"
											aria-label={`Mover ${opcao.titulo} para baixo`}
											disabled={indice === opcoes.length - 1}
											onClick={() => void mover(opcao.id, 1)}
										>
											<IconeDescer size={18} />
										</button>
									</span>
								</div>
							)
						}

						return (
							<button
								key={opcao.id}
								type="button"
								className="opcao-criacao"
								data-foco-inicial={indice === 0 ? true : undefined}
								onClick={() => {
									// "Lista" na verdade cria um projeto; tem formulário
									// próprio e a folha repassa em vez de abrir o genérico.
									if (opcao.id === 'lista') {
										if (onCriarProjeto) {
											onFechar()
											onCriarProjeto()
											return
										}
										setEtapa('projeto')
										return
									}
									setEtapa(opcao.id)
								}}
							>
								<span className="opcao-criacao__icone" aria-hidden="true">
									<Icone size={22} />
								</span>
								<span className="opcao-criacao__texto">
									<span className="opcao-criacao__titulo">{opcao.titulo}</span>
									<span className="opcao-criacao__descricao">
										{opcao.id === 'tarefa'
											? `Para ${formatarDiaCurto(diaDaChave(dia ?? chaveDoDia(diaDeHoje())))}`
											: opcao.descricao}
									</span>
								</span>
							</button>
						)
					})}
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
					{etapa === 'tarefa' ? (
						<div>
							<span className="campo-rotulo">Tipo</span>
							<div className="segmentado" role="group" aria-label="Tipo">
								{TIPOS_DE_TAREFA.map((tipo) => (
									<button
										key={tipo}
										type="button"
										className="segmentado__item"
										aria-pressed={tipoTarefa === tipo}
										onClick={() => setTipoTarefa(tipo)}
									>
										{ROTULO_DO_TIPO[tipo].nome}
									</button>
								))}
							</div>
							<p className="nota" style={{ marginTop: 6 }}>
								{ROTULO_DO_TIPO[tipoTarefa].descricao}
							</p>
						</div>
					) : null}

					<div>
						<label className="campo-rotulo" htmlFor="criar-titulo">
							{etapa === 'lembrete' ? 'Lembrete' : etapa === 'projeto' ? 'Nome do projeto' : 'Título'}
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
							{tipoTarefa === 'tarefa' ? (
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
									<p className="nota" style={{ marginTop: 6 }}>
										{diaTarefa
											? 'Apague para uma tarefa sem dia: ela não vence.'
											: 'Sem dia, a tarefa não vence — fica só na lista.'}
									</p>
								</div>
							) : (
								<p className="nota">
									{tipoTarefa === 'lembrete'
										? 'Sem dia, ele não vence. A hora abaixo só agenda um aviso, se você quiser.'
										: 'Ideia fica guardada em "Algum dia", sem prazo.'}
								</p>
							)}

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
									Projeto (opcional)
								</label>
								<select
									id="criar-projeto"
									className="campo"
									value={projetoVinculo}
									onChange={(evento) => setProjetoVinculo(evento.target.value)}
								>
									<option value="">Sem projeto</option>
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
								<EscolherCor valor={corEscolhida} onMudar={setCorEscolhida} rotulo="Cor do evento" />
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
								<EscolherCor valor={corEscolhida} onMudar={setCorEscolhida} rotulo="Cor do hábito" />
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

export { corDoIndice }
