import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
