/**
 * Interpretação de data/hora escrita em português.
 *
 * O objetivo é a captura em segundos: digitar "pagar luz dia 5 !alta #casa"
 * preenche dia, prioridade e projeto sem abrir nenhum seletor.
 *
 * Regras do parser:
 * - Nunca "inventa": o que não reconhece fica no título.
 * - Devolve o título limpo, sem as palavras que viraram campo.
 * - Datas relativas usam a data local do aparelho, não UTC.
 */

export interface Interpretacao {
	/** Título com as palavras reconhecidas removidas. */
	titulo: string
	/** AAAA-MM-DD */
	dia?: string
	/** minutos desde 00:00 */
	hora?: number
	/** duração em minutos, quando dito ("por 1h") */
	duracao?: number
	prioridade?: 0 | 1 | 2 | 3
	/** etiqueta via @ */
	etiqueta?: string
	/** projeto via # */
	projeto?: string
	recorrencia?: { tipo: 'diaria' | 'semanal' | 'mensal' | 'dias-uteis'; intervalo: number }
	/** marcas que foram reconhecidas, para mostrar o que o app entendeu */
	entendido: string[]
}

const DIAS_SEMANA: Record<string, number> = {
	domingo: 0,
	segunda: 1,
	'segunda-feira': 1,
	terca: 2,
	'terça': 2,
	'terça-feira': 2,
	quarta: 3,
	quinta: 4,
	quinta_feira: 4,
	sexta: 5,
	sabado: 6,
	'sábado': 6,
}

const MESES: Record<string, number> = {
	janeiro: 1,
	fevereiro: 2,
	marco: 3,
	março: 3,
	abril: 4,
	maio: 5,
	junho: 6,
	julho: 7,
	agosto: 8,
	setembro: 9,
	outubro: 10,
	novembro: 11,
	dezembro: 12,
}

/** Remove acentos só para comparar; o texto original é preservado no título. */
export function semAcento(texto: string): string {
	return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function chave(data: Date): string {
	const a = data.getFullYear()
	const m = String(data.getMonth() + 1).padStart(2, '0')
	const d = String(data.getDate()).padStart(2, '0')
	return `${a}-${m}-${d}`
}

function somarDias(base: Date, dias: number): Date {
	const nova = new Date(base)
	nova.setDate(nova.getDate() + dias)
	return nova
}

/**
 * Interpreta o texto digitado. Sem nada reconhecido, o título volta igual.
 */
export function interpretar(entrada: string, agora: Date = new Date()): Interpretacao {
	let texto = entrada
	const entendido: string[] = []
	const saida: Interpretacao = { titulo: entrada, entendido }

	const consumir = (trecho: string): void => {
		const indice = texto.toLowerCase().indexOf(trecho.toLowerCase())
		if (indice >= 0) texto = texto.slice(0, indice) + texto.slice(indice + trecho.length)
	}

	// ---- projeto (#nome) e etiqueta (@nome) --------------------------------
	const achadoProjeto = texto.match(/#([\p{L}\p{N}_-]+)/u)
	if (achadoProjeto) {
		saida.projeto = achadoProjeto[1]
		entendido.push(`projeto ${achadoProjeto[1]}`)
		consumir(achadoProjeto[0])
	}

	const achadoEtiqueta = texto.match(/@([\p{L}\p{N}_-]+)/u)
	if (achadoEtiqueta) {
		saida.etiqueta = achadoEtiqueta[1]
		entendido.push(`etiqueta ${achadoEtiqueta[1]}`)
		consumir(achadoEtiqueta[0])
	}

	// ---- prioridade (!alta / !media / !baixa) ------------------------------
	const achadoPrioridade = texto.match(/!(alta|m[eé]dia|baixa|urgente)/i)
	if (achadoPrioridade) {
		const valor = semAcento(achadoPrioridade[1]!)
		saida.prioridade = valor === 'alta' || valor === 'urgente' ? 3 : valor === 'media' ? 2 : 1
		entendido.push(`prioridade ${valor}`)
		consumir(achadoPrioridade[0])
	}

	// ---- duração ("por 1h", "2h", "30min") ----------------------------------
	const achadoDuracao = texto.match(/\b(?:por\s+|dura(?:ção|cao)\s+(?:de\s+)?)(\d{1,3})\s*(h|hora|horas|min|minutos)\b|\b(\d{1,3})\s*(min|minutos)\b/i)
	if (achadoDuracao) {
		const numero = Number(achadoDuracao[1] ?? achadoDuracao[3])
		const unidade = semAcento(achadoDuracao[2] ?? achadoDuracao[4]!)
		saida.duracao = unidade.startsWith('h') ? numero * 60 : numero
		entendido.push(`duração ${saida.duracao}min`)
		consumir(achadoDuracao[0])
	}

	// ---- hora ("15h", "15:30", "às 9") --------------------------------------
	// A hora é procurada DEPOIS da duração, porque "por 1h" também termina em "h".
	// O `\b(?!\s*(?:de|por))` evita casar "1h" quando ele é duração.
	const achadoHora = texto.match(/(?:\b[àa]s\s+)(\d{1,2})(?::(\d{2}))?\s*h(?:oras?)?\b|\b(\d{1,2}):(\d{2})\b|\b(\d{1,2})\s*h(?:oras?)?\b/i)
	if (achadoHora) {
		const h = Number(achadoHora[1] ?? achadoHora[3] ?? achadoHora[5])
		const m = Number(achadoHora[2] ?? achadoHora[4] ?? 0)
		if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
			saida.hora = h * 60 + m
			entendido.push(`hora ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
			consumir(achadoHora[0])
		}
	}

	// ---- recorrência ("todo dia", "toda segunda", "todo dia 5", "a cada 2 semanas")
	const textoCompara = semAcento(texto)
	if (/\btodo\s+dia\b|\bdiariamente\b/.test(textoCompara)) {
		saida.recorrencia = { tipo: 'diaria', intervalo: 1 }
		entendido.push('repete todo dia')
		consumir(texto.slice(textoCompara.indexOf('todo dia'), textoCompara.indexOf('todo dia') + 8))
	} else if (/\bdias\s+uteis\b/.test(textoCompara)) {
		saida.recorrencia = { tipo: 'dias-uteis', intervalo: 1 }
		entendido.push('repete em dias úteis')
		const i = textoCompara.indexOf('dias uteis')
		consumir(texto.slice(i, i + 11))
	} else {
		const achadoSemanal = textoCompara.match(/\btoda\s+(domingo|segunda|terca|quarta|quinta|sexta|sabado)/)
		if (achadoSemanal) {
			saida.recorrencia = { tipo: 'semanal', intervalo: 1 }
			const dia = DIAS_SEMANA[achadoSemanal[1]!]
			// O próprio dia da semana também vira a data da primeira ocorrência.
			if (dia !== undefined) {
				const hoje = agora.getDay()
				const avanco = (dia - hoje + 7) % 7 || 7
				saida.dia = chave(somarDias(agora, avanco))
			}
			entendido.push(`repete toda ${achadoSemanal[1]}`)
			const i = textoCompara.indexOf(achadoSemanal[0])
			consumir(texto.slice(i, i + achadoSemanal[0].length))
		}
	}

	// ---- datas nomeadas -----------------------------------------------------
	const comparacao = semAcento(texto)
	const nomeadas: [RegExp, number][] = [
		[/\bhoje\b/, 0],
		[/\bamanha\b/, 1],
		[/\bdepois de amanha\b/, 2],
		[/\bontem\b/, -1],
	]
	for (const [expressao, deslocamento] of nomeadas) {
		if (expressao.test(comparacao)) {
			saida.dia = chave(somarDias(agora, deslocamento))
			entendido.push(expressao.source.replace(/\\b/g, ''))
			const i = comparacao.indexOf(expressao.source.replace(/\\b/g, ''))
			if (i >= 0) {
				const trechoOriginal = texto.slice(i, i + expressao.source.replace(/\\b/g, '').length)
				consumir(trechoOriginal)
			}
			break
		}
	}

	// ---- dia da semana ("segunda", "sexta") --------------------------------
	if (!saida.dia) {
		for (const [nome, indice] of Object.entries(DIAS_SEMANA)) {
			const expressao = new RegExp(`\\b${semAcento(nome)}\\b`)
			if (expressao.test(comparacao)) {
				const hoje = agora.getDay()
				const avanco = (indice - hoje + 7) % 7 || 7
				saida.dia = chave(somarDias(agora, avanco))
				entendido.push(nome)
				const i = comparacao.indexOf(semAcento(nome))
				if (i >= 0) consumir(texto.slice(i, i + semAcento(nome).length))
				break
			}
		}
	}

	// ---- "dia 12" / "12 de novembro" ---------------------------------------
	if (!saida.dia) {
		const achadoDia = comparacao.match(/\bdia\s+(\d{1,2})\b/)
		if (achadoDia) {
			const numero = Number(achadoDia[1])
			if (numero >= 1 && numero <= 31) {
				const base = new Date(agora)
				// Se o dia já passou neste mês, vai para o mês seguinte.
				const alvo = new Date(base.getFullYear(), base.getMonth(), numero)
				if (numero < base.getDate()) alvo.setMonth(alvo.getMonth() + 1)
				saida.dia = chave(alvo)
				entendido.push(`dia ${numero}`)
				const i = comparacao.indexOf(achadoDia[0])
				consumir(texto.slice(i, i + achadoDia[0].length))
			}
		}
	}

	if (!saida.dia) {
		const achadoMes = comparacao.match(/\b(\d{1,2})\s+de\s+([a-z]+)\b/)
		if (achadoMes && MESES[achadoMes[2]!]) {
			const numero = Number(achadoMes[1])
			const mes = MESES[achadoMes[2]!]!
			const alvo = new Date(agora.getFullYear(), mes - 1, numero)
			if (alvo.getTime() < agora.getTime() - 86400000) alvo.setFullYear(alvo.getFullYear() + 1)
			saida.dia = chave(alvo)
			entendido.push(`${numero} de ${achadoMes[2]}`)
			const i = comparacao.indexOf(achadoMes[0])
			consumir(texto.slice(i, i + achadoMes[0].length))
		}
	}

	// Título limpo: só espaços sobrando e pontuação solta.
	saida.titulo =
		texto
			.replace(/\s{2,}/g, ' ')
			.replace(/\s+([,.;!?])/g, '$1')
			.trim()
			.replace(/^[-–—-]\s*/, '') || entrada.trim()

	return saida
}
