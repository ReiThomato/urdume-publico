import { useEffect, useRef, useState } from 'react'
import { exportBackup, importBackup, setSetting, useSetting } from '@/db/repo'
import { db } from '@/db/db'
import { FONTES, SEMENTES, TEMA_PADRAO, salvarTema, useTema } from '@/app/tema'
import type { EstiloPaleta, FonteApp, ModoTema } from '@/app/tema'
import { Topo } from '@/ui/AppShell'
import { Folha } from '@/ui/Folha'
import { SecaoAcessibilidade } from '@/ui/acessibilidade'
import { SecaoJarvis } from '@/ui/SecaoJarvis'
import { BotaoNovaCor, SeletorDeCor } from '@/ui/SeletorDeCor'
import {
	IconeBaixar,
	IconeClaro,
	IconeEnviar,
	IconeEscuro,
	IconePaleta,
	IconeSistema,
	IconeTexto,
} from '@/ui/icones'
import { corDoIndice } from '@/ui/paleta'

const MODOS: Array<{ valor: ModoTema; rotulo: string; icone: React.ReactNode }> = [
	{ valor: 'light', rotulo: 'Claro', icone: <IconeClaro size={18} /> },
	{ valor: 'dark', rotulo: 'Escuro', icone: <IconeEscuro size={18} /> },
	{ valor: 'system', rotulo: 'Sistema', icone: <IconeSistema size={18} /> },
]

const ESTILOS: Array<{ valor: EstiloPaleta; rotulo: string }> = [
	{ valor: 'tonal', rotulo: 'Tonal' },
	{ valor: 'expressivo', rotulo: 'Expressivo' },
	{ valor: 'vibrante', rotulo: 'Vibrante' },
	{ valor: 'neutro', rotulo: 'Neutro' },
	{ valor: 'arco-iris', rotulo: 'Arco-íris' },
	{ valor: 'frutas', rotulo: 'Frutas' },
	{ valor: 'monocromatico', rotulo: 'Monocromático' },
	{ valor: 'fidelidade', rotulo: 'Fidelidade' },
	{ valor: 'conteudo', rotulo: 'Conteúdo' },
]

/**
 * Ajustes.
 *
 * O tema não é uma lista de cores escolhidas à mão: é UMA cor-semente, um modo
 * (claro/escuro/sistema), um estilo de paleta Material e uma fonte. Mudar a
 * semente repinta o app inteiro — inclusive o fundo do quadro — de forma
 * coerente. AMOLED força preto puro nos fundos.
 */
export function Ajustes() {
	const tema = useTema()
	const corForaDaPaleta = !SEMENTES.some((s) => s.hex.toLowerCase() === tema.semente.toLowerCase())
	const arquivoRef = useRef<HTMLInputElement>(null)
	const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
	const [apagando, setApagando] = useState(false)
	const [seletorCor, setSeletorCor] = useState(false)
	const [confirmacao, setConfirmacao] = useState('')
	const [erroApagar, setErroApagar] = useState<string | null>(null)
	const [exportando, setExportando] = useState(false)
	const [escolhendoFonte, setEscolhendoFonte] = useState(false)
	const [versaoInstalada, setVersaoInstalada] = useState<string | null>(null)

	// Versão real do APK (a do sistema, não a do package.json). É o que permite
	// conferir, depois de instalar, se a entrega nova entrou de fato.
	useEffect(() => {
		let vivo = true
		void import('@/lib/jarvis/notificacoes').then(async ({ versaoDoAplicativo }) => {
			const versao = await versaoDoAplicativo()
			if (vivo && versao) setVersaoInstalada(versao)
		})
		return () => {
			vivo = false
		}
	}, [])
	const ultimoBackup = useSetting<number | null>('ultimoBackup', null)

	async function exportar(): Promise<void> {
		setExportando(true)
		setMensagem(null)

		try {
			const dados = await exportBackup()
			const conteudo = JSON.stringify(dados, null, 2)
			const blob = new Blob([conteudo], { type: 'application/json' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			const data = new Date().toISOString().slice(0, 10)

			link.href = url
			link.download = `nexo-backup-${data}.json`
			document.body.appendChild(link)
			link.click()
			link.remove()
			URL.revokeObjectURL(url)

			await setSetting('ultimoBackup', Date.now())
			setMensagem({ tipo: 'ok', texto: 'Backup exportado.' })
		} catch (causa) {
			setMensagem({
				tipo: 'erro',
				texto: causa instanceof Error ? causa.message : 'Não foi possível exportar.',
			})
		} finally {
			setExportando(false)
		}
	}

	async function importar(arquivo: File): Promise<void> {
		setMensagem(null)

		try {
			const texto = await arquivo.text()
			const dados: unknown = JSON.parse(texto)
			await importBackup(dados)
			setMensagem({ tipo: 'ok', texto: 'Backup importado. Os dados anteriores foram substituídos.' })
		} catch (causa) {
			setMensagem({
				tipo: 'erro',
				texto: causa instanceof Error ? causa.message : 'Arquivo inválido.',
			})
		} finally {
			if (arquivoRef.current) arquivoRef.current.value = ''
		}
	}

	async function confirmarImportacao(evento: React.ChangeEvent<HTMLInputElement>): Promise<void> {
		const arquivo = evento.target.files?.[0]
		if (!arquivo) return

		const confirmado = window.confirm(
			'Importar este backup substitui todos os dados atuais do Urdume neste aparelho. Continuar?',
		)

		if (!confirmado) {
			if (arquivoRef.current) arquivoRef.current.value = ''
			return
		}

		await importar(arquivo)
	}

	async function esquecerTudo(): Promise<void> {
		if (confirmacao !== 'APAGAR') {
			setErroApagar('Digite APAGAR para confirmar.')
			return
		}

		try {
			await db.transaction(
				'rw',
				[
					db.projects,
					db.tasks,
					db.reminders,
					db.pages,
					db.events,
					db.habits,
					db.habitLogs,
					db.settings,
					db.projectNotes,
				],
				async () => {
					await Promise.all([
						db.projects.clear(),
						db.tasks.clear(),
						db.reminders.clear(),
						db.pages.clear(),
						db.events.clear(),
						db.habits.clear(),
						db.habitLogs.clear(),
						db.settings.clear(),
						db.projectNotes.clear(),
					])
				},
			)
			setApagando(false)
			setConfirmacao('')
			setErroApagar(null)
			setMensagem({ tipo: 'ok', texto: 'Dados apagados.' })
		} catch (causa) {
			setErroApagar(causa instanceof Error ? causa.message : 'Não foi possível apagar.')
		}
	}

	const fonteAtual = FONTES.find((f) => f.valor === tema.fonte) ?? FONTES[0]!

	return (
		<div className="tela">
			<Topo titulo="Ajustes" sobre="Aparência, acessibilidade e seus dados" />

			<div className="conteudo">
				{/* ------------------------------------------------------ aparência */}
				<section className="secao" aria-labelledby="secao-aparencia">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-aparencia">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconePaleta size={18} />
							</span>
							Aparência
						</h2>
					</div>

					<div className="linha-grupo">
						<div className="linha-ajuste">
							<span className="linha-ajuste__texto">
								<span className="linha-ajuste__titulo">Tema</span>
								<span className="linha-ajuste__descricao">
									Claro, escuro ou seguir o aparelho.
								</span>
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
					</div>

					<div className="linha-grupo" style={{ marginTop: 'var(--s-3)' }}>
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
										</div>

					<div className="linha-grupo" style={{ marginTop: 'var(--s-3)' }}>
						<div className="linha-ajuste">
							<span className="linha-ajuste__texto">
								<span className="linha-ajuste__titulo">Estilo da paleta</span>
								<span className="linha-ajuste__descricao">Como a cor-semente se espalha pelas superfícies</span>
							</span>
						</div>
						<div style={{ padding: '0 var(--s-4) var(--s-4)' }}>
							<div className="chips" style={{ margin: 0, padding: 0 }}>
								{ESTILOS.map((estilo) => (
									<button
										key={estilo.valor}
										type="button"
										className="chip"
										aria-pressed={tema.estilo === estilo.valor}
										onClick={() => void salvarTema({ estilo: estilo.valor })}
									>
										{estilo.rotulo}
									</button>
								))}
							</div>
						</div>
					</div>

					<div className="linha-grupo" style={{ marginTop: 'var(--s-3)' }}>
						<button type="button" className="linha-ajuste" onClick={() => setEscolhendoFonte(true)}>
							<span className="linha-ajuste__texto">
								<span className="linha-ajuste__titulo">Fonte</span>
								<span className="linha-ajuste__descricao">{fonteAtual.nome}</span>
							</span>
							<IconeTexto size={22} />
						</button>

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

				<SecaoAcessibilidade />

				{/* ---------------------------------------------------------- dados */}
				<section className="secao" aria-labelledby="secao-dados">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-dados">
							Seus dados
						</h2>
					</div>

					<div className="linha-grupo">
						<div className="linha-ajuste">
							<span className="linha-ajuste__texto">
								<span className="linha-ajuste__titulo">Backup</span>
								<span className="linha-ajuste__descricao">
									{ultimoBackup
										? `Último: ${new Date(ultimoBackup).toLocaleString('pt-BR')}`
										: 'Nenhum backup feito ainda'}
								</span>
							</span>
						</div>

						<div style={{ display: 'flex', gap: 'var(--s-2)', padding: '0 var(--s-4) var(--s-4)' }}>
							<button type="button" className="botao" onClick={() => void exportar()} disabled={exportando}>
								<IconeBaixar size={20} />
								{exportando ? 'Exportando…' : 'Exportar'}
							</button>
							<button type="button" className="botao" onClick={() => arquivoRef.current?.click()}>
								<IconeEnviar size={20} />
								Importar
							</button>
							<input
								ref={arquivoRef}
								type="file"
								accept="application/json,.json"
								hidden
								onChange={(evento) => void confirmarImportacao(evento)}
							/>
						</div>
					</div>

					{mensagem ? (
						<p className={`aviso ${mensagem.tipo === 'ok' ? 'aviso--ok' : 'aviso--erro'}`} role="status">
							{mensagem.texto}
						</p>
					) : null}
				</section>

				{/* --------------------------------------------------------- jarvis */}
				<SecaoJarvis />

				{/* ------------------------------------------------------- aparelho */}
				<section className="secao" aria-labelledby="secao-aparelho">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-aparelho">
							Aparelho
						</h2>
					</div>
					<div className="linha-grupo">
						<div className="linha-ajuste">
							<span className="linha-ajuste__texto">
								<span className="linha-ajuste__titulo">Apagar dados locais</span>
								<span className="linha-ajuste__descricao">Remove tudo deste aparelho. Exporte antes.</span>
							</span>
							<button
								type="button"
								className="botao botao--perigo"
								onClick={() => {
									setConfirmacao('')
									setErroApagar(null)
									setApagando(true)
								}}
							>
								Apagar
							</button>
						</div>
					</div>
				</section>

				<SeletorDeCor
					aberto={seletorCor}
					onFechar={() => setSeletorCor(false)}
					corAtual={tema.semente}
					onEscolher={(hex) => void salvarTema({ semente: hex })}
				/>

				<p className="rodape-versao">
					{versaoInstalada ? `Versão ${versaoInstalada}` : `Versão ${__APP_VERSION__}`} · dados
					só neste aparelho
				</p>
				<p className="rodape-marca">
					<span className="rodape-marca__palavra">urdume público</span>
					<span className="rodape-marca__frase">edição de código aberto · beta</span>
				</p>
			</div>

			<Folha
				titulo="Apagar dados locais"
				aberta={apagando}
				onFechar={() => setApagando(false)}
				passo={confirmacao}
			>
				<div className="formulario">
					<p className="nota">Estes dados serão apagados deste aparelho e não podem ser recuperados:</p>
					<ul className="nota" style={{ paddingLeft: 20, listStyle: 'disc' }}>
						<li>Tarefas, subtarefas e o histórico de conclusões</li>
						<li>Listas, lembretes e eventos</li>
						<li>Hábitos e todo o registro diário deles</li>
						<li>Páginas e tudo o que está desenhado nelas</li>
						<li>Preferências de aparência e acessibilidade</li>
					</ul>

					<div>
						<label className="campo-rotulo" htmlFor="apagar-confirmacao">
							Digite APAGAR para confirmar
						</label>
						<input
							id="apagar-confirmacao"
							className="campo"
							value={confirmacao}
							onChange={(evento) => setConfirmacao(evento.target.value)}
							autoComplete="off"
							spellCheck={false}
							placeholder="APAGAR"
						/>
					</div>

					{erroApagar ? (
						<p className="erro" role="alert">
							{erroApagar}
						</p>
					) : null}

					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setApagando(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							disabled={confirmacao !== 'APAGAR'}
							onClick={() => void esquecerTudo()}
						>
							Apagar tudo
						</button>
					</div>
				</div>
			</Folha>

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
		</div>
	)
}

export { TEMA_PADRAO, corDoIndice }
