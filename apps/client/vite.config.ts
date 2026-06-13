import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// `loadEnv(mode, cwd, '')` reads .env files (local dev) AND real process.env
// vars (CI / Vercel) with no prefix filter, so SENTRY_AUTH_TOKEN is found in
// both places — Vite does NOT put .env values into process.env for the config.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Upload source maps to Sentry on `vite build`, so production stack traces
  // show original TS instead of minified bundle code. Active only when an auth
  // token is present; builds without it (most local dev) just skip the upload.
  // Maps match events via debug IDs, so no release coordination is needed.
  const sentryToken = env.SENTRY_AUTH_TOKEN;

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(sentryToken
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG || 'game-fh',
              project: env.SENTRY_PROJECT || 'game-client',
              authToken: sentryToken,
              // Delete the emitted .map files after upload so they aren't served
              // from the CDN (the bundle still uploads fine to Sentry first).
              sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            }),
          ]
        : []),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      host: true,
    },
    preview: {
      port: 4173,
      host: true,
    },
    build: {
      target: 'es2022',
      sourcemap: true,
    },
  };
});
