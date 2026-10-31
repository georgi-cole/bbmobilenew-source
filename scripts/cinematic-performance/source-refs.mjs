import { execFileSync } from 'node:child_process'

const isSource = (name) => /\.(?:[cm]?[jt]sx?|css|json|html|svg)$/.test(name)

/** Keep the baseline independent of commits on the candidate branch. */
export function readPresentationSourceRefs(root, baselineRef = 'origin/main') {
  const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 100 * 1024 * 1024 })
  const paths = (buffer) => buffer.toString('utf8').split('\0').filter(Boolean)
  const baselineRevision = git('rev-parse', '--verify', `${baselineRef}^{commit}`)
    .toString('utf8')
    .trim()
  const revision = git('rev-parse', 'HEAD').toString('utf8').trim()
  const baselineSourcePaths = paths(
    git('ls-tree', '-r', '--name-only', '-z', baselineRevision, '--', 'src', 'index.html')
  ).filter(isSource)
  const candidateSourcePaths = [
    ...paths(git('ls-files', '-z', '--', 'src', 'index.html')),
    ...paths(git('ls-files', '-z', '--others', '--exclude-standard', '--', 'src')),
  ].filter(isSource)
  const publicPaths = [
    ...paths(git('diff', baselineRevision, '--name-only', '-z', '--', 'public')),
    ...paths(git('ls-files', '-z', '--others', '--exclude-standard', '--', 'public')),
  ]
  return {
    baselineRef,
    baselineRevision,
    revision,
    baselineSourcePaths,
    candidateSourcePaths: [...new Set(candidateSourcePaths)],
    publicPaths: [...new Set(publicPaths)],
    candidateDirty: Boolean(git('status', '--porcelain').toString('utf8').trim()),
  }
}
