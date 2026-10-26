import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getMarketplaceReviewIssue } from './marketplace-review-policy.mjs'

const cwd = fileURLToPath(new URL('../', import.meta.url))
function git(args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  return result.status === 0 ? result.stdout : null
}

const candidates = [
  process.env.MARKETPLACE_BASE_REF,
  process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null,
  'origin/main',
  'main',
  'HEAD^',
].filter(Boolean)
const base = candidates
  .map((candidate) => git(['merge-base', 'HEAD', candidate])?.trim())
  .find(Boolean)
if (!base) throw new Error('Cannot resolve marketplace review base. Set MARKETPLACE_BASE_REF.')

const changed = git(['diff', '--name-only', '-z', base, '--'])
const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
if (changed == null || untracked == null) throw new Error('Cannot enumerate marketplace changes.')
const issue = getMarketplaceReviewIssue(
  [...changed.split('\0'), ...untracked.split('\0')].filter(Boolean)
)
if (issue) {
  console.error(issue)
  process.exitCode = 1
} else {
  console.log('Marketplace change-review gate passed.')
}
