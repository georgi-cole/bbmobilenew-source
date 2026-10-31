import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string }

// https://vite.dev/config/
//
// Base-path strategy
//   npm run build             →  the VITE_BASE_PATH value (GitHub Pages deployment)
//   npm run build:capacitor   →  "./"             (passed via --base ./ CLI flag,
//                                                   required for Capacitor/WKWebView)
const mobileModes = new Set(['capacitor', 'ios', 'android'])
const normalizeWatchPath = (path: string) => {
  const normalized = path.replaceAll('\\', '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}
const ignoredDevelopmentRoots = [
  '.worktrees',
  '.codex-worktrees',
  'renders',
  'test-results',
  'playwright-report',
  'coverage',
  'artifacts',
].map((directory) => normalizeWatchPath(resolve(process.cwd(), directory)))

export default defineConfig(({ mode }) => ({
  base: mobileModes.has(mode) ? './' : process.env.VITE_BASE_PATH || '/bbmobilenew/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  assetsInclude: ['**/*.wp2'],
  plugins: [react()],
  // Local device packages and report pages are not additional game entries.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    watch: {
      // Git worktrees live inside this checkout and contain full copies of the
      // app. Watching them causes a reload storm that can prevent the real app
      // entry module from ever being served during local development. Resolve
      // exclusions from the active Vite root so a preview running inside a
      // managed worktree still watches its own source files. Generated reports
      // and renders are not app inputs: report rewrites can reload the game or
      // fail with EBUSY on Windows while the report writer holds a file open.
      ignored: (path) => {
        const normalized = normalizeWatchPath(path)
        return ignoredDevelopmentRoots.some(
          (root) => normalized === root || normalized.startsWith(`${root}/`)
        )
      },
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
    // Bound concurrency so dynamic minigame imports remain reliable in the full suite.
    maxWorkers: 4,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
}))
