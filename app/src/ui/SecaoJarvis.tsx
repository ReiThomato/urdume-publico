import { useEffect, useState } from 'react'
import { db } from '@/db/db'
import { IconeRaio } from '@/ui/icones'
import {
	apagarChaveApi,
	lerProvedor,
	pistaDaChave,
	salvarChaveApi,
	salvarProvedor,
	temChaveApi,
} from '@/lib/jarvis/segredo'
import { LISTA_DE_PROVEDORES, PROVEDOR_PADRAO, PROVEDORES } from '@/lib/jarvis/provedores'
import type { IdProvedor } from '@/lib/jarvis/provedores'
import { lerPreferencias, salvarPreferencias } from '@/lib/jarvis/estado'
import type { PreferenciasJarvis } from '@/lib/jarvis/relevancia'

/**
 * Seção do Jarvis nos Ajustes.
 *
 * Fica aqui, e não na tela do Jarvis, porque é configuração: quem entra em
 * Ajustes quer resolver "onde fica a chave" e "quanto posso gastar". A tela do
 * Jarvis é para o dia a dia.
 *
 * Sobre a chave: o campo é do tipo senha e, depois de salva, mostra só os
 * quatro últimos caracteres. Não existe botão "ver" — se o usuário perdeu a
 * chave, gera outra no provedor. Guardar em texto claro e oferecer "revelar"
 * seria pior do que não oferecer.
 */
export function SecaoJarvis() {
	const [prefs, setPrefs] = useState<PreferenciasJarvis | null>(null)
	const [salva, setSalva] = useState(false)
	const [pista, setPista] = useState<string | null>(null)
	const [editando, setEditando] = useState(false)
	const [chave, setChave] = useState('')
	const [erro, setErro] = useState<string | null>(null)
	const [mensagem, setMensagem] = useState<string | null>(null)
	const [provedor, setProvedor] = useState<IdProvedor>(PROVEDOR_PADRAO)

	/** Recarrega do banco o que depende do provedor ativo. */
	async function carregar(qual?: IdProvedor): Promise<void> {
		const ativo = qual ?? (await lerProvedor(db))
		setProvedor(ativo)
		setSalva(await temChaveApi(ativo, db))
		setPista(await pistaDaChave(ativo, db))
	}

	useEffect(() => {
		void (async () => {
			setPrefs(await lerPreferencias(db))
			await carregar()
		})()
	}, [])

	async function trocarProvedor(qual: IdProvedor): Promise<void> {
		await salvarProvedor(qual, db)
		setEditando(false)
		setChave('')
		setMensagem(null)
		await carregar(qual)
	}

	async function gravarChave(): Promise<void> {
		setErro(null)
		try {
			// A chave é gravada PARA O PROVEDOR ATIVO: a da Deploy não autentica
			// na DeepSeek, e guardar uma só fazia o app falhar com "recusada".
			await salvarChaveApi(chave, provedor, db)
			setSalva(true)
			setPista(await pistaDaChave(provedor, db))
			setChave('')
			setEditando(false)
			setMensagem(`Chave da ${PROVEDORES[provedor].nome} salva. Ela não entra no backup.`)
		} catch (causa) {
			setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar.')
		}
	}

	async function removerChave(): Promise<void> {
		const confirmado = window.confirm(
			`Remover a chave da ${PROVEDORES[provedor].nome}? A conversa para até você salvar outra.`,
		)
		if (!confirmado) return
		await apagarChaveApi(provedor, db)
		setSalva(false)
		setPista(null)
		setMensagem('Chave removida.')
	}

	async function mudar(patch: Partial<PreferenciasJarvis>): Promise<void> {
		const proximo = await salvarPreferencias(patch, db)
		setPrefs(proximo)
	}

	if (!prefs) return null

	return (
		<>
			<section className="secao" aria-labelledby="secao-jarvis">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-jarvis">
						<span className="secao-titulo__icone" aria-hidden="true">
							<IconeRaio size={18} />
						</span>
						Jarvis
					</h2>
				</div>

				<div className="linha-grupo">
					<div className="linha-ajuste linha-ajuste--coluna">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Provedor</span>
							<span className="linha-ajuste__descricao">{PROVEDORES[provedor].nota}</span>
						</span>
						<div className="opcoes-criacao" role="group" aria-label="Provedor de IA">
							{LISTA_DE_PROVEDORES.map((opcao) => (
								<button
									key={opcao.id}
									type="button"
									className="opcao-criacao"
									aria-pressed={provedor === opcao.id}
									onClick={() => void trocarProvedor(opcao.id)}
								>
									<span className="opcao-criacao__texto">
										<span className="opcao-criacao__titulo">{opcao.nome}</span>
										<span className="opcao-criacao__descricao">
											{provedor === opcao.id ? opcao.nota : opcao.ondePegarChave}
										</span>
									</span>
								</button>
							))}
						</div>
					</div>

					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Chave da {PROVEDORES[provedor].nome}</span>
							<span className="linha-ajuste__descricao">
								{salva
									? `Salva neste aparelho (${pista}). Fora do backup exportado.`
									: 'Sem chave. O painel e as regras funcionam; só a conversa fica de fora.'}
							</span>
						</span>
						{editando ? null : (
							<button type="button" className="botao" onClick={() => setEditando(true)}>
								{salva ? 'Trocar' : 'Adicionar'}
							</button>
						)}
					</div>

					{editando ? (
						<div className="formulario" style={{ padding: '0 var(--s-4) var(--s-4)' }}>
							<input
								type="password"
								autoComplete="off"
								placeholder="Cole a chave da API…"
								value={chave}
								aria-label={`Chave da ${PROVEDORES[provedor].nome}`}
								onChange={(evento) => setChave(evento.target.value)}
							/>
							<p className="nota">
								Ela fica no banco deste aparelho e <strong>não sai no backup</strong>. Quem
								tiver o celular desbloqueado consegue lê-la; por isso o bloqueio de tela
								importa.
							</p>
							<div className="formulario__acoes">
								<button
									type="button"
									className="botao"
									onClick={() => {
										setEditando(false)
										setChave('')
										setErro(null)
									}}
								>
									Cancelar
								</button>
								<button
									type="button"
									className="botao botao--primario"
									disabled={!chave.trim()}
									onClick={() => void gravarChave()}
								>
									Salvar
								</button>
							</div>
						</div>
					) : null}

					{salva && !editando ? (
						<div className="linha-ajuste">
							<span className="linha-ajuste__texto">
								<span className="linha-ajuste__titulo">Remover chave</span>
								<span className="linha-ajuste__descricao">
									A conversa para de funcionar até você salvar outra.
								</span>
							</span>
							<button type="button" className="botao botao--perigo" onClick={() => void removerChave()}>
								Remover
							</button>
						</div>
					) : null}

					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Teto mensal</span>
							<span className="linha-ajuste__descricao">
								{prefs.tetoMensalUsd > 0
									? `US$ ${prefs.tetoMensalUsd.toFixed(2)} por mês. Ao chegar no teto, a IA para.`
									: 'Sem teto. Use um valor se quiser garantia contra surpresa na fatura.'}
							</span>
						</span>
						<input
							type="number"
							min={0}
							step={0.5}
							value={prefs.tetoMensalUsd}
							aria-label="Teto mensal em dólares"
							style={{ width: 88, textAlign: 'right' }}
							onChange={(evento) => void mudar({ tetoMensalUsd: Number(evento.target.value) })}
						/>
					</div>

					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Chamadas por dia</span>
							<span className="linha-ajuste__descricao">
								Máximo de {prefs.chamadasPorDia}. Depois disso, só as regras locais rodam.
							</span>
						</span>
						<input
							type="number"
							min={0}
							max={200}
							value={prefs.chamadasPorDia}
							aria-label="Máximo de chamadas por dia"
							style={{ width: 88, textAlign: 'right' }}
							onChange={(evento) => void mudar({ chamadasPorDia: Number(evento.target.value) })}
						/>
					</div>

					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Guardar histórico</span>
							<span className="linha-ajuste__descricao">
								{prefs.guardarDias} dias de acontecimentos e execuções.
							</span>
						</span>
						<input
							type="number"
							min={7}
							max={365}
							value={prefs.guardarDias}
							aria-label="Dias de histórico"
							style={{ width: 88, textAlign: 'right' }}
							onChange={(evento) => void mudar({ guardarDias: Number(evento.target.value) })}
						/>
					</div>
				</div>

				{erro ? (
					<p className="nota nota--erro" role="alert">
						{erro}
					</p>
				) : null}
				{mensagem ? <p className="nota">{mensagem}</p> : null}
			</section>
		</>
	)
}
