import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/zagi-builder/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

