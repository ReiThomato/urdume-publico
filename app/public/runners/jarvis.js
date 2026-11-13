/**
 * Runner de segundo plano do Jarvis.
 *
 * Roda no motor JavaScript do @capacitor/background-runner, FORA do WebView.
 * Aqui NÃO existe DOM, React, Dexie nem `indexedDB` — só o que a documentação
 * do plugin lista: console, setTimeout, crypto, fetch, `CapacitorKV`,
 * `CapacitorNotifications` e `CapacitorDevice`.
 *
 * **O que este arquivo NÃO faz.** Ele não agenda tarefa, prazo, hábito nem
 * evento. Quem faz isso é o app (`agendar()` em `src/lib/jarvis/notificacoes.ts`),
 * por dois motivos:
 *
 *   1. o app agenda com `Date` nativo, que respeita o fuso; este ambiente
 *      serializa data como texto e o plugin lê no fuso do aparelho sem
 *      normalizar — o aviso sairia com o deslocamento do fuso;
 *   2. os ids seriam os mesmos, e o runner sobrescreveria o que o app agendou
 *      com uma hora errada.
 *
 * **O que ele faz.** Três coisas pequenas, e nenhuma delas é pensamento:
 *
 *   - **batimento**: grava a hora do último tique em `jarvis.runner.estado`.
 *     É a única prova de que o Android está mesmo executando isto com o app
 *     fechado. O app lê esse carimbo e mostra "rodou há X min" na tela;
 *     sem isso, "segundo plano" era uma promessa sem evidência;
 *   - **retrato velho**: se os dados tiverem mais de 36 h, avisa UMA vez por
 *     dia para abrir o app. Fingir tempo real é o erro clássico;
 *   - **pausa**: se o usuário pausou, não faz nada e não escreve nada.
 *
 * O contrato das chaves (`jarvis.retrato`, `jarvis.plano`, `jarvis.config`)
 * vive em `src/lib/jarvis/ponte.ts`. Mudar um lado exige mudar o outro.
 *
 * Este arquivo é copiado para `dist/runners/jarvis.js` pelo build: o plugin
 * carrega o arquivo do bundle, não do TypeScript.
 */

/* eslint-disable no-undef */
// @ts-nocheck — o ambiente do runner não tem tipos de DOM, e os globais do
// Capacitor chegam em tempo de execução, não de compilação.

var DIA = 86_400_000
var HORA = 3_600_000

/**
 * Leitura tolerante do KV.
 *
 * A API documentada é `CapacitorKV.get(chave)` devolvendo `{ value }`, mas
 * versões já publicadas do plugin devolvem a string direto. As duas formas
 * aparecem em campo; aceitar só uma delas é o que fazia o runner "não achar"
 * o retrato e concluir que o app nunca tinha dados.
 */
function lerBruto(chave) {
	try {
		var resultado = CapacitorKV.get(chave)
		if (resultado == null) return null
		if (typeof resultado === 'string') return resultado
		if (typeof resultado === 'object' && typeof resultado.value === 'string') return resultado.value
		return null
	} catch (erro) {
		console.warn('Jarvis runner: falha ao ler ' + chave + ': ' + erro)
		return null
	}
}

function lerJson(chave) {
	var bruto = lerBruto(chave)
	if (!bruto) return null
	try {
		return JSON.parse(bruto)
	} catch (erro) {
		console.warn('Jarvis runner: JSON inválido em ' + chave)
		return null
	}
}

/**
 * Gravação tolerante.
 *
 * `CapacitorKV.set(chave, valor)` é a assinatura nativa (dois argumentos). O
 * código anterior chamava `set({ key, value })` — um objeto — e o motor
 * nativo recusava em silêncio, dentro do try/catch. Resultado: o runner lia
 * um armazenamento que nada escrevia e nunca avisava nada.
 */
function gravarJson(chave, valor) {
	var texto = JSON.stringify(valor)
	try {
		CapacitorKV.set(chave, texto)
		return true
	} catch (erro) {
		console.warn('Jarvis runner: falha ao gravar ' + chave + ': ' + erro)
		return false
	}
}

function lembrar(nome, valor) {
	gravarJson('jarvis.runner.' + nome, { valor: valor, em: Date.now() })
}

function jaFez(nome, janelaMs) {
	var anterior = lerJson('jarvis.runner.' + nome)
	if (!anterior) return false
	return Date.now() - (anterior.em || 0) < janelaMs
}

/**
 * Data no formato que o plugin espera, com a hora **local** no texto.
 *
 * O parser nativo (`SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")`) roda no
 * fuso padrão do aparelho e trata o `Z` final como literal. Passar um objeto
 * `Date` faz a ponte serializar em UTC; o texto com `Z` seria então lido como
 * hora local, e em UTC−3 o aviso sairia três horas atrasado. Mandando a hora
 * local no texto (com o `Z` literal que o formato exige), o resultado bate.
 */
function textoLocal(instante) {
	var d = new Date(instante)
	function dois(n) {
		return (n < 10 ? '0' : '') + n
	}
	return (
		d.getFullYear() +
		'-' +
		dois(d.getMonth() + 1) +
		'-' +
		dois(d.getDate()) +
		'T' +
		dois(d.getHours()) +
		':' +
		dois(d.getMinutes()) +
		':' +
		dois(d.getSeconds()) +
		'.000Z'
	)
}

function avisar(id, titulo, corpo, instante) {
	try {
		CapacitorNotifications.schedule([
			{
				id: id,
				title: titulo,
				body: corpo,
				scheduleAt: textoLocal(instante),
			},
		])
		return true
	} catch (erro) {
		console.warn('Jarvis runner: falha ao agendar: ' + erro)
		return false
	}
}

/**
 * O tique do runner.
 *
 * Executa em poucos milissegundos: lê dois JSONs, compara datas e, no máximo,
 * agenda uma notificação. O limite recomendado é 30 s; aqui sobra muito.
 */
addEventListener('jarvisTick', function (resolve, reject) {
	try {
		var agora = Date.now()
		var config = lerJson('jarvis.config')

		// O batimento é gravado ANTES de qualquer decisão: pausado também é
		// prova de vida. Se o usuário pausou, o app precisa saber que o
		// runner está rodando e simplesmente calado por escolha.
		var batimento = {
			em: agora,
			pausado: !!(config && config.pausado),
			versao: 2,
		}
		gravarJson('jarvis.runner.estado', batimento)

		if (config && config.pausado) {
			resolve({ acao: 'pausado', em: agora })
			return
		}

		var retrato = lerJson('jarvis.retrato')
		var idade = retrato && retrato.geradoEm ? agora - retrato.geradoEm : null

		// Sem retrato nunca gravado: o app não foi aberto desde a instalação.
		// Não há o que dizer e não vale incomodar.
		if (idade == null) {
			resolve({ acao: 'sem-retrato', em: agora })
			return
		}

		// Retrato velho: aviso honesto, no máximo uma vez por dia, e só em
		// horário civilizado. Um "abra o app" às 3h da manhã seria pior que o
		// silêncio.
		if (idade > 36 * HORA && !jaFez('aviso-retrato-velho', 20 * HORA)) {
			var hora = new Date(agora).getHours()
			if (hora >= 8 && hora < 21) {
				var quando = agora + 5000
				avisar(
					9001,
					'Urdume',
					'Faz ' +
						Math.round(idade / HORA) +
						' h que eu não vejo seus dados. Abra o app para eu voltar a acompanhar.',
					quando,
				)
				lembrar('aviso-retrato-velho', true)
				resolve({ acao: 'aviso-retrato-velho', em: agora })
				return
			}
		}

		lembrar('ultimo-tique', agora)
		resolve({ acao: 'ok', idadeHoras: Math.round(idade / HORA), em: agora })
	} catch (erro) {
		reject(erro)
	}
})

/** Evento de inicialização: só confirma que o contexto carregou. */
addEventListener('jarvisStartup', function (resolve) {
	gravarJson('jarvis.runner.estado', { em: Date.now(), pausado: false, versao: 2 })
	resolve({ ok: true })
})
