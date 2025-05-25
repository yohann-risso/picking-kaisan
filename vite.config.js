import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/', // ou '' se estiver em subpasta
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000
  }
});
