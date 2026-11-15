import { useState } from 'react'
import {
	FONTES,
	SEMENTES,
	aplicarTema,
	salvarTema,
	useTema,
} from '@/app/tema'
import type { FonteApp, ModoTema, PreferenciasTema } from '@/app/tema'
import { HARMONIAS, PERFIS, ehIntima, formacaoEmHex } from '@/app/motor-cromatico'
import type { Deslocamentos, Harmonia, TipoDeRoda } from '@/app/motor-cromatico'
import { Hct } from '@material/material-color-utilities'
import { Folha } from '@/ui/Folha'
import { PaginaDeAjustes } from '@/ui/PaginaDeAjustes'
import { BotaoNovaCor, SeletorDeCor } from '@/ui/SeletorDeCor'
import { RodaDeCores } from '@/ui/RodaDeCores'
import { lerFormacoes, limparFormacoes, registrarFormacao, assinaturaDaFormacao } from '@/lib/formacoes-recentes'
import type { FormacaoSalva } from '@/lib/formacoes-recentes'
import {
	IconeClaro,
	IconeEscuro,
	IconePaleta,
	IconeSistema,
	IconeTexto,
} from '@/ui/icones'

const MODOS: Array<{ valor: ModoTema; rotulo: string; icone: React.ReactNode }> = [
	{ valor: 'light', rotulo: 'Claro', icone: <IconeClaro size={18} /> },
	{ valor: 'dark', rotulo: 'Escuro', icone: <IconeEscuro size={18} /> },
	{ valor: 'system', rotulo: 'Sistema', icone: <IconeSistema size={18} /> },
]

/** Harmonias ofertadas. 'intima' é a histórica: famílias do esquema Material. */
const HARMONIAS_UI: Array<{ valor: Harmonia; rotulo: string; descricao?: string }> = [
	{ valor: 'intima', rotulo: 'Do esquema', descricao: 'As famílias que o Material já derivava da semente.' },
	...HARMONIAS,
]

/**
 * Aparência — página própria.
 *
 * ## O que esta tela controla
 *
 * Uma cor-semente, um TIPO de roda (cromática, viva, suave, pastel, sóbria,
 * neutra), uma HARMONIA entre as famílias, um modo e uma fonte. Tudo o mais —
 * tons, contraste, superfícies — é derivado no `tema.ts`, e por isso nenhuma
 * combinação escolhida aqui consegue produzir texto ilegível.
 *
 * ## Por que o "estilo da paleta" saiu
 *
 * Ele oferecia oito esquemas Material e os oito entregavam a mesma paleta,
 * porque o código sobrescrevia secundária e terciária com tons da semente. Um
 * controle que não faz nada é pior que nenhum controle: o usuário toca, nada
 * muda, e ele conclui que o app está quebrado. O tipo de roda faz o mesmo
 * trabalho de um jeito que dá para ver e testar.
 */
export function AjustesAparencia() {
	const tema = useTema()
	const corForaDaPaleta = !SEMENTES.some((s) => s.hex.toLowerCase() === tema.semente.toLowerCase())
	const [seletorCor, setSeletorCor] = useState(false)
	const [escolhendoFonte, setEscolhendoFonte] = useState(false)
	const [rodaAberta, setRodaAberta] = useState(false)
	const [formacoes, setFormacoes] = useState<string[]>([])

	const fonteAtual = FONTES.find((f) => f.valor === tema.fonte) ?? FONTES[0]!
	const perfilAtual = PERFIS.find((p) => p.valor === tema.tipo) ?? PERFIS[0]!

	/**
	 * Prévia ao vivo — SOMENTE DOM.
	 *
	 * `aplicarTema` é síncrono e pinta as variáveis direto no `<html>`, então a
	 * tela muda no mesmo quadro. Antes esta função também gravava no banco a
	 * cada 120 ms: a escrita em IndexedDB fazia o `useTema` re-renderizar o app
	 * inteiro no meio do gesto, e o arraste caía para ~16 fps (medido no
	 * navegador). Agora o banco só é tocado quando o dedo sai.
	 *
	 * `leve: true` também evita gravar o espelho em `localStorage` e mexer em
	 * classes a cada movimento.
	 */
	const prever = (patch: Partial<PreferenciasTema>, alvo?: HTMLElement | null): void => {
		aplicarTema({ ...tema, ...patch }, { leve: true, alvo })
	}

	/** Grava de uma vez o estado final (fim do gesto, troca de tipo/harmonia). */
	const gravar = (patch: Partial<PreferenciasTema>): void => {
		void salvarTema(patch)
	}

	const abrirRoda = (): void => {
		setRodaAberta(true)
		void lerFormacoes().then(setFormacoes)
	}

	const mudarTipo = (tipo: TipoDeRoda): void => {
		// Trocar o tipo NÃO zera a harmonia: são decisões independentes
		// ("que força" x "que relação"). Zerar uma ao mexer na outra fazia o
		// usuário perder a formação sem entender por quê.
		gravar({ tipo })
	}

	const mudarHarmonia = (harmonia: Harmonia): void => {
		// A harmonia nova limpa os deslocamentos à mão: a formação volta ao
		// padrão da regra, que é o que o nome do chip promete.
		gravar({ harmonia, deslocamentos: {} as Deslocamentos })
	}

	const arrastarFamilia = (familia: 'secundaria' | 'terciaria', graus: number): void => {
		prever({ deslocamentos: { ...tema.deslocamentos, [familia]: graus } })
	}

	const guardarFormacaoAtual = (preferencias: PreferenciasTema): void => {
		const formacao: FormacaoSalva = {
			semente: preferencias.semente,
			tipo: preferencias.tipo,
			harmonia: preferencias.harmonia,
			deslocamentos: preferencias.deslocamentos,
		}
		void registrarFormacao(assinaturaDaFormacao(formacao)).then(setFormacoes)
	}

	/** Aplica uma formação antiga. Recalcula tudo: nada de cor guardada. */
	const aplicarFormacao = (assinatura: string): void => {
		const [semente, tipo, harmonia, secundaria, terciaria] = assinatura.split('|')
		if (!semente || !tipo) return
		const patch = {
			semente,
			tipo: tipo as TipoDeRoda,
			harmonia: (harmonia ?? 'intima') as Harmonia,
			deslocamentos: {
				secundaria: secundaria ? Number(secundaria) : undefined,
				terciaria: terciaria ? Number(terciaria) : undefined,
			},
		}
		prever(patch)
		gravar(patch)
	}

	/** Amostras de uma formação guardada, para o chip dos recentes. */
	const amostrasDe = (assinatura: string): ReturnType<typeof formacaoEmHex> | null => {
		const [semente, tipo, harmonia, secundaria, terciaria] = assinatura.split('|')
		if (!semente) return null
		const hct = Hct.fromInt(Number.parseInt(semente.replace('#', ''), 16) | 0xff000000)
		return formacaoEmHex(hct.hue, hct.chroma, tipo as TipoDeRoda, (harmonia ?? 'intima') as Harmonia, {
			secundaria: secundaria ? Number(secundaria) : undefined,
			terciaria: terciaria ? Number(terciaria) : undefined,
		})
	}

	return (
		<PaginaDeAjustes titulo="Aparência" sobre="Tema, cor, harmonia e letra">
			<section className="secao" aria-labelledby="secao-tema">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-tema">
						Tema
					</h2>
				</div>

				<div className="linha-grupo">
					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Modo</span>
							<span className="linha-ajuste__descricao">Claro, escuro ou seguir o aparelho.</span>
						</span>
					</div>
					<div style={{ padding: '0 var(--s-4) var(--s-4)' }}>
						<div className="segmentado" role="group" aria-label="Tema">
							{MODOS.map((opcao) => (
								<button
									key={opcao.valor}
									type="button"
									className="segmentado__item"
									aria-pressed={(tema.modo ?? 'system') === opcao.valor}
									onClick={() => void salvarTema({ modo: opcao.valor })}
								>
									{opcao.icone}
									{opcao.rotulo}
								</button>
							))}
						</div>
					</div>

					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Preto puro (AMOLED)</span>
							<span className="linha-ajuste__descricao">
								Fundo realmente preto no tema escuro. Economiza bateria em tela OLED.
							</span>
						</span>
						<button
							type="button"
							role="switch"
							aria-checked={tema.amoled}
							className="interruptor"
							aria-label="Preto puro"
							onClick={() => void salvarTema({ amoled: !tema.amoled })}
						>
							<span className="interruptor__bolinha" aria-hidden="true" />
						</button>
					</div>
				</div>
			</section>

			<section className="secao" aria-labelledby="secao-cor">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-cor">
						Cor e estilo
					</h2>
				</div>

				<div className="linha-grupo">
					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Cor do app</span>
							<span className="linha-ajuste__descricao">
								Uma cor-semente gera toda a paleta. Toque para trocar.
							</span>
						</span>
					</div>
					<div className="amostra-cores" role="group" aria-label="Cor-semente">
						{SEMENTES.map((semente) => (
							<button
								key={semente.hex}
								type="button"
								className="amostra-cor"
								style={{ background: semente.hex }}
								aria-label={semente.nome}
								aria-pressed={tema.semente.toLowerCase() === semente.hex.toLowerCase()}
								onClick={() => void salvarTema({ semente: semente.hex })}
							/>
						))}

						{/* A cor em uso, quando não é uma das predefinidas: aparece como
						    amostra marcada, para o usuário ver o que está ativo. */}
						{corForaDaPaleta ? (
							<button
								type="button"
								className="amostra-cor"
								style={{ background: tema.semente }}
								aria-label={`Cor personalizada ${tema.semente}`}
								aria-pressed
								onClick={() => setSeletorCor(true)}
							/>
						) : null}

						<BotaoNovaCor onClick={() => setSeletorCor(true)} />
					</div>

					{/* A roda: o coração da tela. Fica logo abaixo das amostras porque
					    é o caminho principal — as amostras são atalhos. */}
					<button type="button" className="linha-ajuste" onClick={abrirRoda}>
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Roda de cores</span>
							<span className="linha-ajuste__descricao">
								{perfilAtual.rotulo} · arraste a cor no círculo e o app acompanha
							</span>
						</span>
						<IconePaleta size={22} />
					</button>

					<div className="tipos-de-roda" role="group" aria-label="Tipo de roda">
						{PERFIS.map((perfil) => {
							const amostras = formacaoEmHex(
								Hct.fromInt(Number.parseInt(tema.semente.replace('#', ''), 16) | 0xff000000).hue,
								Hct.fromInt(Number.parseInt(tema.semente.replace('#', ''), 16) | 0xff000000).chroma,
								perfil.valor,
								tema.harmonia,
								tema.deslocamentos,
							)
							return (
								<button
									key={perfil.valor}
									type="button"
									className="tipo-de-roda"
									aria-pressed={tema.tipo === perfil.valor}
									title={perfil.descricao}
									onClick={() => mudarTipo(perfil.valor)}
								>
									<span className="tipo-de-roda__nome">{perfil.rotulo}</span>
									<span className="tipo-de-roda__amostra" aria-hidden="true">
										<span style={{ background: amostras.primaria }} />
										<span style={{ background: amostras.secundaria }} />
										<span style={{ background: amostras.terciaria }} />
									</span>
								</button>
							)
						})}
					</div>
					<p className="nota" style={{ padding: '6px var(--s-4) 0' }}>
						{perfilAtual.descricao}
					</p>

					<div style={{ padding: 'var(--s-4) var(--s-4) 0' }}>
						<span className="campo-rotulo">Harmonia das famílias</span>
						<div className="chips chips--quebra" role="group" aria-label="Harmonia das famílias">
							{HARMONIAS_UI.map((harmonia) => (
								<button
									key={harmonia.valor}
									type="button"
									className="chip"
									aria-pressed={tema.harmonia === harmonia.valor}
									title={harmonia.descricao}
									onClick={() => mudarHarmonia(harmonia.valor)}
								>
									{harmonia.rotulo}
								</button>
							))}
						</div>
						<p className="nota" style={{ marginTop: 6 }}>
							{HARMONIAS_UI.find((h) => h.valor === tema.harmonia)?.descricao ??
								'Como a cor-semente se reparte entre acento, secundária e terciária.'}
						</p>
					</div>

					<button type="button" className="linha-ajuste" onClick={() => setEscolhendoFonte(true)}>
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Fonte</span>
							<span className="linha-ajuste__descricao">{fonteAtual.nome}</span>
						</span>
						<IconeTexto size={22} />
					</button>
				</div>
			</section>

			<SeletorDeCor
				aberto={seletorCor}
				onFechar={() => setSeletorCor(false)}
				corAtual={tema.semente}
				onEscolher={(hex) => void salvarTema({ semente: hex })}
			/>

			<Folha titulo="Fonte do app" aberta={escolhendoFonte} onFechar={() => setEscolhendoFonte(false)}>
				<div className="opcoes-criacao">
					{FONTES.map((fonte) => (
						<button
							key={fonte.valor}
							type="button"
							className="opcao-criacao"
							aria-pressed={tema.fonte === fonte.valor}
							onClick={() => {
								void salvarTema({ fonte: fonte.valor as FonteApp })
								setEscolhendoFonte(false)
							}}
						>
							<span
								className="opcao-criacao__icone"
								aria-hidden="true"
								style={{ fontFamily: fonte.pilha, fontSize: 22, fontWeight: 700 }}
							>
								Aa
							</span>
							<span className="opcao-criacao__texto">
								<span className="opcao-criacao__titulo" style={{ fontFamily: fonte.pilha }}>
									{fonte.nome}
								</span>
								<span className="opcao-criacao__descricao">
									{tema.fonte === fonte.valor ? 'Em uso agora' : 'Toque para aplicar'}
								</span>
							</span>
						</button>
					))}
				</div>
			</Folha>

			<Folha
				titulo="Roda de cores"
				sobre={perfilAtual.rotulo}
				aberta={rodaAberta}
				onFechar={() => setRodaAberta(false)}
				passo={tema.tipo}
			>
				<p className="nota" style={{ padding: '0 var(--s-4)' }}>
					Arraste o pino grande: o app repinta enquanto você move. Os pinos menores são a
					secundária e a terciária — giram com a harmonia e podem ser arrastados à mão.
				</p>

				<RodaDeCores
					tipo={tema.tipo}
					harmonia={tema.harmonia}
					deslocamentos={tema.deslocamentos}
					semente={tema.semente}
					aoArrastar={(hex, alvo) => prever({ semente: hex }, alvo)}
					aoArrastarFamilia={arrastarFamilia}
					aoSoltar={(hexFinal) => {
						// UMA escrita por gesto, com a cor em que o dedo parou.
						const patch: Partial<PreferenciasTema> = {
							semente: hexFinal,
							tipo: tema.tipo,
							harmonia: tema.harmonia,
							deslocamentos: tema.deslocamentos,
						}
						gravar(patch)
						guardarFormacaoAtual({ ...tema, ...patch })
					}}
				/>

				<div className="tipos-de-roda" role="group" aria-label="Tipo de roda">
					{PERFIS.map((perfil) => (
						<button
							key={perfil.valor}
							type="button"
							className="tipo-de-roda"
							aria-pressed={tema.tipo === perfil.valor}
							title={perfil.descricao}
							onClick={() => mudarTipo(perfil.valor)}
						>
							<span className="tipo-de-roda__nome">{perfil.rotulo}</span>
						</button>
					))}
				</div>
				<p className="nota" style={{ padding: '6px var(--s-4) 0' }}>
					{perfilAtual.descricao}
				</p>

				<div style={{ padding: 'var(--s-4) var(--s-4) 0' }}>
					<span className="campo-rotulo">Harmonia</span>
					<div className="chips chips--quebra" role="group" aria-label="Harmonia">
						{HARMONIAS_UI.map((harmonia) => (
							<button
								key={harmonia.valor}
								type="button"
								className="chip"
								aria-pressed={tema.harmonia === harmonia.valor}
								title={harmonia.descricao}
								onClick={() => mudarHarmonia(harmonia.valor)}
							>
								{harmonia.rotulo}
							</button>
						))}
					</div>
					{ehIntima(tema.harmonia) ? (
						<p className="nota" style={{ marginTop: 6 }}>
							O esquema do Material reparte a cor. Escolha uma harmonia acima para controlar as
							famílias com os pinos.
						</p>
					) : null}
				</div>

				{formacoes.length > 0 ? (
					<div style={{ padding: '0 var(--s-4) var(--s-4)' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<span className="campo-rotulo" style={{ flex: 1 }}>
								Formações recentes
							</span>
							<button
								type="button"
								className="botao-icone botao-icone--pequeno"
								aria-label="Limpar formações recentes"
								onClick={() => void limparFormacoes().then(() => setFormacoes([]))}
							>
								×
							</button>
						</div>
						<div className="amostra-cores" style={{ padding: '4px 0 0' }}>
							{formacoes.map((assinatura) => {
								const amostras = amostrasDe(assinatura)
								if (!amostras) return null
								return (
									<button
										key={assinatura}
										type="button"
										className="amostra-cor"
										style={{
											width: 56,
											borderRadius: 12,
											display: 'grid',
											gridTemplateColumns: '1fr 1fr 1fr',
											overflow: 'hidden',
										}}
										aria-label={`Aplicar a formação ${assinatura.replaceAll('|', ', ')}`}
										onClick={() => aplicarFormacao(assinatura)}
									>
										<span aria-hidden="true" style={{ background: amostras.primaria }} />
										<span aria-hidden="true" style={{ background: amostras.secundaria }} />
										<span aria-hidden="true" style={{ background: amostras.terciaria }} />
									</button>
								)
							})}
						</div>
					</div>
				) : null}

				<div className="formulario__acoes" style={{ padding: '0 var(--s-4) var(--s-4)' }}>
					<button type="button" className="botao botao--primario" onClick={() => setRodaAberta(false)}>
						Pronto
					</button>
				</div>
			</Folha>
		</PaginaDeAjustes>
	)
}
