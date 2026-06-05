import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './index.html',
        player: './player.html'
      }
    }
  },
  server: {
    port: 5173,
    open: true
  }
});
