import { readFile, writeFile } from 'node:fs/promises'
import * as lucide from 'lucide-react'

/**
 * Gera `src/ui/icones.tsx` a partir do Lucide.
 *
 * Mantém exatamente os mesmos nomes exportados (IconeAdicionar, IconePasta…),
 * para nenhuma tela precisar mudar. O mapeamento abaixo é a decisão de design:
 * cada função do app aponta para o ícone que a representa, no mesmo estilo
 * (traço 1.75, cantos redondos, 24 px).
 */

const MAPA = {
	IconeAdicionar: 'Plus',
	IconeConcluir: 'Check',
	IconeConcluido: 'CircleCheckBig',
	IconeCirculo: 'Circle',
	IconeApagar: 'Trash2',
	IconeLimpar: 'Eraser',
	IconeEditar: 'Pencil',
	IconeCalendario: 'CalendarDays',
	IconeAlarme: 'AlarmClock',
	IconeTarefaFeita: 'ListChecks',
	IconeFogo: 'Flame',
	IconeAjustes: 'Settings',
	IconeVoltar: 'ArrowLeft',
	IconeAvancar: 'ArrowRight',
	IconeAnterior: 'ChevronLeft',
	IconeProximo: 'ChevronRight',
	IconeExpandir: 'ChevronDown',
	IconeFechar: 'X',
	IconeBuscar: 'Search',
	IconeFiltrar: 'ListFilter',
	IconeOrdenar: 'ArrowUpDown',
	IconeGrade: 'Grid3x3',
	IconePainel: 'LayoutDashboard',
	IconeCamadas: 'Layers',
	IconeNota: 'StickyNote',
	IconePasta: 'Folder',
	IconeBandeira: 'Flag',
	IconeEtiqueta: 'Tag',
	IconeHorario: 'Clock',
	IconeCronometro: 'Timer',
	IconeRepetir: 'Repeat',
	IconeMais: 'Plus',
	IconeMaisVertical: 'EllipsisVertical',
	IconeArrastar: 'GripVertical',
	IconeAjuste: 'SlidersHorizontal',
	IconePaleta: 'Palette',
	IconeEscuro: 'Moon',
	IconeClaro: 'Sun',
	IconeSistema: 'Smartphone',
	IconeTexto: 'Type',
	IconeContraste: 'Contrast',
	IconeAcessibilidade: 'Accessibility',
	IconeBaixar: 'Download',
	IconeEnviar: 'Upload',
	IconeCompartilhar: 'Share2',
	IconeImprimir: 'Printer',
	IconeLink: 'Link',
	IconeQr: 'QrCode',
	IconeSincronizar: 'RefreshCw',
	IconeSincronizado: 'CheckCheck',
	IconeOffline: 'CloudOff',
	IconeNovaTarefa: 'SquarePen',
	IconeAviso: 'TriangleAlert',
	IconeEvento: 'CalendarClock',
	IconeHoje: 'CalendarRange',
	IconeHistorico: 'History',
	IconeArquivar: 'Archive',
	IconeInsights: 'ChartLine',
	IconeGrafico: 'ChartColumn',
	IconeAnel: 'CircleDashed',
	IconeSubir: 'ChevronUp',
	IconeDescer: 'ChevronDown',
	IconeRemover: 'Minus',
	IconeTudoFeito: 'CheckCheck',
	IconeDia: 'Sun',
	IconeSemana: 'CalendarRange',
	IconeApps: 'LayoutGrid',
	IconeDescricao: 'FileText',
	IconeRaio: 'Zap',
	IconeDesfazer: 'Undo2',
	IconeRefazer: 'Redo2',
	IconeAlinhamento: 'AlignLeft',
	IconeGrelha: 'Grid3x3',
	IconeAlinharEsquerda: 'AlignLeft',
	IconeAlinharCentro: 'AlignCenter',
	IconeAlinharDireita: 'AlignRight',
	IconeListaAdicionar: 'ListPlus',
	IconeListaFeita: 'ListChecks',
}

const faltando = Object.values(MAPA).filter((nome) => !(nome in lucide))
if (faltando.length) {
	throw new Error('Ícones inexistentes no Lucide: ' + faltando.join(', '))
}

// PascalCase → kebab para achar o nó do ícone no pacote.
const kebab = (nome) => nome.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const comentarios = {
	IconeAdicionar: 'Criar qualquer coisa',
	IconeConcluir: 'Marcar como feito',
	IconeConcluido: 'Feito / concluído',
	IconeCirculo: 'Vazio, a fazer',
	IconeApagar: 'Excluir de vez',
	IconeLimpar: 'Limpar concluídas',
	IconeEditar: 'Editar',
	IconeCalendario: 'Agenda e datas',
	IconeAlarme: 'Lembrete com hora',
	IconeTarefaFeita: 'Tarefas',
	IconeFogo: 'Hábitos',
	IconeAjustes: 'Ajustes',
	IconeVoltar: 'Voltar',
	IconeAvancar: 'Avançar',
	IconeAnterior: 'Mês/dia anterior',
	IconeProximo: 'Próximo',
	IconeExpandir: 'Abrir detalhes',
	IconeFechar: 'Fechar',
	IconeBuscar: 'Buscar',
	IconeFiltrar: 'Filtrar',
	IconeOrdenar: 'Ordenar',
	IconeGrade: 'Grade do mês',
	IconePainel: 'Hoje / painel',
	IconeCamadas: 'Camadas do quadro',
	IconeNota: 'Nota',
	IconePasta: 'Projetos e listas',
	IconeBandeira: 'Marcos e prioridade',
	IconeEtiqueta: 'Etiqueta',
	IconeHorario: 'Hora',
	IconeCronometro: 'Duração',
	IconeRepetir: 'Repete',
	IconeMais: 'Mais opções',
	IconeMaisVertical: 'Menu de contexto',
	IconeArrastar: 'Arrastar para reordenar',
	IconeAjuste: 'Montar o Início',
	IconePaleta: 'Cores do app',
	IconeEscuro: 'Tema escuro',
	IconeClaro: 'Tema claro',
	IconeSistema: 'Seguir o aparelho',
	IconeTexto: 'Fonte',
	IconeContraste: 'Alto contraste',
	IconeAcessibilidade: 'Acessibilidade',
	IconeBaixar: 'Exportar backup',
	IconeEnviar: 'Importar backup',
	IconeCompartilhar: 'Compartilhar',
	IconeImprimir: 'Imprimir',
	IconeLink: 'Link',
	IconeQr: 'Código QR',
	IconeSincronizar: 'Sincronizar',
	IconeSincronizado: 'Em dia',
	IconeOffline: 'Sem conexão',
	IconeNovaTarefa: 'Nova tarefa',
	IconeAviso: 'Atenção',
	IconeEvento: 'Evento',
	IconeHoje: 'Hoje',
	IconeHistorico: 'Histórico',
	IconeArquivar: 'Arquivar',
	IconeInsights: 'Evolução',
	IconeGrafico: 'Gráfico',
	IconeAnel: 'Progresso',
	IconeSubir: 'Subir',
	IconeDescer: 'Descer',
	IconeRemover: 'Remover',
	IconeTudoFeito: 'Tudo feito',
	IconeDia: 'Dia',
	IconeSemana: 'Semana',
	IconeApps: 'Aplicativos',
	IconeDescricao: 'Quadros, páginas e notas',
	IconeRaio: 'Rápido',
	IconeDesfazer: 'Desfazer',
	IconeRefazer: 'Refazer',
	IconeAlinhamento: 'Alinhamento',
	IconeGrelha: 'Grade',
	IconeAlinharEsquerda: 'Alinhar à esquerda',
	IconeAlinharCentro: 'Centralizar',
	IconeAlinharDireita: 'Alinhar à direita',
	IconeListaAdicionar: 'Adicionar à lista',
	IconeListaFeita: 'Lista concluída',
}

// Os SVG do Lucide vêm como [tag, atributos]; aqui só interessam os filhos de <svg>.
function filhos(no) {
	return no
}

const linhas = []
linhas.push(`import type { ComponentType, SVGProps } from 'react'`)
linhas.push(`import {`)
for (const destino of [...new Set(Object.values(MAPA))]) linhas.push(`\t${destino},`)
linhas.push(`} from 'lucide-react'`)
linhas.push('')
linhas.push(`/**
 * Ícones do Urdume — uma família só.
 *
 * Antes cada ícone era um SVG do Material Symbols copiado à mão: traço grosso,
 * formas cheias e tamanhos ópticos desiguais. Trocado por Lucide, que é um
 * conjunto desenhado com a mesma grade, o mesmo traço (1.75) e o mesmo
 * vocabulário em todos os símbolos — é o que faz a interface deixar de parecer
 * colagem.
 *
 * Os nomes exportados não mudaram: \`IconePasta\` continua sendo o ícone de
 * projeto em todas as telas. \`tamanho\` é a altura em px; a cor vem sempre de
 * \`currentColor\`, para o ícone herdar o estado do botão ou da linha.
 *
 * Arquivo GERADO por \`scripts/gerar-icones.mjs\` — não editar à mão.
 */
export type Props = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & { size?: number | string }`)

for (const [exportado, lucideNome] of Object.entries(MAPA)) {
	linhas.push('')
	linhas.push(`/** ${comentarios[exportado]} — \`${lucideNome}\`. */`)
	linhas.push(`export function ${exportado}({ size = 24, strokeWidth = 1.75, ...props }: Props) {`)
	linhas.push(`\tconst Icone = ${lucideNome} as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>`)
	linhas.push(`\treturn <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />`)
	linhas.push(`}`)
}

await writeFile(new URL('../src/ui/icones.tsx', import.meta.url), linhas.join('\n') + '\n')
console.log('gerado:', Object.keys(MAPA).length, 'ícones')
