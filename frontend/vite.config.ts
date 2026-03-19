import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ['localhost', '127.0.0.1', 'tiny-tower', 'tiny-tower.bangus-city.ts.net'],
    proxy: {
      '/api': {
        target: 'http://localhost:17103',
        ws: true,  // Enable WebSocket upgrade proxying
      },
    },
  },
});
