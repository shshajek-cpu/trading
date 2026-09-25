import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Trading',
        short_name: 'Trading',
        description: '바이낸스 선물 실시간 차트',
        // 상단 상태표시줄 색. 앱 배경과 맞춰야 이음새가 안 보인다.
        theme_color: '#0f0f0f',
        // 앱을 열 때 잠깐 보이는 첫 화면 색.
        background_color: '#0f0f0f',
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
        globPatterns: ['**/*.{js,css,html,svg,png}'],
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
  build: {
    rolldownOptions: {
      output: {
        // 첫 화면 번들을 셋으로 나눈다. 라이브러리(react·차트)는 배포마다 거의 안 바뀌어 서비스워커가 새 버전을 받을 때
        // 다시 내려받지 않는다. 처음 열 때 받는 위젯·시트(App 의 LAZY)와 함께 쓰는 앱 모듈은 작은 조각으로 흩어지지 않게
        // 첫 화면 묶음($initial)에 모은다 — 안 그러면 첫 화면이 작은 파일 여러 개를 따로 받는다.
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'charts', test: /[\\/]node_modules[\\/](lightweight-charts|fancy-canvas)[\\/]/, priority: 20 },
            { name: 'app', tags: ['$initial'], priority: 10 },
          ],
        },
      },
    },
  },
})
