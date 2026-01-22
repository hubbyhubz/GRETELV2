import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default ({ mode }) => {
  // Load all environment variables from the current working directory.
  // The third argument '' ensures all variables are loaded, not just those with VITE_ prefix.
  // FIX: Replaced process.cwd() with '.' to avoid TypeScript type errors in environments where node types are not loaded.
  const env = loadEnv(mode, '.', '');

  return defineConfig({
    plugins: [react()],
    define: {
      // Expose the API_KEY to the client-side code through process.env
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
    // PostCSS will be configured via postcss.config.js
    // Tailwind will be processed through PostCSS
  });
};
