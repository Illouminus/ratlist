import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { vitePrerenderPlugin } from 'vite-prerender-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Snapshots the un-prerendered `index.html` template as `_spa.html` so Vercel
 * has a clean SPA shell to fall back to on routes we don't prerender (login,
 * share, auth callback, …). Without this, every unknown URL would be served
 * the prerendered landing page, briefly flashing the marketing copy before
 * React Router takes over and re-renders the right screen — plus search
 * crawlers would index the landing under every SPA URL.
 *
 * Runs in the default (normal) enforce phase, which is before
 * `vite-prerender-plugin`'s post-enforce `generateBundle`. At that point
 * `bundle['index.html']` is still the empty template Vite just produced, so
 * the snapshot is the right starting point.
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
      // Strip the dangling modulepreload to the prerender chunk — that
      // file is deleted by `stripPrerenderChunkFromClient`, so without
      // this regex the browser would 404 on every SPA-fallback load.
      // The chunk name is always `prerender-<hash>.js` because that's
      // how Rolldown derives names from the source file `prerender.tsx`.
      const cleaned = template.replace(
        /\s*<link\s+rel="modulepreload"[^>]*href="[^"]*prerender-[^"]+"[^>]*>/g,
        '',
      );
      await fs.writeFile(join(outDir, '_spa.html'), cleaned);
    },
  };
}

/**
 * Drops the prerender entry chunk from the client output. `vite-prerender-plugin`
 * emits `src/prerender.tsx` as a separate Rollup input so it can `import()`
 * the bundle in Node and call `prerender()`. In Vite 5 + classic Rollup the
 * plugin's `manualChunks` setting merged that code into `index`; in Vite 8 /
 * Rolldown it doesn't, so a ~600 KB chunk + a `<link rel="modulepreload">`
 * pointing at it leak into every shipped page. The chunk is server-only —
 * nothing in the runtime app imports it — so once `vite-prerender-plugin`
 * has finished using it we delete the asset from the bundle and strip the
 * preload tag from every emitted HTML file.
 *
 * Detected by the `prerender` export name: the plugin itself locates the
 * chunk the same way (`exports.includes('prerender')`), so this matches
 * whatever the plugin used.
 */
function stripPrerenderChunkFromClient(): Plugin {
  return {
    name: 'strip-prerender-chunk-from-client',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_opts, bundle) {
        let chunkFile: string | undefined;
        for (const [name, item] of Object.entries(bundle)) {
          if (item.type === 'chunk' && item.exports?.includes('prerender')) {
            chunkFile = item.fileName;
            delete bundle[name];
            break;
          }
        }
        if (!chunkFile) return;
        const escaped = chunkFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(
          `\\s*<link\\s+rel="modulepreload"[^>]*href="[^"]*${escaped}"[^>]*>`,
          'g',
        );
        for (const item of Object.values(bundle)) {
          if (
            item.type === 'asset' &&
            typeof item.source === 'string' &&
            item.fileName.endsWith('.html')
          ) {
            item.source = item.source.replace(re, '');
          }
        }
      },
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
    vitePrerenderPlugin({
      renderTarget: '#root',
      prerenderScript: resolve(__dirname, 'src/prerender.tsx'),
    }),
    // Must run AFTER vite-prerender-plugin so the chunk still exists when
    // it does its rendering work, but before write so we don't have to
    // touch disk.
    stripPrerenderChunkFromClient(),
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
        // Routes that must NOT be served the cached `index.html`:
        //   /og.png and /functions/* are external rewrites (Supabase
        //   Edge Functions) — the SW would otherwise hijack them.
        //   /legal/* are separately prerendered HTML files with their
        //   own per-route metadata; falling back to /index.html
        //   would replace them with the landing page in the browser
        //   (visible bug — navigation appears to succeed but the
        //   wrong HTML renders until the SPA router re-routes).
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
