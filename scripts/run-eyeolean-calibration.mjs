import { spawnSync } from 'node:child_process'

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const node = process.execPath

const testResult = spawnSync(
  npx,
  [
    'playwright',
    'test',
    'e2e/playwright/eyeolean-calibration.spec.ts',
    '--project=iphone-17-chromium',
    '--workers=1',
    '--retries=0',
  ],
  {
    env: {
      ...process.env,
      SEASON_SIM_SKIP_UNLOAD_AUTOSAVE: '1',
      VISUAL_AUDIT_WRITE: '1',
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }
)

if (testResult.error) throw testResult.error

const reportResult = spawnSync(
  node,
  [
    'scripts/summarize-eyeolean-calibration.mjs',
    'test-results',
    '--out=test-results/eyeolean-calibration-summary.json',
  ],
  {
    env: process.env,
    shell: false,
    stdio: 'inherit',
  }
)

if (reportResult.error) throw reportResult.error
if ((reportResult.status ?? 1) !== 0) process.exit(reportResult.status ?? 1)
process.exit(testResult.status ?? 1)
