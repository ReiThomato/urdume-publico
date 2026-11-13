import type { Retrato } from './retrato'

/**
 * Catálogo de sinais.
 *
 * Cada sinal é uma função pura do retrato: mesma entrada, mesma saída, sem
 * relógio próprio e sem acesso ao banco. É o que permite testar os 41 com dados
 * sintéticos e o que garante que rodar duas vezes o mesmo retrato não gera dois
 * acontecimentos.
 *
 * `nivel` é a relevância POTENCIAL. A relevância real é calculada em
 * `relevancia.ts` (magnitude, urgência, novidade, fadiga, confiança).
 */

export type Nivel = 'informativo' | 'oportunidade' | 'atencao' | 'urgente'

export type Familia = 'tarefas' | 'projetos' | 'agenda' | 'habitos' | 'uso'

/** Constituição "tarefa → projeto → prazo → inatividade". */
export interface Sinal {
	/** Chave estável do catálogo, ex. `tarefa_atrasada`. */
	id: string
	familia: Familia
	nivel: Nivel
	/** Frase curta, já em português, para o painel. */
	titulo: string
	/** Detalhe específico deste retrato (contagens, nomes). */
	detalhe: string
	/** 0–1: quanto passou do limite. */
	magnitude: number
	/** 0–1: proximidade temporal. */
	urgencia: number
	/** Entidades tocadas, para abrir a tela certa. */
	entidades: string[]
	/** A decisão do que fazer aqui precisa de julgamento do modelo? */
	precisaIA: boolean
	/**
	 * Parte da chave de deduplicação. Dois sinais com o mesmo `chave` na mesma
	 * janela são o mesmo acontecimento — o segundo é descartado.
	 */
	chave: string
}

const limitar = (valor: number): number => Math.max(0, Math.min(1, valor))

/** Ids de projetos que participam do acompanhamento. */
function acompanhados(r: Retrato): Retrato['projetos'] {
	return r.projetos.filter((p) => !p.ignorado && p.status !== 'concluido')
}

/**
 * Avalia o catálogo inteiro e devolve só os sinais que dispararam.
 *
 * A ordem da saída é estável (família, depois severidade) para o painel não
 * "pular" entre renders. Quem chama decide o que interrompe.
 */
export function avaliarSinais(r: Retrato): Sinal[] {
	const sinais: Sinal[] = []

	/* ------------------------------- tarefas ------------------------------- */

	if (r.tarefas.abertas > 0 && r.tarefas.semData >= 5) {
		sinais.push({
			id: 'tarefa_criada_sem_data',
			familia: 'tarefas',
			nivel: 'informativo',
			titulo: 'Tarefas sem dia marcado',
			detalhe: `${r.tarefas.semData} tarefas abertas não têm dia nem "algum dia".`,
			magnitude: limitar(r.tarefas.semData / 10),
			urgencia: 0.2,
			entidades: [],
			precisaIA: false,
			chave: `tarefa_criada_sem_data:${r.hoje}`,
		})
	}

	if (r.tarefas.atrasadas > 0) {
		const dias = r.tarefas.relevantes[0]?.diasAtraso ?? 0
		sinais.push({
			id: 'tarefa_atrasada',
			familia: 'tarefas',
			nivel: r.tarefas.atrasoCritico ? 'urgente' : 'atencao',
			titulo: r.tarefas.atrasadas === 1 ? '1 tarefa atrasada' : `${r.tarefas.atrasadas} tarefas atrasadas`,
			detalhe:
				dias > 0
					? `A mais antiga venceu há ${dias} ${dias === 1 ? 'dia' : 'dias'}.`
					: 'Venceram antes de hoje.',
			magnitude: limitar(r.tarefas.atrasadas / 5),
			urgencia: r.tarefas.atrasoCritico ? 0.9 : 0.6,
			entidades: r.tarefas.relevantes.map((t) => t.id),
			precisaIA: false,
			chave: `tarefa_atrasada:${r.hoje}:${r.tarefas.atrasadas}`,
		})
	}

	if (r.tarefas.atrasoCritico && r.tarefas.atrasadas >= 3) {
		sinais.push({
			id: 'atraso_critico',
			familia: 'tarefas',
			nivel: 'urgente',
			titulo: 'Atraso acumulado',
			detalhe: `${r.tarefas.atrasadas} tarefas passaram do dia. Vale reorganizar a semana.`,
			magnitude: limitar(r.tarefas.atrasadas / 6),
			urgencia: 1,
			entidades: [],
			precisaIA: true,
			chave: `atraso_critico:${r.hoje}`,
		})
	}

	if (r.tarefas.concluidasHoje > 0) {
		sinais.push({
			id: 'tarefa_concluida',
			familia: 'tarefas',
			nivel: 'informativo',
			titulo: 'Trabalho do dia',
			detalhe: `${r.tarefas.concluidasHoje} ${r.tarefas.concluidasHoje === 1 ? 'tarefa concluída' : 'tarefas concluídas'} hoje.`,
			magnitude: limitar(r.tarefas.concluidasHoje / 10),
			urgencia: 0.1,
			entidades: [],
			precisaIA: false,
			chave: `tarefa_concluida:${r.hoje}`,
		})
	}

	const blocosFechados = acompanhados(r).filter((p) => p.abertas === 0 && p.concluidas > 0)
	if (blocosFechados.length > 0) {
		sinais.push({
			id: 'bloco_concluido',
			familia: 'tarefas',
			nivel: 'oportunidade',
			titulo: 'Projeto com tudo concluído',
			detalhe: `${blocosFechados.map((p) => p.nome).join(', ')}: nenhuma tarefa aberta. Vale marcar como concluído?`,
			magnitude: 0.5,
			urgencia: 0.3,
			entidades: blocosFechados.map((p) => p.id),
			precisaIA: false,
			chave: `bloco_concluido:${r.hoje}:${blocosFechados.map((p) => p.id).join(',')}`,
		})
	}

	// Dependente liberada: algo foi concluído hoje num projeto que ainda tem
	// tarefas abertas. É a leitura honesta de "esta tarefa esperava aquela":
	// o app não tem campo de dependência, então o vínculo é o projeto e o dia.
	for (const projeto of acompanhados(r)) {
		if (projeto.concluidasHoje > 0 && projeto.abertas > 0) {
			sinais.push({
				id: 'dependente_liberada',
				familia: 'tarefas',
				nivel: 'oportunidade',
				titulo: 'Trabalho liberado',
				detalhe: `"${projeto.nome}": ${projeto.concluidasHoje} ${projeto.concluidasHoje === 1 ? 'tarefa concluída' : 'tarefas concluídas'} hoje${projeto.abertas === 1 ? ' e 1 ainda aberta' : ` e ${projeto.abertas} ainda abertas`}.`,
				magnitude: 0.4,
				urgencia: 0.5,
				entidades: [projeto.id],
				precisaIA: false,
				chave: `dependente_liberada:${projeto.id}:${r.hoje}`,
			})
		}
	}

	if (r.tarefas.subtarefasParadas > 0) {
		sinais.push({
			id: 'subtarefas_paradas',
			familia: 'tarefas',
			nivel: 'atencao',
			titulo: 'Passos parados',
			detalhe: `${r.tarefas.subtarefasParadas} ${r.tarefas.subtarefasParadas === 1 ? 'tarefa tem' : 'tarefas têm'} 5+ subtarefas abertas e nada marcado há uma semana.`,
			magnitude: limitar(r.tarefas.subtarefasParadas / 3),
			urgencia: 0.5,
			entidades: [],
			precisaIA: false,
			chave: `subtarefas_paradas:${r.hoje}`,
		})
	}

	if (r.tarefas.recorrentesFalhando.length > 0) {
		sinais.push({
			id: 'recorrente_falhando',
			familia: 'tarefas',
			nivel: 'atencao',
			titulo: 'Repetição não cumprida',
			detalhe: `"${r.tarefas.recorrentesFalhando[0]}" ficou 3 ciclos sem ser feita.`,
			magnitude: 0.6,
			urgencia: 0.5,
			entidades: [],
			precisaIA: false,
			chave: `recorrente_falhando:${r.hoje}:${r.tarefas.recorrentesFalhando[0]}`,
		})
	}

	if (r.tarefas.cargaHoje >= 6) {
		sinais.push({
			id: 'carga_do_dia',
			familia: 'tarefas',
			nivel: 'atencao',
			titulo: 'Dia carregado',
			detalhe: `${r.tarefas.cargaHoje} tarefas marcadas para hoje.`,
			magnitude: limitar(r.tarefas.cargaHoje / 10),
			urgencia: 0.7,
			entidades: [],
			precisaIA: true,
			chave: `carga_do_dia:${r.hoje}`,
		})
	}

	/* ------------------------------- projetos ------------------------------ */

	for (const projeto of acompanhados(r)) {
		if (projeto.criadoVazio) {
			sinais.push({
				id: 'projeto_criado_vazio',
				familia: 'projetos',
				nivel: 'oportunidade',
				titulo: 'Projeto recém-criado, sem tarefas',
				detalhe: `"${projeto.nome}" ainda não tem tarefas. Quer estruturar os primeiros passos?`,
				magnitude: 0.5,
				urgencia: 0.6,
				entidades: [projeto.id],
				precisaIA: true,
				chave: `projeto_criado_vazio:${projeto.id}`,
			})
		}

		if (projeto.diasSemAtividade >= 7 && projeto.status === 'ativo') {
			sinais.push({
				id: 'projeto_sem_atividade',
				familia: 'projetos',
				nivel: 'atencao',
				titulo: 'Projeto parado',
				detalhe: `"${projeto.nome}" não recebe mudança há ${projeto.diasSemAtividade} dias.`,
				magnitude: limitar(projeto.diasSemAtividade / 21),
				urgencia: 0.5,
				entidades: [projeto.id],
				precisaIA: true,
				chave: `projeto_sem_atividade:${projeto.id}:${Math.floor(projeto.diasSemAtividade / 7)}`,
			})
		}

		if (projeto.diasParaPrazo != null && projeto.diasParaPrazo >= 0 && projeto.diasParaPrazo <= 3 && projeto.progresso < 60) {
			sinais.push({
				id: 'projeto_prazo_proximo',
				familia: 'projetos',
				nivel: 'urgente',
				titulo: 'Prazo de projeto chegando',
				detalhe: `"${projeto.nome}" vence em ${projeto.diasParaPrazo} ${projeto.diasParaPrazo === 1 ? 'dia' : 'dias'} e está em ${projeto.progresso}%.`,
				magnitude: limitar((60 - projeto.progresso) / 60),
				urgencia: limitar(1 - projeto.diasParaPrazo / 4),
				entidades: [projeto.id],
				precisaIA: true,
				chave: `projeto_prazo_proximo:${projeto.id}:${r.hoje}`,
			})
		}

		if (projeto.diasParaPrazo != null && projeto.diasParaPrazo < 0) {
			sinais.push({
				id: 'projeto_prazo_estourado',
				familia: 'projetos',
				nivel: 'urgente',
				titulo: 'Projeto com prazo vencido',
				detalhe: `"${projeto.nome}" passou do prazo há ${Math.abs(projeto.diasParaPrazo)} dias e continua aberto.`,
				magnitude: limitar(Math.abs(projeto.diasParaPrazo) / 14),
				urgencia: 1,
				entidades: [projeto.id],
				precisaIA: true,
				chave: `projeto_prazo_estourado:${projeto.id}:${r.hoje}`,
			})
		}

		if (projeto.progresso === 0 && projeto.diasSemAtividade >= 14 && projeto.abertas > 0) {
			sinais.push({
				id: 'projeto_progresso_parado',
				familia: 'projetos',
				nivel: 'atencao',
				titulo: 'Projeto sem progresso',
				detalhe: `"${projeto.nome}" tem ${projeto.abertas} tarefas abertas e nada concluído há ${projeto.diasSemAtividade} dias.`,
				magnitude: 0.6,
				urgencia: 0.4,
				entidades: [projeto.id],
				precisaIA: true,
				chave: `projeto_progresso_parado:${projeto.id}:${Math.floor(projeto.diasSemAtividade / 7)}`,
			})
		}

		if (projeto.abertas >= 10 && projeto.diasSemAtividade >= 7) {
			sinais.push({
				id: 'projeto_muitas_abertas',
				familia: 'projetos',
				nivel: 'atencao',
				titulo: 'Muitas frentes abertas',
				detalhe: `"${projeto.nome}" tem ${projeto.abertas} tarefas abertas e não conclui nada há ${projeto.diasSemAtividade} dias.`,
				magnitude: limitar(projeto.abertas / 20),
				urgencia: 0.4,
				entidades: [projeto.id],
				precisaIA: true,
				chave: `projeto_muitas_abertas:${projeto.id}:${Math.floor(projeto.diasSemAtividade / 7)}`,
			})
		}

		if (projeto.status === 'ativo' && projeto.marcosPendentes === 0 && projeto.abertas === 0) {
			sinais.push({
				id: 'projeto_sem_proximo_passo',
				familia: 'projetos',
				nivel: 'oportunidade',
				titulo: 'Projeto sem próximo passo',
				detalhe: `"${projeto.nome}" não tem marco pendente nem tarefa aberta.`,
				magnitude: 0.4,
				urgencia: 0.3,
				entidades: [projeto.id],
				precisaIA: true,
				chave: `projeto_sem_proximo_passo:${projeto.id}:${r.hoje}`,
			})
		}

		if (projeto.marcosPendentes > 0 && projeto.progresso >= 80) {
			sinais.push({
				id: 'marco_concluido',
				familia: 'projetos',
				nivel: 'oportunidade',
				titulo: 'Marco ao alcance',
				detalhe: `"${projeto.nome}" está em ${projeto.progresso}% e ainda tem marco pendente.`,
				magnitude: 0.4,
				urgencia: 0.5,
				entidades: [projeto.id],
				precisaIA: true,
				chave: `marco_concluido:${projeto.id}:${r.hoje}`,
			})
		}

		if (projeto.marcosAtrasados > 0) {
			sinais.push({
				id: 'marco_atrasado',
				familia: 'projetos',
				nivel: 'atencao',
				titulo: 'Marco atrasado',
				detalhe: `"${projeto.nome}": ${projeto.marcosAtrasados} ${projeto.marcosAtrasados === 1 ? 'marco passou' : 'marcos passaram'} da data.`,
				magnitude: limitar(projeto.marcosAtrasados / 3),
				urgencia: 0.7,
				entidades: [projeto.id],
				precisaIA: false,
				chave: `marco_atrasado:${projeto.id}:${r.hoje}`,
			})
		}
	}

	/* -------------------------------- agenda ------------------------------- */

	if (r.agenda.conflitosHoje > 0) {
		sinais.push({
			id: 'agenda_conflito',
			familia: 'agenda',
			nivel: 'urgente',
			titulo: 'Compromissos sobrepostos',
			detalhe: `${r.agenda.conflitosHoje} ${r.agenda.conflitosHoje === 1 ? 'horário tem dois' : 'horários têm dois'} compromissos ao mesmo tempo.`,
			magnitude: limitar(r.agenda.conflitosHoje / 3),
			urgencia: 0.9,
			entidades: [],
			precisaIA: false,
			chave: `agenda_conflito:${r.hoje}`,
		})
	}

	const comHora = r.agenda.hoje.filter((e) => !e.diaInteiro)
	if (comHora.length >= 5) {
		sinais.push({
			id: 'agenda_dia_cheio',
			familia: 'agenda',
			nivel: 'atencao',
			titulo: 'Agenda cheia',
			detalhe: `${comHora.length} compromissos hoje.`,
			magnitude: limitar(comHora.length / 8),
			urgencia: 0.6,
			entidades: [],
			precisaIA: false,
			chave: `agenda_dia_cheio:${r.hoje}`,
		})
	}

	if (r.agenda.maiorJanelaLivre >= 60) {
		sinais.push({
			id: 'agenda_janela_livre',
			familia: 'agenda',
			nivel: 'oportunidade',
			titulo: 'Espaço livre hoje',
			detalhe: `Há ${r.agenda.maiorJanelaLivre} minutos livres entre compromissos.`,
			magnitude: limitar(r.agenda.maiorJanelaLivre / 180),
			urgencia: 0.4,
			entidades: [],
			precisaIA: true,
			chave: `agenda_janela_livre:${r.hoje}`,
		})
	}

	if (r.agenda.proximoEmMin != null && r.agenda.proximoEmMin <= 60 && r.agenda.proximoEmMin >= 0) {
		sinais.push({
			id: 'agenda_evento_proximo',
			familia: 'agenda',
			nivel: 'atencao',
			titulo: 'Compromisso próximo',
			detalhe: `Começa em ${r.agenda.proximoEmMin} minutos.`,
			magnitude: limitar(1 - r.agenda.proximoEmMin / 60),
			urgencia: 0.9,
			entidades: [],
			precisaIA: false,
			chave: `agenda_evento_proximo:${r.hoje}`,
		})
	}

	if (r.agenda.semPreparo > 0) {
		sinais.push({
			id: 'agenda_sem_preparo',
			familia: 'agenda',
			nivel: 'oportunidade',
			titulo: 'Compromisso sem preparo',
			detalhe: `${r.agenda.semPreparo} ${r.agenda.semPreparo === 1 ? 'compromisso' : 'compromissos nas próximas 24 h'} sem tarefa aberta no projeto.`,
			magnitude: limitar(r.agenda.semPreparo / 3),
			urgencia: 0.6,
			entidades: [],
			precisaIA: false,
			chave: `agenda_sem_preparo:${r.hoje}`,
		})
	}

	if (r.agenda.cancelados24h > 0 && r.tarefas.cargaHoje > 0) {
		sinais.push({
			id: 'agenda_evento_cancelado',
			familia: 'agenda',
			nivel: 'informativo',
			titulo: 'Compromisso cancelado',
			detalhe: `${r.agenda.cancelados24h} ${r.agenda.cancelados24h === 1 ? 'compromisso saiu' : 'compromissos saíram'} da agenda nas últimas 24 h — há ${r.tarefas.cargaHoje} tarefa(s) para hoje.`,
			magnitude: 0.3,
			urgencia: 0.3,
			entidades: [],
			precisaIA: false,
			chave: `agenda_evento_cancelado:${r.hoje}`,
		})
	}

	if (r.agenda.diasCheiosNaSemana >= 3) {
		sinais.push({
			id: 'agenda_sobrecarga_semana',
			familia: 'agenda',
			nivel: 'atencao',
			titulo: 'Semana sobrecarregada',
			detalhe: `${r.agenda.diasCheiosNaSemana} dias desta semana têm 5+ compromissos.`,
			magnitude: limitar(r.agenda.diasCheiosNaSemana / 7),
			urgencia: 0.4,
			entidades: [],
			precisaIA: true,
			chave: `agenda_sobrecarga_semana:${r.hoje}`,
		})
	}

	/* -------------------------------- hábitos ------------------------------ */

	for (const habito of r.habitos) {
		if (habito.sequencia === 0 && habito.recorde >= 5 && habito.diasSemRegistro >= 1 && habito.diasSemRegistro <= 3) {
			sinais.push({
				id: 'habito_sequencia_quebrada',
				familia: 'habitos',
				nivel: 'atencao',
				titulo: 'Sequência interrompida',
				detalhe: `"${habito.titulo}" vinha de ${habito.recorde} dias e ficou sem ontem.`,
				magnitude: limitar(habito.recorde / 21),
				urgencia: 0.5,
				entidades: [habito.id],
				precisaIA: false,
				chave: `habito_sequencia_quebrada:${habito.id}:${r.hoje}`,
			})
		}

		if (habito.sequencia > 0 && habito.sequencia === habito.recorde && habito.sequencia >= 7) {
			sinais.push({
				id: 'habito_melhor_sequencia',
				familia: 'habitos',
				nivel: 'oportunidade',
				titulo: 'Recorde pessoal',
				detalhe: `"${habito.titulo}" está em ${habito.sequencia} dias seguidos — a maior sequência até agora.`,
				magnitude: limitar(habito.sequencia / 30),
				urgencia: 0.2,
				entidades: [habito.id],
				precisaIA: false,
				chave: `habito_melhor_sequencia:${habito.id}:${habito.sequencia}`,
			})
		}

		if (habito.diasSemRegistro >= 7) {
			sinais.push({
				id: 'habito_abandonado',
				familia: 'habitos',
				nivel: 'atencao',
				titulo: 'Hábito largado',
				detalhe: `"${habito.titulo}" está há ${habito.diasSemRegistro} dias sem registro.`,
				magnitude: limitar(habito.diasSemRegistro / 30),
				urgencia: 0.3,
				entidades: [habito.id],
				precisaIA: false,
				chave: `habito_abandonado:${habito.id}:${Math.floor(habito.diasSemRegistro / 7)}`,
			})
		}

		if (habito.metaQuase) {
			sinais.push({
				id: 'habito_meta_quase',
				familia: 'habitos',
				nivel: 'informativo',
				titulo: 'Quase lá',
				detalhe: `"${habito.titulo}" está perto da meta de hoje.`,
				magnitude: 0.4,
				urgencia: 0.5,
				entidades: [habito.id],
				precisaIA: false,
				chave: `habito_meta_quase:${habito.id}:${r.hoje}`,
			})
		}

		if (habito.conflitoDeHorario) {
			sinais.push({
				id: 'habito_conflito_horario',
				familia: 'habitos',
				nivel: 'informativo',
				titulo: 'Dois hábitos no mesmo horário',
				detalhe: `"${habito.titulo}" começa no mesmo minuto que outro hábito.`,
				magnitude: 0.3,
				urgencia: 0.2,
				entidades: [habito.id],
				precisaIA: false,
				chave: `habito_conflito_horario:${habito.id}`,
			})
		}

		if (habito.devidosNaSemana >= 3 && habito.feitosNaSemana <= habito.devidosNaSemana - 3) {
			sinais.push({
				id: 'habito_semana_ruim',
				familia: 'habitos',
				nivel: 'atencao',
				titulo: 'Semana fraca num hábito',
				detalhe: `"${habito.titulo}": ${habito.feitosNaSemana} de ${habito.devidosNaSemana} dias nesta semana.`,
				magnitude: limitar((habito.devidosNaSemana - habito.feitosNaSemana) / 7),
				urgencia: 0.3,
				entidades: [habito.id],
				precisaIA: false,
				chave: `habito_semana_ruim:${habito.id}:${r.hoje}`,
			})
		}
	}

	/* --------------------------------- uso --------------------------------- */

	if (r.uso.diasSemAbrir >= 3) {
		sinais.push({
			id: 'usuario_inativo',
			familia: 'uso',
			nivel: 'oportunidade',
			titulo: 'Faz dias que você não abre o Urdume',
			detalhe: `Última abertura há ${r.uso.diasSemAbrir} dias.`,
			magnitude: limitar(r.uso.diasSemAbrir / 14),
			urgencia: 0.3,
			entidades: [],
			precisaIA: true,
			chave: `usuario_inativo:${Math.floor(r.uso.diasSemAbrir)}`,
		})
	}

	if (r.uso.diasSemAbrir >= 7 && r.uso.ultimaAbertura != null) {
		sinais.push({
			id: 'usuario_voltou',
			familia: 'uso',
			nivel: 'oportunidade',
			titulo: 'De volta',
			detalhe: 'Faz uma semana ou mais que você não abria o app.',
			magnitude: 0.4,
			urgencia: 0.2,
			entidades: [],
			precisaIA: false,
			chave: `usuario_voltou:${r.hoje}`,
		})
	}

	if (r.tarefas.concluidasHoje >= 20) {
		sinais.push({
			id: 'uso_intenso',
			familia: 'uso',
			nivel: 'informativo',
			titulo: 'Dia de muita conclusão',
			detalhe: `${r.tarefas.concluidasHoje} tarefas concluídas hoje.`,
			magnitude: limitar(r.tarefas.concluidasHoje / 40),
			urgencia: 0.1,
			entidades: [],
			precisaIA: false,
			chave: `uso_intenso:${r.hoje}`,
		})
	}

	if (r.uso.ultimoBackup != null && r.geradoEm - r.uso.ultimoBackup > 14 * 86_400_000) {
		const dias = Math.floor((r.geradoEm - r.uso.ultimoBackup) / 86_400_000)
		sinais.push({
			id: 'backup_antigo',
			familia: 'uso',
			nivel: 'atencao',
			titulo: 'Backup atrasado',
			detalhe: `O último backup foi há ${dias} dias.`,
			magnitude: limitar(dias / 60),
			urgencia: 0.4,
			entidades: [],
			precisaIA: false,
			chave: `backup_antigo:${r.hoje}`,
		})
	}

	if (r.uso.primeiroUsoHoje) {
		sinais.push({
			id: 'primeiro_uso_do_dia',
			familia: 'uso',
			nivel: 'informativo',
			titulo: 'Primeira abertura do dia',
			detalhe: 'Bom dia. O retrato de hoje está pronto.',
			magnitude: 0.2,
			urgencia: 0.1,
			entidades: [],
			precisaIA: false,
			chave: `primeiro_uso_do_dia:${r.hoje}`,
		})
	}

	if (r.hora >= 18 && r.hora <= 21 && r.tarefas.abertas > 0) {
		sinais.push({
			id: 'fim_do_dia',
			familia: 'uso',
			nivel: 'oportunidade',
			titulo: 'Fechamento do dia',
			detalhe: `${r.tarefas.abertas} tarefas continuam abertas. Dá para fechar o dia.`,
			magnitude: limitar(r.tarefas.abertas / 15),
			urgencia: 0.6,
			entidades: [],
			precisaIA: true,
			chave: `fim_do_dia:${r.hoje}`,
		})
	}

	return ordenar(sinais)
}

/** Regras compostas — o que só faz sentido quando os fatos se juntam. */
export function avaliarCompostos(r: Retrato): Sinal[] {
	const sinais: Sinal[] = []

	// Projeto abandonado: criado, sem tarefas, prazo perto, sem retorno.
	for (const projeto of acompanhados(r)) {
		const prazoPerto = projeto.diasParaPrazo != null && projeto.diasParaPrazo >= 0 && projeto.diasParaPrazo < 7
		if (projeto.abertas === 0 && projeto.concluidas === 0 && prazoPerto) {
			sinais.push({
				id: 'projeto_abandonado',
				familia: 'projetos',
				nivel: 'urgente',
				titulo: 'Projeto criado e esquecido',
				detalhe: `"${projeto.nome}" não tem nenhuma tarefa e vence em ${projeto.diasParaPrazo} dias.`,
				magnitude: 0.8,
				urgencia: limitar(1 - (projeto.diasParaPrazo ?? 7) / 7),
				entidades: [projeto.id],
				precisaIA: true,
				chave: `projeto_abandonado:${projeto.id}`,
			})
		}

		if (projeto.status === 'pausado' && projeto.abertas > 0 && projeto.diasSemAtividade <= 7) {
			sinais.push({
				id: 'esforco_inutil',
				familia: 'projetos',
				nivel: 'atencao',
				titulo: 'Projeto pausado recebendo trabalho',
				detalhe: `"${projeto.nome}" está pausado, mas tem ${projeto.abertas} tarefas abertas e recebeu mudanças nesta semana.`,
				magnitude: 0.5,
				urgencia: 0.4,
				entidades: [projeto.id],
				precisaIA: true,
				chave: `esforco_inutil:${projeto.id}:${r.hoje}`,
			})
		}
	}

	// Dia impossível: muitas tarefas, muitos compromissos e conflito.
	if (r.tarefas.cargaHoje >= 5 && r.agenda.hoje.length >= 3 && r.agenda.conflitosHoje >= 1) {
		sinais.push({
			id: 'dia_impossivel',
			familia: 'agenda',
			nivel: 'urgente',
			titulo: 'Dia impossível',
			detalhe: `${r.tarefas.cargaHoje} tarefas, ${r.agenda.hoje.length} compromissos e ${r.agenda.conflitosHoje} choque de horário.`,
			magnitude: 0.9,
			urgencia: 1,
			entidades: [],
			precisaIA: true,
			chave: `dia_impossivel:${r.hoje}`,
		})
	}

	// Hábito e tarefa do mesmo tema no mesmo dia: só registra, não interrompe.
	for (const habito of r.habitos) {
		const tema = habito.titulo.toLowerCase()
		const tarefaParecida = r.tarefas.relevantes.find((t) => {
			const titulo = t.titulo.toLowerCase()
			return tema.length > 3 && (titulo.includes(tema) || tema.includes(titulo))
		})
		if (habito.valeHoje && !habito.feitoHoje && tarefaParecida) {
			sinais.push({
				id: 'habito_e_tarefa',
				familia: 'habitos',
				nivel: 'informativo',
				titulo: 'Hábito e tarefa do mesmo tema',
				detalhe: `"${habito.titulo}" e "${tarefaParecida.titulo}" falam da mesma coisa hoje.`,
				magnitude: 0.3,
				urgencia: 0.2,
				entidades: [habito.id, tarefaParecida.id],
				precisaIA: false,
				chave: `habito_e_tarefa:${habito.id}:${tarefaParecida.id}:${r.hoje}`,
			})
		}
	}

	return ordenar(sinais)
}

/**
 * Catálogo completo: os 37 simples + 4 compostos.
 *
 * Depois de ordenar, remove redundâncias entre sinais que falam do MESMO fato:
 *
 * - `atraso_critico` já é a versão urgente de `tarefa_atrasada`. Mostrar os
 *   dois lado a lado ("3 tarefas atrasadas" e "Atraso acumulado") é o tipo de
 *   repetição que faz o painel parecer um alarme barulhento.
 * - `dia_impossivel` engloba `carga_do_dia` e `agenda_conflito` do mesmo dia.
 */
export function avaliarTudo(r: Retrato): Sinal[] {
	const todos = ordenar([...avaliarSinais(r), ...avaliarCompostos(r)])
	const ids = new Set(todos.map((sinal) => sinal.id))
	const redundantes = new Set<string>()

	if (ids.has('atraso_critico')) redundantes.add('tarefa_atrasada')
	if (ids.has('dia_impossivel')) {
		redundantes.add('carga_do_dia')
		redundantes.add('agenda_conflito')
	}

	return todos.filter((sinal) => !redundantes.has(sinal.id))
}

const PESO_NIVEL: Record<Nivel, number> = {
	informativo: 0,
	oportunidade: 1,
	atencao: 2,
	urgente: 3,
}

function ordenar(sinais: Sinal[]): Sinal[] {
	const familia: Familia[] = ['tarefas', 'projetos', 'agenda', 'habitos', 'uso']
	return [...sinais].sort(
		(a, b) =>
			PESO_NIVEL[b.nivel] - PESO_NIVEL[a.nivel] ||
			familia.indexOf(a.familia) - familia.indexOf(b.familia) ||
			a.id.localeCompare(b.id),
	)
}

/** Quantos sinais o catálogo tem hoje — usado nos testes de cobertura. */
export const TOTAL_DE_SINAIS = 41
