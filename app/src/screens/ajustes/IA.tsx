import { PaginaDeAjustes } from '@/ui/PaginaDeAjustes'
import { SecaoJarvis } from '@/ui/SecaoJarvis'
import { IconeAjustes, IconeRaio } from '@/ui/icones'
import { Link } from '@/app/router'

/**
 * Inteligência — página própria.
 *
 * Aqui fica o que é configuração da IA: provedor, chave, teto de gasto,
 * histórico. O comportamento do dia a dia (modo, tom, autonomia, o que ela
 * observou) continua na tela do Jarvis, que é para isso.
 *
 * Antes esta seção morava no meio dos Ajustes, e o painel de observações dela
 * empurrava os controles para fora da tela. Agora são dois endereços claros.
 */
export function AjustesIA() {
	return (
		<PaginaDeAjustes titulo="Inteligência" sobre="Chave, custo e comportamento">
			<SecaoJarvis />

			<section className="secao" aria-labelledby="secao-jarvis-abrir">
				<div className="secao-cabecalho">
					<h2 className="secao-titulo" id="secao-jarvis-abrir">
						<span className="secao-titulo__icone" aria-hidden="true">
							<IconeRaio size={18} />
						</span>
						Comportamento e observações
					</h2>
				</div>
				<div className="linha-grupo">
					<Link route={{ name: 'jarvis' }} className="linha-ajuste linha-ajuste--entrada">
						<span className="linha-ajuste__icone" aria-hidden="true">
							<IconeAjustes size={20} />
						</span>
						<span className="linha-ajuste__texto">
							<span className="linha-ajuste__titulo">Abrir a central do Jarvis</span>
							<span className="linha-ajuste__descricao">
								Modo, notificações, autonomia, tom, o que ela sabe e o que observou hoje.
							</span>
						</span>
					</Link>
				</div>
			</section>
		</PaginaDeAjustes>
	)
}
