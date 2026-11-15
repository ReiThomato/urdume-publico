import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NexoDatabase } from '@/db/db'
import { salvarPreferencias } from '@/lib/jarvis/estado'
import { enfileirarRecado, lerFilaDeRecados, LIMITE_DA_FILA } from '@/lib/jarvis/recados'
import type { SugestaoPensada } from '@/lib/jarvis/recados'
import { descartarRecado, lerRecadosDaIlha } from '@/lib/jarvis/ilha'
import { createTask } from '@/db/repo'

/**
 * A ilha é a parte visível da iniciativa. O que estes testes protegem:
 *
 * 1. a fila não cresce sem limite nem duplica o mesmo recado;
 * 2. pausar esvazia a ilha na hora;
 * 3. sem chave de IA, a ilha ainda mostra o que as REGRAS viram — senão ela
 *    seria muda para quem não configurou a chave;
 * 4. o recado sobrevive ao cooldown do motor (o sinal sai do painel, a ilha
 *    continua mostrando);
 * 5. dispensar dispensa de verdade — não volta na leitura seguinte.
 *
 * Os testes usam o banco real e a avaliação real: `lerRecadosDaIlha` chama
 * `avaliarAgora`, então o cenário precisa existir de fato nas tabelas.
 */

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`jarvis-ilha-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

function sugestao(parcial: Partial<SugestaoPensada> = {}): SugestaoPensada {
	return {
		em: Date.now(),
		sinal: 'projeto_parado:p1',
		titulo: 'Projeto parado',
		mensagem: 'O projeto X está parado há 12 dias.',
		nivel: 'oportunidade',
		acoes: [{ tipo: 'criar_tarefa', dados: { titulo: 'Revisar X' }, motivo: 'parado' }],
		...parcial,
	}
}

/** Data local de N dias atrás, no formato do banco. */
function diaAtras(dias: number): string {
	const d = new Date()
	d.setDate(d.getDate() - dias)
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Uma tarefa atrasada de verdade — é o sinal mais comum. */
async function tarefaAtrasada(): Promise<void> {
	await createTask({ title: 'Prova da ilha', dueDate: diaAtras(1) }, banco)
}

describe('fila da ilha', () => {
	it('guarda o recado e devolve na leitura', async () => {
		await enfileirarRecado(sugestao(), banco)
		const fila = await lerFilaDeRecados(banco)

		expect(fila).toHaveLength(1)
		expect(fila[0]!.mensagem).toContain('parado')
	})

	it('não duplica o mesmo recado', async () => {
		const recado = sugestao()
		await enfileirarRecado(recado, banco)
		await enfileirarRecado(recado, banco)

		expect(await lerFilaDeRecados(banco)).toHaveLength(1)
	})

	it('corta a fila no limite, mantendo os mais recentes', async () => {
		for (let i = 0; i < LIMITE_DA_FILA + 4; i++) {
			await enfileirarRecado(sugestao({ em: 1_000 + i, sinal: `sinal_${i}` }), banco)
		}

		const fila = await lerFilaDeRecados(banco)
		expect(fila).toHaveLength(LIMITE_DA_FILA)
		expect(fila[fila.length - 1]!.sinal).toBe(`sinal_${LIMITE_DA_FILA + 3}`)
	})

	it('modo pausado esvazia a ilha', async () => {
		await enfileirarRecado(sugestao(), banco)
		await salvarPreferencias({ modo: 'pausado' }, banco)

		expect(await lerRecadosDaIlha(Date.now(), banco)).toEqual([])
	})

	it('a fala da IA vem antes da regra e não repete o assunto', async () => {
		const agora = Date.now()
		await tarefaAtrasada()
		await enfileirarRecado(sugestao({ em: agora, sinal: 'tarefa_atrasada_teste' }), banco)

		const lista = await lerRecadosDaIlha(agora, banco)
		// A fala da IA existe; a regra de atraso continua existindo porque o
		// assunto é diferente (a sugestão fala de "projeto parado").
		expect(lista[0]!.origem).toBe('ia')
		expect(lista.some((recado) => recado.origem === 'regra')).toBe(true)
	})
})

describe('a ilha não depende do orçamento de notificação', () => {
	it('sem chave de IA, mostra o que as regras viram', async () => {
		await tarefaAtrasada()

		const lista = await lerRecadosDaIlha(Date.now(), banco)
		expect(lista.length).toBeGreaterThan(0)
		expect(lista[0]!.origem).toBe('regra')
		expect(lista[0]!.mensagem).toContain('atrasada')
	})

	it('não mostra o que o usuário desligou', async () => {
		await tarefaAtrasada()
		await salvarPreferencias({ gatilhosDesativados: ['tarefa_atrasada', 'atraso_critico'] }, banco)

		const lista = await lerRecadosDaIlha(Date.now(), banco)
		expect(lista.some((recado) => recado.titulo.includes('atrasada'))).toBe(false)
	})
})

describe('a ilha sobrevive ao cooldown do motor', () => {
	it('o recado continua depois de o sinal sair do painel', async () => {
		await tarefaAtrasada()

		const primeira = await lerRecadosDaIlha(Date.now(), banco)
		expect(primeira.length).toBeGreaterThan(0)

		// Quarenta segundos depois, com o motor tendo rodado várias vezes: o
		// recado continua na ilha, mesmo que o painel já não o liste.
		const segunda = await lerRecadosDaIlha(Date.now() + 40_000, banco)
		expect(segunda[0]!.id).toBe(primeira[0]!.id)
	})

	it('dispensar apaga de vez — não volta na leitura seguinte', async () => {
		await tarefaAtrasada()

		const lista = await lerRecadosDaIlha(Date.now(), banco)
		const alvo = lista[0]!
		await descartarRecado(alvo.id, banco)

		const depois = await lerRecadosDaIlha(Date.now(), banco)
		expect(depois.some((recado) => recado.id === alvo.id)).toBe(false)
	})

	it('dispensar uma vez não silencia o tipo para sempre', async () => {
		await tarefaAtrasada()
		const lista = await lerRecadosDaIlha(Date.now(), banco)
		await descartarRecado(lista[0]!.id, banco)

		// Uma tarefa NOVA (outro sinal, outra chave) precisa aparecer.
		await createTask({ title: 'Outra atrasada', dueDate: diaAtras(2) }, banco)
		const depois = await lerRecadosDaIlha(Date.now(), banco)
		expect(depois.length).toBeGreaterThan(0)
	})
})
