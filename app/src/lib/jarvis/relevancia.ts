import type { Nivel } from './sinais'

/**
 * Relevância e as travas contra o incômodo.
 *
 * A fórmula é um número, não um sentimento:
 *
 *   relevancia = tipo × magnitude × urgência × novidade × fadiga × confiança
 *
 * O recurso escasso não é o dólar: é a paciência. Por isso o limite principal
 * é o ORÇAMENTO DE ATENÇÃO (quantas interrupções por dia), e não o de token.
 *
 * As quatro travas, todas necessárias:
 *
 * 1. fingerprint  — o mesmo acontecimento só é avaliado uma vez por janela;
 * 2. cooldown     — cada tipo descansa depois de falar (24 h / 72 h);
 * 3. orçamento    — no máximo N interrupções por dia;
 * 4. silêncio     — 3 ignorados seguidos do mesmo tipo pausam aquele tipo.
 *
 * Sem a trava 4, qualquer heurística vira ruído em poucas semanas.
 */

export type ModoJarvis = 'ativo' | 'silencioso' | 'manual' | 'pausado'

/**
 * Como a IA fala. Separado de `autonomia`, que é sobre AGIR: um Jarvis falante
 * e conservador é uma combinação válida, e misturar as duas coisas faria o
 * usuário mudar de personalidade sem querer ao mudar de permissão.
 */
export interface Personalidade {
	/** Tom da escrita. */
	tom:
		| 'direto'
		| 'rispido'
		| 'sarcastico'
		| 'comediante'
		| 'serio'
		| 'profissional'
		| 'calmo'
		| 'proximo'
	/** Quanta explicação vem junto. */
	detalhe: 'curto' | 'equilibrado' | 'explicado'
	/** Quanto ela puxa assunto sem ser chamada. */
	iniciativa: 'reservada' | 'equilibrada' | 'presente'
	/** Assunto que ela deve valorizar (texto curto, opcional). */
	foco?: string
}

export interface PreferenciasJarvis {
	modo: ModoJarvis
	personalidade: Personalidade
	/** Liga/desliga só o que interrompe (o painel continua). */
	notificacoes: boolean
	/**
	 * Avisos por horário: tarefa com hora, prazo, hábito no horário habitual,
	 * evento e lembrete. É separado de `notificacoes` porque são coisas
	 * diferentes: uma é o Jarvis opinando, a outra é o relógio cobrando.
	 */
	agendaDeAvisos: boolean
	/** Minutos de antecedência no aviso de evento (0–180). */
	antecedenciaMin: number
	/** Liga/desliga a avaliação periódica. */
	analisesAutomaticas: boolean
	/** Tipos desligados um a um (`sinal.id`). */
	gatilhosDesativados: string[]
	/** Máximo de interrupções por dia (0–10). */
	orcamentoDiario: number
	/** Faixa silenciosa, em horas locais. */
	silencio: { inicio: number; fim: number; ligado: boolean }
	/** Nível de autonomia. */
	autonomia: 'conservador' | 'equilibrado' | 'confiante'
	/** Projetos com acompanhamento desligado. */
	projetosIgnorados: string[]
	/** Teto mensal em US$ (0 = sem teto). */
	tetoMensalUsd: number
	/** Teto de chamadas de IA por dia. */
	chamadasPorDia: number
	/** Dias de histórico a guardar. */
	guardarDias: number
}

export const PREFERENCIAS_PADRAO: PreferenciasJarvis = {
	modo: 'ativo',
	personalidade: { tom: 'direto', detalhe: 'curto', iniciativa: 'equilibrada', foco: '' },
	notificacoes: true,
	agendaDeAvisos: true,
	antecedenciaMin: 15,
	analisesAutomaticas: true,
	gatilhosDesativados: [],
	orcamentoDiario: 3,
	silencio: { inicio: 22, fim: 7, ligado: true },
	autonomia: 'conservador',
	projetosIgnorados: [],
	tetoMensalUsd: 0,
	chamadasPorDia: 20,
	guardarDias: 90,
}

const PESO: Record<Nivel, number> = {
	informativo: 0.2,
	oportunidade: 0.45,
	atencao: 0.72,
	urgente: 1,
}

/** Corte por modo: abaixo dele o sinal vai para o painel e não interrompe. */
export const CORTE: Record<ModoJarvis, number> = {
	ativo: 0.45,
	silencioso: 0.75,
	manual: Number.POSITIVE_INFINITY,
	pausado: Number.POSITIVE_INFINITY,
}

/**
 * Ajuste do corte pela personalidade.
 *
 * "Iniciativa" não é enfeite: ela desloca o limite em que um sinal passa a
 * falar. Reservada é mais exigente (fala menos), presente é mais solta. O
 * orçamento diário continua sendo o teto — iniciativa muda QUEM fala, não
 * QUANTAS vezes no dia.
 */
export function corteComIniciativa(
	modo: ModoJarvis,
	iniciativa: Personalidade['iniciativa'],
): number {
	const base = CORTE[modo]
	if (!Number.isFinite(base)) return base

	const ajuste = iniciativa === 'reservada' ? 0.12 : iniciativa === 'presente' ? -0.1 : 0
	return Math.max(0.15, Math.min(0.95, base + ajuste))
}

export interface ContextoDeAvaliacao {
	/** Interrupções já feitas hoje. */
	interrupcoesHoje: number
	/** Epoch ms atual. */
	agora: number
	/** Hora local 0–23. */
	hora: number
	/** `chave do sinal` → quando foi mostrado pela última vez. */
	ultimaVez: Record<string, number>
	/** `sinal.id` → vezes seguidas ignoradas e até quando está silenciado. */
	silencio: Record<string, { ignorados: number; ate: number }>
	/** `sinal.id` → taxa de aceitação histórica (0–1). */
	confianca: Record<string, number>
}

const HORA = 3_600_000
const DIA = 24 * HORA

/** Cooldown por nível: atenção fala no máximo 1×/dia, oportunidade 1×/72 h. */
function cooldown(nivel: Nivel): number {
	switch (nivel) {
		case 'urgente':
			return 6 * HORA
		case 'atencao':
			return DIA
		case 'oportunidade':
			return 3 * DIA
		default:
			return 7 * DIA
	}
}

export interface Veredito {
	/** 0–1. */
	relevancia: number
	/** Vai interromper (notificação/painel em destaque) ou só aparecer no painel? */
	interrompe: boolean
	/** Motivo curto quando não interrompe — o painel mostra "silenciado porque…". */
	motivo: 'modo' | 'sem-orcamento' | 'silencio-horario' | 'cooldown' | 'repetido' | 'abaixo-do-corte' | 'gatilho-desligado' | null
}

export interface EntradaAvaliacao {
	nivel: Nivel
	magnitude: number
	urgencia: number
	chave: string
	id: string
}

/**
 * Aplica a fórmula e as travas. Devolve também o motivo de um sinal não ter
 * interrompido — sem isso o painel não consegue explicar o próprio silêncio.
 */
export function avaliar(
	sinal: EntradaAvaliacao,
	prefs: PreferenciasJarvis,
	contexto: ContextoDeAvaliacao,
): Veredito {
	// Ordem das travas: das mais baratas e definitivas para as relativas.

	if (prefs.gatilhosDesativados.includes(sinal.id)) {
		return { relevancia: 0, interrompe: false, motivo: 'gatilho-desligado' }
	}

	if (prefs.modo === 'pausado' || prefs.modo === 'manual') {
		return { relevancia: 0, interrompe: false, motivo: 'modo' }
	}

	const silencio = contexto.silencio[sinal.id]
	if (silencio && silencio.ate > contexto.agora) {
		return { relevancia: 0, interrompe: false, motivo: 'repetido' }
	}

	// Novidade: 1 na primeira vez, 50% a cada repetição do mesmo fingerprint.
	const anterior = contexto.ultimaVez[sinal.chave]
	const repeticoes = anterior ? 1 : 0
	const novidade = anterior ? 0.5 : 1

	// Fadiga: 0 interrupções = 1,0; 3 = 0,4; 6 = 0.
	const fadiga = Math.max(0, 1 - contexto.interrupcoesHoje / 6)

	const confianca = contexto.confianca[sinal.id] ?? 0.85

	const relevancia =
		PESO[sinal.nivel] * sinal.magnitude * sinal.urgencia * novidade * fadiga * confianca

	const cooldownAtivo = !!anterior && contexto.agora - anterior < cooldown(sinal.nivel)
	const semOrcamento = contexto.interrupcoesHoje >= prefs.orcamentoDiario
	const emSilencioHorario = prefs.silencio.ligado && dentroDoSilencio(contexto.hora, prefs.silencio)
	const abaixoDoCorte = relevancia < corteComIniciativa(prefs.modo, prefs.personalidade.iniciativa)

	// A ordem do motivo importa para o painel: uma trava objetiva ("orçamento
	// acabou") explica melhor o silêncio do que "nota baixa", que é consequência.
	let motivo: Veredito['motivo'] = null
	if (cooldownAtivo) motivo = 'cooldown'
	else if (semOrcamento) motivo = 'sem-orcamento'
	else if (emSilencioHorario) motivo = 'silencio-horario'
	else if (!prefs.notificacoes) motivo = 'modo'
	else if (abaixoDoCorte) motivo = 'abaixo-do-corte'

	const interrompe =
		!cooldownAtivo &&
		!semOrcamento &&
		!emSilencioHorario &&
		prefs.notificacoes &&
		!abaixoDoCorte &&
		!(repeticoes > 0 && sinal.nivel === 'informativo')

	return { relevancia: Math.round(relevancia * 1000) / 1000, interrompe, motivo }
}

/** Faixa 22→7 atravessa a meia-noite; comparar com cuidado. */
export function dentroDoSilencio(hora: number, faixa: { inicio: number; fim: number }): boolean {
	if (faixa.inicio === faixa.fim) return false
	if (faixa.inicio < faixa.fim) return hora >= faixa.inicio && hora < faixa.fim
	return hora >= faixa.inicio || hora < faixa.fim
}

/**
 * Um tipo foi ignorado. Três seguidos pausam aquele tipo por 14 dias.
 *
 * "Ignorar" é não agir sobre a intervenção em 24 h — não é fechar o painel.
 * Conta-se por tipo, não por acontecimento: se "projeto parado" incomoda, o
 * problema é o tipo, não o projeto da vez.
 */
export function registrarIgnorado(
	tipo: string,
	memoria: Record<string, { ignorados: number; ate: number }>,
	agora: number,
): Record<string, { ignorados: number; ate: number }> {
	const atual = memoria[tipo] ?? { ignorados: 0, ate: 0 }
	const ignorados = atual.ignorados + 1
	const silenciar = ignorados >= 3

	return {
		...memoria,
		[tipo]: {
			ignorados: silenciar ? 0 : ignorados,
			ate: silenciar ? agora + 14 * DIA : atual.ate,
		},
	}
}

/** Um tipo foi aceito: a confiança sobe devagar e para em 1. */
export function registrarAceito(tipo: string, confianca: Record<string, number>): Record<string, number> {
	const atual = confianca[tipo] ?? 0.85
	return { ...confianca, [tipo]: Math.min(1, Math.round((atual + 0.05) * 100) / 100) }
}

/** Um tipo foi recusado ("não é isso"): a confiança cai, com piso em 0,5. */
export function registrarRecusado(tipo: string, confianca: Record<string, number>): Record<string, number> {
	const atual = confianca[tipo] ?? 0.85
	return { ...confianca, [tipo]: Math.max(0.5, Math.round((atual - 0.15) * 100) / 100) }
}
