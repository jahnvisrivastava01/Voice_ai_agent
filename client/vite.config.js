import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development, /api calls go to the Express server so no CORS setup is needed.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
