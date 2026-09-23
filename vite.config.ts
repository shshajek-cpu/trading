import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'fonts/SUIT-Variable.woff2'],
      manifest: {
        name: 'Trading',
        short_name: 'Trading',
        description: '바이낸스 선물 실시간 차트',
        // 상단 상태표시줄 색. 앱 배경과 맞춰야 이음새가 안 보인다.
        theme_color: '#07070a',
        // 앱을 열 때 잠깐 보이는 첫 화면 색.
        background_color: '#07070a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'ko',
        categories: ['finance'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        importScripts: ['/sw-push.js'],
        // 앱 셸만 캐시한다. 시세 API·웹소켓은 절대 캐시하지 않는다.
        // 글꼴도 함께 담아야 오프라인에서 글자가 시스템 글꼴로 바뀌지 않는다.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 기본 한도(2MiB)로는 글꼴이 빠질 수 있어 넉넉히 올린다.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fapi\.binance\.com\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
