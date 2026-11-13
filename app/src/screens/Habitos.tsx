import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Habit } from '@/db/db'
import {
	alternarDiaHabito,
	atualizarHabito,
	criarHabito,
	excluirHabito,
	registrarValor,
	valeNoDia,
} from '@/db/habitos'
import { useHabitosCalculados } from '@/db/habitos'
import type { HabitoCalculado } from '@/db/habitos'
import { adicionarDias, capitalizar, chaveDoDia, diaDeHoje, formatarHora } from '@/lib/date'
import { Link } from '@/app/router'
import { Topo } from '@/ui/AppShell'
import { Folha } from '@/ui/Folha'
import { estiloCor } from '@/ui/cores'
import { PALETA, corDoIndice } from '@/ui/paleta'
import {
	IconeAdicionar,
	IconeApagar,
	IconeCalendario,
	IconeConcluido,
	IconeEditar,
	IconeFogo,
	IconeHorario,
	IconeRepetir,
} from '@/ui/icones'

const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const DIAS_LONGOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * Hábitos — tela própria, como no Grit.
 *
 * Cada hábito tem sua semana clicável (marcar um dia passado conta para o
 * histórico), sequência, consistência de 30 dias e heatmap. Hábito com meta
 * mostra o quanto falta; tocar abre o registro do valor.
 */
export function Habitos() {
	const calculados = useHabitosCalculados()
	const [criando, setCriando] = useState(false)
	const [editando, setEditando] = useState<Habit | null>(null)
	const [registrando, setRegistrando] = useState<HabitoCalculado | null>(null)
	const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'feitos'>('todos')

	const hoje = useMemo(() => diaDeHoje(), [])
	const chaveHoje = chaveDoDia(hoje)

	const lista = useMemo(() => {
		const todos = calculados ?? []
		if (filtro === 'pendentes') return todos.filter((h) => h.valeHoje && !h.concluidoHoje)
		if (filtro === 'feitos') return todos.filter((h) => h.concluidoHoje)
		return todos
	}, [calculados, filtro])

	const feitos = (calculados ?? []).filter((h) => h.concluidoHoje).length
	const devidos = (calculados ?? []).filter((h) => h.valeHoje).length

	return (
		<div className="tela">
			<Topo
				titulo="Hábitos"
				sobre={
					calculados === undefined
						? 'Carregando…'
						: devidos === 0
							? 'Nenhum hábito para hoje'
							: `${feitos} de ${devidos} feitos hoje`
				}
			/>

			<div className="conteudo" style={{ paddingTop: 0 }}>
				<div className="secao">
					<div className="segmentado segmentado--baixo" role="group" aria-label="Filtrar hábitos">
						{(
							[
								['todos', 'Todos'],
								['pendentes', 'Pendentes'],
								['feitos', 'Feitos'],
							] as const
						).map(([valor, rotulo]) => (
							<button
								key={valor}
								type="button"
								className="segmentado__item"
								aria-pressed={filtro === valor}
								onClick={() => setFiltro(valor)}
							>
								{rotulo}
							</button>
						))}
					</div>
				</div>

				<section className="secao" aria-label="Seus hábitos">
					{calculados === undefined ? (
						<div className="cartao esqueleto" aria-hidden="true">
							{[0, 1].map((i) => (
								<div key={i} className="esqueleto__linha">
									<span className="esqueleto__titulo" />
									<span className="esqueleto__meta" />
								</div>
							))}
						</div>
					) : lista.length === 0 ? (
						<div className="cartao cartao--vazio">
							<span className="vazio__icone" aria-hidden="true">
								<IconeFogo size={28} />
							</span>
							<p>
								{filtro === 'todos'
									? 'Nenhum hábito ainda. Comece com um pequeno, de preferência diário.'
									: 'Nada neste filtro agora.'}
							</p>
							<button type="button" className="botao botao--primario" onClick={() => setCriando(true)}>
								<IconeAdicionar size={20} />
								Criar hábito
							</button>
						</div>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
							{lista.map((habito) => (
								<CartaoHabito
									key={habito.id}
									habito={habito}
									hoje={chaveHoje}
									onRegistrar={() => setRegistrando(habito)}
									onEditar={() => setEditando(habito)}
								/>
							))}
						</div>
					)}
				</section>

				{calculados && calculados.length > 0 ? (
					<section className="secao" aria-label="Visão geral">
						<div className="secao-cabecalho">
							<h2 className="secao-titulo">
								<span className="secao-titulo__icone" aria-hidden="true">
									<IconeCalendario size={18} />
								</span>
								Últimos 30 dias
							</h2>
						</div>
						<div className="cartao" style={{ padding: 'var(--s-4)' }}>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
								{calculados.map((habito) => (
									<div key={habito.id} style={estiloCor(habito.cor ?? 0)}>
										<div
											style={{
												display: 'flex',
												justifyContent: 'space-between',
												fontSize: 'var(--text-sm)',
												fontWeight: 600,
												marginBottom: 6,
											}}
										>
											<span style={{ color: 'var(--on-surface)' }}>{habito.title}</span>
											<span style={{ color: 'var(--on-surface-variant)' }}>
												{habito.consistencia}% · {habito.concluidos30} dias
											</span>
										</div>
										<div
											style={{
												height: 8,
												borderRadius: 999,
												background: 'var(--surface-container-highest)',
												overflow: 'hidden',
											}}
										>
											<div
												style={{
													width: `${habito.consistencia}%`,
													height: '100%',
													borderRadius: 999,
													background: corDoIndice(habito.cor ?? 0).hex,
													transition: 'width var(--dur-slow) var(--ease-emphasized)',
												}}
											/>
										</div>
									</div>
								))}
							</div>
						</div>
					</section>
				) : null}

				<CalendarioGeral habitos={calculados ?? []} />
			</div>


			<FormularioHabito aberto={criando} onFechar={() => setCriando(false)} />
			<FormularioHabito
				aberto={editando !== null}
				habito={editando}
				onFechar={() => setEditando(null)}
			/>
			<RegistroHabito habito={registrando} onFechar={() => setRegistrando(null)} hoje={chaveHoje} />
		</div>
	)
}

/** Cartão de um hábito, com a semana e o anel/contador. */
function CartaoHabito({
	habito,
	hoje,
	onRegistrar,
	onEditar,
}: {
	habito: HabitoCalculado
	hoje: string
	onRegistrar: () => void
	onEditar: () => void
}) {
	const cor = corDoIndice(habito.cor ?? 0).hex
	const dataHoje = new Date(`${hoje}T12:00:00`)

	// A semana mostrada termina no domingo seguinte, sempre com 7 dias.
	const inicioSemana = adicionarDias(dataHoje, -((dataHoje.getDay() + 6) % 7))
	const dias = Array.from({ length: 7 }, (_, i) => adicionarDias(inicioSemana, i))

	const mensuravel = (habito.targetValue ?? 0) > 0
	const valor = habito.hoje?.value ?? 0

	return (
		<article
			className={[
				'habito',
				habito.concluidoHoje ? 'habito--feito' : '',
				habito.valeHoje ? '' : 'habito--fora',
			]
				.filter(Boolean)
				.join(' ')}
			style={estiloCor(habito.cor ?? 0)}
		>
			<div className="habito__cabecalho">
				<button
					type="button"
					className="habito__marca"
					onClick={() =>
						mensuravel ? onRegistrar() : void alternarDiaHabito(habito, hoje)
					}
					aria-label={
						mensuravel
							? `Registrar ${habito.title}`
							: `${habito.concluidoHoje ? 'Desmarcar' : 'Marcar'} ${habito.title} hoje`
					}
					aria-pressed={habito.concluidoHoje}
				>
					<IconeConcluido size={24} />
				</button>

				<button
					type="button"
					className="habito__texto"
					onClick={onEditar}
					style={{ textAlign: 'left' }}
					aria-label={`Editar ${habito.title}`}
				>
					<span className="habito__titulo">{habito.title}</span>
					<span className="habito__descricao">
						{habito.description
							? habito.description
							: mensuravel
								? `${valor} de ${habito.targetValue} ${habito.targetUnit || ''}`
								: habito.startMin != null
									? formatarHora(new Date(2026, 0, 1, Math.floor(habito.startMin / 60), habito.startMin % 60))
									: habito.valeHoje
										? 'Hoje é dia deste hábito'
										: 'Hoje não é dia deste hábito'}
					</span>
				</button>

				<div className="habito__numeros">
					{mensuravel ? (
						<span className="habito__meta">
							{valor}/{habito.targetValue}
						</span>
					) : null}
					<span className="habito__sequencia" title={`Sequência: ${habito.sequencia} dias`}>
						<IconeFogo size={16} />
						{habito.sequencia}
					</span>
				</div>
			</div>

			<div className="habito__semana" role="group" aria-label={`Semana de ${habito.title}`}>
				{dias.map((data) => {
					const chave = chaveDoDia(data)
					const registro = habito.porDia.get(chave)
					const valido = valeNoDia(habito, data)
					const futuro = chave > hoje
					const ehHoje = chave === hoje
					return (
						<button
							key={chave}
							type="button"
							className={[
								'habito__dia',
								registro ? 'habito__dia--feito' : '',
								ehHoje ? 'habito__dia--hoje' : '',
								!valido ? 'habito__dia--fora' : '',
								futuro ? 'habito__dia--futuro' : '',
							]
								.filter(Boolean)
								.join(' ')}
							aria-pressed={Boolean(registro)}
							aria-label={`${capitalizar(DIAS_LONGOS[data.getDay()] ?? '')}, ${data.getDate()}: ${
								registro ? 'feito' : 'não feito'
							}`}
							disabled={futuro}
							onClick={() => void alternarDiaHabito(habito, chave)}
						>
							<span className="habito__dia-letra" aria-hidden="true">
								{DIAS_CURTOS[data.getDay()]}
							</span>
							<span className="habito__dia-numero">{data.getDate()}</span>
						</button>
					)
				})}
			</div>

			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginTop: 'var(--s-3)' }}>
				<span className="nota" style={{ flex: 1 }}>
					{habito.consistencia}% nos últimos 30 dias
				</span>
				<span className="botao botao--texto" style={{ minHeight: 32 }}>
					{habito.recorde} de recorde
				</span>
			</div>
			<div
				aria-hidden="true"
				style={{
					height: 3,
					borderRadius: 999,
					marginTop: 6,
					background: cor,
					opacity: 0.25 + (habito.consistencia / 100) * 0.75,
				}}
			/>
		</article>
	)
}

/** Heatmap de 5 semanas para os hábitos selecionados. */
function CalendarioGeral({ habitos }: { habitos: HabitoCalculado[] }) {
	if (habitos.length === 0) return null

	const hoje = diaDeHoje()
	const dias = Array.from({ length: 35 }, (_, i) => adicionarDias(hoje, i - 34))

	return (
		<section className="secao" aria-label="Mapa de calor dos hábitos">
			<div className="secao-cabecalho">
				<h2 className="secao-titulo">
					<span className="secao-titulo__icone" aria-hidden="true">
						<IconeCalendario size={18} />
					</span>
					Mapa de calor
				</h2>
			</div>
			<div className="cartao" style={{ padding: 'var(--s-4)' }}>
				<div className="heatmap" role="img" aria-label="Hábitos concluídos por dia nas últimas 5 semanas">
					{dias.map((data) => {
						const chave = chaveDoDia(data)
						const devidos = habitos.filter((h) => valeNoDia(h, data))
						const feitos = devidos.filter((h) => h.porDia.get(chave)).length
						const nivel = devidos.length === 0 ? 0 : Math.ceil((feitos / devidos.length) * 4)
						return (
							<span
								key={chave}
								className={nivel > 0 ? `heatmap__celula heatmap__celula--n${nivel}` : 'heatmap__celula'}
								title={`${chave}: ${feitos} de ${devidos.length}`}
							/>
						)
					})}
				</div>
				<p className="nota" style={{ marginTop: 'var(--s-3)' }}>
					Cada quadrado é um dia proporcional ao que você cumpriu. Toque num dia na semana do hábito para
					corrigir o passado.
				</p>
			</div>
		</section>
	)
}

/** Folha de criar/editar hábito. */
function FormularioHabito({
	aberto,
	habito,
	onFechar,
}: {
	aberto: boolean
	habito?: Habit | null
	onFechar: () => void
}) {
	const [titulo, setTitulo] = useState(habito?.title ?? '')
	const [descricao, setDescricao] = useState(habito?.description ?? '')
	const [cor, setCor] = useState(Number(habito?.cor ?? 0))
	const [hora, setHora] = useState(
		habito?.startMin != null
			? `${String(Math.floor(habito.startMin / 60)).padStart(2, '0')}:${String(habito.startMin % 60).padStart(2, '0')}`
			: '',
	)
	const [dias, setDias] = useState<number[]>(habito?.dias ?? [])
	const [meta, setMeta] = useState(habito?.targetValue ? String(habito.targetValue) : '')
	const [unidade, setUnidade] = useState(habito?.targetUnit ?? '')
	const [confirmando, setConfirmando] = useState(false)

	// O formulário nasce de um hábito diferente a cada abertura: reinicia os
	// campos quando a folha abre, sem precisar remontar o componente.
	const chave = `${aberto ? 'aberto' : 'fechado'}:${habito?.id ?? 'novo'}`
	const [chaveAtual, setChaveAtual] = useState(chave)
	if (chave !== chaveAtual) {
		setChaveAtual(chave)
		setTitulo(habito?.title ?? '')
		setDescricao(habito?.description ?? '')
		setCor(Number(habito?.cor ?? 0))
		setHora(
			habito?.startMin != null
				? `${String(Math.floor(habito.startMin / 60)).padStart(2, '0')}:${String(habito.startMin % 60).padStart(2, '0')}`
				: '',
		)
		setDias(habito?.dias ?? [])
		setMeta(habito?.targetValue ? String(habito.targetValue) : '')
		setUnidade(habito?.targetUnit ?? '')
		setConfirmando(false)
	}

	async function salvar(): Promise<void> {
		const nome = titulo.trim()
		if (!nome) return

		const dados = {
			title: nome,
			description: descricao.trim() || null,
			cor,
			startMin: hora ? Number(hora.split(':')[0]) * 60 + Number(hora.split(':')[1]) : null,
			dias,
			targetValue: meta ? Number(meta.replace(',', '.')) : 0,
			targetUnit: unidade.trim(),
			// O horário É o pedido de aviso. Sem sincronizar este campo, ele
			// ficava sempre falso enquanto a agenda avisava pelo horário — dois
			// lugares discordando sobre a mesma intenção.
			reminder: Boolean(hora),
		}

		if (habito) await atualizarHabito(habito.id, dados)
		else await criarHabito(dados)
		onFechar()
	}

	return (
		<Folha
			titulo={habito ? 'Editar hábito' : 'Novo hábito'}
			sobre="Marque os dias em que ele vale. Sem dia marcado, vale todos."
			aberta={aberto}
			onFechar={onFechar}
			passo={confirmando ? 'excluir' : 'form'}
		>
			{confirmando ? (
				<div className="formulario">
					<p className="nota">
						Excluir <strong>{habito?.title}</strong> remove o histórico de dias dele. Não dá para desfazer.
					</p>
					<div className="formulario__acoes">
						<button type="button" className="botao" onClick={() => setConfirmando(false)}>
							Manter
						</button>
						<button
							type="button"
							className="botao botao--perigo-solido"
							onClick={() => {
								if (habito) void excluirHabito(habito.id)
								onFechar()
							}}
						>
							Excluir
						</button>
					</div>
				</div>
			) : (
				<form
					className="formulario"
					onSubmit={(evento) => {
						evento.preventDefault()
						void salvar()
					}}
				>
					<div>
						<label className="campo-rotulo" htmlFor="hab-titulo">
							Nome
						</label>
						<input
							id="hab-titulo"
							data-foco-inicial
							className="campo"
							value={titulo}
							onChange={(evento) => setTitulo(evento.target.value)}
							placeholder="Ex.: Ler, Correr, Beber água"
							maxLength={80}
						/>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="hab-desc">
							Detalhe (opcional)
						</label>
						<input
							id="hab-desc"
							className="campo"
							value={descricao}
							onChange={(evento) => setDescricao(evento.target.value)}
							placeholder="Ex.: 20 páginas antes de dormir"
							maxLength={120}
						/>
					</div>

					<div>
						<span className="campo-rotulo">Dias da semana</span>
						<div style={{ display: 'flex', gap: 6 }}>
							{DIAS_CURTOS.map((letra, indice) => {
								const ativo = dias.includes(indice)
								return (
									<button
										key={indice}
										type="button"
										className="chip chip--pequeno"
										style={{
											flex: 1,
											justifyContent: 'center',
											background: ativo ? corDoIndice(cor).hex : undefined,
											color: ativo ? '#fff' : undefined,
										}}
										aria-pressed={ativo}
										aria-label={capitalizar(DIAS_LONGOS[indice] ?? '')}
										onClick={() =>
											setDias((atual) =>
												atual.includes(indice) ? atual.filter((d) => d !== indice) : [...atual, indice],
											)
										}
									>
										{letra}
									</button>
								)
							})}
						</div>
						<p className="nota" style={{ marginTop: 6 }}>
							{dias.length === 0 ? 'Vale todos os dias.' : 'Só nos dias marcados.'}
						</p>
					</div>

					<div className="campo-duplo">
						<div>
							<label className="campo-rotulo" htmlFor="hab-meta">
								Meta diária
							</label>
							<input
								id="hab-meta"
								className="campo campo--compacto"
								type="number"
								min={0}
								step={1}
								value={meta}
								onChange={(evento) => setMeta(evento.target.value)}
								placeholder="Ex.: 20"
							/>
						</div>
						<div>
							<label className="campo-rotulo" htmlFor="hab-unidade">
								Unidade
							</label>
							<input
								id="hab-unidade"
								className="campo campo--compacto"
								value={unidade}
								onChange={(evento) => setUnidade(evento.target.value)}
								placeholder="páginas, litros"
								maxLength={16}
							/>
						</div>
					</div>

					<div>
						<label className="campo-rotulo" htmlFor="hab-hora">
							Horário habitual (opcional)
						</label>
						<input
							id="hab-hora"
							className="campo campo--compacto"
							type="time"
							value={hora}
							onChange={(evento) => setHora(evento.target.value)}
						/>
					</div>

					<div>
						<span className="campo-rotulo">Cor</span>
						<div className="amostra-cores" style={{ padding: '4px 0 0' }} role="group" aria-label="Cor do hábito">
							{PALETA.map((item) => (
								<button
									key={item.indice}
									type="button"
									className="amostra-cor"
									style={{ background: item.hex }}
									aria-label={item.rotulo}
									aria-pressed={cor === item.indice}
									onClick={() => setCor(item.indice)}
								/>
							))}
						</div>
					</div>

					<div className="formulario__acoes" style={{ justifyContent: 'space-between' }}>
						{habito ? (
							<button type="button" className="botao botao--perigo" onClick={() => setConfirmando(true)}>
								<IconeApagar size={18} />
								Excluir
							</button>
						) : (
							<span />
						)}
						<button type="submit" className="botao botao--primario" disabled={!titulo.trim()}>
							{habito ? 'Salvar' : 'Criar hábito'}
						</button>
					</div>
				</form>
			)}
		</Folha>
	)
}

/** Registro de valor de um hábito com meta. */
function RegistroHabito({
	habito,
	hoje,
	onFechar,
}: {
	habito: HabitoCalculado | null
	hoje: string
	onFechar: () => void
}) {
	const [valor, setValor] = useState('')
	const [chaveAtual, setChaveAtual] = useState<string | null>(null)

	if (!habito) return null

	const alvo = habito.targetValue ?? 0
	const unidade = habito.targetUnit || ''
	const atual = habito.hoje?.value ?? 0

	if (chaveAtual !== `${habito.id}:${hoje}`) {
		setChaveAtual(`${habito.id}:${hoje}`)
		setValor(atual > 0 ? String(atual) : '')
	}

	async function salvar(): Promise<void> {
		if (!habito) return
		const numero = Number(valor.replace(',', '.'))
		await registrarValor(habito, hoje, Number.isFinite(numero) ? numero : 0)
		onFechar()
	}

	return (
		<Folha titulo={`Registrar ${habito.title}`} sobre={`Meta: ${alvo} ${unidade}`} aberta onFechar={onFechar}>
			<form
				className="formulario"
				onSubmit={(evento) => {
					evento.preventDefault()
					void salvar()
				}}
			>
				<div>
					<label className="campo-rotulo" htmlFor="reg-valor">
						Quanto você fez hoje?
					</label>
					<input
						id="reg-valor"
						data-foco-inicial
						className="campo"
						type="number"
						inputMode="decimal"
						min={0}
						step={1}
						value={valor}
						onChange={(evento) => setValor(evento.target.value)}
						placeholder={`Ex.: ${alvo}`}
					/>
				</div>

				<div style={{ display: 'flex', gap: 'var(--s-2)' }}>
					{[25, 50, 75, 100].map((porcentagem) => (
						<button
							key={porcentagem}
							type="button"
							className="chip chip--pequeno"
							style={{ flex: 1, justifyContent: 'center' }}
							onClick={() => setValor(String(Math.round((alvo * porcentagem) / 100)))}
						>
							{porcentagem}%
						</button>
					))}
				</div>

				<div className="formulario__acoes">
					<button
						type="button"
						className="botao botao--texto"
						onClick={async () => {
							await registrarValor(habito, hoje, 0)
							onFechar()
						}}
					>
						Limpar dia
					</button>
					<button type="submit" className="botao botao--primario">
						Salvar
					</button>
				</div>
			</form>
		</Folha>
	)
}

/** Detalhe de um hábito: estatísticas completas. */
export function HabitoDetalhe({ id }: { id: string }) {
	const habito = useLiveQuery(async () => {
		const encontrado = await db.habits.get(id)
		if (!encontrado || encontrado.deletedAt) return null
		const registros = await db.habitLogs.where('habitId').equals(id).toArray()
		const { calcularHabito } = await import('@/db/habitos')
		return calcularHabito(encontrado, registros)
	}, [id])

	const [editando, setEditando] = useState(false)

	if (habito === undefined) {
		return (
			<div className="tela">
				<Topo titulo="Hábito" sobre="Abrindo…" />
			</div>
		)
	}

	if (habito === null) {
		return (
			<div className="tela">
				<Topo titulo="Hábito" sobre="Não encontrado" />
				<div className="secao">
					<div className="cartao cartao--vazio">
						<p>Este hábito não existe ou foi excluído.</p>
						<Link route={{ name: 'habitos' }} className="botao">
							Voltar
						</Link>
					</div>
				</div>
			</div>
		)
	}

	const cor = corDoIndice(habito.cor ?? 0).hex

	return (
		<div className="tela" style={estiloCor(habito.cor ?? 0)}>
			<Topo
				titulo={habito.title}
				sobre={habito.description ?? 'Hábito'}
				antes={
					<Link route={{ name: 'habitos' }} className="botao-icone" ariaLabel="Voltar">
						<IconeCalendario size={22} style={{ transform: 'rotate(-90deg)' }} />
					</Link>
				}
				acoes={
					<button type="button" className="botao-icone" aria-label="Editar hábito" onClick={() => setEditando(true)}>
						<IconeEditar size={22} />
					</button>
				}
			/>

			<div className="conteudo">
				<div className="secao">
					<div className="resumo-lista" style={{ ['--cor-cat' as string]: cor }}>
						<div className="anel" role="img" aria-label={`Consistência ${habito.consistencia}%`}>
							<svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
								<circle cx="60" cy="60" r="50" fill="none" stroke="var(--surface-container-highest)" strokeWidth="12" />
								<circle
									cx="60"
									cy="60"
									r="50"
									fill="none"
									stroke={cor}
									strokeWidth="12"
									strokeLinecap="round"
									strokeDasharray={`${(habito.consistencia / 100) * 314} 314`}
									transform="rotate(-90 60 60)"
								/>
							</svg>
							<div className="anel__centro">
								<span className="anel__valor">{habito.consistencia}%</span>
								<span className="anel__rotulo">30 dias</span>
							</div>
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							<span style={{ fontSize: 'var(--text-sm)', color: 'var(--on-surface-variant)' }}>
								Sequência atual
							</span>
							<span className="sequencia" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>
								<IconeFogo size={26} />
								{habito.sequencia}
							</span>
							<span className="nota">Recorde de {habito.recorde} dias</span>
						</div>
					</div>
				</div>

				<section className="secao" aria-label="Histórico">
					<div className="secao-cabecalho">
						<h2 className="secao-titulo">
							<span className="secao-titulo__icone" aria-hidden="true">
								<IconeRepetir size={18} />
							</span>
							Últimos 14 dias
						</h2>
					</div>
					<div className="cartao" style={{ padding: 'var(--s-3)' }}>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(7, 1fr)',
								gap: 6,
							}}
						>
							{habito.ultimos14.map((dia) => (
								<div
									key={dia.day}
									title={`${dia.day}: ${dia.registro?.value ?? 0}`}
									style={{
										aspectRatio: '1',
										borderRadius: 8,
										display: 'grid',
										placeItems: 'center',
										fontSize: 'var(--text-xs)',
										fontWeight: 700,
										background: dia.registro
											? cor
											: 'var(--surface-container-high)',
										color: dia.registro ? '#fff' : 'var(--on-surface-variant)',
									}}
								>
									{dia.data.getDate()}
								</div>
							))}
						</div>
					</div>
				</section>

				{habito.startMin != null ? (
					<section className="secao">
						<div className="linha-grupo">
							<div className="linha">
								<span className="linha__icone" aria-hidden="true">
									<IconeHorario size={20} />
								</span>
								<span className="linha__corpo">
									<span className="linha__titulo">Horário habitual</span>
									<span className="linha__meta">
										{formatarHora(
											new Date(2026, 0, 1, Math.floor(habito.startMin / 60), habito.startMin % 60),
										)}
									</span>
								</span>
							</div>
						</div>
					</section>
				) : null}
			</div>

			<FormularioHabito aberto={editando} habito={habito} onFechar={() => setEditando(false)} />
		</div>
	)
}
