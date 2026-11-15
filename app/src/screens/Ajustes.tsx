import { useEffect, useState } from 'react'
import { Topo } from '@/ui/AppShell'
import { useTema } from '@/app/tema'
import { useAcessibilidade } from '@/ui/acessibilidade'
import { useSetting } from '@/db/repo'
import { useCategorias, useProjects } from '@/db/repo'
import { versaoDoAplicativo } from '@/lib/jarvis/notificacoes'
import {
	IconeAcessibilidade,
	IconeAjustes,
	IconePainel,
	IconeBaixar,
	IconePaleta,
	IconeRaio,
	IconeSistema,
} from '@/ui/icones'

/**
 * Ajustes — índice de assuntos.
 *
 * Antes esta tela era UMA rolagem com sete seções: aparência, acessibilidade,
 * backup, IA, aparelho e versão. Quem queria o teto mensal da IA passava por
 * tema, cor, fonte e backup; e cada recurso
 * novo aumentava a rolagem.
 *
 * A correção NÃO foi comprimir controles em blocos apertados: foi separar por
 * assunto. Aqui ficam linhas grandes, com o resumo do estado atual à direita —
 * dá para ver "Sistema · escuro" sem entrar. Cada assunto tem página própria com
 * os mesmos controles, no mesmo tamanho.
 */
export function Ajustes() {
	const tema = useTema()
	const acessibilidade = useAcessibilidade()
	const projetos = useProjects()
	const categorias = useCategorias()
	const [versao, setVersao] = useState<string | null>(null)
	const ultimoBackup = useSetting<number | null>('ultimoBackup', null)

	useEffect(() => {
		let vivo = true
		void versaoDoAplicativo().then((valor) => {
			if (vivo) setVersao(valor)
		})
		return () => {
			vivo = false
		}
	}, [])

	const resumoDoTema =
		tema.modo === 'light' ? 'Claro' : tema.modo === 'dark' ? 'Escuro' : 'Sistema'

	const resumoDeDados = ultimoBackup
		? `Backup ${new Date(ultimoBackup).toLocaleDateString('pt-BR')}`
		: 'Sem backup ainda'

	return (
		<div className="tela">
			<Topo titulo="Ajustes" sobre="Escolha um assunto" />

			<div className="conteudo">
				<section className="secao" aria-labelledby="secao-ajustes-visual">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-ajustes-visual">
							Aparência e conforto
						</h2>
					</div>
					<div className="linha-grupo">
						<Entrada
							rota={{ name: 'ajustes-aparencia' }}
							icone={<IconePaleta size={20} />}
							titulo="Aparência"
							descricao="Roda de cores, harmonia, fonte e AMOLED"
							valor={resumoDoTema}
						/>
						<Entrada
							rota={{ name: 'ajustes-acessibilidade' }}
							icone={<IconeAcessibilidade size={20} />}
							titulo="Acessibilidade"
							descricao="Tamanho do texto, alto contraste e movimento"
							valor={
								acessibilidade.tamanho === 'normal'
									? acessibilidade.altoContraste || acessibilidade.reduzirMovimento
										? 'Ajustado'
										: 'Padrão'
									: acessibilidade.tamanho === 'grande'
										? 'Grande'
										: 'Maior'
							}
						/>
					</div>
				</section>

				<section className="secao" aria-labelledby="secao-ajustes-ia">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-ajustes-ia">
							Inteligência
						</h2>
					</div>
					<div className="linha-grupo">
						<Entrada
							rota={{ name: 'ajustes-ia' }}
							icone={<IconeRaio size={20} />}
							titulo="Jarvis e IA"
							descricao="Provedor, chave da API, teto de gasto e histórico"
							valor="Configurar"
						/>
					</div>
				</section>

				<section className="secao" aria-labelledby="secao-ajustes-dados">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo" id="secao-ajustes-dados">
							Dados e aparelho
						</h2>
					</div>
					<div className="linha-grupo">
						<Entrada
							rota={{ name: 'ajustes-dados' }}
							icone={<IconeBaixar size={20} />}
							titulo="Dados"
							descricao="Backup e apagar deste aparelho"
							valor={resumoDeDados}
						/>
						<Entrada
							rota={{ name: 'ajustes-aparelho' }}
							icone={<IconeSistema size={20} />}
							titulo="Aparelho"
							descricao="Versão instalada e leitura em uso"
							valor={versao ? 'Instalado' : 'Site'}
						/>
						<Entrada
							rota={{ name: 'ajustes-navegacao' }}
							icone={<IconePainel size={20} />}
							titulo="Navegação"
							descricao="Quais telas ficam na barra de baixo"
							valor="5 lugares"
						/>
						<Entrada
							rota={{ name: 'ajustes-sobre' }}
							icone={<IconeAjustes size={20} />}
							titulo="Sobre"
							descricao="A marca, o que o app faz e privacidade"
							valor="Urdume"
						/>
					</div>
				</section>

				<p className="nota" style={{ padding: 'var(--s-4)', textAlign: 'center' }}>
					{projetos
						? `${projetos.length} ${projetos.length === 1 ? 'projeto' : 'projetos'}`
						: '…'}
					{categorias.length > 0
						? ` · ${categorias.length} ${categorias.length === 1 ? 'categoria' : 'categorias'}`
						: ''}{' '}
					· dados só neste aparelho
				</p>
			</div>
		</div>
	)
}

/**
 * Linha de entrada para uma página de Ajustes.
 *
 * `Link` de verdade (âncora): funciona com teclado, leitor de tela, botão
 * voltar do Android e abrir em nova aba. A seta é decoração; o alvo é a linha
 * inteira.
 */
function Entrada({
	rota,
	icone,
	titulo,
	descricao,
	valor,
}: {
	rota:
		| { name: 'ajustes-aparencia' }
		| { name: 'ajustes-acessibilidade' }
		| { name: 'ajustes-ia' }
		| { name: 'ajustes-dados' }
		| { name: 'ajustes-aparelho' }
		| { name: 'ajustes-sobre' }
		| { name: 'ajustes-navegacao' }
	icone: React.ReactNode
	titulo: string
	descricao: string
	valor?: string
}) {
	return (
		<LinkAjuste rota={rota} icone={icone} titulo={titulo} descricao={descricao} valor={valor} />
	)
}

/** Reexporta o link para manter uma implementação só (ver PaginaDeAjustes). */
import { LinhaDeAjuste as LinkAjuste } from '@/ui/PaginaDeAjustes'
