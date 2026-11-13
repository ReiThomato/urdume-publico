import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { toDayKey } from '@/db/repo'
import { Topo } from '@/ui/AppShell'
import { useRouter } from '@/app/router'
import { Folha } from '@/ui/Folha'
import {
	IconeAjustes,
	IconeAviso,
	IconeApagar,
	IconeConcluido,
	IconeConversa,
	IconeInsights,
	IconeHorario,
	IconeOffline,
	IconeRaio,
} from '@/ui/icones'
import type { Nivel, Sinal } from '@/lib/jarvis/sinais'
import { avaliarAgora, lerPainel, marcarItem } from '@/lib/jarvis/motor'
import type { ItemDoPainel, PainelDoDia } from '@/lib/jarvis/motor'
import {
	PREFERENCIAS_PADRAO,
	avaliar,
	dentroDoSilencio,
} from '@/lib/jarvis/relevancia'
import type { ModoJarvis, PreferenciasJarvis } from '@/lib/jarvis/relevancia'
import { consumoDeHoje, lerPreferencias, salvarPreferencias } from '@/lib/jarvis/estado'
import {
	estadoDaPermissao,
	pedirPermissao,
	contarAgendadas,
	estadoDoAlarmeExato,
	pedirAlarmeExato,
	testarNotificacao,
	garantirCanal,
	estadoDaBateria,
	pedirIsencaoDeBateria,
} from '@/lib/jarvis/notificacoes'
import type { EstadoPermissao } from '@/lib/jarvis/notificacoes'
import { HORAS_DE_AVISO, sincronizarSegundoPlano, montarAgendaDoBanco } from '@/lib/jarvis/segundo-plano'
import { lerRetratoGravado, lerBatimentoDoRunner } from '@/lib/jarvis/ponte'
import { criarTarefaDeApoio, temAcaoDeApoio } from '@/lib/jarvis/autonomia'
import { esquecer, ensinar, listarConhecimento } from '@/lib/jarvis/conhecimento'
import type { Fato } from '@/lib/jarvis/conhecimento'
import { useOnline } from '@/lib/jarvis/rede'
import { criarGatilho, GATILHOS_SUGERIDOS, listarGatilhos, proximoGatilho, removerGatilho } from '@/lib/jarvis/gatilhos'
import type { Gatilho } from '@/lib/jarvis/gatilhos'

/**
 * Tela do Jarvis — painel do dia + central de controle.
 *
 * O painel mostra o que as regras locais detectaram, com o motivo de cada
 * silêncio. A central mostra e muda o comportamento. As duas coisas no mesmo
 * lugar de propósito: quem reclama de um aviso precisa achar o botão que o
 * desliga sem procurar em três telas.
 *
 * A tela diz o que NÃO funciona (pontualidade, app fechado, permissões) em vez
 * de esconder. É a diferença entre um assistente e um outdoor.
 */

const ROTULO_NIVEL: Record<Nivel, string> = {
	informativo: 'Informativo',
	oportunidade: 'Oportunidade',
	atencao: 'Atenção',
	urgente: 'Urgente',
}

const ROTULO_MOTIVO: Record<string, string> = {
	modo: 'modo atual',
	'sem-orcamento': 'orçamento do dia esgotado',
	'silencio-horario': 'horário silencioso',
	cooldown: 'já avisei sobre isto',
	repetido: 'tipo silenciado por 14 dias',
	'abaixo-do-corte': 'relevância baixa',
	'gatilho-desligado': 'gatilho desligado',
}

/** "2 por horário silencioso, 1 por orçamento" — sem repetir a lista inteira. */
function resumoDosMotivos(silenciados: Array<{ motivo: string }>): string {
	const contagem = new Map<string, number>()
	for (const entrada of silenciados) {
		contagem.set(entrada.motivo, (contagem.get(entrada.motivo) ?? 0) + 1)
	}
	return [...contagem.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 2)
		.map(([motivo, total]) => `${total} por ${ROTULO_MOTIVO[motivo] ?? motivo}`)
		.join(', ')
}

/** "há 12 min", "há 3 h", "há 2 dias" — para o batimento do runner. */
function haQuanto(ms: number): string {
	const minutos = Math.max(0, Math.round(ms / 60_000))
	if (minutos < 1) return 'agora'
	if (minutos < 60) return `há ${minutos} min`
	const horas = Math.round(minutos / 60)
	if (horas < 24) return `há ${horas} h`
	return `há ${Math.round(horas / 24)} dia(s)`
}

const MODOS: Array<{ valor: ModoJarvis; rotulo: string; explicacao: string }> = [
	{ valor: 'ativo', rotulo: 'Ativo', explicacao: 'Acompanha e avisa dentro das permissões.' },
	{ valor: 'silencioso', rotulo: 'Silencioso', explicacao: 'Monitora, mas só mostra no painel.' },
	{ valor: 'manual', rotulo: 'Manual', explicacao: 'Não avalia sozinho. Só quando você pedir.' },
	{ valor: 'pausado', rotulo: 'Pausado', explicacao: 'Para tudo e cancela o que estava agendado.' },
]

/**
 * Os tons, com um exemplo real de cada um.
 *
 * O exemplo é o que permite escolher sem adivinhar: "Sarcástico" não diz nada
 * sozinho; uma frase de exemplo diz tudo em dois segundos. As frases são do
 * mesmo assunto (uma tarefa atrasada) para a comparação ser honesta.
 */
const TONS: Array<{
	valor: PreferenciasJarvis['personalidade']['tom']
	rotulo: string
	exemplo: string
}> = [
	{ valor: 'direto', rotulo: 'Direto', exemplo: 'Três tarefas atrasadas. Comece pela do cliente.' },
	{
		valor: 'rispido',
		rotulo: 'Ríspido',
		exemplo: 'Terceiro dia empurrando isso. Você sabe que o prazo é hoje, né?',
	},
	{
		valor: 'sarcastico',
		rotulo: 'Sarcástico',
		exemplo: 'Boa notícia: o prazo de ontem ainda está disponível para hoje.',
	},
	{
		valor: 'comediante',
		rotulo: 'Comediante',
		exemplo: 'Essa tarefa já tem idade para tirar carteira de motorista.',
	},
	{ valor: 'serio', rotulo: 'Sério', exemplo: 'O prazo venceu. Recomendo tratar hoje.' },
	{
		valor: 'profissional',
		rotulo: 'Profissional',
		exemplo: 'Pendência vencida: 3 itens. Prioridade sugerida: proposta do cliente.',
	},
	{ valor: 'calmo', rotulo: 'Calmo', exemplo: 'Sem pressa, mas essa vale a pena resolver hoje.' },
	{
		valor: 'proximo',
		rotulo: 'Próximo',
		exemplo: 'Ficou essa pendente, quer que eu te ajude a destravar?',
	},
]

const AUTONOMIA: Array<{ valor: PreferenciasJarvis['autonomia']; rotulo: string; explicacao: string }> = [
	{
		valor: 'conservador',
		rotulo: 'Conservador',
		explicacao: 'Só observa e sugere. Nada é criado sem você confirmar.',
	},
	{
		valor: 'equilibrado',
		rotulo: 'Equilibrado',
		explicacao: 'Pode criar tarefas simples quando algo mudar. O resto pede confirmação.',
	},
	{
		valor: 'confiante',
		rotulo: 'Confiante',
		explicacao: 'Pode editar 1 tarefa por vez, com desfazer de 24 h.',
	},
]

export function Jarvis() {
	const { navigate } = useRouter()
	const [prefs, setPrefs] = useState<PreferenciasJarvis | null>(null)
	const [painel, setPainel] = useState<PainelDoDia | null>(null)
	const [atualizando, setAtualizando] = useState(false)
	const [permissao, setPermissao] = useState<EstadoPermissao>('indisponivel')
	const [agendadas, setAgendadas] = useState(0)
	const [alarme, setAlarme] = useState<'concedida' | 'negada' | 'indisponivel'>('indisponivel')
	const [bateria, setBateria] = useState<'isento' | 'restrito' | 'indisponivel'>('indisponivel')
	const [agendaResumo, setAgendaResumo] = useState('—')
	const [teste, setTeste] = useState<string | null>(null)
	const [idadeRetrato, setIdadeRetrato] = useState<number | null>(null)
	const [batimento, setBatimento] = useState<number | null>(null)
	const [detalhe, setDetalhe] = useState<ItemDoPainel | null>(null)
	const [trocandoModo, setTrocandoModo] = useState(false)
	const [fatos, setFatos] = useState<Fato[]>([])
	const [novoFato, setNovoFato] = useState('')
	const [erroFato, setErroFato] = useState<string | null>(null)
	const online = useOnline()
	const [gatilhos, setGatilhos] = useState<Gatilho[]>([])
	const [novaHora, setNovaHora] = useState(9)
	const [novoTitulo, setNovoTitulo] = useState('')

	const dia = toDayKey(new Date())

	// Diagnóstico do segundo plano: o que o aparelho realmente tem.
	useEffect(() => {
		let vivo = true
		void (async () => {
			// O canal precisa existir mesmo que o usuário nunca chegue a agendar;
			// criá-lo aqui garante que um aviso futuro não seja descartado.
			await garantirCanal()

			const [estado, total, retrato, exato, daAgenda, pulso, energia] = await Promise.all([
				estadoDaPermissao(),
				contarAgendadas(),
				lerRetratoGravado(),
				estadoDoAlarmeExato(),
				montarAgendaDoBanco(),
				lerBatimentoDoRunner(),
				estadoDaBateria(),
			])
			if (!vivo) return
			setPermissao(estado)
			setAgendadas(total)
			setAlarme(exato)
			setBateria(energia)
			setIdadeRetrato(retrato ? Date.now() - retrato.geradoEm : null)
			setBatimento(pulso ? pulso.em : null)
			setAgendaResumo(
				daAgenda.length === 0
					? 'Nada com hora marcada nos próximos 7 dias.'
					: `${daAgenda.length} aviso(s). O próximo: ${new Date(daAgenda[0]!.em).toLocaleString('pt-BR', {
							weekday: 'short',
							hour: '2-digit',
							minute: '2-digit',
						})} — ${daAgenda[0]!.titulo}.`,
			)
		})()
		return () => {
			vivo = false
		}
	}, [prefs?.modo, permissao])

	useEffect(() => {
		void (async () => {
			setFatos(await listarConhecimento(db))
			setGatilhos(await listarGatilhos(db))
		})()
	}, [])

	useEffect(() => {
		void (async () => {
			const carregadas = await lerPreferencias(db)
			setPrefs(carregadas)
			// A tela SEMPRE recalcula ao abrir. O painel salvo serve para o
			// Início mostrar uma contagem antes de avaliar, mas aqui o usuário
			// veio ver o presente — mostrar o retrato de 3 h atrás seria mentira.
			const salvo = await lerPainel(dia, db)
			if (salvo) setPainel(salvo)
			if (carregadas.modo === 'ativo' || carregadas.modo === 'silencioso') {
				setPainel(await avaliarAgora({ forcar: true }, db))
			}
		})()
	}, [dia])

	const consumo = useLiveQuery(async () => consumoDeHoje(Date.now(), db), [])
	const pendentes = painel?.itens.filter((item) => item.estado === 'novo') ?? []
	const tratados = painel?.itens.filter((item) => item.estado !== 'novo') ?? []
	const absorvidos = painel?.itens.reduce((soma, item) => soma + (item.agregados ?? 0), 0) ?? 0

	const resumoDoTopo = useMemo(() => {
		if (!prefs) return 'Carregando…'
		if (prefs.modo === 'pausado') return 'Pausado. Nada é avaliado nem avisado.'
		if (painel) return painel.resumo
		return 'Nada avaliado ainda hoje.'
	}, [prefs, painel])

	async function mudar(patch: Partial<PreferenciasJarvis>): Promise<void> {
		const proximo = await salvarPreferencias(patch, db)
		setPrefs(proximo)

		// Pausar precisa cancelar agora, não no próximo tique — e a lista some
		// na hora. Antes o cabeçalho dizia "pausado" e os cartões continuavam
		// na tela: a pausa parecia não ter funcionado.
		if (patch.modo === 'pausado') {
			await sincronizarSegundoPlano()
			setAgendadas(0)
			setPainel({
				dia,
				geradoEm: Date.now(),
				resumo: 'Jarvis pausado.',
				itens: [],
				interrupcoes: 0,
				silenciados: [],
			})
			return
		}

		if (patch.notificacoes === false || patch.agendaDeAvisos === false || patch.antecedenciaMin != null) {
			await sincronizarSegundoPlano()
			setAgendadas(await contarAgendadas())
		}

		if (patch.modo) {
			const novo = await avaliarAgora({ forcar: true }, db)
			setPainel(novo)
		}
	}

	async function recalcular(): Promise<void> {
		setAtualizando(true)
		try {
			setPainel(await avaliarAgora({ forcar: true }, db))
			await sincronizarSegundoPlano()
		} finally {
			setAtualizando(false)
		}
	}

	async function tratar(item: ItemDoPainel, estado: 'aceito' | 'dispensado' | 'ignorado'): Promise<void> {
		const novo = await marcarItem(dia, item.sinal.chave, estado, db)
		if (novo) setPainel(novo)
		setDetalhe(null)
	}

	/**
	 * "Útil" faz duas coisas, e a ordem importa.
	 *
	 * 1. Se o sinal tem ação de apoio definida, cria a tarefa e depois marca
	 *    como aceito.
	 * 2. Se o sinal precisa de julgamento (projeto parado, atraso acumulado),
	 *    abre a conversa com o contexto já preenchido — em vez de "aceitar" sem
	 *    nada acontecer, que era o comportamento anterior e dava a sensação de
	 *    botão quebrado.
	 */
	async function aprovar(item: ItemDoPainel): Promise<void> {
		if (temAcaoDeApoio(item)) {
			const criada = await criarTarefaDeApoio(item, db)
			if (criada) {
				await tratar(item, 'aceito')
				return
			}
		}

		// Sem ação pronta: pede à IA o que fazer com este sinal.
		navigate({
			name: 'conversa',
			semente: `O painel apontou: ${item.sinal.titulo}. ${item.sinal.detalhe} O que você sugere fazer?`,
		})
	}

	/** Aceita a sugestão de apoio: cria a tarefa já com confirmação implícita. */
	async function criarApoio(item: ItemDoPainel): Promise<void> {
		const criada = await criarTarefaDeApoio(item, db)
		if (criada) {
			await tratar(item, 'aceito')
		} else {
			setDetalhe(item)
		}
	}

	async function permitirNotificacoes(): Promise<void> {
		const estado = await pedirPermissao()
		setPermissao(estado)
		if (estado === 'concedida') await sincronizarSegundoPlano()
		setAgendadas(await contarAgendadas())
	}

	/** Prova o caminho inteiro: permissão → canal → alarme → bandeja. */
	async function provarNotificacao(): Promise<void> {
		const resultado = await testarNotificacao(10)
		setTeste(
			resultado.erro
				? `Falhou: ${resultado.erro}`
				: 'Aviso agendado para daqui a 10 s. Pode sair do app e bloquear a tela.',
		)
		if (!resultado.erro) window.setTimeout(() => void sincronizarSegundoPlano(), 12_000)
	}

	return (
		<div className="tela">
			<Topo
				titulo="Jarvis"
				sobre={resumoDoTopo}
				acoes={
					<>
						<button
							type="button"
							className="botao-icone"
							aria-label="Conversar com o Jarvis"
							title="Conversar"
							onClick={() => navigate({ name: 'conversa' })}
						>
							<IconeConversa size={22} />
						</button>
						<button
							type="button"
							className="botao-icone"
							aria-label="Recalcular agora"
							title="Recalcular agora"
							onClick={() => void recalcular()}
							disabled={atualizando}
						>
							<IconeRaio size={22} />
						</button>
					</>
				}
			/>

			<div className="conteudo conteudo--sem-fab">
				{prefs === null ? (
					<p className="nota" style={{ padding: '0 var(--s-4)' }}>
						Lendo o estado do Jarvis…
					</p>
				) : (
					<>
					{/* ---------------------------------------------------- modo */}
					<section className="secao" aria-labelledby="jarvis-modo">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo" id="jarvis-modo">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeRaio size={18} />
								</span>
								Modo
							</h2>
							<button
								type="button"
								className="secao-acao"
								onClick={() => setTrocandoModo(true)}
							>
								Explicar
							</button>
						</div>

						<div className="segmentado" role="group" aria-label="Modo do Jarvis">
							{MODOS.map((modo) => (
								<button
									key={modo.valor}
									type="button"
									className="segmentado__item"
									aria-pressed={prefs.modo === modo.valor}
									onClick={() => void mudar({ modo: modo.valor })}
								>
									{modo.rotulo}
								</button>
							))}
						</div>

						<p className="nota" style={{ marginTop: 'var(--s-3)' }}>
							{MODOS.find((modo) => modo.valor === prefs.modo)?.explicacao}
						</p>
					</section>

					{/* ------------------------------------------------- painel */}
					<section className="secao" aria-labelledby="jarvis-painel">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo" id="jarvis-painel">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeAviso size={18} />
								</span>
								Hoje
								{pendentes.length > 0 ? (
									<span className="secao-titulo__contagem">{pendentes.length}</span>
								) : null}
							</h2>
							<span className="nota">
								{painel ? `${Math.max(0, Math.round((Date.now() - painel.geradoEm) / 60000))} min` : ''}
							</span>
						</div>

						{pendentes.length === 0 ? (
							<div className="cartao cartao--vazio">
								<span className="vazio__icone" aria-hidden="true">
									<IconeConcluido size={22} />
								</span>
								<p>
									{prefs.modo === 'pausado'
										? 'O Jarvis está pausado. Nada foi avaliado.'
										: 'Nada pede atenção agora. O painel se atualiza ao abrir o app e nos horários de avaliação.'}
								</p>
							</div>
						) : (
							<ul className="jarvis-itens">
								{pendentes.map((item) => (
									<li key={item.sinal.chave} className="jarvis-item">
										<button
											type="button"
											className="jarvis-item__corpo"
											onClick={() => setDetalhe(item)}
										>
											<span className={`jarvis-selo jarvis-selo--${item.sinal.nivel}`}>
												{ROTULO_NIVEL[item.sinal.nivel]}
											</span>
											<span className="jarvis-item__titulo">{item.sinal.titulo}</span>
											<span className="jarvis-item__detalhe">{item.sinal.detalhe}</span>
											{item.agregados ? (
												<span className="jarvis-item__mais">
													mais {item.agregados}{' '}
													{item.agregados === 1 ? 'observação sobre o mesmo assunto' : 'observações sobre o mesmo assunto'}
												</span>
											) : null}
										</button>
										<div className="jarvis-item__acoes">
											{temAcaoDeApoio(item) ? (
												<button
													type="button"
													className="botao botao--texto"
													onClick={() => void criarApoio(item)}
												>
													Criar tarefa
												</button>
											) : null}
											<button
												type="button"
												className="botao botao--texto"
												onClick={() => void tratar(item, 'dispensado')}
											>
												Não é isso
											</button>
											<button
												type="button"
												className="botao botao--texto"
												onClick={() => void aprovar(item)}
											>
												Útil
											</button>
										</div>
									</li>
								))}
							</ul>
						)}

						{(painel?.silenciados.length ?? 0) > 0 ? (
							<p className="nota" style={{ marginTop: 'var(--s-3)' }}>
								{painel!.silenciados.length}{' '}
								{painel!.silenciados.length === 1 ? 'observação ficou' : 'observações ficaram'}{' '}
								caladas hoje — {resumoDosMotivos(painel!.silenciados)}. Elas continuam no
								histórico e voltam quando fizer sentido.
							</p>
						) : null}

						{absorvidos > 0 ? (
							<p className="nota" style={{ marginTop: 'var(--s-2)' }}>
								{absorvidos} observação(ões) do mesmo assunto foram juntadas aos cartões
								acima.
							</p>
						) : null}

						{tratados.length > 0 ? (
							<p className="nota" style={{ marginTop: 'var(--s-2)' }}>
								{tratados.length} item(ns) tratado(s) hoje.
							</p>
						) : null}
					</section>

					{/* ------------------------------------------------- controle */}
					<section className="secao" aria-labelledby="jarvis-controle">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo" id="jarvis-controle">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeAjustes size={18} />
								</span>
								Controle
							</h2>
						</div>

						<div className="cartao jarvis-controle">
							<label className="jarvis-linha">
								<span>
									<strong>Notificações</strong>
									<small>Interromper o celular quando algo importante aparecer.</small>
								</span>
								<input
									type="checkbox"
									checked={prefs.notificacoes}
									onChange={(evento) => void mudar({ notificacoes: evento.target.checked })}
								/>
							</label>

							<label className="jarvis-linha">
								<span>
									<strong>Análise automática</strong>
									<small>Avaliar sozinho ao abrir o app e nos horários do dia.</small>
								</span>
								<input
									type="checkbox"
									checked={prefs.analisesAutomaticas}
									onChange={(evento) => void mudar({ analisesAutomaticas: evento.target.checked })}
								/>
							</label>

							<label className="jarvis-linha">
								<span>
									<strong>Avisos por horário</strong>
									<small>
										Tarefa com hora, prazo, hábito no horário, evento e lembrete. Não depende
										da análise automática.
									</small>
								</span>
								<input
									type="checkbox"
									checked={prefs.agendaDeAvisos}
									onChange={(evento) => void mudar({ agendaDeAvisos: evento.target.checked })}
								/>
							</label>

							<div className="jarvis-linha jarvis-linha--coluna">
								<span>
									<strong>Aviso de evento</strong>
									<small>Quanto tempo antes do compromisso o celular avisa.</small>
								</span>
								<div className="segmentado" role="group" aria-label="Antecedência do aviso de evento">
									{[0, 10, 15, 30, 60].map((minutos) => (
										<button
											key={minutos}
											type="button"
											className="segmentado__item"
											aria-pressed={prefs.antecedenciaMin === minutos}
											onClick={() => void mudar({ antecedenciaMin: minutos })}
										>
											{minutos === 0 ? 'Na hora' : `${minutos} min`}
										</button>
									))}
								</div>
							</div>

							<div className="jarvis-linha jarvis-linha--coluna">
								<span>
									<strong>Interrupções por dia</strong>
									<small>
										No máximo {prefs.orcamentoDiario}. O que passar disso fica só no painel.
									</small>
								</span>
								<input
									type="range"
									min={0}
									max={10}
									step={1}
									value={prefs.orcamentoDiario}
									aria-label="Máximo de interrupções por dia"
									onChange={(evento) =>
										void mudar({ orcamentoDiario: Number(evento.target.value) })
									}
								/>
							</div>

							<div className="jarvis-linha jarvis-linha--coluna">
								<span>
									<strong>Horário silencioso</strong>
									<small>
										{prefs.silencio.ligado
											? `Das ${prefs.silencio.inicio}h às ${prefs.silencio.fim}h nada interrompe.`
											: 'Desligado: o Jarvis pode avisar a qualquer hora.'}
									</small>
								</span>
								<div className="jarvis-horas">
									<label>
										De
										<input
											type="number"
											min={0}
											max={23}
											value={prefs.silencio.inicio}
											onChange={(evento) =>
												void mudar({
													silencio: { ...prefs.silencio, inicio: Number(evento.target.value) },
												})
											}
										/>
									</label>
									<label>
										Até
										<input
											type="number"
											min={0}
											max={23}
											value={prefs.silencio.fim}
											onChange={(evento) =>
												void mudar({
													silencio: { ...prefs.silencio, fim: Number(evento.target.value) },
												})
											}
										/>
									</label>
									<label className="jarvis-horas__liga">
										<input
											type="checkbox"
											checked={prefs.silencio.ligado}
											onChange={(evento) =>
												void mudar({
													silencio: { ...prefs.silencio, ligado: evento.target.checked },
												})
											}
										/>
										Ligado
									</label>
								</div>
							</div>

							<div className="jarvis-linha jarvis-linha--coluna">
								<span>
									<strong>Autonomia</strong>
									<small>
										{AUTONOMIA.find((nivel) => nivel.valor === prefs.autonomia)?.explicacao}
									</small>
								</span>
								<div className="segmentado" role="group" aria-label="Nível de autonomia">
									{AUTONOMIA.map((nivel) => (
										<button
											key={nivel.valor}
											type="button"
											className="segmentado__item"
											aria-pressed={prefs.autonomia === nivel.valor}
											onClick={() => void mudar({ autonomia: nivel.valor })}
										>
											{nivel.rotulo}
										</button>
									))}
								</div>
							</div>
						</div>
					</section>

					{/* ------------------------------------------------ personalidade */}
					<section className="secao" aria-labelledby="jarvis-voz">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo" id="jarvis-voz">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeConversa size={18} />
								</span>
								Como ela fala
							</h2>
						</div>

						<div className="cartao jarvis-controle">
							<div className="jarvis-linha jarvis-linha--coluna">
								<span>
									<strong>Tom</strong>
									<small>Vale para o painel e para a conversa.</small>
								</span>
								<div className="tons" role="group" aria-label="Tom">
									{TONS.map((item) => (
										<button
											key={item.valor}
											type="button"
											className="tons__item"
											aria-pressed={prefs.personalidade.tom === item.valor}
											onClick={() =>
												void mudar({
													personalidade: { ...prefs.personalidade, tom: item.valor },
												})
											}
										>
											<span className="tons__rotulo">{item.rotulo}</span>
											<span className="tons__exemplo">“{item.exemplo}”</span>
										</button>
									))}
								</div>
							</div>

							<div className="jarvis-linha jarvis-linha--coluna">
								<span>
									<strong>Quanto explicar</strong>
									<small>Respostas curtas ou com o raciocínio junto.</small>
								</span>
								<div className="segmentado" role="group" aria-label="Detalhe">
									{(['curto', 'equilibrado', 'explicado'] as const).map((detalhe) => (
										<button
											key={detalhe}
											type="button"
											className="segmentado__item"
											aria-pressed={prefs.personalidade.detalhe === detalhe}
											onClick={() =>
												void mudar({
													personalidade: { ...prefs.personalidade, detalhe },
												})
											}
										>
											{detalhe === 'curto' ? 'Curto' : detalhe === 'equilibrado' ? 'Médio' : 'Explicado'}
										</button>
									))}
								</div>
							</div>

							<div className="jarvis-linha jarvis-linha--coluna">
								<span>
									<strong>Iniciativa</strong>
									<small>
										Muda quantos sinais passam do corte de relevância. Não muda permissão de
										agir.
									</small>
								</span>
								<div className="segmentado" role="group" aria-label="Iniciativa">
									{(['reservada', 'equilibrada', 'presente'] as const).map((iniciativa) => (
										<button
											key={iniciativa}
											type="button"
											className="segmentado__item"
											aria-pressed={prefs.personalidade.iniciativa === iniciativa}
											onClick={() =>
												void mudar({
													personalidade: { ...prefs.personalidade, iniciativa },
												})
											}
										>
											{iniciativa === 'reservada' ? 'Reservada' : iniciativa === 'equilibrada' ? 'Equilibrada' : 'Presente'}
										</button>
									))}
								</div>
							</div>

							<div className="jarvis-linha jarvis-linha--coluna">
								<span>
									<strong>O que mais importa</strong>
									<small>Uma frase. Entra no contexto de toda análise.</small>
								</span>
								<input
									type="text"
									value={prefs.personalidade.foco ?? ''}
									placeholder="Ex.: prazos de entrega primeiro"
									aria-label="Foco do Jarvis"
									onChange={(evento) =>
										void mudar({
											personalidade: { ...prefs.personalidade, foco: evento.target.value },
										})
									}
								/>
							</div>
						</div>
					</section>

					{/* -------------------------------------------------- conhecimento */}
					<section className="secao" aria-labelledby="jarvis-conhecimento">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo" id="jarvis-conhecimento">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeInsights size={18} />
								</span>
								O que ela sabe sobre você
							</h2>
						</div>

						<div className="cartao jarvis-diagnostico">
							<p className="nota">
								Frases curtas que entram em toda análise. Elas informam, mas nunca autorizam
								uma ação.
							</p>

							{fatos.length === 0 ? (
								<p className="nota">Nada ensinado ainda.</p>
							) : (
								<ul className="jarvis-fatos">
									{fatos.map((fato) => (
										<li key={fato.id}>
											<span>{fato.texto}</span>
											<button
												type="button"
												className="botao-icone botao-icone--pequeno"
												aria-label={`Esquecer: ${fato.texto}`}
												onClick={() =>
													void (async () => {
														await esquecer(fato.id, db)
														setFatos(await listarConhecimento(db))
													})()
												}
											>
												<IconeApagar size={16} />
											</button>
										</li>
									))}
								</ul>
							)}

							<div className="jarvis-linha jarvis-linha--coluna">
								<input
									type="text"
									value={novoFato}
									placeholder="Ex.: não marco nada aos domingos"
									aria-label="Ensinar um fato"
									onChange={(evento) => {
										setNovoFato(evento.target.value)
										setErroFato(null)
									}}
								/>
								<button
									type="button"
									className="botao"
									disabled={!novoFato.trim()}
									onClick={() =>
										void (async () => {
											const resultado = await ensinar(novoFato, db)
											if (!resultado.ok) {
												setErroFato(resultado.erro)
												return
											}
											setNovoFato('')
											setErroFato(null)
											setFatos(await listarConhecimento(db))
										})()
									}
								>
									Ensinar
								</button>
								{erroFato ? (
									<p className="nota nota--erro" role="alert">
										{erroFato}
									</p>
								) : null}
							</div>
						</div>
					</section>

					{/* ---------------------------------------------- diagnóstico */}
					<section className="secao" aria-labelledby="jarvis-estado">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo" id="jarvis-estado">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeOffline size={18} />
								</span>
								O que funciona de fato
							</h2>
						</div>

						<div className="cartao jarvis-diagnostico">
							<p>
								<strong>Notificações:</strong>{' '}
								{permissao === 'concedida'
									? `permitidas. ${agendadas} agendada(s) no sistema.`
									: permissao === 'negada'
										? 'negadas nos Ajustes do Android. O app não consegue pedir de novo sem você liberar.'
										: permissao === 'prompt'
											? 'ainda não pedidas.'
											: 'indisponíveis nesta versão (site).'}
							</p>

							<p>
								<strong>Alarme exato:</strong>{' '}
								{alarme === 'concedida'
									? 'liberado — o aviso chega no minuto marcado, mesmo com o app fechado.'
									: alarme === 'negada'
										? 'não liberado. Em aparelhos com economia de bateria agressiva (MIUI, ColorOS, One UI), o aviso pode ser adiado por horas ou dias. Medido num Redmi 12: o alarme foi reagendado para 3 dias depois.'
										: 'não se aplica nesta versão do Android.'}
							</p>

							<p>
								<strong>Economia de bateria:</strong>{' '}
								{bateria === 'isento'
									? 'o sistema não segura o app. É o estado em que os avisos e o trabalho de segundo plano chegam na hora.'
									: bateria === 'restrito'
										? 'o sistema está segurando o app. Neste estado, o Android pode reagendar um aviso para dias depois. Toque abaixo e escolha "Sem restrições".'
										: 'não se aplica nesta versão.'}
							</p>

							{bateria === 'restrito' ? (
								<button
									type="button"
									className="botao botao--primario"
									onClick={() =>
										void pedirIsencaoDeBateria().then((novo) => {
											setBateria(novo)
											void estadoDaBateria().then(setBateria)
										})
									}
								>
									Liberar da economia de bateria
								</button>
							) : null}

							{alarme === 'negada' ? (
								<button
									type="button"
									className="botao botao--secundario"
									onClick={() =>
										void pedirAlarmeExato().then((liberado) => {
											void estadoDoAlarmeExato().then(setAlarme)
											if (liberado) void sincronizarSegundoPlano()
										})
									}
								>
									Liberar alarme exato
								</button>
							) : null}

							{permissao === 'prompt' ? (
								<button type="button" className="botao botao--primario" onClick={() => void permitirNotificacoes()}>
									Permitir notificações
								</button>
							) : null}

							<p>
								<strong>Próximos avisos com hora:</strong> {agendaResumo}
							</p>

							<p className="nota">
								Tarefas com hora, prazos, hábitos no horário habitual, eventos e lembretes
								avisam por aqui. É separado do painel: o painel é o Jarvis opinando; isto é o
								relógio cobrando.
							</p>

							{permissao === 'concedida' ? (
								<>
									<button
										type="button"
										className="botao botao--secundario"
										onClick={() => void provarNotificacao()}
									>
										Testar notificação agora
									</button>
									{teste ? (
										<p className="nota" role="status">
											{teste}
										</p>
									) : null}
								</>
							) : null}

							<p>
								<strong>Rede agora:</strong>{' '}
								{online
									? 'o aparelho declara ter conexão. Ainda assim a chamada pode falhar, e nesse caso o pedido fica guardado.'
									: 'sem conexão declarada. O painel, as regras e as ações programadas continuam; a conversa fica guardada para depois.'}
							</p>

							<p>
								<strong>Segundo plano:</strong>{' '}
								{batimento == null
									? 'o Android ainda não executou o trabalho de segundo plano desde a instalação. Ele só começa depois que o app é colocado em segundo plano uma vez; o primeiro tique vem a partir de 15 min.'
									: `o Android executou o trabalho ${haQuanto(Date.now() - batimento)}. Isso é o que prova que ele roda com o app fechado.`}
							</p>

							<p>
								<strong>Retrato:</strong>{' '}
								{idadeRetrato == null
									? 'ainda não gravado. Ele é criado quando o app vai para segundo plano.'
									: idadeRetrato < 3_600_000
										? `de ${Math.max(1, Math.round(idadeRetrato / 60000))} min atrás.`
										: `de ${Math.round(idadeRetrato / 3_600_000)} h atrás — pode estar desatualizado.`}
							</p>

							<p className="nota">
								O Android não garante horário exato: os avisos saem nas janelas de{' '}
								{HORAS_DE_AVISO.join('h, ')}h, com atraso possível. Depois de reiniciar o
								aparelho, o sistema pode levar alguns minutos para reagendar. Sem internet, o
								painel e as regras continuam funcionando; só a análise por IA fica de fora.
							</p>

							<p className="nota">
								<strong>Consumo hoje:</strong> {consumo?.hoje ?? 0} de {prefs.chamadasPorDia}{' '}
								chamadas. {prefs.tetoMensalUsd > 0
									? `Gasto no mês: US$ ${(consumo?.mes ?? 0).toFixed(4)} de ${prefs.tetoMensalUsd.toFixed(2)}.`
									: 'Sem teto mensal definido.'}{' '}
								Nenhuma chamada é feita sem que as regras locais peçam.
							</p>
						</div>
					</section>

					{/* --------------------------------------------------- gatilhos */}
					<section className="secao" aria-labelledby="jarvis-gatilhos">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo" id="jarvis-gatilhos">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeHorario size={18} />
								</span>
								Quando ela deve olhar
							</h2>
						</div>

						<div className="cartao jarvis-diagnostico">
							<p className="nota">
								Um gatilho faz o Jarvis rodar as regras naquele horário — <strong>sem gastar
								token</strong>. Se houver algo relevante, ele avisa. Ele nunca altera nada
								sozinho por causa de um gatilho.
							</p>

							{gatilhos.length === 0 ? (
								<p className="nota">Nenhum gatilho. Sem eles, a avaliação acontece ao abrir o app e nos horários padrão.</p>
							) : (
								<ul className="jarvis-fatos">
									{gatilhos.map((gatilho) => (
										<li key={gatilho.id}>
											<span>
												<strong>{String(gatilho.payload.hora).padStart(2, '0')}:00</strong>{' '}
												{gatilho.payload.titulo}
												{gatilho.payload.dias.length > 0 ? ' · alguns dias' : ' · todos os dias'}
											</span>
											<button
												type="button"
												className="botao-icone botao-icone--pequeno"
												aria-label={`Remover gatilho ${gatilho.payload.titulo}`}
												onClick={() =>
													void (async () => {
														await removerGatilho(gatilho.id, db)
														setGatilhos(await listarGatilhos(db))
													})()
												}
											>
												<IconeApagar size={16} />
											</button>
										</li>
									))}
								</ul>
							)}

							<p className="nota">
								{gatilhos.length > 0 && proximoGatilho(gatilhos)
									? `Próximo: ${proximoGatilho(gatilhos)!.gatilho.payload.titulo}, às ${String(proximoGatilho(gatilhos)!.gatilho.payload.hora).padStart(2, '0')}h.`
									: 'Nenhum gatilho à frente.'}
							</p>

							<div className="jarvis-gatilho-novo">
								<input
									type="text"
									value={novoTitulo}
									placeholder="Nome do gatilho (ex.: revisar a semana)"
									aria-label="Nome do Gatilho"
									onChange={(evento) => setNovoTitulo(evento.target.value)}
								/>
								<label>
									Hora
									<input
										type="number"
										min={0}
										max={23}
										value={novaHora}
										onChange={(evento) => setNovaHora(Number(evento.target.value))}
									/>
								</label>
								<button
									type="button"
									className="botao"
									disabled={!novoTitulo.trim()}
									onClick={() =>
										void (async () => {
											await criarGatilho({ hora: novaHora, dias: [], titulo: novoTitulo, comIA: false }, db)
											setNovoTitulo('')
											setGatilhos(await listarGatilhos(db))
										})()
									}
								>
									Criar
								</button>
							</div>

							{gatilhos.length === 0 ? (
								<button
									type="button"
									className="botao botao--texto"
									onClick={() =>
										void (async () => {
											for (const sugestao of GATILHOS_SUGERIDOS) {
												await criarGatilho(sugestao, db)
											}
											setGatilhos(await listarGatilhos(db))
										})()
									}
								>
									Usar os três horários sugeridos
								</button>
							) : null}
						</div>
					</section>

					{/* ------------------------------------------------ agendado */}
					<section className="secao" aria-labelledby="jarvis-agenda">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo" id="jarvis-agenda">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeHorario size={18} />
								</span>
								O que está programado
							</h2>
						</div>

						<div className="cartao jarvis-diagnostico">
							<p>
								<strong>Janelas de avaliação:</strong> {HORAS_DE_AVISO.join(', ')}h. Fora
								delas, só uma mudança importante (como conflito de agenda) faz o Jarvis falar.
							</p>
							<p>
								<strong>Segundo plano:</strong> a cada 15 min, no mínimo, e sem garantia de
								pontualidade. Ele lê o último retrato gravado — nunca o banco.
							</p>
							<p>
								<strong>Modo atual:</strong> {prefs.modo}.{' '}
								{dentroDoSilencio(new Date().getHours(), prefs.silencio)
									? 'Agora está dentro do horário silencioso.'
									: 'Agora está fora do horário silencioso.'}
							</p>
						</div>
					</section>
				</>
			)}
			</div>

			<Folha
				titulo={detalhe?.sinal.titulo ?? ''}
				aberta={detalhe !== null}
				onFechar={() => setDetalhe(null)}
				sobre={detalhe ? ROTULO_NIVEL[detalhe.sinal.nivel] : undefined}
			>
				{detalhe ? (
					<div className="formulario">
						<p>{detalhe.sinal.detalhe}</p>
						<p className="nota">
							Origem: {detalhe.sinal.familia}. Relevância{' '}
							{(detalhe.relevancia * 100).toFixed(0)}%.{' '}
							{detalhe.interrompe
								? 'Este sinal interrompeu.'
								: `Ficou só no painel: ${ROTULO_MOTIVO[detalhe.motivo ?? ''] ?? detalhe.motivo}.`}
						</p>
						<p className="nota">
							{detalhe.sinal.precisaIA
								? 'Este tipo se beneficia de análise do modelo — mas só quando houver autorização e orçamento.'
								: 'Este tipo é resolvido por regra local, sem usar IA.'}
						</p>

						<div className="formulario__acoes">
							<button
								type="button"
								className="botao"
								onClick={() => void tratar(detalhe, 'ignorado')}
							>
								Ignorar
							</button>
							<button
								type="button"
								className="botao botao--primario"
								onClick={() => void tratar(detalhe, 'aceito')}
							>
								Faz sentido
							</button>
						</div>
					</div>
				) : null}
			</Folha>

			<Folha
				titulo="Como os modos funcionam"
				aberta={trocandoModo}
				onFechar={() => setTrocandoModo(false)}
			>
				<div className="formulario">
					{MODOS.map((modo) => (
						<div key={modo.valor} className="jarvis-modo-explicacao">
							<strong>{modo.rotulo}</strong>
							<p>{modo.explicacao}</p>
						</div>
					))}
					<p className="nota">
						Regra de precedência, para não haver dois estados ao mesmo tempo:
						pausado &gt; manual &gt; silencioso &gt; ativo. Notificações e análise
						automática são interruptores separados e não brigam com o modo.
					</p>
				</div>
			</Folha>

		</div>
	)
}

/** Rótulo de autonomia para usar em outras telas. */
export function rotuloDeAutonomia(valor: PreferenciasJarvis['autonomia']): string {
	return AUTONOMIA.find((nivel) => nivel.valor === valor)?.rotulo ?? valor
}

export { PREFERENCIAS_PADRAO, avaliar }
export type { Sinal }
