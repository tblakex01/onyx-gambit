import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
