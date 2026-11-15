import type { BlocoDoProjeto, Project } from '@/db/db'

/**
 * Blocos da tela de um projeto.
 *
 * A tela tem sete seções possíveis. Antes a ordem era fixa no JSX e todas
 * apareciam sempre — o mesmo problema que o Início já tinha resolvido com
 * blocos configuráveis. Aqui a configuração vive em `Project.blocos` e o
 * conteúdo continua nas tabelas próprias: ocultar um bloco NÃO apaga nada.
 *
 * A regra de leitura é a mesma dos hábitos e das tarefas: registro sem o campo
 * vale como padrão. Nenhum projeto existente muda ao atualizar o app.
 */

type TipoBlocoDoProjeto = BlocoDoProjeto['tipo']

interface DefinicaoBlocoDoProjeto {
	tipo: TipoBlocoDoProjeto
	nome: string
	descricao: string
	tituloPadrao: string
	/** Blocos essenciais não podem ser removidos, só ocultados. */
	essencial?: boolean
}

export const BLOCOS_DO_PROJETO: DefinicaoBlocoDoProjeto[] = [
	{
		tipo: 'painel',
		nome: 'Painel',
		descricao: 'Progresso, atrasos, marcos e prazo numa faixa',
		tituloPadrao: 'Painel',
		essencial: true,
	},
	{
		tipo: 'marcos',
		nome: 'Marcos',
		descricao: 'As entregas que dividem o caminho',
		tituloPadrao: 'Marcos',
	},
	{
		tipo: 'tarefas',
		nome: 'Tarefas',
		descricao: 'O que falta fazer neste projeto',
		tituloPadrao: 'Tarefas',
		essencial: true,
	},
	{
		tipo: 'anotacoes',
		nome: 'Anotações',
		descricao: 'Notas datadas, uma por linha',
		tituloPadrao: 'Anotações',
	},
	{
		tipo: 'resumo',
		nome: 'Resumo do projeto',
		descricao: 'O parágrafo de contexto que sempre aparece',
		tituloPadrao: 'Resumo do projeto',
	},
	{
		tipo: 'texto',
		nome: 'Texto livre',
		descricao: 'Um recado, links, o que quiser ter à mão',
		tituloPadrao: 'Recados',
	},
]

export function definicaoDoBloco(tipo: TipoBlocoDoProjeto): DefinicaoBlocoDoProjeto {
	return BLOCOS_DO_PROJETO.find((bloco) => bloco.tipo === tipo) ?? BLOCOS_DO_PROJETO[0]!
}

/**
 * Configuração inicial. A ordem segue as perguntas de quem gerencia:
 * em que pé está → qual a próxima entrega → o que falta fazer → o que foi
 * escrito → o recado curto.
 */
export const BLOCOS_DO_PROJETO_PADRAO: BlocoDoProjeto[] = [
	{ id: 'p-painel', tipo: 'painel' },
	{ id: 'p-marcos', tipo: 'marcos' },
	{ id: 'p-tarefas', tipo: 'tarefas' },
	{ id: 'p-anotacoes', tipo: 'anotacoes' },
	{ id: 'p-resumo', tipo: 'resumo' },
]

/**
 * Blocos efetivos de um projeto, na ordem de exibição.
 *
 * Faz três coisas que o JSX não pode fazer sozinho:
 * - cai no padrão quando o projeto não tem configuração;
 * - garante que um bloco ESSENCIAL (painel, tarefas) exista, mesmo que uma
 *   configuração antiga ou corrompida o tenha perdido — perder o painel é
 *   perder a orientação dentro do projeto;
 * - acrescenta tipos novos que o app ganhou depois da configuração ter sido
 *   gravada, para o usuário não ficar sem um recurso novo em silêncio.
 */
export function blocosDoProjeto(projeto: Pick<Project, 'blocos'>): BlocoDoProjeto[] {
	const configurados = projeto.blocos
	if (!Array.isArray(configurados) || configurados.length === 0) {
		return BLOCOS_DO_PROJETO_PADRAO
	}

	const vistos = new Set<string>()
	const saida: BlocoDoProjeto[] = []

	for (const bloco of configurados) {
		// Tipo desconhecido (configuração de uma versão futura): ignora em vez
		// de quebrar a tela inteira.
		if (!BLOCOS_DO_PROJETO.some((def) => def.tipo === bloco.tipo)) continue
		// Um bloco por tipo: dois painéis não fazem sentido e confundiriam a
		// edição. O primeiro vence.
		if (vistos.has(bloco.tipo)) continue
		vistos.add(bloco.tipo)
		saida.push(bloco)
	}

	for (const definicao of BLOCOS_DO_PROJETO) {
		if (!definicao.essencial || vistos.has(definicao.tipo)) continue
		saida.unshift({ id: `p-${definicao.tipo}`, tipo: definicao.tipo })
	}

	return saida
}

/** Blocos visíveis, na ordem — o que a tela desenha. */
export function blocosVisiveisDoProjeto(projeto: Pick<Project, 'blocos'>): BlocoDoProjeto[] {
	return blocosDoProjeto(projeto).filter((bloco) => !bloco.oculto)
}

/** Tipos ainda não usados, para o seletor de "adicionar bloco". */
export function tiposDisponiveisNoProjeto(projeto: Pick<Project, 'blocos'>): TipoBlocoDoProjeto[] {
	const usados = new Set(blocosDoProjeto(projeto).map((bloco) => bloco.tipo))
	return BLOCOS_DO_PROJETO.filter((def) => !usados.has(def.tipo)).map((def) => def.tipo)
}

export function novIdBlocoDoProjeto(): string {
	return `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
