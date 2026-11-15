import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { NexoDatabase } from '@/db/db'
import {
	createReminder,
	restaurarReminder,
	softDeleteReminder,
	updateReminder,
} from '@/db/repo'
import { criarEvento, excluirEvento, restaurarEvento } from '@/db/eventos'
import { _paraCampoLocal } from '@/ui/EditarLembrete'

/**
 * Paridade das telas — o que a Onda 2 unificou.
 *
 * Três verificações de tipos diferentes:
 *
 * 1. **Comportamento** (banco de verdade): lembrete editável/excluível e evento
 *    restaurador.
 * 2. **Contrato do componente**: o editor de lembrete converte a hora local
 *    sem passar por UTC.
 * 3. **Leitura de fonte**: cada tela usa o MESMO componente de exclusão e o
 *    MESMO editor de evento/projeto. Isso não quebra o build quando alguém
 *    volta a copiar a folha — e é justamente o defeito que não aparece em
 *    teste de lógica. Foi o recurso usado no teste do AvisoNoTopo.
 */

function fonte(caminho: string): string {
	return readFileSync(new URL(caminho, import.meta.url), 'utf-8')
}

let banco: NexoDatabase

beforeEach(async () => {
	banco = new NexoDatabase(`onda2-paridade-${crypto.randomUUID()}`)
	await banco.open()
})

afterEach(async () => {
	await banco.delete()
})

describe('lembrete: editar e excluir', () => {
	it('updateReminder muda texto e hora e limpa o aviso já mostrado', async () => {
		const lembrete = await createReminder({ text: 'Ligar para o banco', dueAt: 1000 }, banco)
		await banco.reminders.update(lembrete.id, { notificadoEm: 2000 })

		const novaHora = new Date('2026-11-20T09:30:00').getTime()
		await updateReminder(lembrete.id, { text: 'Ligar para o gerente', dueAt: novaHora, notificadoEm: null }, banco)

		const atualizado = await banco.reminders.get(lembrete.id)
		expect(atualizado?.text).toBe('Ligar para o gerente')
		expect(atualizado?.dueAt).toBe(novaHora)
		// Sem zerar, o aviso corrigido não apareceria de novo.
		expect(atualizado?.notificadoEm).toBeNull()
	})

	it('excluir é suave e o desfazer traz o mesmo lembrete de volta', async () => {
		const lembrete = await createReminder({ text: 'Pagar luz' }, banco)

		await softDeleteReminder(lembrete.id, banco)
		expect((await banco.reminders.get(lembrete.id))?.deletedAt).toBeTypeOf('number')

		await restaurarReminder(lembrete.id, banco)
		const voltou = await banco.reminders.get(lembrete.id)
		expect(voltou?.deletedAt).toBeNull()
		expect(voltou?.text).toBe('Pagar luz')
	})

	it('o campo datetime-local usa hora local, não UTC', () => {
		const ms = new Date(2026, 10, 20, 9, 5).getTime()
		expect(_paraCampoLocal(ms)).toBe('2026-11-20T09:05')
		expect(_paraCampoLocal(null)).toBe('')
	})
})

describe('evento: excluir e desfazer', () => {
	it('restaurarEvento traz o compromisso de volta', async () => {
		const evento = await criarEvento(
			{ title: 'Dentista', startAt: Date.now(), endAt: Date.now() + 3_600_000 },
			banco,
		)

		await excluirEvento(evento.id, banco)
		expect((await banco.events.get(evento.id))?.deletedAt).toBeTypeOf('number')

		await restaurarEvento(evento.id, banco)
		expect((await banco.events.get(evento.id))?.deletedAt).toBeNull()
	})
})

describe('cada tela usa o mesmo componente', () => {
	it('tarefas, projeto e agenda excluem por ExcluirComDesfazer', () => {
		for (const tela of ['../screens/Tarefas.tsx', '../screens/Projeto.tsx', '../screens/Calendario.tsx']) {
			const texto = fonte(tela)
			expect(texto).toContain('ExcluirComDesfazer')
			expect(texto).toContain('restaurarTask')
		}
	})

	it('a folha de confirmação antiga não é mais usada como caminho de exclusão', () => {
		// `ConfirmarExclusaoTarefa` continua existindo para quem quiser, mas
		// nenhuma tela deve voltar a chamá-la: ela apaga sem desfazer.
		for (const tela of ['../screens/Inicio.tsx', '../screens/Tarefas.tsx', '../screens/Projeto.tsx', '../screens/Calendario.tsx']) {
			expect(fonte(tela)).not.toContain('ConfirmarExclusaoTarefa')
		}
	})

	it('Início e painel do dia abrem o mesmo editor de evento e de lembrete', () => {
		const inicio = fonte('../screens/Inicio.tsx')
		expect(inicio).toContain("from '@/ui/EditarEvento'")
		expect(inicio).toContain("from '@/ui/EditarLembrete'")

		// O painel recebe os callbacks em vez de desenhar linha morta.
		expect(inicio).toContain('onAbrirEvento={setEditandoEvento}')
		expect(inicio).toContain('onAbrirLembrete={setEditandoLembrete}')

		const painel = fonte('../ui/PainelDoDia.tsx')
		expect(painel).toContain('onAbrirEvento')
		expect(painel).toContain('onAbrirLembrete')
	})

	it('a busca abre o evento, não só o dia', () => {
		const busca = fonte('../ui/Busca.tsx')
		expect(busca).toContain("from '@/ui/EditarEvento'")
		expect(busca).toContain("db.events.get(id)")
	})

	it('o painel do dia também conclui com desfazer, exclui e abre lembrete', () => {
		const painel = fonte('../ui/PainelDoDia.tsx')
		expect(painel).toContain('onConcluirTarefa')
		expect(painel).toContain('onExcluirTarefa')
		expect(painel).toContain('onAbrirLembrete')

		// E o Início liga os três: sem isso o painel tem botão que não faz nada.
		const inicio = fonte('../screens/Inicio.tsx')
		expect(inicio).toContain('onConcluirTarefa={concluir}')
		expect(inicio).toContain('onExcluirTarefa={setExcluindoTarefa}')
	})

	it('o menu ⋮ do lembrete abre ações, como o do hábito', () => {
		const inicio = fonte('../screens/Inicio.tsx')
		expect(inicio).toContain('setAcoesLembrete(lembrete)')
		expect(inicio).toContain('O que você quer fazer com ele')
		expect(inicio).toContain("from '@/ui/EditarLembrete'")
		// O lembrete não pode apagar sem confirmação e sem desfazer.
		expect(inicio).toContain('softDeleteReminder(alvo.id)')
		expect(inicio).toContain('restaurarReminder(alvo.id)')
	})

	it('excluir hábito passa pela confirmação nos dois caminhos', () => {
		const habitos = fonte('../screens/Habitos.tsx')
		// O menu ⋮ não pode mais apagar no toque: ele abre `excluindo`, e a
		// folha de confirmação é a única que chama `excluirHabito`.
		const menu = habitos.slice(
			habitos.indexOf('O que você quer fazer com ele'),
			habitos.indexOf('Confirmação única'),
		)
		expect(menu).toContain('setExcluindo(alvo)')
		expect(menu).not.toContain('excluirHabito')

		// Um único ponto de escrita de exclusão, e ele é a confirmação.
		expect(habitos.match(/excluirHabito\(/g)?.length).toBe(1)
	})

	it('a criação de projeto é uma só, com todos os campos', () => {
		const projetos = fonte('../screens/Projetos.tsx')
		const tarefas = fonte('../screens/Tarefas.tsx')
		const shell = fonte('../screens/Shell.tsx')

		for (const texto of [projetos, tarefas, shell]) {
			expect(texto).toContain('CriarProjeto')
		}
		// A central não mantém mais o formulário próprio de sete campos.
		expect(projetos).not.toContain('id="projeto-nome"')
	})
})
