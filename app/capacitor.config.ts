import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Configuração do APK Android (Capacitor).
 *
 * O app roda 100% do bundle local — nenhuma URL de servidor. Isso mantém o
 * funcionamento offline e faz o WebView servir de `https://localhost`, que é
 * origem segura: service worker, IndexedDB e PWA funcionam.
 *
 * O `appId` é PRÓPRIO desta variante (`app.urdume.publico`). Isso é
 * deliberado: o app privado usa `app.nexo.pessoal`. Se os dois usassem o mesmo
 * id, instalar a variante substituiria o app privado no mesmo celular — e as
 * duas disputariam o mesmo banco IndexedDB.
 *
 * O nome visível é `appName`.
 */
const config: CapacitorConfig = {
	appId: 'app.urdume.publico',
	appName: 'Urdume Público',
	webDir: 'dist',
	server: {
		// Origem http://localhost no WebView.
		//
		// Dois motivos: (1) o servidor de sincronização é local e fala ws:// —
		// a partir de uma origem https:// o WebView bloquearia como conteúdo
		// misto; (2) o tldraw trata http: como ambiente de desenvolvimento, então
		// o quadro funciona sem chave de licença dentro do app (a licença
		// continua valendo para a versão publicada na web).
		androidScheme: 'http',
	},
	android: {
		// Desenha atrás das barras para o app usar as safe areas.
		adjustMarginsForEdgeToEdge: 'auto',
	},
	plugins: {
		// Nada de servidor remoto: o conteúdo vem do dist/ empacotado.
		//
		// Jarvis em segundo plano. O runner NÃO tem acesso ao IndexedDB (o
		// ambiente do plugin é um JavaScript sem WebView); ele lê o retrato que
		// o app grava em SharedPreferences, via CapacitorKV.
		//
		// O `label` não é só um nome de log: no Android ele vira o NOME DO
		// SharedPreferences do runner. O app precisa gravar no mesmo arquivo —
		// é o que `GRUPO_DO_RUNNER` faz do outro lado (src/lib/jarvis/ponte.ts).
		// Se mudar aqui, mude lá; senão o runner lê um arquivo vazio e a falha
		// é silenciosa.
		//
		// 15 min é o mínimo que o Android aceita para tarefa periódica. Não é
		// pontual: o sistema pode atrasar conforme bateria e uso. O aviso real
		// do dia vem das notificações locais agendadas pelo próprio app.
		BackgroundRunner: {
			label: 'app.urdume.publico.jarvis',
			src: 'runners/jarvis.js',
			event: 'jarvisTick',
			repeat: true,
			interval: 15,
			autoStart: true,
		},
	},
}

export default config
