import { defineConfig } from 'vite';

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('three/examples/jsm/postprocessing')) return 'three-postfx';
  if (id.includes('/three/')) return 'three-core';
  if (id.includes('/chess.js/')) return 'chess-core';
  return undefined;
}

export default defineConfig({
  base: './',
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
