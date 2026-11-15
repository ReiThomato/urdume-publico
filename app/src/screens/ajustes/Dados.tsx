import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { db } from '@/db/db'
import { exportBackup, importBackup, setSetting, useSetting } from '@/db/repo'
import { limparRetratoDoRunner } from '@/lib/jarvis/ponte'
import { useLiveQuery } from 'dexie-react-hooks'
import { contarLixeira } from '@/lib/lixeira'
import { LinhaDeAjuste, PaginaDeAjustes } from '@/ui/PaginaDeAjustes'
import { IconeApagar, IconeBaixar, IconeEnviar } from '@/ui/icones'
import { Folha } from '@/ui/Folha'

/**
 * Dados — backup e apagar tudo.
 *
 * Estavam separados em blocos distantes dentro da mesma rolagem: exportar no
 * meio, apagar no fim. São a mesma pergunta — "onde estão e como protejo os
 * meus dados" — e agora estão na mesma página, na ordem em que se pensa nela.
 */
export function AjustesDados() {
	const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
	const [apagando, setApagando] = useState(false)
	const [confirmacao, setConfirmacao] = useState('')
	const [erroApagar, setErroApagar] = useState<string | null>(null)
	const [exportando, setExportando] = useState(false)
	const [escolhendoArquivo, setEscolhendoArquivo] = useState(false)
	const ultimoBackup = useSetting<number | null>('ultimoBackup', null)
	const totalNaLixeira = useLiveQuery(() => contarLixeira(), [])

	useEffect(() => {
		if (!escolhendoArquivo) return
	}, [escolhendoArquivo])

	async function exportar(): Promise<void> {
		setExportando(true)
		setMensagem(null)

		try {
			const dados = await exportBackup()
			const conteudo = JSON.stringify(dados, null, 2)
			const data = new Date().toISOString().slice(0, 10)
			const nome = `urdume-backup-${data}.json`

			/*
			 * No APK, `<a download>` NÃO grava arquivo: o WebView não tem
			 * destino de download configurado. O botão dizia "Backup exportado"
			 * e nada aparecia no aparelho — mesmo depois de o backup dizer que
			 * tinha dado certo.
			 *
			 * Nativo: grava em `Documents/Urdume/`, pasta real, visível no
			 * gerenciador de arquivos e no Drive, e oferece o compartilhamento
			 * a partir do arquivo existente.
			 */
			if (Capacitor.isNativePlatform()) {
				const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
				await Filesystem.writeFile({
					path: `Urdume/${nome}`,
					data: conteudo,
					directory: Directory.Documents,
					encoding: Encoding.UTF8,
					recursive: true,
				})
				const { uri } = await Filesystem.getUri({
					path: `Urdume/${nome}`,
					directory: Directory.Documents,
				})

				try {
					const { Share } = await import('@capacitor/share')
					await Share.share({ title: 'Backup do Urdume', url: uri, dialogTitle: 'Enviar o backup' })
				} catch {
					// Usuário cancelou: o arquivo já está salvo.
				}

				await setSetting('ultimoBackup', Date.now())
				setMensagem({ tipo: 'ok', texto: `Backup salvo em Documentos/Urdume/${nome}.` })
				return
			}

			const blob = new Blob([conteudo], { type: 'application/json' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')

			link.href = url
			link.download = nome
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
		}
	}

	async function confirmarImportacao(evento: React.ChangeEvent<HTMLInputElement>): Promise<void> {
		const arquivo = evento.target.files?.[0]
		if (!arquivo) return

		const confirmado = window.confirm(
			'Importar este backup substitui todos os dados atuais do Urdume neste aparelho. Continuar?',
		)

		if (!confirmado) {
			evento.target.value = ''
			return
		}

		await importar(arquivo)
		evento.target.value = ''
	}

	async function esquecerTudo(): Promise<void> {
		if (confirmacao !== 'APAGAR') {
			setErroApagar('Digite APAGAR para confirmar.')
			return
		}

		try {
			// Apagar "tudo" tem de ser tudo. Antes esta lista cobria 9 das 16
			// tabelas: a chave da API, a conversa com o Jarvis, o diário e a
			// memória sobreviviam ao botão — o usuário achava que tinha apagado
			// e o dado mais sensível continuava no aparelho.
			//
			// A ordem importa pouco (é transação), mas a lista tem de acompanhar
			// `db.ts`. O teste em `Dados.test.ts` compara as duas para que uma
			// tabela nova não volte a ficar de fora em silêncio.
			const tabelas = [
				db.projects,
				db.tasks,
				db.reminders,
				db.events,
				db.habits,
				db.habitLogs,
				db.settings,
				db.projectNotes,
				db.aiJournal,
				db.aiMemory,
				db.aiJobs,
				db.aiRuns,
				db.aiActions,
				db.aiChat,
				db.aiSecrets,
			] as const

			await db.transaction('rw', tabelas, async () => {
				await Promise.all(tabelas.map((tabela) => tabela.clear()))
			})

			// O retrato em SharedPreferences alimenta o Jarvis em segundo plano.
			// Fica fora do IndexedDB, então precisa ser apagado à parte — senão
			// o runner continua com a agenda de um banco que não existe mais.
			await limparRetratoDoRunner().catch(() => undefined)

			setApagando(false)
			setConfirmacao('')
			setErroApagar(null)
			setMensagem({ tipo: 'ok', texto: 'Dados apagados, inclusive a chave da IA e a conversa.' })
		} catch (causa) {
			setErroApagar(causa instanceof Error ? causa.message : 'Não foi possível apagar.')
		}
	}

	return (
		<PaginaDeAjustes titulo="Dados" sobre="Backup e apagar">
			<section className="secao" aria-labelledby="secao-backup">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-backup">
						Backup
					</h2>
				</div>

				<div className="linha-grupo">
					<div className="linha-ajuste">
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Último backup</span>
							<span className="linha-ajuste__descricao">
								{ultimoBackup
									? `${new Date(ultimoBackup).toLocaleString('pt-BR')}`
									: 'Nenhum backup feito ainda'}
							</span>
						</span>
					</div>

					<div style={{ display: 'flex', gap: 'var(--s-2)', padding: '0 var(--s-4) var(--s-4)' }}>
						<button type="button" className="botao" onClick={() => void exportar()} disabled={exportando}>
							<IconeBaixar size={20} />
							{exportando ? 'Exportando…' : 'Exportar'}
						</button>
						<label className="botao" style={{ cursor: 'pointer' }}>
							<IconeEnviar size={20} />
							Importar
							<input
								type="file"
								accept="application/json,.json"
								hidden
								onChange={(evento) => {
									setEscolhendoArquivo(false)
									void confirmarImportacao(evento)
								}}
							/>
						</label>
					</div>
				</div>

				{mensagem ? (
					<p className={`aviso ${mensagem.tipo === 'ok' ? 'aviso--ok' : 'aviso--erro'}`} role="status">
						{mensagem.texto}
					</p>
				) : null}
			</section>

			{/*
			 * A lixeira fica aqui, e não numa aba própria: é parte de "onde
			 * estão os meus dados", junto do backup. Antes ela não existia e o
			 * excluído ficava inalcançável.
			 */}
			<section className="secao" aria-labelledby="secao-lixeira">
				<div className="linha-grupo">
					<LinhaDeAjuste
						rota={{ name: 'lixeira' }}
						titulo="Lixeira"
						descricao="O que você excluiu, para restaurar ou apagar de vez."
						icone={<IconeApagar size={20} />}
						valor={
							totalNaLixeira === undefined
								? undefined
								: totalNaLixeira === 0
									? 'Vazia'
									: `${totalNaLixeira} ${totalNaLixeira === 1 ? 'item' : 'itens'}`
						}
					/>
				</div>
			</section>

			<section className="secao" aria-labelledby="secao-apagar">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-apagar">
						Apagar deste aparelho
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
						<li>Projetos, lembretes e eventos</li>
						<li>Hábitos e todo o registro diário deles</li>
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
		</PaginaDeAjustes>
	)
}
