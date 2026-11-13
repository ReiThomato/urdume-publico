import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
	version: string
}

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: [
				'fonts/InstrumentSerif-Regular.ttf',
				'fonts/OFL.txt',
				'icons/*.png',
				// Assets do tldraw servidos localmente: sem eles o quadro abre na
				// primeira vez offline sem fonte e sem ícones.
				'tldraw-fonts/*.woff2',
				'tldraw-assets/icons/*.svg',
				'tldraw-assets/translations/*.json',
			],
			manifest: {
				name: 'Urdume Público',
				short_name: 'Urdume Público',
				description: 'Tarefas, projetos, hábitos e um assistente de IA com a sua própria chave.',
				lang: 'pt-BR',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				orientation: 'portrait',
				theme_color: '#FAF7F2',
				background_color: '#FAF7F2',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{ src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
				],
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ttf,woff2,json}'],
				// O chunk do tldraw passa de 2 MiB; o precache precisa aceitá-lo para o
				// quadro abrir offline (requisito de uso offline real).
				maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
				navigateFallback: '/index.html',
			},
		}),
	],
	build: {
		chunkSizeWarningLimit: 800,
	},
	server: {
		port: 5173,
	},
	test: {
		environment: 'node',
		setupFiles: ['./src/test/setup.ts'],
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
	},
})
