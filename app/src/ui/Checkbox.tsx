import type { ReactNode } from 'react'
import { IconeConcluir } from '@/ui/icones'

/**
 * Caixa de seleção do app.
 *
 * O Jarvis usava `<input type="checkbox">` nativo em cada opção. No aparelho o
 * Android desenhava um quadrado laranja grande que destoava de todo o resto —
 * o app usa círculos e pílulas — e o controle parecia de outro aplicativo.
 * Também convivia com o `.checkbox` que as tarefas já usavam, com dois
 * desenhos diferentes para a mesma ideia.
 *
 * Este componente é o único desenho de "marcar/desmarcar" da interface. Ele é
 * um `<button role="checkbox">`, não um input: o alvo é a caixa inteira de
 * 44 px e o leitor de tela anuncia o estado por `aria-checked`.
 */
export function Checkbox({
	marcado,
	aoMudar,
	rotulo,
	desabilitado = false,
}: {
	marcado: boolean
	aoMudar: (valor: boolean) => void
	rotulo: string
	desabilitado?: boolean
}) {
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={marcado}
			aria-label={rotulo}
			className="checkbox"
			disabled={desabilitado}
			onClick={() => aoMudar(!marcado)}
		>
			<span className="checkbox__marca" aria-hidden="true">
				<IconeConcluir size={16} />
			</span>
		</button>
	)
}

/** Linha com rótulo à esquerda e caixa à direita, no padrão dos Ajustes. */
export function LinhaComCheckbox({
	titulo,
	descricao,
	marcado,
	aoMudar,
}: {
	titulo: string
	descricao?: ReactNode
	marcado: boolean
	aoMudar: (valor: boolean) => void
}) {
	return (
		<label className="jarvis-linha">
			<span>
				<strong>{titulo}</strong>
				{descricao ? <small>{descricao}</small> : null}
			</span>
			<Checkbox marcado={marcado} aoMudar={aoMudar} rotulo={titulo} />
		</label>
	)
}
