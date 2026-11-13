import type { ComponentType, SVGProps } from 'react'
import {
	Plus,
	Check,
	CircleCheckBig,
	Circle,
	Trash2,
	Eraser,
	Pencil,
	CalendarDays,
	AlarmClock,
	ListChecks,
	Flame,
	Settings,
	ArrowLeft,
	ArrowRight,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	X,
	Search,
	ListFilter,
	ArrowUpDown,
	Grid3x3,
	LayoutDashboard,
	Layers,
	StickyNote,
	Folder,
	Flag,
	Tag,
	Clock,
	Timer,
	Repeat,
	EllipsisVertical,
	GripVertical,
	SlidersHorizontal,
	MessageCircle,
	Palette,
	Moon,
	Sun,
	Smartphone,
	Type,
	Contrast,
	Accessibility,
	Download,
	Upload,
	Share2,
	Printer,
	Link,
	QrCode,
	RefreshCw,
	CheckCheck,
	CloudOff,
	SquarePen,
	TriangleAlert,
	CalendarClock,
	CalendarRange,
	History,
	Archive,
	ChartLine,
	ChartColumn,
	CircleDashed,
	ChevronUp,
	Minus,
	LayoutGrid,
	FileText,
	Zap,
	Undo2,
	Redo2,
	AlignLeft,
	AlignCenter,
	AlignRight,
	ListPlus,
} from 'lucide-react'

/**
 * Ícones do Urdume — uma família só.
 *
 * Antes cada ícone era um SVG do Material Symbols copiado à mão: traço grosso,
 * formas cheias e tamanhos ópticos desiguais. Trocado por Lucide, que é um
 * conjunto desenhado com a mesma grade, o mesmo traço (1.75) e o mesmo
 * vocabulário em todos os símbolos — é o que faz a interface deixar de parecer
 * colagem.
 *
 * Os nomes exportados não mudaram: `IconePasta` continua sendo o ícone de
 * projeto em todas as telas. `tamanho` é a altura em px; a cor vem sempre de
 * `currentColor`, para o ícone herdar o estado do botão ou da linha.
 *
 * Arquivo GERADO por `scripts/gerar-icones.mjs` — não editar à mão.
 */
export type Props = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & { size?: number | string }

/** Criar qualquer coisa — `Plus`. */
export function IconeAdicionar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Plus as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Marcar como feito — `Check`. */
export function IconeConcluir({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Check as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Feito / concluído — `CircleCheckBig`. */
export function IconeConcluido({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CircleCheckBig as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Vazio, a fazer — `Circle`. */
export function IconeCirculo({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Circle as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Excluir de vez — `Trash2`. */
export function IconeApagar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Trash2 as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Limpar concluídas — `Eraser`. */
export function IconeLimpar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Eraser as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Editar — `Pencil`. */
export function IconeEditar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Pencil as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Agenda e datas — `CalendarDays`. */
export function IconeCalendario({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CalendarDays as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Lembrete com hora — `AlarmClock`. */
export function IconeAlarme({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = AlarmClock as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Tarefas — `ListChecks`. */
export function IconeTarefaFeita({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ListChecks as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Hábitos — `Flame`. */
export function IconeFogo({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Flame as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Ajustes — `Settings`. */
export function IconeAjustes({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Settings as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Voltar — `ArrowLeft`. */
export function IconeVoltar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ArrowLeft as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Avançar — `ArrowRight`. */
export function IconeAvancar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ArrowRight as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Mês/dia anterior — `ChevronLeft`. */
export function IconeAnterior({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ChevronLeft as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Próximo — `ChevronRight`. */
export function IconeProximo({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ChevronRight as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Abrir detalhes — `ChevronDown`. */
export function IconeExpandir({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ChevronDown as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Fechar — `X`. */
export function IconeFechar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = X as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Buscar — `Search`. */
export function IconeBuscar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Search as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Filtrar — `ListFilter`. */
export function IconeFiltrar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ListFilter as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Ordenar — `ArrowUpDown`. */
export function IconeOrdenar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ArrowUpDown as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Grade do mês — `Grid3x3`. */
export function IconeGrade({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Grid3x3 as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Hoje / painel — `LayoutDashboard`. */
export function IconePainel({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = LayoutDashboard as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Camadas do quadro — `Layers`. */
export function IconeCamadas({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Layers as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Nota — `StickyNote`. */
export function IconeNota({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = StickyNote as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Projetos e listas — `Folder`. */
export function IconePasta({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Folder as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Marcos e prioridade — `Flag`. */
export function IconeBandeira({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Flag as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Etiqueta — `Tag`. */
export function IconeEtiqueta({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Tag as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Hora — `Clock`. */
export function IconeHorario({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Clock as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Duração — `Timer`. */
export function IconeCronometro({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Timer as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Repete — `Repeat`. */
export function IconeRepetir({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Repeat as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Mais opções — `Plus`. */
export function IconeMais({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Plus as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Menu de contexto — `EllipsisVertical`. */
export function IconeMaisVertical({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = EllipsisVertical as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Arrastar para reordenar — `GripVertical`. */
export function IconeArrastar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = GripVertical as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Montar o Início — `SlidersHorizontal`. */
export function IconeAjuste({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = SlidersHorizontal as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Cores do app — `Palette`. */
export function IconePaleta({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Palette as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Tema escuro — `Moon`. */
export function IconeEscuro({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Moon as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Tema claro — `Sun`. */
export function IconeClaro({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Sun as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Seguir o aparelho — `Smartphone`. */
export function IconeSistema({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Smartphone as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Fonte — `Type`. */
export function IconeTexto({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Type as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Alto contraste — `Contrast`. */
export function IconeContraste({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Contrast as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Acessibilidade — `Accessibility`. */
export function IconeAcessibilidade({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Accessibility as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Exportar backup — `Download`. */
export function IconeBaixar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Download as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Importar backup — `Upload`. */
export function IconeEnviar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Upload as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Compartilhar — `Share2`. */
export function IconeCompartilhar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Share2 as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Imprimir — `Printer`. */
export function IconeImprimir({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Printer as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Link — `Link`. */
export function IconeLink({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Link as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Código QR — `QrCode`. */
export function IconeQr({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = QrCode as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Sincronizar — `RefreshCw`. */
export function IconeSincronizar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = RefreshCw as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Em dia — `CheckCheck`. */
export function IconeSincronizado({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CheckCheck as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Sem conexão — `CloudOff`. */
export function IconeOffline({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CloudOff as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Nova tarefa — `SquarePen`. */
export function IconeNovaTarefa({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = SquarePen as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Atenção — `TriangleAlert`. */
export function IconeAviso({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = TriangleAlert as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Evento — `CalendarClock`. */
export function IconeEvento({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CalendarClock as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Hoje — `CalendarRange`. */
export function IconeHoje({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CalendarRange as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Histórico — `History`. */
export function IconeHistorico({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = History as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Arquivar — `Archive`. */
export function IconeArquivar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Archive as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Evolução — `ChartLine`. */
export function IconeInsights({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ChartLine as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Gráfico — `ChartColumn`. */
export function IconeGrafico({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ChartColumn as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Progresso — `CircleDashed`. */
export function IconeAnel({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CircleDashed as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Subir — `ChevronUp`. */
export function IconeSubir({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ChevronUp as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Descer — `ChevronDown`. */
export function IconeDescer({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ChevronDown as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Remover — `Minus`. */
export function IconeRemover({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Minus as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Tudo feito — `CheckCheck`. */
export function IconeTudoFeito({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CheckCheck as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Dia — `Sun`. */
export function IconeDia({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Sun as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Semana — `CalendarRange`. */
export function IconeSemana({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = CalendarRange as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Aplicativos — `LayoutGrid`. */
export function IconeApps({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = LayoutGrid as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Quadros, páginas e notas — `FileText`. */
export function IconeDescricao({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = FileText as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Rápido — `Zap`. */
export function IconeRaio({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Zap as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Desfazer — `Undo2`. */
export function IconeDesfazer({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Undo2 as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Refazer — `Redo2`. */
export function IconeRefazer({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Redo2 as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Alinhamento — `AlignLeft`. */
export function IconeAlinhamento({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = AlignLeft as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Grade — `Grid3x3`. */
export function IconeGrelha({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = Grid3x3 as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Alinhar à esquerda — `AlignLeft`. */
export function IconeAlinharEsquerda({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = AlignLeft as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Centralizar — `AlignCenter`. */
export function IconeAlinharCentro({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = AlignCenter as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Alinhar à direita — `AlignRight`. */
export function IconeAlinharDireita({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = AlignRight as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Adicionar à lista — `ListPlus`. */
export function IconeListaAdicionar({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ListPlus as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Lista concluída — `ListChecks`. */
export function IconeListaFeita({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = ListChecks as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}

/** Balão de conversa — abre o chat do Jarvis. */
export function IconeConversa({ size = 24, strokeWidth = 1.75, ...props }: Props) {
	const Icone = MessageCircle as ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>
	return <Icone size={size} strokeWidth={strokeWidth} aria-hidden focusable="false" {...props} />
}
