import { useEffect, useState } from 'react'
import { RouterProvider, useRouter } from '@/app/router'
import { useTema } from '@/app/tema'
import { iniciarAvisos } from '@/lib/avisos'
import { useJarvisVivo } from '@/lib/jarvis/ciclo'
import { aoFalharEscrita } from '@/lib/falhas'
import { Ajustes } from '@/screens/Ajustes'
import { Calendario } from '@/screens/Calendario'
import { HabitoDetalhe, Habitos } from '@/screens/Habitos'
import { Inicio } from '@/screens/Inicio'
import { Jarvis } from '@/screens/Jarvis'
import { ConversaJarvis } from '@/ui/ConversaJarvis'
import { ProjetoRota } from '@/screens/Projeto'
import { Projetos } from '@/screens/Projetos'
import { Tarefas } from '@/screens/Tarefas'
import { AppShell } from '@/ui/AppShell'
import { IconeAdicionar, IconeConversa } from '@/ui/icones'
import { CriarFolha, type TipoCriacao } from '@/ui/CriarFolha'
import { AvisoNoTopo } from '@/ui/AvisoNoTopo'
import type { AvisoDoTopo } from '@/ui/AvisoNoTopo'

interface CriacaoPedida {
	tipo?: TipoCriacao
	dia?: string
}

function Telas() {
	const { route, navigate } = useRouter()
	const [criando, setCriando] = useState<CriacaoPedida | null>(null)
	const [aviso, setAviso] = useState<AvisoDoTopo | null>(null)
	// Falha de escrita (banco recusou, cota cheia): faixa vermelha no rodapé.
	// Antes a folha fechava como se tivesse salvado e o usuário não sabia.
	const [falha, setFalha] = useState<string | null>(null)
	const [fabVisivel, setFabVisivel] = useState(true)
	useTema()
	// Carimba a abertura, avalia e mantém o retrato do segundo plano em dia.
	useJarvisVivo()

	// O botão de criar fica no canto inferior direito, sobre o fim da lista — é o
	// padrão de FAB do Material. Ele se recolhe enquanto a página DESCE e volta
	// ao subir, que é o comportamento do Material 3: assim não cobre os atalhos
	// da linha que passa por baixo, e continua a um gesto de distância.
	//
	// As tentativas anteriores e por que foram descartadas:
	// - reservar 56 px na direita da lista da Agenda: funcionava, mas deslocava
	//   os botões de ação para a esquerda, fora do padrão das outras abas;
	// - mover o botão para o trecho livre a cada rolagem: em listas de linha
	//   inteira ele não achava vão e desaparecia, tirando o acesso a criar
	//   lembrete, evento, hábito e página.
	useEffect(() => {
		let ultimo = window.scrollY
		// Trocar de tela sempre mostra o botão de novo. Antes o estado
		// "recolhido" sobrevivia à navegação: quem parava no fim da lista do
		// Início chegava em outra aba com o botão oculto e, se a tela fosse curta
		// demais para rolar, não tinha como fazê-lo voltar.
		setFabVisivel(true)
		ultimo = window.scrollY

		const aoRolar = (): void => {
			const atual = window.scrollY
			// Tolerância de 8 px: o tremor do dedo no celular não alterna o botão.
			if (Math.abs(atual - ultimo) < 8) return
			setFabVisivel(atual < ultimo || atual < 24)
			ultimo = atual
		}
		window.addEventListener('scroll', aoRolar, { passive: true })
		return () => window.removeEventListener('scroll', aoRolar)
	}, [route])

	// Aviso de lembrete vencido: verifica ao abrir e a cada minuto, sem rede.
	// O banner interno vale mesmo sem permissão de notificação.
	useEffect(() => {
		let contador = 0
		return iniciarAvisos((texto) => {
			contador += 1
			setAviso({ id: `lembrete-${Date.now()}-${contador}`, texto: `Lembrete: ${texto}`, tipo: 'atencao' })
		})
	}, [])

	// Escuta as falhas de escrita anunciadas por `lib/falhas`. Fica aqui porque
	// o Shell envolve todas as telas: um aviso só, um lugar só.
	useEffect(() => {
		let timer: number | undefined
		const parar = aoFalharEscrita((mensagem) => {
			setFalha(mensagem)
			window.clearTimeout(timer)
			timer = window.setTimeout(() => setFalha(null), 6000)
		})
		return () => {
			parar()
			window.clearTimeout(timer)
		}
	}, [])

	const abrirCriacao = (opcoes?: CriacaoPedida): void => {
		setCriando(opcoes ?? {})
	}

	const conteudo = (() => {
		switch (route.name) {
			case 'inicio':
				return <Inicio onCriar={abrirCriacao} />
			case 'tarefas':
				return <Tarefas listaInicial={route.lista} onCriar={abrirCriacao} />
			case 'habitos':
				return <Habitos />
			case 'habito':
				return <HabitoDetalhe id={route.id} />
			case 'calendario':
				return <Calendario dia={route.day} onCriar={abrirCriacao} />
			case 'projetos':
				return <Projetos />
			case 'projeto':
				return <ProjetoRota id={route.id} />
			case 'jarvis':
				return <Jarvis />
			case 'conversa':
				return (
					<ConversaJarvis
						semente={route.semente}
						onVoltar={() => navigate({ name: 'inicio' })}
					/>
				)
			case 'ajustes':
				return <Ajustes />
			default:
				return (
					<div className="tela">
						<div className="secao" style={{ paddingTop: 'var(--s-8)' }}>
							<div className="cartao cartao--vazio">
								<p>Esta página não existe.</p>
							</div>
						</div>
					</div>
				)
		}
	})()

	return (
		<>
			<AppShell>{conteudo}</AppShell>

			{/* Criar não pertence a Ajustes nem ao Jarvis: não há o que criar nas
			    duas telas, e o botão ficava por cima dos controles (no Jarvis,
			    cobria o "Útil" dos cartões). Nas outras telas ele fica no canto,
			    e o conteúdo reserva a faixa de baixo. */}
			{route.name === 'ajustes' || route.name === 'jarvis' || route.name === 'conversa' ? null : (
				<div className={fabVisivel ? 'fab-area' : 'fab-area fab-area--oculto'}>
					{/* Conversar fica ACIMA do Criar, menor e mais discreto: o Criar é a
					    ação principal do app; o chat é presença, não comando. */}
					<button
						type="button"
						className="fab fab--conversa"
						aria-label="Conversar com o Jarvis"
						title="Conversar"
						onClick={() => navigate({ name: 'conversa' })}
					>
						<IconeConversa size={20} />
					</button>
					<button
						type="button"
						className="fab"
						aria-label="Criar"
						title="Criar"
						onClick={() => abrirCriacao()}
					>
						<IconeAdicionar size={22} />
						<span className="fab__rotulo">Criar</span>
					</button>
				</div>
			)}

			{falha ? (
				<div className="desfazer desfazer--erro" role="alert" aria-live="assertive">
					<span className="desfazer__texto">{falha}</span>
					<button type="button" className="botao botao--texto" onClick={() => setFalha(null)}>
						Fechar
					</button>
				</div>
			) : null}

			<AvisoNoTopo aviso={aviso} onFechar={() => setAviso(null)} />

			<CriarFolha
				aberta={criando !== null}
				onFechar={() => setCriando(null)}
				tipo={criando?.tipo}
				dia={criando?.dia}
			/>
		</>
	)
}

export function App() {
	return (
		<RouterProvider>
			<Telas />
		</RouterProvider>
	)
}
