import { PaginaDeAjustes } from '@/ui/PaginaDeAjustes'
import { SecaoAcessibilidade } from '@/ui/acessibilidade'

/**
 * Acessibilidade — página própria.
 *
 * `SecaoAcessibilidade` já era um componente fechado; antes ele ficava no meio
 * da rolagem de Ajustes, entre a aparência e o backup. Aqui ele tem a página
 * inteira, e o conteúdo não mudou.
 */
export function AjustesAcessibilidade() {
	return (
		<PaginaDeAjustes titulo="Acessibilidade" sobre="Leitura, contraste e movimento">
			<SecaoAcessibilidade />
		</PaginaDeAjustes>
	)
}
