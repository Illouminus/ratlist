import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Generate a service worker that pre-caches the build output and
      // updates itself when a new deploy lands.
      registerType: 'autoUpdate',
      // We already author the manifest by hand at public/manifest.webmanifest
      // because keeping it as a checked-in JSON makes it easier for SEO tools
      // and for a human to review. So don't let the plugin write its own.
      manifest: false,
      // Workbox: pre-cache every static asset Vite emits. The runtime is
      // small (~5 KB gzip) and works offline for the landing + cached
      // routes after first visit.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,webmanifest}'],
        // Don't try to pre-cache the OG image — it's served from an
        // external rewrite (Supabase Edge Function) and isn't part of
        // the SPA bundle.
        navigateFallbackDenylist: [/^\/og\.png$/, /^\/functions\//],
      },
      // Inline the registration script into index.html so we don't need
      // an extra round-trip on first paint.
      injectRegister: 'inline',
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    // Force a single copy of React across the dep graph. react-router v7
    // otherwise sometimes ends up loading its own copy through Vite's
    // pre-bundler, which breaks hooks at runtime.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
});
