import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  base: '/apps/mcp_server/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
}));
