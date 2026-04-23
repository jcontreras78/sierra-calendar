import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/airbnb-ical': {
        target: 'https://www.airbnb.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/airbnb-ical\//, '/calendar/ical/')
      }
    }
  }
});
