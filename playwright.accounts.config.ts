import { defineConfig } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

/**
 * Isolated real-app account journeys; all Supabase requests use test route handlers.
 * Run with: npx playwright test --config playwright.accounts.config.ts
 */
export default defineConfig({
  testDir: './e2e/player-accounts',
  outputDir: 'test-results/player-account-runs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4183/bbmobilenew/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4183 --strictPort',
    url: 'http://127.0.0.1:4183/bbmobilenew/',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      VITE_SUPABASE_ENABLED: 'true',
      VITE_PLAYER_ACCOUNTS_ENABLED: 'true',
      VITE_SUPABASE_URL: 'https://account-preview.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preview',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
})
