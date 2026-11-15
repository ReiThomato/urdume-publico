import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CHAVES, apagarChave, gravarChave, lerChave, migrarChave, migrarChavesAntigas } from '@/lib/chaves'

/**
 * Chaves do aparelho com histórico de nome.
 *
 * O app já se chamou Rabisco e Nexo. Essas chaves guardam o tema já resolvido
 * (o que evita a piscada na abertura) e as últimas formações de cor. Se a leitura
 * deixasse de enxergar o nome antigo, o usuário "perderia" a configuração numa
 * atualização — sem erro na tela, só a sensação de que o app esqueceu.
 */

// `localStorage` mínimo: os testes rodam em ambiente node.
function criarStorage(): void {
	const dados = new Map<string, string>()
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (k: string) => (dados.has(k) ? dados.get(k)! : null),
			setItem: (k: string, v: string) => void dados.set(k, String(v)),
			removeItem: (k: string) => void dados.delete(k),
			clear: () => dados.clear(),
			key: (i: number) => [...dados.keys()][i] ?? null,
			get length() {
				return dados.size
			},
		},
	})
}

beforeEach(criarStorage)

afterEach(() => {
	// O último teste remove o localStorage de propósito: aqui não se assume
	// que ele existe.
	localStorage?.clear?.()
})

describe('chaves com histórico de nome', () => {
	it('lê a chave nova quando ela existe', () => {
		gravarChave(CHAVES.espelhoDoTema, 'novo')
		expect(lerChave(CHAVES.espelhoDoTema)).toBe('novo')
	})

	it('lê a chave antiga Nexo quando a nova não existe', () => {
		localStorage.setItem('nexo.tema', 'do-nexo')
		expect(lerChave(CHAVES.espelhoDoTema)).toBe('do-nexo')
	})

	it('lê a chave mais antiga Rabisco nas cores do tema', () => {
		localStorage.setItem('rabisco.tema.cores', '{"--x":"1"}')
		expect(lerChave(CHAVES.coresDoTema)).toBe('{"--x":"1"}')
	})

	it('a chave nova vence a antiga', () => {
		localStorage.setItem('nexo.tema', 'antigo')
		localStorage.setItem('urdume.tema', 'atual')
		expect(lerChave(CHAVES.espelhoDoTema)).toBe('atual')
	})

	it('migra a antiga para a nova sem apagar a antiga', () => {
		localStorage.setItem('nexo.tema', 'antigo')
		migrarChave(CHAVES.espelhoDoTema)
		expect(localStorage.getItem('urdume.tema')).toBe('antigo')
		// A antiga continua: nada do usuário é destruído na migração.
		expect(localStorage.getItem('nexo.tema')).toBe('antigo')
	})

	it('não sobrescreve a chave nova já gravada', () => {
		localStorage.setItem('nexo.tema', 'antigo')
		localStorage.setItem('urdume.tema', 'escolha-recente')
		migrarChave(CHAVES.espelhoDoTema)
		expect(localStorage.getItem('urdume.tema')).toBe('escolha-recente')
	})

	it('migra todas as chaves conhecidas de uma vez', () => {
		localStorage.setItem('nexo.tema', 'a')
		localStorage.setItem('nexo.tema.cores', 'cores')
		migrarChavesAntigas()
		expect(localStorage.getItem('urdume.tema')).toBe('a')
		expect(localStorage.getItem('urdume.tema.cores')).toBe('cores')
	})

	it('apagar remove só a chave nova', () => {
		localStorage.setItem('nexo.tema', 'antigo')
		gravarChave(CHAVES.espelhoDoTema, 'novo')
		apagarChave(CHAVES.espelhoDoTema)
		expect(localStorage.getItem('urdume.tema')).toBeNull()
		expect(localStorage.getItem('nexo.tema')).toBe('antigo')
	})

	it('sem storage, ler devolve null em vez de lançar', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: undefined,
		})
		expect(() => lerChave(CHAVES.espelhoDoTema)).not.toThrow()
		expect(() => gravarChave(CHAVES.espelhoDoTema, 'x')).not.toThrow()
	})
})
