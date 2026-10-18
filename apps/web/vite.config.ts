import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

// `VITE_APP_MODE=admin` builds the dashboard-only bundle that ships as the
// separate `com.salonpro.admin` Android app. It has no landing page and no
// customer app, so it also skips the PWA service worker (the native shell owns
// caching, and a stale SW would fight `cap sync`).
const APP_MODE = process.env.VITE_APP_MODE ?? 'customer';
const isAdminBuild = APP_MODE === 'admin';

// A packaged Capacitor WebView loads from local assets, so a service worker is
// both useless and harmful there (it fails to register, and a stale precache
// would keep serving an old bundle past `cap sync`). `scripts/build-apk.sh`
// sets this for the bundles that go into the APKs; the web/PWA build keeps it.
const pwaDisabled = process.env.VITE_DISABLE_PWA === '1';
const pwaEnabled = !isAdminBuild && !pwaDisabled;

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
  },
  plugins: [
    react(),
    ...(pwaEnabled
      ? [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'SalonPro — Your Salon. Your Style. Your Rewards.',
        short_name: 'SalonPro',
        description:
          'Book salon appointments, manage your prepaid wallet and earn referral rewards at SalonPro.',
        theme_color: '#EC4899',
        background_color: '#FDF2F7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['beauty', 'lifestyle', 'shopping'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/api\/catalog\/(services|branches)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'catalog', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
      ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@salonpro/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  optimizeDeps: { exclude: ['@salonpro/shared'] },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: isAdminBuild ? 'dist-admin' : 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
