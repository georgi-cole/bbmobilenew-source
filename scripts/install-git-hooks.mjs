import { chmod, mkdir, stat, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(scriptDir)
const gitDir = join(repoRoot, '.git')

const hook = `#!/bin/sh
set -eu

echo "Running PR preflight before push..."
npm run check:pr
`

try {
  await stat(gitDir)
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('Git metadata is unavailable; skipping local pre-push hook installation.')
    process.exit(0)
  }
  throw error
}

// A linked worktree has a .git file; Git resolves its shared hook directory.
const hooksDir = resolve(
  repoRoot,
  execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
)
const hookPath = join(hooksDir, 'pre-push')
await mkdir(hooksDir, { recursive: true })
await writeFile(hookPath, hook, 'utf8')
await chmod(hookPath, 0o755)
console.log('Installed pre-push -> npm run check:pr')
