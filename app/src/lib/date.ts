/** Formatação de datas em pt-BR, sempre no fuso local do aparelho. */

const formatadorDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const formatadorCurto = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
const formatadorMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const formatadorHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function diaDeHoje(): Date {
	const agora = new Date()
	return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
}

export function chaveDoDia(date: Date): string {
	const ano = date.getFullYear()
	const mes = String(date.getMonth() + 1).padStart(2, '0')
	const dia = String(date.getDate()).padStart(2, '0')
	return `${ano}-${mes}-${dia}`
}

export function diaDaChave(chave: string): Date {
	const [ano, mes, dia] = chave.split('-').map(Number)
	return new Date(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1)
}

export function adicionarDias(date: Date, dias: number): Date {
	const copia = new Date(date)
	copia.setDate(copia.getDate() + dias)
	return copia
}

export function capitalizar(texto: string): string {
	return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** "terça-feira, 10 de novembro" */
export function formatarDiaLongo(date: Date): string {
	return formatadorDia.format(date)
}

/** "ter., 10 de nov." */
export function formatarDiaCurto(date: Date): string {
	return formatadorCurto.format(date).replace('.', '.')
}

/** "novembro de 2026" */
export function formatarMes(date: Date): string {
	return formatadorMes.format(date)
}

/** "12:53" */
export function formatarHora(date: Date | number): string {
	return formatadorHora.format(typeof date === 'number' ? new Date(date) : date)
}

export function ehMesmoDia(a: Date, b: Date): boolean {
	return chaveDoDia(a) === chaveDoDia(b)
}

export interface CelulaMes {
	chave: string
	data: Date
	noMes: boolean
}

/**
 * Grade do mês começando no domingo, com as semanas completas necessárias.
 * As células de fora do mês existem para alinhar a grade, não são clicáveis.
 */
export function gradeDoMes(ano: number, mes: number): CelulaMes[] {
	const primeiro = new Date(ano, mes, 1)
	const inicio = adicionarDias(primeiro, -primeiro.getDay())
	const ultimo = new Date(ano, mes + 1, 0)
	const totalDias = Math.ceil((ultimo.getDate() + primeiro.getDay()) / 7) * 7

	return Array.from({ length: totalDias }, (_, indice) => {
		const data = adicionarDias(inicio, indice)
		return { chave: chaveDoDia(data), data, noMes: data.getMonth() === mes }
	})
}

export const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
