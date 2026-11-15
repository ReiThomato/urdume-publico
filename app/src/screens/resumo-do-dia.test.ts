import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O resumo do dia é UM cartão.
 *
 * A primeira tentativa de "expandir o repertório" empilhou cartões de hábitos,
 * atrasadas, agenda e lembretes embaixo do resumo. O dono do app descreveu
 * como "um câncer acoplado": era feio, não seguia o padrão da tela e repetia
 * números e seções que já existem logo abaixo.
 *
 * O que ele pediu foi expandir o que o resumo CONTA — e isso cabe na segunda
 * linha de texto do cartão que já existia. Este teste lê o fonte de propósito:
 * é uma regra de desenho, e o jeito de não voltar é não voltar o código.
 */
const raiz = join(import.meta.dirname, '..')
const inicio = readFileSync(join(raiz, 'screens/Inicio.tsx'), 'utf8')
const telas = readFileSync(join(raiz, 'styles/telas.css'), 'utf8')

describe('resumo do dia', () => {
	it('não cria uma grade de cartões extras', () => {
		expect(inicio).not.toContain('resumo-fatias')
		expect(inicio).not.toContain('resumo-fatia')
		expect(telas).not.toContain('.resumo-fatias')
		expect(telas).not.toContain('.resumo-fatia {')
	})

	it('continua sendo o cartão único, com número e duas linhas', () => {
		const bloco = inicio.slice(inicio.indexOf("bloco.tipo === 'resumo'"))
		const fim = bloco.indexOf("bloco.tipo === 'tarefas'")
		const trecho = bloco.slice(0, fim)

		// Um contêiner só.
		expect(trecho.match(/className="resumo-hoje"/g)).toHaveLength(1)
		expect(trecho).toContain('resumo-hoje__numero')
		expect(trecho).toContain('resumo-hoje__texto')
	})

	it('conta hábitos, agenda e atraso na segunda linha', () => {
		const bloco = inicio.slice(inicio.indexOf("bloco.tipo === 'resumo'"))
		const fim = bloco.indexOf("bloco.tipo === 'tarefas'")
		const trecho = bloco.slice(0, fim)

		expect(trecho).toContain('hábitos')
		expect(trecho).toContain('na agenda')
		expect(trecho).toContain('atrasada')
	})
})
