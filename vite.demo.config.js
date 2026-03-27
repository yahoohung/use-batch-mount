import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Ensures relative paths work on Vercel/GitHub Pages
  build: {
    outDir: 'demo-dist', // Differentiate from the library 'dist' folder
    emptyOutDir: true,
  }
});
