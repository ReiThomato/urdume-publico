import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '@/db/db'
import { useRouter } from '@/app/router'
import { toDayKey } from '@/db/repo'
import { Folha } from '@/ui/Folha'
import { IlhaDoJarvis } from '@/ui/IlhaDoJarvis'
import type { Recado } from '@/ui/IlhaDoJarvis'
import { descartarRecado } from '@/lib/jarvis/ilha'
import { createId } from '@/db/id'
import { garantirSessao } from '@/lib/jarvis/conversas'
import { lerRecadosDaIlha } from '@/lib/jarvis/ilha'
import type { RecadoDaIlha } from '@/lib/jarvis/ilha'
import { avaliarLote, executarLote } from '@/lib/jarvis/executor'
import type { AvaliacaoDaAcao } from '@/lib/jarvis/executor'
import { lerPreferencias } from '@/lib/jarvis/estado'
import type { PreferenciasJarvis } from '@/lib/jarvis/relevancia'
import { avaliarSePermitido, marcarItem } from '@/lib/jarvis/motor'
import { IconeRaio } from '@/ui/icones'

/**
 * A ilha viva: lê o que o Jarvis tem a dizer e transforma em presença na tela.
 *
 * ## Por que um componente separado do `Shell`
 *
 * O Shell mexe em rota, FAB e avisos de lembrete. A ilha tem ciclo próprio —
 * fila, confirmação, execução — e misturar os dois faria qualquer mudança na
 * ilha arriscar a navegação. Aqui ela é uma caixa preta: entra estado, sai
 * recado.
 *
 * ## Como a fila chega
 *
 * Duas fontes, unidas por `lib/jarvis/ilha`:
 * - o que a IA pensou (`ilha:fila`, gravado por `pensarSozinho`);
 * - o que as regras detectaram (o painel do dia) — o que garante a ilha
 *   funcionando mesmo sem chave de API.
 *
 * Relê a cada 20 s com o app aberto e imediatamente quando ele volta do
 * segundo plano. Não há evento de "chegou recado": um evento a mais seria uma
 * segunda verdade para o mesmo dado.
 */

/** Intervalo de leitura da fila com o app aberto. */
const INTERVALO = 20_000

function paraRecado(recado: RecadoDaIlha): Recado {
	return {
		id: recado.id,
		titulo: recado.titulo,
		mensagem: recado.mensagem,
		nivel: recado.nivel,
		acoes: recado.acoes.length,
	}
}

export function BolhaDoJarvis() {
	const { navigate } = useRouter()
	const [recados, setRecados] = useState<RecadoDaIlha[]>([])
	/** Recado aberto em detalhe (o "Ver"). */
	const [detalhe, setDetalhe] = useState<RecadoDaIlha | null>(null)
	/** Ações aguardando confirmação (o "Fazer"). */
	const [previas, setPrevias] = useState<AvaliacaoDaAcao[] | null>(null)
	const [executando, setExecutando] = useState(false)
	const [resultado, setResultado] = useState<string | null>(null)
	/**
	 * Nível de autonomia, lido junto com a fila.
	 *
	 * O painel do "Ver" precisa dele para descrever cada ação na MESMA frase da
	 * confirmação (`avaliarLote`). Sem guardar, a lista caía no tipo cru.
	 */
	const [autonomia, setAutonomia] = useState<PreferenciasJarvis['autonomia']>('conservador')
	const vivo = useRef(true)


	const recarregar = useCallback(async (): Promise<void> => {
		const prefs = await lerPreferencias(db)
		// Pausado não mostra nada — e limpa o que estava na tela: uma ilha que
		// continua falando depois de "pausar" é a pior prova de que a pausa não
		// funciona.
		setAutonomia(prefs.autonomia)
		if (prefs.modo === 'pausado') {
			setRecados([])
			return
		}

		/*
		 * Avaliar ANTES de ler.
		 *
		 * A primeira versão só lia o painel salvo. O efeito era uma ilha
		 * atrasada: criar uma tarefa atrasada e esperar não mostrava nada,
		 * porque o painel em memória ainda era o de antes da tarefa existir.
		 * `avaliarSePermitido` reaproveita o painel quando ele ainda descreve o
		 * banco (custa quase nada) e recalcula quando houve escrita — que é
		 * exatamente o caso aqui.
		 */
		await avaliarSePermitido({ agora: Date.now() }).catch(() => null)

		const lista = await lerRecadosDaIlha(Date.now(), db)

		/*
		 * Só troca o estado se a lista mudou de fato.
		 *
		 * A releitura de 20 s devolvia objetos novos com o mesmo conteúdo; isso
		 * re-renderizava o cartão e reiniciava as animações de entrada, o que
		 * fazia a ilha parecer que "piscava" sozinha de tempos em tempos.
		 */
		if (!vivo.current) return
		setRecados((anterior) => {
			const antes = anterior.map((recado) => `${recado.id}:${recado.mensagem}`).join('|')
			const depois = lista.map((recado) => `${recado.id}:${recado.mensagem}`).join('|')
			return antes === depois ? anterior : lista
		})
	}, [])

	useEffect(() => {
		vivo.current = true
		void recarregar()

		const relogio = window.setInterval(() => void recarregar(), INTERVALO)

		// Voltar ao app é o momento em que a fila pode ter mudado sem que o
		// intervalo tenha rodado ainda.
		const aoVoltar = (): void => {
			if (document.visibilityState === 'visible') void recarregar()
		}
		document.addEventListener('visibilitychange', aoVoltar)

		return () => {
			vivo.current = false
			window.clearInterval(relogio)
			document.removeEventListener('visibilitychange', aoVoltar)
		}
	}, [recarregar])

	const atual = recados[0] ?? null


	/**
	 * Dispensar.
	 *
	 * Recado da IA sai da fila (some para sempre). Recado de regra só é marcado
	 * como visto no painel: o mesmo assunto pode voltar amanhã, com número
	 * novo, que é o comportamento correto para um atraso que continua atrasado.
	 */
	const dispensar = useCallback(
		async (recado: Recado): Promise<void> => {
			const alvo = recados.find((item) => item.id === recado.id)
			if (!alvo) return

			/*
			 * `dispensado`, NÃO `ignorado`.
			 *
			 * No motor, três `ignorado` seguidos do mesmo tipo silenciam aquele
			 * tipo por 14 DIAS. Um "Agora não" na ilha é um gesto leve — "não
			 * agora" — e transformá-lo em duas semanas de silêncio faria o
			 * usuário desligar o Jarvis sem entender por quê.
			 */
			if (alvo.origem === 'regra') {
				await marcarItem(toDayKey(new Date()), alvo.sinal, 'dispensado', db).catch(() => null)
			}

			await descartarRecado(recado.id, db)
			await recarregar()
		},
		[recarregar, recados],
	)

	/** "Fazer": prévia obrigatória, como em qualquer ação da IA. */
	const prepararExecucao = async (recado: RecadoDaIlha): Promise<void> => {
		const prefs = await lerPreferencias(db)
		const { avaliacoes } = avaliarLote(recado.acoes, prefs.autonomia)
		setPrevias(avaliacoes)
	}

	const executar = async (): Promise<void> => {
		if (!previas || !detalhe) return
		setExecutando(true)
		try {
			const permitidas = previas
				.filter((previa) => previa.risco !== 'proibido')
				.map((previa) => previa.acao)
			const feito = await executarLote(permitidas, db)
			setResultado(
				feito.executadas > 0
					? `${feito.executadas} ${feito.executadas === 1 ? 'ação feita' : 'ações feitas'}. Dá para desfazer na conversa por 24 h.`
					: (feito.erro ?? 'Nada foi feito.'),
			)
			if (detalhe.origem === 'ia') await descartarRecado(detalhe.id, db).catch(() => undefined)
			await recarregar()
		} finally {
			setExecutando(false)
			setPrevias(null)
		}
	}

	/**
	 * Espelha o recado no histórico da conversa.
	 *
	 * O dono do app foi específico: se ele estiver no meio de algo e dispensar
	 * a ilha, precisa poder voltar depois e ler o que era. Sem isto, "Agora
	 * não" apagava a mensagem para sempre — e a ilha virava um lugar de onde a
	 * informação desaparece.
	 *
	 * A mensagem entra como fala do Jarvis, com uma marca de que veio da ilha,
	 * para não se confundir com uma resposta que ele pediu.
	 */
	const espelharNoChat = useCallback(async (recado: RecadoDaIlha): Promise<void> => {
		const sessao = await garantirSessao(db)

		/*
		 * Deduplicação no BANCO, não na memória.
		 *
		 * A primeira versão guardava os ids num `useRef`. Parecia suficiente e
		 * não era: cada recarregamento da página recriava o componente, o `ref`
		 * nascia vazio e a MESMA mensagem era gravada outra vez. No teste
		 * apareceram seis cópias de "Atraso acumulado".
		 *
		 * A chave é o sinal + o dia: o mesmo assunto, no mesmo dia, entra uma
		 * vez só. Amanhã é outro dia, e o recado volta a ser registrado.
		 */
		const dia = toDayKey(new Date())
		const jaTem = await db.aiChat
			.where('em')
			.above(Date.now() - 36 * 3_600_000)
			.toArray()
			.then((linhas) =>
				linhas.some((linha) => {
					const meta = linha.meta as { origem?: string; sinal?: string; dia?: string } | undefined
					return (
						meta?.origem === 'ilha' &&
						meta.sinal === recado.sinal &&
						meta.dia === dia
					)
				}),
			)

		if (jaTem) return

		await db.aiChat.put({
			id: createId(),
			em: Date.now(),
			papel: 'jarvis',
			texto: recado.mensagem,
			sessao,
			meta: { origem: 'ilha', titulo: recado.titulo, sinal: recado.sinal, dia },
		})
	}, [])

	/*
	 * Espelha todo recado que aparece na ilha, uma vez.
	 *
	 * O `useRef` guarda o que já foi copiado: sem isso, cada releitura de 20 s
	 * gravaria a mesma mensagem no chat outra vez.
	 */
	const espelhados = useRef<Set<string>>(new Set())
	useEffect(() => {
		const primeiro = recados[0]
		if (!primeiro || espelhados.current.has(primeiro.id)) return
		espelhados.current.add(primeiro.id)
		void espelharNoChat(primeiro)
	}, [recados, espelharNoChat])

	/**
	 * Passa para o próximo sem apagar.
	 *
	 * Depois de "Ver" ou "Fechar", o recado volta para o fim da fila: quem já
	 * leu não precisa vê-lo de novo agora, mas ele não desaparece por ter sido
	 * lido — reaparece depois dos outros, e volta amanhã se for de regra.
	 */
	const passarAdiante = useCallback((recado: RecadoDaIlha): void => {
		setRecados((atual) => {
			if (atual.length < 2) return atual
			const resto = atual.filter((item) => item.id !== recado.id)
			return [...resto, recado]
		})
	}, [])

	/** Conversar sobre o assunto: leva o contexto para a conversa. */
	const irParaConversa = (): void => {
		const semente = detalhe
			? `O painel apontou: ${detalhe.titulo}. ${detalhe.mensagem} O que você sugere fazer?`
			: undefined
		if (detalhe?.origem === 'ia') {
			void descartarRecado(detalhe.id, db).then(recarregar)
		} else if (detalhe) {
			void marcarItem(toDayKey(new Date()), detalhe.sinal, 'aceito', db).catch(() => null)
			void descartarRecado(detalhe.id, db).then(recarregar)
		}
		setDetalhe(null)
		navigate({ name: 'conversa', semente })
	}

	return (
		<>
			<IlhaDoJarvis
				recados={recados.map(paraRecado)}
				onAbrir={() => {
					if (atual) setDetalhe(atual)
				}}
				onFazer={() => {
					if (atual && atual.acoes.length > 0) {
						setDetalhe(atual)
						void prepararExecucao(atual)
					} else if (atual) {
						// Sem ação pronta: conversar é a única coisa honesta a
						// fazer. Antes o botão "Fazer" aparecia e não fazia nada.
						setDetalhe(atual)
					}
				}}
				onDispensar={(recado) => void dispensar(recado)}
				onProximo={(recado) => {
					const alvo = recados.find((item) => item.id === recado.id)
					if (alvo) passarAdiante(alvo)
				}}
			/>

			{/* Detalhe: o texto inteiro e o que ela propõe fazer. */}
			<Folha
				aberta={detalhe !== null && previas === null}
				titulo={detalhe?.titulo ?? 'Jarvis'}
				sobre="O Jarvis observou isto por conta própria."
				onFechar={() => {
					if (detalhe) passarAdiante(detalhe)
					setDetalhe(null)
					setResultado(null)
				}}
				rodape={
					<>
						<button
							type="button"
							className="botao botao--texto"
							onClick={() => {
								if (detalhe) passarAdiante(detalhe)
								setDetalhe(null)
								setResultado(null)
							}}
						>
							Fechar
						</button>
						<button type="button" className="botao botao--primario" onClick={irParaConversa}>
							Conversar
						</button>
					</>
				}
			>
				{/*
				 * `formulario` é o contêiner padrão das folhas.
				 *
				 * O painel do "Ver" era o único conteúdo de folha sem ele: os
				 * blocos ficavam com o recuo do próprio `ilha-detalhe` (2 px) em
				 * vez dos 16 px de todas as folhas, e o fim do conteúdo encostava
				 * no rodapé fixo. Não era um tamanho "um pouco diferente": era
				 * um elemento fora do padrão, e por isso parecia quebrado.
				 */}
				<div className="formulario">
					<p className="ilha-detalhe__fala">{detalhe?.mensagem}</p>

					{detalhe && detalhe.acoes.length > 0 ? (
						<div className="ilha-detalhe__acoes">
							<p className="ilha-detalhe__rotulo">
								<IconeRaio size={16} /> O que ele propõe
							</p>
							<ul className="ilha-detalhe__lista">
								{/*
								 * A frase legível, não o tipo cru.
								 *
								 * Aqui aparecia `acao.tipo.replaceAll('_', ' ')` —
								 * "criar tarefa", "criar tarefa" — que não diz O QUE
								 * seria criado. O executor já produz a prévia em
								 * português ("Criar tarefa “X” amanhã às 9h"), e é
								 * a mesma frase que a confirmação mostra. As duas
								 * telas descreviam a mesma ação com palavras
								 * diferentes.
								 */}
								{avaliarLote(detalhe.acoes, autonomia).avaliacoes.map(
									(avaliacao, indice) => (
										<li key={`${avaliacao.acao.tipo}-${indice}`} className="ilha-detalhe__item">
											<strong>{avaliacao.previa || avaliacao.acao.tipo.replaceAll('_', ' ')}</strong>
											<span>{avaliacao.recusa ?? avaliacao.acao.motivo}</span>
										</li>
									),
								)}
							</ul>
							<button
								type="button"
								className="botao botao--primario botao--largo"
								onClick={() => void prepararExecucao(detalhe)}
							>
								Ver e executar
							</button>
						</div>
					) : null}

					{resultado ? <p className="ilha-detalhe__resultado">{resultado}</p> : null}
				</div>
			</Folha>

			{/* Confirmação: a mesma prévia da conversa, sem atalho. */}
			<Folha
				aberta={previas !== null}
				titulo="Executar?"
				sobre="Confira antes; nada é feito sem este passo."
				onFechar={() => setPrevias(null)}
				rodape={
					<>
						<button type="button" className="botao botao--texto" onClick={() => setPrevias(null)}>
							Cancelar
						</button>
						<button
							type="button"
							className="botao botao--primario"
							onClick={() => void executar()}
							disabled={executando || (previas?.every((p) => p.risco === 'proibido') ?? true)}
						>
							{executando ? 'Executando…' : 'Executar'}
						</button>
					</>
				}
			>
				<div className="formulario">
					<ul className="ilha-detalhe__lista">
						{(previas ?? []).map((previa, indice) => (
							<li
								key={`${previa.acao.tipo}-${indice}`}
								className={
									previa.risco === 'proibido'
										? 'ilha-detalhe__item ilha-detalhe__item--recusado'
										: 'ilha-detalhe__item'
								}
							>
								<strong>{previa.previa || previa.acao.tipo.replaceAll('_', ' ')}</strong>
								<span>{previa.recusa ?? previa.acao.motivo}</span>
							</li>
						))}
					</ul>
				</div>
			</Folha>
		</>
	)
}
