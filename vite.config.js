import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// IMPORTANT FOR GITHUB PAGES:
// If your repo is named "HomeAffordabilityCalculator" and you deploy to
// https://YOUR_USERNAME.github.io/HomeAffordabilityCalculator/
// then `base` must match your repo name (with slashes).
// If you deploy to a custom domain or use a "user" repo (USERNAME.github.io),
// set base back to '/'.
const REPO_NAME = 'HomeAffordabilityCalculator';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Home Affordability Calculator',
        short_name: 'Affordability',
        description:
          'Figure out how much house you can really afford. Sliders, charts, stress tests, scenario comparison, and more. Works offline.',
        theme_color: '#006aff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Cache the Zippopotam.us ZIP lookup API responses so it works offline
        // after the first lookup.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.zippopotam\.us\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'zippopotam-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
}));
