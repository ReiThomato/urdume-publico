import { describe, expect, it } from 'vitest'
import {
	CORTE,
	PREFERENCIAS_PADRAO,
	avaliar,
	dentroDoSilencio,
	registrarIgnorado,
} from '@/lib/jarvis/relevancia'
import type { ContextoDeAvaliacao, PreferenciasJarvis } from '@/lib/jarvis/relevancia'

const AGORA = new Date(2026, 10, 12, 10, 0, 0).getTime()

function contexto(parcial: Partial<ContextoDeAvaliacao> = {}): ContextoDeAvaliacao {
	return {
		interrupcoesHoje: 0,
		agora: AGORA,
		hora: 10,
		ultimaVez: {},
		silencio: {},
		confianca: {},
		...parcial,
	}
}

function prefs(parcial: Partial<PreferenciasJarvis> = {}): PreferenciasJarvis {
	return { ...PREFERENCIAS_PADRAO, ...parcial }
}

const sinal = (parcial: Partial<Parameters<typeof avaliar>[0]> = {}) => ({
	nivel: 'atencao' as const,
	magnitude: 1,
	urgencia: 1,
	chave: 'teste:1',
	id: 'teste',
	...parcial,
})

describe('fórmula de relevância', () => {
	it('um sinal urgente e completo interrompe no modo ativo', () => {
		const veredito = avaliar(sinal({ nivel: 'urgente' }), prefs(), contexto())
		expect(veredito.interrompe).toBe(true)
		expect(veredito.relevancia).toBeGreaterThan(CORTE.ativo)
	})

	it('um sinal informativo nunca interrompe', () => {
		const veredito = avaliar(sinal({ nivel: 'informativo' }), prefs(), contexto())
		expect(veredito.interrompe).toBe(false)
	})

	it('o mesmo sinal perde metade da relevância na repetição', () => {
		const primeiro = avaliar(sinal(), prefs(), contexto())
		const segundo = avaliar(sinal(), prefs(), contexto({ ultimaVez: { 'teste:1': AGORA - 1000 } }))
		expect(segundo.relevancia).toBeLessThan(primeiro.relevancia)
	})
})

describe('travas contra incômodo', () => {
	it('respeita o orçamento diário de atenção', () => {
		const veredito = avaliar(sinal({ nivel: 'urgente' }), prefs({ orcamentoDiario: 3 }), contexto({ interrupcoesHoje: 3 }))
		expect(veredito.interrompe).toBe(false)
		expect(veredito.motivo).toBe('sem-orcamento')
	})

	it('o cansaço reduz a relevância antes de chegar ao orçamento', () => {
		const cedo = avaliar(sinal({ nivel: 'urgente' }), prefs(), contexto({ interrupcoesHoje: 0 }))
		const tarde = avaliar(sinal({ nivel: 'urgente' }), prefs(), contexto({ interrupcoesHoje: 4 }))
		expect(tarde.relevancia).toBeLessThan(cedo.relevancia)
	})

	it('aplica cooldown por nível', () => {
		const veredito = avaliar(
			sinal({ nivel: 'oportunidade' }),
			prefs(),
			contexto({ ultimaVez: { 'teste:1': AGORA - 3_600_000 } }),
		)
		expect(veredito.interrompe).toBe(false)
		expect(veredito.motivo).toBe('cooldown')
	})

	it('um cooldown de urgente dura 6 h', () => {
		const antigo = avaliar(
			sinal({ nivel: 'urgente' }),
			prefs(),
			contexto({ ultimaVez: { 'teste:1': AGORA - 7 * 3_600_000 } }),
		)
		expect(antigo.motivo).not.toBe('cooldown')
	})

	it('respeita o horário silencioso', () => {
		const veredito = avaliar(sinal({ nivel: 'urgente' }), prefs(), contexto({ hora: 23 }))
		expect(veredito.interrompe).toBe(false)
		expect(veredito.motivo).toBe('silencio-horario')
	})

	it('o silêncio atravessa a meia-noite', () => {
		expect(dentroDoSilencio(23, { inicio: 22, fim: 7 })).toBe(true)
		expect(dentroDoSilencio(2, { inicio: 22, fim: 7 })).toBe(true)
		expect(dentroDoSilencio(12, { inicio: 22, fim: 7 })).toBe(false)
		expect(dentroDoSilencio(7, { inicio: 22, fim: 7 })).toBe(false)
	})

	it('não interrompe nada no modo manual nem no pausado', () => {
		expect(avaliar(sinal({ nivel: 'urgente' }), prefs({ modo: 'manual' }), contexto()).interrompe).toBe(false)
		expect(avaliar(sinal({ nivel: 'urgente' }), prefs({ modo: 'pausado' }), contexto()).interrompe).toBe(false)
	})

	it('o modo silencioso exige relevância muito alta', () => {
		const fraco = avaliar(sinal({ magnitude: 0.4, urgencia: 0.5 }), prefs({ modo: 'silencioso' }), contexto())
		expect(fraco.interrompe).toBe(false)
		expect(fraco.motivo).toBe('abaixo-do-corte')
	})

	it('um gatilho desligado não produz nada', () => {
		const veredito = avaliar(
			sinal({ nivel: 'urgente' }),
			prefs({ gatilhosDesativados: ['teste'] }),
			contexto(),
		)
		expect(veredito.interrompe).toBe(false)
		expect(veredito.motivo).toBe('gatilho-desligado')
	})

	it('desligar notificações não esconde o painel, mas não interrompe', () => {
		const veredito = avaliar(sinal({ nivel: 'urgente' }), prefs({ notificacoes: false }), contexto())
		expect(veredito.interrompe).toBe(false)
		expect(veredito.relevancia).toBeGreaterThan(0)
	})
})

describe('aprendizado de frequência', () => {
	it('três ignorados seguidos silenciam o tipo por 14 dias', () => {
		let memoria: Record<string, { ignorados: number; ate: number }> = {}

		memoria = registrarIgnorado('projeto_sem_atividade', memoria, AGORA)
		expect(memoria.projeto_sem_atividade?.ate).toBe(0)

		memoria = registrarIgnorado('projeto_sem_atividade', memoria, AGORA)
		expect(memoria.projeto_sem_atividade?.ate).toBe(0)

		memoria = registrarIgnorado('projeto_sem_atividade', memoria, AGORA)
		expect(memoria.projeto_sem_atividade?.ate).toBeGreaterThan(AGORA)

		const veredito = avaliar(
			sinal({ id: 'projeto_sem_atividade', nivel: 'urgente' }),
			prefs(),
			contexto({ silencio: memoria }),
		)
		expect(veredito.interrompe).toBe(false)
		expect(veredito.motivo).toBe('repetido')
	})
})
