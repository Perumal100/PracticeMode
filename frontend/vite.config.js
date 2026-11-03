import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server forwards /api calls to the Django backend so session cookies
// and CSRF work without extra CORS setup.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // changeOrigin stays false: the string shorthand rewrites Host to
      // localhost:8000 while the browser still sends Origin localhost:5173,
      // and Django's CSRF origin check then rejects every POST and PATCH.
      '/api': { target: 'http://localhost:8000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
});
