/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative paths: the app works at a site root (localhost) AND in a sub-folder (GitHub Pages).
  base: './',
  plugins: [react()],
  build: { target: 'es2020' },
  test: { environment: 'jsdom', setupFiles: ['tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'] },
});
