/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// In development the API is proxied, so the console and the API share one
// origin and the refresh cookie stays first-party (docs/features/admin.md).
// Where it is comes only from .env (see .env.example).
export default defineConfig(({ command, mode }) => {
  const apiOrigin = loadEnv(mode, process.cwd(), '').ADMIN_API_ORIGIN
  // Only the dev server and preview proxy; builds and tests don't need it.
  if (command === 'serve' && mode !== 'test' && !apiOrigin) {
    throw new Error('Set ADMIN_API_ORIGIN in .env (copy .env.example).')
  }
  const proxy = apiOrigin ? { '/v1': { target: apiOrigin } } : undefined

  return {
    plugins: [react(), tailwindcss()],
    // Shown in the sign-in page's footer.
    define: { __APP_VERSION__: JSON.stringify(version) },
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      port: 4173,
      proxy,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
    },
  }
})
