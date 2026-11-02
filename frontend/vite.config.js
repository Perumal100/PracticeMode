import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server forwards /api calls to the Django backend so session cookies
// and CSRF work without extra CORS setup.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
});
