import { useEffect, useState } from 'react'
import { PaginaDeAjustes } from '@/ui/PaginaDeAjustes'
import { useAcessibilidade } from '@/ui/acessibilidade'
import { versaoDoAplicativo } from '@/lib/jarvis/notificacoes'
import { useTema } from '@/app/tema'
import { IconeSistema } from '@/ui/icones'

/** Rótulo do tamanho de texto, como o usuário escolheu. */
const TAMANHOS: Record<string, string> = {
	normal: 'Normal',
	grande: 'Grande',
	maior: 'Maior',
}

/**
 * Aparelho — versão e o estado real de leitura.
 *
 * Antes a versão aparecia no rodapé de Ajustes, longe de qualquer explicação, e
 * não havia onde conferir se o app atualizou depois de instalar um APK novo. É
 * exatamente o que se procura aqui.
 */
export function AjustesAparelho() {
	const [versao, setVersao] = useState<string | null>(null)
	const acessibilidade = useAcessibilidade()
	const tema = useTema()

	/**
	 * O navegador concedeu armazenamento persistente?
	 *
	 * Sem isso, o Chromium pode descartar o IndexedDB inteiro sob pressão de
	 * espaço — o app abriria vazio, sem erro e sem aviso. O pedido é feito na
	 * abertura (`main.tsx`); aqui só se lê o resultado, porque é a informação
	 * que responde "por que meus dados sumiriam?".
	 */
	const [persistente, setPersistente] = useState<string | null>(null)
	const [uso, setUso] = useState<string | null>(null)

	useEffect(() => {
		let vivo = true
		void versaoDoAplicativo().then((valor) => {
			if (vivo) setVersao(valor)
		})

		void (async () => {
			try {
				if (navigator.storage?.persisted) {
					const concedido = await navigator.storage.persisted()
					if (vivo) setPersistente(concedido ? 'sim' : 'não')
				}
				if (navigator.storage?.estimate) {
					const { usage } = await navigator.storage.estimate()
					if (vivo && typeof usage === 'number') {
						setUso(usage < 1024 * 1024 ? `${Math.round(usage / 1024)} KB` : `${(usage / 1024 / 1024).toFixed(1)} MB`)
					}
				}
			} catch {
				// Sem Storage API: a seção simplesmente não aparece.
			}
		})()

		return () => {
			vivo = false
		}
	}, [])

	return (
		<PaginaDeAjustes titulo="Aparelho" sobre="O que está instalado e como está rodando">
			<section className="secao" aria-labelledby="secao-versao">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-versao">
						Aplicativo
					</h2>
				</div>

				<div className="linha-grupo">
					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Versão instalada</span>
							<span className="linha-ajuste__descricao">
								{versao ?? `Pacote ${__APP_VERSION__} (site)`}
							</span>
						</span>
					</div>

					{persistente ? (
						<div className="linha-ajuste">
							<span className="linha-ajuste__texto">
								<span className="linha-ajuste__titulo">Armazenamento persistente</span>
								<span className="linha-ajuste__descricao">
									{persistente === 'sim'
										? 'Concedido. O sistema não apaga o banco por falta de espaço.'
										: 'Não concedido. Em aparelho muito cheio, o sistema pode descartar o banco — mantenha um backup.'}
								</span>
							</span>
						</div>
					) : null}

					{uso ? (
						<div className="linha-ajuste">
							<span className="linha-ajuste__texto">
								<span className="linha-ajuste__titulo">Espaço usado</span>
								<span className="linha-ajuste__descricao">{uso}</span>
							</span>
						</div>
					) : null}

					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Dados</span>
							<span className="linha-ajuste__descricao">
								Ficam só neste aparelho. Para levar a outro, exporte em Dados.
							</span>
						</span>
					</div>
				</div>
			</section>

			<section className="secao" aria-labelledby="secao-leitura">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-leitura">
						<span className="secao-titulo__icone" aria-hidden="true">
							<IconeSistema size={18} />
						</span>
						Leitura em uso
					</h2>
				</div>
				<div className="linha-grupo">
					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Tamanho do texto</span>
							<span className="linha-ajuste__descricao">
								{TAMANHOS[acessibilidade.tamanho] ?? acessibilidade.tamanho}
							</span>
						</span>
					</div>
					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Alto contraste</span>
							<span className="linha-ajuste__descricao">
								{acessibilidade.altoContraste ? 'Ligado' : 'Desligado'}
							</span>
						</span>
					</div>
					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Movimento reduzido</span>
							<span className="linha-ajuste__descricao">
								{acessibilidade.reduzirMovimento ? 'Ligado' : 'Desligado'}
							</span>
						</span>
					</div>
					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Tema</span>
							<span className="linha-ajuste__descricao">
								{tema.modo === 'light' ? 'Claro' : tema.modo === 'dark' ? 'Escuro' : 'Sistema'}
								{tema.amoled ? ' · preto puro' : ''}
							</span>
						</span>
					</div>
				</div>
				<p className="nota" style={{ padding: '0 var(--s-4)' }}>
					Para mudar qualquer um destes, use Aparência e Acessibilidade.
				</p>
			</section>
		</PaginaDeAjustes>
	)
}
