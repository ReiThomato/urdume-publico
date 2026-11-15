import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from '@/screens/Shell'
import { aplicarTemaInicial } from '@/app/tema'
import { aplicarAcessibilidadeSalva } from '@/ui/acessibilidade'
import { conferirVersao } from '@/lib/higiene'
import { migrarChavesAntigas } from '@/lib/chaves'
import '@/styles/tokens.css'
import '@/styles/app.css'
import '@/styles/nav.css'
import '@/styles/folha.css'
import '@/styles/telas.css'
import '@/styles/ilha.css'
import '@/styles/roda.css'

/**
 * O app é nativo (APK) ou um site no navegador?
 *
 * No APK, o conteúdo já vem empacotado em `assets/public` e é servido do
 * próprio aparelho — não existe rede para "baixar versão nova". O service
 * worker, que existe para cachear um site, aqui só faz estrago: ele guarda o
 * bundle antigo e o serve na primeira abertura depois de atualizar. Era isso
 * que fazia **a interface antiga aparecer primeiro e a nova só depois**: o
 * SW entregava o `index.html` e os JS do pacote anterior, e o React só trocava
 * quando o precache novo terminasse de instalar e recarregasse.
 */
const NATIVO =
	typeof window !== 'undefined' &&
	!!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
		?.isNativePlatform?.()

/**
 * Remove service worker e caches antigos no APK.
 *
 * Não basta parar de registrar: quem já instalou as versões anteriores tem um
 * SW registrado que continua controlando a página e servindo o bundle velho.
 * É preciso desregistrar e apagar os caches — é o que realmente destrava o
 * aparelho que "parece preso no passado".
 *
 * Roda antes de montar o React, mas não bloqueia: se falhar, o app abre igual.
 */
async function limparCacheDeSiteAntigo(): Promise<void> {
	if (!NATIVO || !('serviceWorker' in navigator)) return
	try {
		const registros = await navigator.serviceWorker.getRegistrations()
		await Promise.all(registros.map((registro) => registro.unregister()))

		if ('caches' in window) {
			const chaves = await caches.keys()
			await Promise.all(chaves.map((chave) => caches.delete(chave)))
		}
	} catch {
		// Aparelho sem suporte ou já limpo: seguir é o certo.
	}
}

/**
 * No site, o service worker continua: é ele que permite abrir offline.
 * No APK, ele não é registrado — o bundle já está no disco.
 */
if (!NATIVO) {
	registerSW({ immediate: true })
} else {
	void limparCacheDeSiteAntigo()
}

// Rede de segurança: se a versão do pacote mudou, limpa caches de recursos uma
// vez. Não toca no banco — só em arquivos, que são reconstruíveis.
void conferirVersao()

/**
 * Pede armazenamento persistente.
 *
 * Por padrão o Chromium trata o IndexedDB como "melhor esforço": quando o
 * aparelho fica sem espaço, ele descarta a origem inteira, sem erro e sem
 * aviso — o app abriria vazio. Com `persist()` concedido, o navegador só apaga
 * com a permissão do usuário.
 *
 * O Chrome decide sozinho se concede (histórico de uso, instalação, espaço).
 * Falhar não é erro: o app funciona igual, apenas sem essa garantia. Por isso
 * o resultado vai para Ajustes → Aparelho, e não para um alerta.
 */
void (async (): Promise<void> => {
	try {
		if (!navigator.storage?.persist || !navigator.storage.persisted) return
		if (await navigator.storage.persisted()) {
			localStorage.setItem('urdume.armazenamentoPersistente', 'sim')
			return
		}
		const concedido = await navigator.storage.persist()
		localStorage.setItem('urdume.armazenamentoPersistente', concedido ? 'sim' : 'nao')
	} catch {
		localStorage.setItem('urdume.armazenamentoPersistente', 'nao')
	}
})()

/**
 * Botão voltar do Android (Capacitor).
 *
 * A ordem importa: primeiro a folha aberta, depois a tela. Antes, apertar
 * voltar com uma folha na frente navegava por trás dela (ou saía do app) e
 * deixava a folha órfã — a única saída era o X ou arrastar a alça.
 *
 * - folha aberta → fecha a de cima;
 * - há tela anterior → volta na pilha;
 * - raiz → deixa o Android agir (minimizar).
 */
void (async (): Promise<void> => {
	try {
		const { App: CapacitorApp } = await import('@capacitor/app')
		const { fecharFolhaDoTopo } = await import('@/ui/Folha')
		void CapacitorApp.addListener('backButton', () => {
			if (fecharFolhaDoTopo()) return
			if ((window.history.state?.nexo ?? 0) > 0) window.history.back()
			else void CapacitorApp.exitApp()
		})
	} catch {
		// Fora do APK (web/PWA) não há botão voltar nativo.
	}
})()

const container = document.getElementById('root')

if (!container) {
	throw new Error('Elemento #root não encontrado.')
}

// Copia chaves antigas (`nexo.*`, `rabisco.*`) para os nomes atuais antes de
// qualquer leitura — o app já se chamou Nexo e Rabisco, e renomear sem migrar
// faria o tema e a licença do quadro "sumirem" na atualização.
migrarChavesAntigas()
// Aplica o tema ANTES de qualquer desenho (espelho síncrono em localStorage):
// sem isso a primeira pintura saía na cor padrão e "piscava" para a certa.
aplicarTemaInicial()
// Aplica as preferências antes do primeiro desenho: evita o layout "pular".
void aplicarAcessibilidadeSalva()

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
