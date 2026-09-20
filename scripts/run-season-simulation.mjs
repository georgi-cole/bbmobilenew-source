import { spawnSync } from 'node:child_process'

const full = process.argv.includes('--full')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const projects = full
  ? ['--project=iphone-17-chromium', '--project=compact-mobile-chromium']
  : ['--project=iphone-17-chromium']

const result = spawnSync(
  npx,
  [
    'playwright',
    'test',
    'e2e/playwright/season-simulation.spec.ts',
    ...projects,
    '--workers=1',
    '--retries=0',
  ],
  {
    env: {
      ...process.env,
      SEASON_SIM_SKIP_UNLOAD_AUTOSAVE: '1',
      // The simulator already saves deliberate screenshots and structured
      // reports. Avoid retaining a browser video, which can block Chromium
      // context shutdown while an in-progress game animation is active.
      VISUAL_AUDIT_WRITE: '1',
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
