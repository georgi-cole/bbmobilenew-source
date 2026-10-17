import { spawnSync } from 'node:child_process'

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(
  npx,
  [
    'playwright',
    'test',
    'e2e/playwright/season-performance.spec.ts',
    '--project=iphone-17-chromium',
    '--workers=1',
    '--retries=0',
  ],
  {
    env: {
      ...process.env,
      RUN_SEASON_PERFORMANCE: '1',
      SEASON_SIM_SKIP_UNLOAD_AUTOSAVE: '1',
      VISUAL_AUDIT_WRITE: '1',
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
