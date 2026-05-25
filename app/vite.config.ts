import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { vitePrerenderPlugin } from 'vite-prerender-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Forces `node` to exit cleanly once the build pipeline has finished.
 *
 * `vite-prerender-plugin` dynamically imports the bundled prerender
 * entry to render HTML at build time. Something in that load path —
 * almost certainly `react-dom/server`'s lazy worker / scheduler
 * initialisation — leaves a libuv handle alive, so `vite build`
 * completes (every file is written to disk, every hook returns) but
 * the process never exits. Locally that's a 60s nuisance; on Vercel's
 * Hobby tier it eats the entire 45-minute build budget and the
 * deployment is killed.
 *
 * Sitting in the `enforce: 'post'` + `order: 'post'` slot of
 * `closeBundle` puts us strictly last: all assets are committed,
 * every plugin has already done its work. We schedule the exit on
 * `setImmediate` so any in-flight microtasks (e.g. the plugin
 * logger flushing the "Prerendered N pages" message) get a chance
 * to run before we tear down.
 */
function forceExitAfterBuild(): Plugin {
  return {
    name: 'force-exit-after-build',
    apply: 'build',
    enforce: 'post',
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        setImmediate(() => process.exit(0));
      },
    },
  };
}

/**
 * Snapshots the un-prerendered `index.html` template as `_spa.html` so Vercel
 * has a clean SPA shell to fall back to on routes we don't prerender (login,
 * share, auth callback, …). Without this, every unknown URL would be served
 * the prerendered landing page, briefly flashing the marketing copy before
 * React Router takes over and re-renders the right screen — plus search
 * crawlers would index the landing under every SPA URL.
 *
 * Runs in `transformIndexHtml` (which fires during Vite's HTML phase, before
 * vite-prerender-plugin's `generateBundle` mutates index.html in place) and
 * writes the snapshot to disk in `closeBundle`, after Vite has finished
 * emitting everything.
 */
function emitSpaFallback(): Plugin {
  let template: string | null = null;
  let outDir: string | null = null;

  return {
    name: 'emit-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      // Run after every other transform so the snapshot includes Vite's
      // injected script tags, stylesheets, and PWA hooks — same shape as
      // the real `index.html`, just without anything prerender adds later
      // in `generateBundle`.
      order: 'post',
      handler(html) {
        template = html;
      },
    },
    async closeBundle() {
      if (!template || !outDir) return;
      await fs.writeFile(join(outDir, '_spa.html'), template);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Must run BEFORE vite-prerender-plugin so the snapshot it copies is
    // still the empty SPA shell, not the prerendered landing.
    emitSpaFallback(),
    // Prerender the marketing + legal pages at build time. Renders the
    // app to static HTML in Node so crawlers and slow second-pass JS
    // indexers see real content immediately. See `src/prerender.tsx`
    // for the route list and per-route head metadata.
    //
    // Sidebar on Vite 8 / Rolldown: the plugin's internal `manualChunks`
    // hook is supposed to merge `prerender.tsx` into the `index` chunk so
    // nothing prerender-related ships to clients. Rolldown ignores that
    // hook for entry inputs, so a separate `prerender-<hash>.js` chunk
    // sticks around and `index` ends up importing shared React / Router
    // code from it. We don't delete the chunk: dropping it would break
    // the import. The ~160 KB gzip cost is mostly code the client needs
    // anyway (React, react-router, app code) — only `renderToString` and
    // the prerender wrapper are wasted weight (~10 KB gzip).
    vitePrerenderPlugin({
      renderTarget: '#root',
      prerenderScript: resolve(__dirname, 'src/prerender.tsx'),
    }),
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
        // The SPA navigation fallback. Workbox defaults to `index.html`
        // — but our `index.html` is the *prerendered LandingScreen*, so
        // serving it for client-side SPA routes (`/events`, `/people`,
        // …) on a hard refresh paints the landing into the DOM for
        // however long it takes React to mount and replace it. On
        // mobile that flash is permanent in some browser/SW caching
        // states (confirmed 2026-05-25 — friend on phone refreshed
        // `/events`, saw landing with sign-in even though they were
        // authed and the bottom nav stayed visible).
        //
        // `_spa.html` is the same template *without* the prerendered
        // content — empty `<div id="root">`. React's createRoot mounts
        // into the empty slot and renders the correct route from
        // scratch. No hydration mismatch, no landing flash.
        //
        // The forceExitAfterBuild + writeSpaFallback plugins guarantee
        // `_spa.html` is written; the precache list above includes it.
        navigateFallback: '/_spa.html',
        // Routes that must NOT be served the cached SPA fallback:
        //   /og.png and /functions/* are external rewrites (Supabase
        //   Edge Functions) — the SW would otherwise hijack them.
        //   /legal/* are separately prerendered HTML files with their
        //   own per-route metadata; falling back to the SPA template
        //   would replace them with the empty bootstrap shell while
        //   React loads.
        navigateFallbackDenylist: [
          /^\/og\.png$/,
          /^\/functions\//,
          /^\/legal\//,
        ],
      },
      // Inline the registration script into index.html so we don't need
      // an extra round-trip on first paint.
      injectRegister: 'inline',
      devOptions: {
        enabled: false,
      },
    }),
    // Strictly last — see comment above. Must come after VitePWA so
    // sw.js / workbox-*.js are already written by the time we exit.
    forceExitAfterBuild(),
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
