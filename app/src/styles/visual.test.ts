import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { contraste, coresDoEsquema } from '@/app/tema'
import { PERFIS } from '@/app/motor-cromatico'
import type { TipoDeRoda } from '@/app/motor-cromatico'

/**
 * Contrato visual da Onda 3 (auditoria `02-visual-e-toque.md`).
 *
 * Estes testes travam o que a correção prometeu e o que é fácil de desfazer sem
 * perceber:
 *
 *   1. `--on-accent` e `--text-suave` existem e não voltam a ser `--primary`;
 *   2. as classes usadas no TSX têm CSS (eram 17 promessas sem estilo);
 *   3. nenhum alvo interativo declarado por classe fica abaixo de 44;
 *   4. o contraste calculado com o MESMO motor do app passa AA nas 9 sementes.
 *
 * São testes de leitura de fonte, de propósito: o que eles protegem é a
 * intenção escrita no CSS, não o pixel renderizado (que exige aparelho).
 */

const css = (nome: string): string =>
	readFileSync(new URL(`../styles/${nome}`, import.meta.url), 'utf-8')

const TOKENS = css('tokens.css')
const APP = css('app.css')
const TELAS = css('telas.css')
const FOLHA = css('folha.css')
const NAV = css('nav.css')
const TUDO = [TOKENS, APP, TELAS, FOLHA, NAV].join('\n')

/**
 * O CSS sem comentários.
 *
 * Várias asserções são "esta string NÃO aparece" — e os comentários explicam o
 * defeito antigo citando exatamente o valor proibido (`gap: 0`,
 * `--app-bar-h`). Sem tirar comentário, o teste acusa a própria explicação.
 */
const semComentario = (texto: string): string => texto.replace(/\/\*[\s\S]*?\*\//g, '')

const CSS = semComentario(TUDO)

/** Valor declarado de uma variável em `:root` (primeira ocorrência). */
function token(nome: string): string | undefined {
	const achado = TOKENS.match(new RegExp(`${nome}:\\s*([^;]+);`))
	return achado?.[1]?.trim()
}

describe('tokens semânticos de texto', () => {
	it('--on-accent existe, tem valor sólido de segurança e deriva do acento', () => {
		const solido = token('--on-accent')
		expect(solido).toMatch(/^#[0-9a-f]{6}$/i)

		// A versão calculada entra sob @supports, para o WebView antigo não ficar
		// sem cor nenhuma.
		expect(TOKENS).toMatch(/@supports \(color: color-mix/)
		expect(TOKENS).toContain('--on-accent: color-mix(in srgb, var(--primary) 50%, var(--on-surface))')
	})

	it('--text-suave existe e deriva da tinta secundária', () => {
		const solido = token('--text-suave')
		expect(solido).toMatch(/^#[0-9a-f]{6}$/i)
		expect(TOKENS).toContain('--text-suave: color-mix(in srgb, var(--on-surface-variant) 90%, var(--background))')
	})

	it('--primary NÃO é mais usado como cor de texto legível', () => {
		// Fundo de botão, ponto, filete e barra continuam com `--primary`; o que
		// não pode voltar é `color: var(--primary)` em texto. `accent-color` e
		// `border-color` (controles nativos, contornos) são legítimos.
		const proibidos = CSS
			.split('\n')
			.filter((linha) => /(?<![a-z-])color:\s*var\(--primary\)/.test(linha))

		expect(proibidos).toEqual([])
	})

	it('os tokens de tipografia que faltavam existem', () => {
		expect(token('--text-base')).toBeDefined()
		expect(token('--text-md')).toBeDefined()
		// E nenhuma declaração usa um `--text-*` que não exista.
		const usados = new Set([...TUDO.matchAll(/var\((--text-[a-z-]+)\)/g)].map((m) => m[1]))
		for (const nome of usados) {
			expect(token(nome!), `token ${nome} usado mas não declarado`).toBeDefined()
		}
	})

	it('o token fictício --app-bar-h não voltou', () => {
		expect(semComentario(TOKENS)).not.toContain('--app-bar-h')
		expect(CSS).not.toContain('var(--app-bar-h)')
	})
})

describe('seletor de provedor de IA', () => {
	/*
	 * Cinco provedores com o rótulo completo não cabem numa fileira: a 412 px,
	 * o grupo de 348 px dava 67 px por item e "OpenRouter" (74 px) aparecia
	 * cortado. A correção tem duas metades, e o teste guarda as duas — uma
	 * sozinha não resolve.
	 */
	it('o grupo quebra em colunas em vez de cortar o rótulo', () => {
		expect(CSS).toContain('.segmentado--quebra')
		expect(CSS).toMatch(/\.segmentado--quebra\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit/)
		// O item não pode continuar com `flex: 1 1 0`, que corta com reticências.
		expect(CSS).toMatch(/\.segmentado--quebra > \.segmentado__item\s*\{[^}]*min-width: 0/)
	})

	it('o rótulo curto cabe e o nome completo continua acessível', async () => {
		const { readFileSync } = await import('node:fs')
		const secao = readFileSync(new URL('../ui/SecaoJarvis.tsx', import.meta.url), 'utf-8')
		const { LISTA_DE_PROVEDORES } = await import('@/lib/jarvis/provedores')

		expect(secao).toContain('PROVEDORES[qual].curto')
		// O nome completo no aria-label: leitor de tela não perde "ChatGPT".
		expect(secao).toContain('aria-label={PROVEDORES[qual].nome}')
		expect(secao).toContain('segmentado--quebra')

		for (const provedor of LISTA_DE_PROVEDORES) {
			expect(provedor.curto.length, `${provedor.id} sem rótulo curto`).toBeGreaterThan(2)
			expect(provedor.curto.length, `${provedor.id}: rótulo curto longo demais`).toBeLessThanOrEqual(10)
		}
	})
})

describe('alvos de toque', () => {
	/** `min-height`/`min-width`/`height`/`width` de uma regra, resolvidos. */
	function medidas(seletor: string, arquivo = TELAS): { altura?: number; largura?: number } {
		const bloco = arquivo.match(new RegExp(`\\n${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
		if (!bloco) return {}
		const corpo = bloco[1]!
		const ler = (prop: string): number | undefined => {
			const bruto = corpo.match(new RegExp(`(?:^|\\n)\\s*(?:min-)?${prop}:\\s*([^;]+);`))?.[1]
			if (!bruto) return undefined
			const px = bruto.match(/^var\(--([a-z-]+)\)$/)
			if (px) {
				const valor = token(`--${px[1]}`)
				const numero = valor?.match(/^(\d+)px$/)
				return numero ? Number(numero[1]) : undefined
			}
			const numero = bruto.match(/^(\d+)px$/)
			return numero ? Number(numero[1]) : undefined
		}
		return { altura: ler('height'), largura: ler('width') }
	}

	it('--toque é 44, o mínimo da WCAG 2.5.5', () => {
		expect(token('--toque')).toBe('44px')
	})

	it('o atalho da tarefa tem alvo de 44 mesmo com desenho de 32', () => {
		// O desenho de 32 preserva a largura do título; o `::after` de 6 px por
		// lado leva o alvo a 44.
		const atalho = medidas(String.raw`.tarefa__atalho`)
		expect(atalho.altura).toBe(32)
		expect(TELAS).toMatch(/\.tarefa__atalho::after\s*\{[^}]*inset:\s*-6px/)

		const acoes = semComentario(TELAS).match(/\.tarefa__acoes\s*\{([^}]*)\}/)?.[1] ?? ''
		expect(acoes).toMatch(/gap:\s*var\(--s-3\)/)
		expect(acoes).not.toMatch(/gap:\s*0[;\s]/)
	})

	it('a marca do hábito tem 44 de lado', () => {
		const marca = medidas(String.raw`.habito__marca`)
		expect(marca.altura).toBe(44)
		expect(marca.largura).toBe(44)
	})

	it('os seis botões do editor de blocos não ficam a 2 px um do outro', () => {
		const acoes = semComentario(TELAS).match(/\.editor-blocos__acoes\s*\{([^}]*)\}/)?.[1] ?? ''
		expect(acoes).not.toMatch(/gap:\s*2px/)
		expect(acoes).toMatch(/gap:\s*var\(--s-/)
	})

	it('o botão de ícone pequeno expande o alvo para 44 sem inflar o desenho', () => {
		expect(APP).toMatch(/\.botao-icone--pequeno\s*\{[^}]*width:\s*var\(--toque-desenho\)/)
		expect(APP).toMatch(/\.botao-icone--pequeno::after\s*\{[^}]*inset:/)
		// A duplicata de `telas.css` que sobrescrevia sem `::after` saiu.
		expect(semComentario(TELAS)).not.toMatch(/\.botao-icone--pequeno\s*\{[^}]*height:\s*36px/)
	})

	it('o aviso de desfazer não cobre mais o botão de conversar', () => {
		// A pilha de flutuantes fica acima do aviso (46 > 45).
		const fab = semComentario(APP).match(/\.fab-area\s*\{([^}]*)\}/)?.[1] ?? ''
		expect(fab).toMatch(/z-index:\s*46/)

		// E o aviso começa acima do topo da pilha.
		const desfazer = semComentario(APP).match(/\n\.desfazer\s*\{([^}]*)\}/)?.[1] ?? ''
		expect(desfazer).toMatch(/bottom:\s*calc\(var\(--nav-h\) \+ var\(--fab-pilha\)/)
	})
})

describe('classes usadas no TSX têm CSS', () => {
	/**
	 * As 17 classes de O-15. Algumas viraram CSS de verdade; as que falavam de
	 * estado (`linha__titulo--riscado`) ganharam regra própria. O teste garante
	 * que nenhuma volte a ser só promessa.
	 */
	const CLASSES = [
		'botao--compacto',
		'botao--secundario',
		'campo-linha',
		'chip--remover',
		'confirmacao',
		'etiquetas-lista',
		'etiquetas-sugeridas',
		'formulario__acoes--entre',
		'indicador__rotulo',
		'linha-ajuste--sem-borda',
		'linha__titulo--riscado',
		'subtarefas__lista',
		'cartao--linha-do-dia',
		'agenda-bloco--tarefa',
		'conversa__confirmacao',
		'jarvis-sugestao__acoes',
	]

	for (const classe of CLASSES) {
		it(`.${classe}`, () => {
			expect(TUDO).toContain(`.${classe}`)
		})
	}
})

describe('contraste AA com o motor real do app', () => {
	// Mesmo algoritmo de `tema.ts`, e mesmas sementes de Ajustes.
	const SEMENTES = [
		'#d96c47', '#e8623f', '#e9a13b', '#7a9e52', '#3f9e8b',
		'#4a7fd4', '#7d5cc6', '#c2557f', '#6f6a63',
	]

	/** `color-mix(in srgb, a p%, b)` em sRGB, como o WebView compõe. */
	function mistura(a: number, b: number, peso: number): number {
		const canal = (deslocamento: number): number => {
			const va = (a >> deslocamento) & 255
			const vb = (b >> deslocamento) & 255
			return Math.round(va * peso + vb * (1 - peso))
		}
		return 0xff000000 | (canal(16) << 16) | (canal(8) << 8) | canal(0)
	}

	/**
	 * Todas as combinações de tipo de roda e tema.
	 *
	 * Cada uma é uma paleta REAL do app: se um tipo novo entrar em PERFIS, ele
	 * é testado aqui automaticamente — não há lista para esquecer de atualizar.
	 */
	const COMBINACOES: Array<{ tipo: TipoDeRoda; escuro: boolean }> = PERFIS.flatMap((perfil) => [
		{ tipo: perfil.valor, escuro: false },
		{ tipo: perfil.valor, escuro: true },
	])

	it('--on-accent passa 4,5:1 sobre todas as superfícies, nos 6 tipos e nos 2 temas', () => {
		const piores: string[] = []
		for (const { tipo, escuro } of COMBINACOES) {
			for (const semente of SEMENTES) {
				const cores = coresDoEsquema(
					{
						modo: 'light',
						amoled: false,
						semente,
						tipo,
						harmonia: 'intima',
						deslocamentos: {},
						fonte: 'figtree',
					},
					escuro,
				)
				// A tinta agora vem CALCULADA pelo tema — o teste mede o que o app
				// publica, não uma cópia da fórmula.
				const onAccent = cores.onAccent!

				const superficiesDoTema = [
					cores.background!,
					cores.surfaceContainer!,
					cores.surfaceContainerHigh!,
					cores.surfaceContainerHighest!,
					cores.primaryContainer!,
				]

				for (const superficie of superficiesDoTema) {
					const razao = contraste(onAccent, superficie)
					if (razao < 4.5) {
						piores.push(`${tipo} ${semente} ${escuro ? 'escuro' : 'claro'}: ${razao.toFixed(2)}`)
					}
				}
			}
		}
		expect(piores).toEqual([])
	})

	it('--text-suave passa 4,5:1 sobre todas as superfícies, nos 6 tipos', () => {
		const piores: string[] = []
		for (const { tipo, escuro } of COMBINACOES) {
			for (const semente of SEMENTES) {
				const cores = coresDoEsquema(
					{
						modo: 'light',
						amoled: false,
						semente,
						tipo,
						harmonia: 'intima',
						deslocamentos: {},
						fonte: 'figtree',
					},
					escuro,
				)
				const suave = mistura(cores.onSurfaceVariant!, cores.background!, 0.9)

				// `--text-suave` é usado sobre superfícies de conteúdo
				// (`background`, `surface-container*`), nunca sobre o container do
				// acento — esse par é do `--on-accent`.
				for (const superficie of [
					cores.background!,
					cores.surfaceContainer!,
					cores.surfaceContainerHigh!,
					cores.surfaceContainerHighest!,
				]) {
					const razao = contraste(suave, superficie)
					if (razao < 4.5) piores.push(`${tipo} ${semente} ${escuro ? 'escuro' : 'claro'}: ${razao.toFixed(2)}`)
				}
			}
		}
		expect(piores).toEqual([])
	})

	it('o botão Fechar do aviso de erro tem contraste de texto', () => {
		expect(APP).toMatch(/\.desfazer--erro \.botao--texto\s*\{[^}]*color:\s*var\(--on-error-container\)/)
		// E a regra genérica do `.desfazer` continua existindo para o aviso normal.
		expect(APP).toMatch(/\.desfazer \.botao--texto\s*\{[^}]*color:\s*var\(--inverse-primary\)/)
	})
})

describe('movimento', () => {
	it('as transições de interação ficam em 200 ms ou menos', () => {
		// `--dur-slow` (320) só pode ser usado em animação de entrada/saída de
		// conteúdo, nunca em `:active`. Aqui o gate é: nenhum `:active` com
		// duração maior que `--dur`.
		const regras = TUDO.split('}').filter((bloco) => bloco.includes(':active'))
		for (const regra of regras) {
			const duracoes = [...regra.matchAll(/transition:[^;]*?(var\(--dur-slow\)|\d{2,}ms)/g)]
				.map((m) => m[1])
				.filter(Boolean)
			expect(duracoes, `regra :active com transição longa: ${regra.slice(0, 80)}`).toEqual([])
		}
	})

	it('a entrada de lista existe e respeita movimento reduzido', () => {
		expect(APP).toContain('@keyframes entra-item')
		expect(APP).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tarefa,/)
	})

	it('o movimento reduzido do APP desliga tudo (não só o do sistema)', () => {
		expect(TOKENS).toMatch(/:root\[data-movimento='reduzido'\][\s\S]*?animation: none !important/)
	})

	it('a folha entra em 240 ms, abaixo do teto de 320', () => {
		expect(FOLHA).toMatch(/animation: folha-sobe 240ms/)
	})
})

describe('área segura e teclado', () => {
	it('o cabeçalho continua abaixo da barra de status', () => {
		expect(APP).toMatch(/\.topo\s*\{[^}]*top:\s*env\(safe-area-inset-top\)/)
	})

	it('a folha usa a altura realmente visível e tem fallback', () => {
		expect(FOLHA).toMatch(/max-height:\s*var\(--folha-altura, 100%\)/)
		// Fallback sem JS: o fundo da folha é `inset: 0`, então 100% é a janela.
		expect(FOLHA).toMatch(/\.folha-fundo\s*\{[^}]*inset:\s*0/)
	})

	it('a tela e o shell aceitam a altura visível publicada pelo JS', () => {
		expect(APP).toMatch(/\.tela\s*\{[^}]*min-height:\s*var\(--altura-visivel, 100dvh\)/)
		expect(NAV).toMatch(/\.shell\s*\{[^}]*min-height:\s*var\(--altura-visivel, 100dvh\)/)
	})

	it('a barra inferior sai da frente do teclado', () => {
		expect(NAV).toContain(":root[data-teclado='aberto'] .navegacao")
	})
})

describe('barra de status do Android (sem plugin)', () => {
	const raiz = new URL('../../android/app/src/main/res/', import.meta.url)

	it('o tema claro pede ícones escuros e o escuro pede claros', () => {
		const claro = readFileSync(new URL('values/styles.xml', raiz), 'utf-8')
		const escuro = readFileSync(new URL('values-night/styles.xml', raiz), 'utf-8')

		expect(claro).toMatch(/android:windowLightStatusBar">true</)
		expect(escuro).toMatch(/android:windowLightStatusBar">false</)
	})

	it('o splash usa a mesma cor de fundo do app', () => {
		const cores = readFileSync(new URL('values/colors.xml', raiz), 'utf-8')
		expect(cores).toContain('<color name="urdumeFundo">#fff4f1</color>')
		expect(cores).toContain('<color name="urdumeFundoEscuro">#171211</color>')

		const estilo = readFileSync(new URL('values/styles.xml', raiz), 'utf-8')
		expect(estilo).toContain('@color/urdumeFundo')
	})
})
