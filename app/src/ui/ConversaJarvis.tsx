import { useEffect, useRef, useState } from 'react'
import { db } from '@/db/db'
import { toDayKey } from '@/db/repo'
import { createId } from '@/db/id'
import type { AiChatMessage } from '@/db/db'
import { Topo } from '@/ui/AppShell'
import { Folha } from '@/ui/Folha'
import { useRouter } from '@/app/router'
import { IconeEnviar, IconeDesfazer, IconeVoltar } from '@/ui/icones'
import { lerPainel } from '@/lib/jarvis/motor'
import { lerPreferencias, dentroDosLimites, registrarExecucao } from '@/lib/jarvis/estado'
import { lerRetrato } from '@/lib/jarvis/leitura'
import { avaliarTudo } from '@/lib/jarvis/sinais'
import { consultar } from '@/lib/jarvis/ia'
import type { RespostaDaIA } from '@/lib/jarvis/ia'
import { avaliarLote, desfazerLote, executarLote, ultimoLoteDesfazivel } from '@/lib/jarvis/executor'
import type { AvaliacaoDaAcao } from '@/lib/jarvis/executor'
import { lerProvedor, temChaveApi } from '@/lib/jarvis/segredo'
import { PROVEDORES } from '@/lib/jarvis/provedores'
import { estaOnline } from '@/lib/jarvis/rede'
import { enfileirar, idadeDoContexto, listarFila, removerDaFila } from '@/lib/jarvis/fila'
import type { PedidoNaFila } from '@/lib/jarvis/fila'
import { textosDeConhecimento } from '@/lib/jarvis/conhecimento'

/**
 * Conversa com o Jarvis — a camada consultiva.
 *
 * Só é chamada quando o usuário pede ou quando um sinal marcado como
 * `precisaIA` é analisado. A conversa NÃO vira gatilho de autonomia: as ações
 * continuam passando pelo executor e pela confirmação.
 *
 * Era uma folha modal e virou TELA. A folha obrigava a abrir, conversar e
 * fechar; com uso frequente, o teclado cobria metade dela e a conversa sumia
 * atrás do fundo. Em tela cheia, a conversa ocupa o espaço todo, o campo fica
 * no rodapé acima do teclado e o histórico respira.
 *
 * Três estados: conversa, prévia de ações e resultado. A prévia é obrigatória
 * em toda ação que o executor classificou como "confirmar".
 */

interface Props {
	/** Pedido inicial, quando a conversa nasce de um cartão do painel. */
	semente?: string | null
	onVoltar: () => void
}

export function ConversaJarvis({ semente, onVoltar }: Props) {
	const { navigate } = useRouter()
	const [mensagens, setMensagens] = useState<AiChatMessage[]>([])
	const [texto, setTexto] = useState('')
	const [carregando, setCarregando] = useState(false)
	const [erro, setErro] = useState<string | null>(null)
	const [pendente, setPendente] = useState<{ avaliacoes: AvaliacaoDaAcao[]; mensagem: string } | null>(null)
	const [loteDesfazer, setLoteDesfazer] = useState<string | null>(null)
	const [temChave, setTemChave] = useState(true)
	const [fila, setFila] = useState<PedidoNaFila[]>([])
	const fimRef = useRef<HTMLDivElement>(null)
	const campoRef = useRef<HTMLTextAreaElement>(null)

	// O campo cresce com o texto até um teto. `field-sizing: content` faz isso
	// sozinho, mas só existe em WebView recente; medir o `scrollHeight` vale em
	// qualquer versão e evita o campo de uma linha com texto cortado.
	useEffect(() => {
		const campo = campoRef.current
		if (!campo) return
		campo.style.height = 'auto'
		campo.style.height = `${Math.min(campo.scrollHeight, 132)}px`
	}, [texto])

	/**
	 * Altura real da área visível.
	 *
	 * A tela trava a altura para o histórico rolar por dentro. No Android, o
	 * teclado NÃO encolhe o viewport de layout: ele abre sobre o campo e o
	 * usuário digita às cegas. `visualViewport` é a única fonte que reflete o
	 * que está de fato visível — quando o teclado abre, ela encolhe e a barra
	 * inferior (escondida atrás do teclado) deixa de ser descontada.
	 */
	useEffect(() => {
		const janela = window.visualViewport
		const raiz = document.documentElement
		if (!janela) return

		const aplicar = (): void => {
			const tecladoAberto = window.innerHeight - janela.height > 120
			raiz.style.setProperty('--altura-visivel', `${Math.round(janela.height)}px`)
			raiz.style.setProperty('--conversa-desconto', tecladoAberto ? '0px' : '')
			// Com o teclado aberto, a última bolha precisa continuar visível.
			if (tecladoAberto) fimRef.current?.scrollIntoView({ block: 'end' })
		}

		aplicar()
		janela.addEventListener('resize', aplicar)
		janela.addEventListener('scroll', aplicar)
		return () => {
			janela.removeEventListener('resize', aplicar)
			janela.removeEventListener('scroll', aplicar)
			raiz.style.removeProperty('--altura-visivel')
			raiz.style.removeProperty('--conversa-desconto')
		}
	}, [])

	useEffect(() => {
		void (async () => {
			setTemChave(await temChaveApi(db))
			const historico = await db.aiChat.orderBy('em').limit(60).toArray()
			setMensagens(historico)
			const lote = await ultimoLoteDesfazivel(db)
			setLoteDesfazer(lote?.id ?? null)
			setFila(await listarFila(db))
		})()
	}, [])

	useEffect(() => {
		if (semente) setTexto(semente)
	}, [semente])

	useEffect(() => {
		fimRef.current?.scrollIntoView({ block: 'end' })
	}, [mensagens, pendente, carregando])

	/** Envia o texto do campo. */
	async function enviar(): Promise<void> {
		const pergunta = texto.trim()
		if (!pergunta || carregando) return
		await enviarCom(pergunta)
	}

	/**
	 * Envia uma pergunta já conhecida.
	 *
	 * Existe separado de `enviar` porque a fila precisa enviar um texto que não
	 * está no campo — e ler `texto` do estado logo depois de `setTexto` daria
	 * o valor antigo (o React não atualiza antes do próximo render).
	 */
	async function enviarCom(pergunta: string): Promise<void> {
		if (!pergunta.trim() || carregando) return

		setErro(null)

		// Sem rede declarada, nem tenta: guarda o pedido e diz o que fazer.
		// Insistir aqui só produz erro de rede e a sensação de app quebrado.
		if (!estaOnline()) {
			await guardarNaFila(pergunta)

			// Monta UMA mensagem de cada lado e grava as duas no banco. Antes a
			// resposta existia em duas versões — uma na tela, outra no histórico
			// — e reabrir a conversa mostrava um texto diferente do que foi lido.
			const minha: AiChatMessage = { id: createId(), em: Date.now(), papel: 'usuario', texto: pergunta }
			const dela: AiChatMessage = {
				id: createId(),
				em: Date.now(),
				papel: 'jarvis',
				texto:
					'Estou sem internet. Guardei seu pedido e, quando a conexão voltar, pergunto se você quer que eu responda com o contexto de agora.',
			}

			setMensagens((atuais) => [...atuais, minha, dela])
			await db.aiChat.put(minha)
			await db.aiChat.put(dela)
			setTexto('')
			return
		}

		setCarregando(true)
		setTexto('')

		const minha: AiChatMessage = {
			id: createId(),
			em: Date.now(),
			papel: 'usuario',
			texto: pergunta,
		}
		setMensagens((atuais) => [...atuais, minha])
		await db.aiChat.put(minha)

		try {
			const prefs = await lerPreferencias(db)
			const agora = Date.now()
			const limites = await dentroDosLimites(prefs, agora, db)

			if (!limites.permitido) {
				setErro(limites.motivo)
				return
			}

			const dia = toDayKey(new Date(agora))
			const retrato = await lerRetrato(
				{ agora, hoje: dia, projetosIgnorados: prefs.projetosIgnorados },
				db,
			)
			const painel = await lerPainel(dia, db)
			const sinais = painel?.itens.map((item) => item.sinal) ?? avaliarTudo(retrato)
			const nomesDeProjeto = Object.fromEntries(retrato.projetos.map((projeto) => [projeto.id, projeto.nome]))

			const [personalidade, conhecimento] = await Promise.all([
				lerPreferencias(db).then((prefs) => prefs.personalidade),
				textosDeConhecimento(db),
			])

			// O provedor ativo decide endpoint, modelo e nome do campo de saída.
			// Antes era fixo na DeepSeek, e uma chave da Deploy dava 401.
			const provedorAtivo = await lerProvedor(db)

			const resultado = await consultar(
				{
					retrato,
					sinais,
					pergunta,
					nomesDeProjeto,
					personalidade,
					conhecimento,
				},
				{ provedor: provedorAtivo },
			)

			await registrarExecucao(
				{
					em: Date.now(),
					origem: 'usuario',
					modelo: PROVEDORES[provedorAtivo].modelo,
					entradaTokens: resultado.entradaTokens,
					saidaTokens: resultado.saidaTokens,
					custoUsd: resultado.custoUsd,
					duracaoMs: resultado.duracaoMs,
					ok: resultado.ok,
					erro: resultado.erro,
					sinais: sinais.slice(0, 8).map((sinal) => sinal.id),
					acoes: resultado.resposta?.acoes.length ?? 0,
				},
				db,
			)

			if (!resultado.ok || !resultado.resposta) {
				// Falha transitória (rede caiu no meio, 5xx, timeout): guarda o
				// pedido em vez de perdê-lo. Chave recusada não entra na fila:
				// enfileirar não resolve credencial errada.
				const transitorio = !resultado.erro || !/chave/i.test(resultado.erro)
				if (transitorio) {
					await guardarNaFila(pergunta)
					setErro(
						`${resultado.erro ?? 'Não consegui responder agora.'} Guardei o pedido para tentar de novo quando a conexão voltar.`,
					)
				} else {
					setErro(resultado.erro)
				}
				return
			}

			const resposta = resultado.resposta
			await guardarResposta(resposta)

			if (resposta.acoes.length > 0) {
				const { avaliacoes, erroDoLote } = avaliarLote(resposta.acoes, prefs.autonomia)
				if (erroDoLote) setErro(erroDoLote)
				else setPendente({ avaliacoes, mensagem: resposta.mensagem })
			}
		} catch (causa) {
			setErro(causa instanceof Error ? causa.message : 'Falha ao falar com a IA.')
		} finally {
			setCarregando(false)
		}
	}

	async function guardarResposta(resposta: RespostaDaIA): Promise<void> {
		const dela: AiChatMessage = {
			id: createId(),
			em: Date.now(),
			papel: 'jarvis',
			texto: resposta.mensagem || 'Sem sugestões agora.',
			meta: { acoes: resposta.acoes.length },
		}
		setMensagens((atuais) => [...atuais, dela])
		await db.aiChat.put(dela)
	}

	/**
	 * Guarda o pedido que não pôde ser atendido.
	 *
	 * O contexto que acompanha é a idade do retrato no momento da falha — é o
	 * que permite responder depois dizendo honestamente que o dado é antigo.
	 */
	async function guardarNaFila(pergunta: string): Promise<void> {
		const dia = toDayKey(new Date())
		await enfileirar(pergunta, { dia, retratoEm: Date.now(), origem: 'usuario' }, db)
		setFila(await listarFila(db))
	}

	/**
	 * Responde um pedido que ficou na fila.
	 *
	 * Envia de verdade — antes só preenchia o campo, e o botão dizia "Perguntar
	 * agora". O contexto usado é o de AGORA, não o congelado: o usuário está
	 * aqui e vê o estado atual da tela, então seria pior responder com dado de
	 * ontem sem ele ter pedido isso.
	 */
	async function responderDaFila(item: PedidoNaFila): Promise<void> {
		await removerDaFila(item.id, db)
		setFila(await listarFila(db))
		setTexto(item.pedido)

		// Pequeno atraso para o campo refletir o texto antes do envio.
		await new Promise((resolver) => setTimeout(resolver, 60))
		await enviarCom(item.pedido)
	}

	async function confirmar(): Promise<void> {
		if (!pendente) return
		const permitidas = pendente.avaliacoes.filter((avaliacao) => avaliacao.risco !== 'proibido')
		if (permitidas.length === 0) {
			setErro('Nenhuma ação podia ser executada.')
			setPendente(null)
			return
		}

		setCarregando(true)
		try {
			const resultado = await executarLote(
				permitidas.map((avaliacao) => avaliacao.acao),
				db,
			)

			const aviso: AiChatMessage = {
				id: createId(),
				em: Date.now(),
				papel: 'jarvis',
				texto:
					resultado.executadas > 0
						? `${resultado.executadas} ${resultado.executadas === 1 ? 'ação feita' : 'ações feitas'}. Dá para desfazer por 24 h.`
						: (resultado.erro ?? 'Nada foi feito.'),
			}
			setMensagens((atuais) => [...atuais, aviso])
			await db.aiChat.put(aviso)
			setLoteDesfazer(resultado.loteId)
		} finally {
			setCarregando(false)
			setPendente(null)
		}
	}

	async function desfazer(): Promise<void> {
		// Sempre pergunta qual lote: "desfazer" sem contexto é o caminho mais
		// curto para apagar algo que o usuário queria manter.
		if (!loteDesfazer) return
		const confirmado = window.confirm('Desfazer as últimas ações da IA e voltar ao estado anterior?')
		if (!confirmado) return

		const resultado = await desfazerLote(loteDesfazer, db)
		setLoteDesfazer(null)
		const aviso: AiChatMessage = {
			id: createId(),
			em: Date.now(),
			papel: 'jarvis',
			texto: resultado.ok ? 'Desfeito. Tudo voltou ao estado anterior.' : (resultado.erro ?? 'Não foi possível desfazer.'),
		}
		setMensagens((atuais) => [...atuais, aviso])
		await db.aiChat.put(aviso)
	}

	return (
		<div className="tela tela--conversa">
			<Topo
				titulo="Jarvis"
				sobre="Conversa com o resumo do app. Notas e desenhos não saem do aparelho."
				acoes={
					<button
						type="button"
						className="botao-icone"
						aria-label="Voltar"
						title="Voltar"
						onClick={onVoltar}
					>
						<IconeVoltar size={22} />
					</button>
				}
			/>

			<div className="conteudo conteudo--conversa">
				<div className="conversa">
					{/* Só o histórico rola. O campo fica fora dele, preso no rodapé,
					    para nunca sair da tela — era isso que acontecia quando a
					    confirmação e o campo viviam no mesmo fluxo rolável. */}
					<div className="conversa__historico" data-mensagens={mensagens.length > 0 ? 'sim' : 'nao'}>
						{fila.length > 0 ? (
							<div className="conversa__fila">
								<p className="conversa__fila-titulo">
									{fila.length === 1 ? '1 pedido guardado' : `${fila.length} pedidos guardados`}
								</p>
								<p className="nota">
									Ficaram sem resposta por falta de conexão. Responder agora usa o contexto de{' '}
									{idadeDoContexto(fila[0]!)}, então eu digo isso na resposta.
								</p>
								<ul>
									{fila.map((item) => (
										<li key={item.id}>
											<span>{item.pedido}</span>
											<button
												type="button"
												className="botao botao--texto"
												onClick={() => void responderDaFila(item)}
											>
												Perguntar agora
											</button>
										</li>
									))}
								</ul>
							</div>
						) : null}

						{mensagens.length === 0 ? (
							<p className="nota">
								Pergunte o que quiser sobre o dia: “o que eu deixo para amanhã?”, “como
								destravo a reforma?”. Se houver ação a fazer, ela aparece para você aprovar
								antes.
							</p>
						) : (
							<ul className="conversa__lista">
								{mensagens.map((mensagem) => (
									<li
										key={mensagem.id}
										className={
											mensagem.papel === 'usuario'
												? 'conversa__fala conversa__fala--minha'
												: 'conversa__fala'
										}
									>
										{mensagem.texto}
									</li>
								))}
							</ul>
						)}

						{carregando ? <p className="nota">Pensando…</p> : null}
						<div ref={fimRef} />
					</div>

					<div className="conversa__composer">
						{erro ? (
							<p className="nota nota--erro" role="alert">
								{erro}
							</p>
						) : null}

						{!temChave ? (
							<div className="conversa__falta-chave">
								<span>Sem chave da API a conversa não responde.</span>
								<button
									type="button"
									className="botao botao--texto"
									onClick={() => navigate({ name: 'ajustes' })}
								>
									Abrir Ajustes
								</button>
							</div>
						) : null}

						{loteDesfazer ? (
							<button
								type="button"
								className="botao botao--texto conversa__desfazer"
								onClick={() => void desfazer()}
							>
								<IconeDesfazer size={18} />
								Desfazer as últimas ações da IA
							</button>
						) : null}

						<form
							className="conversa__campo"
							onSubmit={(evento) => {
								evento.preventDefault()
								void enviar()
							}}
						>
							<label className="conversa__campo-caixa">
								<span className="sr-only">Sua pergunta</span>
								<textarea
									ref={campoRef}
									value={texto}
									rows={1}
									placeholder="Pergunte alguma coisa…"
									onChange={(evento) => setTexto(evento.target.value)}
									onKeyDown={(evento) => {
										// Enter envia; Shift+Enter quebra linha. No celular o
										// teclado manda "Enter" como newline, então o envio
										// por toque continua sendo o caminho principal.
										if (evento.key === 'Enter' && !evento.shiftKey) {
											evento.preventDefault()
											void enviar()
										}
									}}
								/>
							</label>
							<button
								type="submit"
								className="botao botao--primario conversa__enviar"
								aria-label="Enviar"
								disabled={!texto.trim() || carregando || !temChave}
							>
								<IconeEnviar size={18} />
								<span className="conversa__enviar-rotulo">Enviar</span>
							</button>
						</form>
					</div>
				</div>
			</div>

			{/* Prévia obrigatória: nada é executado sem este "Sim".
			    É uma Folha (o mesmo modal de todo o app) porque, no fluxo da
			    conversa, o bloco inline nascia ABAIXO do histórico: com 12
			    mensagens ele caía em y=945 num viewport de 844 e o usuário via
			    a lista de ações sem achar os botões. Folha não depende do
			    tamanho do histórico — ela abre sobre a tela, com as ações no
			    rodapé fixo. */}
			<Folha
				titulo="Confirmar ações"
				aberta={pendente !== null}
				onFechar={() => setPendente(null)}
				sobre={
					pendente
						? `${pendente.avaliacoes.length} ${
								pendente.avaliacoes.length === 1 ? 'ação proposta' : 'ações propostas'
							} · dá para desfazer por 24 h`
						: undefined
				}
				rodape={
					<>
						<button
							type="button"
							className="botao"
							onClick={() => setPendente(null)}
							disabled={carregando}
						>
							Não fazer
						</button>
						<button
							type="button"
							className="botao botao--primario"
							onClick={() => void confirmar()}
							disabled={carregando}
						>
							{carregando ? 'Fazendo…' : 'Fazer'}
						</button>
					</>
				}
			>
				{pendente ? (
					<div className="formulario conversa__confirmacao">
						{pendente.mensagem ? <p>{pendente.mensagem}</p> : null}

						<ul className="conversa__previa-lista">
							{pendente.avaliacoes.map((avaliacao, indice) => (
								<li key={indice} className="conversa__previa">
									<span
										className={
											avaliacao.risco === 'proibido'
												? 'jarvis-selo jarvis-selo--urgente'
												: avaliacao.risco === 'livre'
													? 'jarvis-selo jarvis-selo--informativo'
													: 'jarvis-selo jarvis-selo--atencao'
										}
									>
										{avaliacao.risco === 'proibido'
											? 'Recusada'
											: avaliacao.risco === 'livre'
												? 'Permitida'
												: 'Confirmação'}
									</span>
									<p>
										{avaliacao.risco === 'proibido' ? avaliacao.recusa : avaliacao.previa}
									</p>
									{avaliacao.acao.motivo ? (
										<p className="nota">Motivo: {avaliacao.acao.motivo}</p>
									) : null}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</Folha>
		</div>
	)
}
