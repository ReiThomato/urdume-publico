import { describe, expect, it } from 'vitest'
import { interpretar } from './interpretar'

/** Data fixa: terça-feira, 10 de novembro de 2026, 15:00. */
const AGORA = new Date(2026, 10, 10, 15, 0, 0)

describe('interpretar', () => {
	it('sem nada reconhecido, devolve o texto como título', () => {
		const r = interpretar('Comprar café', AGORA)
		expect(r.titulo).toBe('Comprar café')
		expect(r.dia).toBeUndefined()
		expect(r.hora).toBeUndefined()
	})

	it('reconhece hoje e amanhã', () => {
		expect(interpretar('Ligar hoje', AGORA).dia).toBe('2026-11-10')
		expect(interpretar('Ligar amanhã', AGORA).dia).toBe('2026-11-11')
	})

	it('reconhece hora em 15h e 15:30', () => {
		expect(interpretar('Reunião 15h', AGORA).hora).toBe(900)
		expect(interpretar('Reunião 9:30', AGORA).hora).toBe(570)
	})

	it('reconhece dia da semana e usa a próxima ocorrência', () => {
		// De terça, "sexta" é dia 13; "segunda" é dia 16.
		expect(interpretar('Academia sexta', AGORA).dia).toBe('2026-11-13')
		expect(interpretar('Academia segunda', AGORA).dia).toBe('2026-11-16')
	})

	it('reconhece "dia 5" indo para o mês seguinte quando já passou', () => {
		expect(interpretar('Pagar luz dia 5', AGORA).dia).toBe('2026-12-05')
		// Dia 20 ainda não passou: fica no mês atual.
		expect(interpretar('Consulta dia 20', AGORA).dia).toBe('2026-11-20')
	})

	it('reconhece prioridade, projeto e etiqueta e limpa o título', () => {
		const r = interpretar('Enviar proposta !alta #trabalho @cliente', AGORA)
		expect(r.prioridade).toBe(3)
		expect(r.projeto).toBe('trabalho')
		expect(r.etiqueta).toBe('cliente')
		expect(r.titulo).toBe('Enviar proposta')
	})

	it('reconhece recorrência diária', () => {
		const r = interpretar('Tomar remédio todo dia 8h', AGORA)
		expect(r.recorrencia).toEqual({ tipo: 'diaria', intervalo: 1 })
		expect(r.hora).toBe(480)
	})

	it('reconhece "toda segunda" e marca a primeira ocorrência', () => {
		const r = interpretar('Revisar metas toda segunda', AGORA)
		expect(r.recorrencia).toEqual({ tipo: 'semanal', intervalo: 1 })
		expect(r.dia).toBe('2026-11-16')
	})

	it('reconhece duração', () => {
		expect(interpretar('Estudar 14h por 1h', AGORA).duracao).toBe(60)
		expect(interpretar('Caminhada 30min', AGORA).duracao).toBe(30)
	})

	it('não come o título quando não há nada a reconhecer', () => {
		const r = interpretar('Ler o livro às páginas 30', AGORA)
		expect(r.titulo.toLowerCase()).toContain('ler')
	})

	it('combina vários sinais no mesmo texto', () => {
		const r = interpretar('Reunião amanhã 10h por 1h #trabalho !media', AGORA)
		expect(r.dia).toBe('2026-11-11')
		expect(r.hora).toBe(600)
		expect(r.duracao).toBe(60)
		expect(r.projeto).toBe('trabalho')
		expect(r.prioridade).toBe(2)
		expect(r.titulo).toBe('Reunião')
	})
})
