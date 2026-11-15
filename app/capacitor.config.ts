import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Configuração do APK Android (Capacitor).
 *
 * O app roda 100% do bundle local — nenhuma URL de servidor. Isso mantém o
 * funcionamento offline e faz o WebView servir uma origem segura: service
 * worker, IndexedDB e PWA funcionam.
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
		/*
		 * Não mude sem uma migração de dados.
		 *
		 * O IndexedDB é identificado pela ORIGEM (`esquema://host`), não pelo
		 * appId. Trocar `http` por `https` aqui muda a origem e esconde o banco
		 * de quem já instalou — o app abre vazio, sem erro e sem explicação.
		 * Como esta variante publicou uma beta com `http`, o valor fica assim.
		 */
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
