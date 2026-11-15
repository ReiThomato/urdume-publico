import { PaginaDeAjustes } from '@/ui/PaginaDeAjustes'
import { MarcaUrdume } from '@/ui/Marca'
import { IconeAvancar } from '@/ui/icones'

/**
 * Sobre — nome, identidade, quem fez e o que o app é.
 *
 * Existe porque o nome antigo ainda aparecia no rodapé e porque o app troca de
 * identidade com frequência: ter um lugar único que diz "este app é o Urdume, e
 * ele faz isto" evita três nomes circulando sem dono.
 *
 * ## Por que a lista do que ele faz é revisada a cada rodada
 *
 * Ela já ficou desatualizada: prometia "hábitos com sequência e mapa de calor"
 * antes de a tabela própria de hábitos existir, e não mencionava a ilha. Uma
 * lista de recursos que mente é pior que nenhuma: quem lê para decidir se usa
 * o app é enganado pela própria tela do app.
 */
export function AjustesSobre() {
	return (
		<PaginaDeAjustes titulo="Sobre" sobre="O app, a marca e quem fez">
			<section className="secao" aria-labelledby="secao-marca">
				<div className="cartao" style={{ padding: 'var(--s-6) var(--s-4)' }}>
					<MarcaUrdume />
					<p className="nota" style={{ marginTop: 'var(--s-3)' }}>
						Urdume é o fio longitudinal do tear: o que fica esticado e sustenta a trama.
						Tarefas, projetos, hábitos, agenda e desenho são fios diferentes que só viram
						tecido porque existe uma base que os mantém juntos.
					</p>
				</div>
			</section>

			{/* ------------------------------------------------------- autor */}
			<section className="secao" aria-labelledby="secao-autor">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-autor">
						Quem fez
					</h2>
				</div>
				<div className="cartao" style={{ padding: 'var(--s-4)' }}>
					<p style={{ margin: 0, fontSize: 'var(--text-base)' }}>
						Feito por <strong>Rei Thomato</strong> — para uso próprio, e aberto para quem
						quiser usar do mesmo jeito: um app que guarda o dia no próprio aparelho, sem
						conta e sem nuvem obrigatória.
					</p>

					<div className="sobre-links">
						<a
							className="sobre-link"
							href="https://github.com/reithomoto"
							target="_blank"
							rel="noreferrer noopener"
						>
							<span className="sobre-link__texto">
								<span className="sobre-link__nome">GitHub</span>
								<span className="sobre-link__endereco">github.com/reithomoto</span>
							</span>
							<IconeAvancar size={20} />
						</a>

						<a
							className="sobre-link"
							href="https://instagram.com/reithomato"
							target="_blank"
							rel="noreferrer noopener"
						>
							<span className="sobre-link__texto">
								<span className="sobre-link__nome">Instagram</span>
								<span className="sobre-link__endereco">instagram.com/reithomato</span>
							</span>
							<IconeAvancar size={20} />
						</a>
					</div>

					<p className="nota" style={{ marginTop: 'var(--s-3)', marginBottom: 0 }}>
						O código é público. Relatos de defeito e sugestões são bem-vindos nas issues do
						repositório.
					</p>
				</div>
			</section>

			{/* ------------------------------------------------ o que ele faz */}
			<section className="secao" aria-labelledby="secao-sobre-app">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-sobre-app">
						O que ele faz
					</h2>
				</div>
				<div className="cartao" style={{ padding: 'var(--s-4)' }}>
					<ul className="nota lista-marcada">
						<li>
							<strong>Tarefas</strong> com dia, prazo, hora, subtarefas, repetição e tipo
							(tarefa, lembrete, ideia). Atrasadas, de hoje e sem dia ficam separadas.
						</li>
						<li>
							<strong>Projetos</strong> com categoria, prioridade, cor, prazo, marcos e
							anotações datadas.
						</li>
						<li>
							<strong>Hábitos</strong> com dias da semana, meta, sequência, mapa de calor e
							contagem junto das tarefas no progresso.
						</li>
						<li>
							<strong>Agenda</strong> com eventos, lembretes e avisos no horário — inclusive
							com o app fechado.
						</li>
						<li>
							<strong>Jarvis</strong>: um assistente que observa tarefas, hábitos, agenda e
							projetos, aparece numa ilha no topo quando tem algo a dizer, e só age depois
							que você confirma.
						</li>
						<li>
							<strong>Progresso</strong> com as tarefas e os hábitos empilhados no mesmo
							gráfico, para ver de onde veio o dia.
						</li>
						<li>
							<strong>Aparência</strong> com tema claro, escuro ou do sistema, cor-semente
							livre numa roda de harmonia, quatro fontes e preto puro em telas OLED.
							Cada projeto, hábito e evento aceita qualquer cor, não só as da paleta.
						</li>
						<li>
							<strong>Backup</strong> em arquivo JSON, exportado para a pasta do aparelho e
							importável em outro.
						</li>
					</ul>
				</div>
			</section>

			<section className="secao" aria-labelledby="secao-privacidade">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-privacidade">
						Privacidade
					</h2>
				</div>
				<div className="cartao" style={{ padding: 'var(--s-4)' }}>
					<p className="nota">
						Tudo fica no seu aparelho (IndexedDB). Nada é enviado para servidor, exceto o
						resumo que a IA recebe quando você usa a conversa — e ele vai para o provedor
						cuja chave você mesmo colou. Notas livres nunca saem do aparelho.
					</p>
				</div>
			</section>

			<p className="rodape-versao">Urdume · dados só neste aparelho</p>
		</PaginaDeAjustes>
	)
}
