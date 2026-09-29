import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Crash',
        short_name: 'Crash',
        description: 'Crash — the three-card hand game for 3 or 4 players.',
        theme_color: '#06110d',
        background_color: '#06110d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The API and live tables must always hit the network.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  // `pnpm dev` talks to the local Worker (`pnpm cf:dev`) for the online API.
  server: { proxy: { '/api': { target: 'http://localhost:8787', ws: true } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
