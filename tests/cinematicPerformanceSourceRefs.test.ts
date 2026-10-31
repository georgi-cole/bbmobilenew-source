// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let directory: string
let baselineRevision: string
let candidateRevision: string
const helper = pathToFileURL(resolve('scripts/cinematic-performance/source-refs.mjs')).href
const environment = { ...process.env }
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) {
  delete environment[name]
}

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: directory, env: environment, encoding: 'utf8' }).trim()
}

function refs(reference?: string) {
  const code = `import { readPresentationSourceRefs } from ${JSON.stringify(helper)};
    console.log(JSON.stringify(readPresentationSourceRefs(${JSON.stringify(directory)}, ${JSON.stringify(reference)})));`
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      env: environment,
      encoding: 'utf8',
    })
  )
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'presentation-source-'))
  git('init', '--quiet')
  expect(resolve(git('rev-parse', '--show-toplevel'))).toBe(resolve(directory))
  git('config', '--local', 'user.name', 'Presentation fixture')
  git('config', '--local', 'user.email', 'presentation-fixture@example.invalid')
  git('config', '--local', 'core.hooksPath', '.git/hooks')
  await mkdir(join(directory, 'src'))
  await mkdir(join(directory, 'public'))
  await writeFile(join(directory, 'index.html'), '<div id="root"></div>')
  await writeFile(join(directory, 'src/base.ts'), 'export const value = "baseline"\n')
  await writeFile(join(directory, 'public/clip.mp4'), 'baseline fixture bytes')
  git('add', '.')
  git('commit', '--quiet', '-m', 'Baseline fixture')
  baselineRevision = git('rev-parse', 'HEAD')
  git('update-ref', 'refs/remotes/origin/main', baselineRevision)
  git('checkout', '--quiet', '-b', 'codex/candidate-fixture')
  await writeFile(join(directory, 'src/base.ts'), 'export const value = "candidate"\n')
  await writeFile(join(directory, 'src/added.ts'), 'export const added = true\n')
  await writeFile(join(directory, 'public/clip.mp4'), 'candidate fixture bytes')
  git('add', '.')
  git('commit', '--quiet', '-m', 'Committed candidate fixture')
  candidateRevision = git('rev-parse', 'HEAD')
})

afterEach(async () => {
  if (!directory) return
  const actual = await realpath(directory)
  const parent = await realpath(tmpdir())
  if (
    dirname(actual).toLowerCase() !== parent.toLowerCase() ||
    !basename(actual).startsWith('presentation-source-')
  ) {
    throw new Error('Unexpected presentation source fixture path')
  }
  await rm(actual, { recursive: true, force: true })
})

describe('presentation baseline source selection', () => {
  it('keeps committed candidate modules out of the origin/main baseline', () => {
    const snapshot = refs()
    expect(snapshot.baselineRevision).toBe(baselineRevision)
    expect(snapshot.revision).toBe(candidateRevision)
    expect(snapshot.baselineSourcePaths).not.toContain('src/added.ts')
    expect(snapshot.candidateSourcePaths).toContain('src/added.ts')
    expect(snapshot.publicPaths).toContain('public/clip.mp4')
    expect(snapshot.candidateDirty).toBe(false)
  })

  it('includes uncommitted source and media without adding them to the baseline', async () => {
    await writeFile(join(directory, 'src/pending.ts'), 'export const pending = true\n')
    await writeFile(join(directory, 'public/pending.webp'), 'pending fixture bytes')
    const snapshot = refs()
    expect(snapshot.candidateSourcePaths).toContain('src/pending.ts')
    expect(snapshot.baselineSourcePaths).not.toContain('src/pending.ts')
    expect(snapshot.publicPaths).toContain('public/pending.webp')
    expect(snapshot.candidateDirty).toBe(true)
  })

  it('retains an explicitly pinned baseline after main advances', () => {
    git('update-ref', 'refs/remotes/origin/main', candidateRevision)
    const snapshot = refs(baselineRevision)
    expect(snapshot.baselineRevision).toBe(baselineRevision)
    expect(snapshot.baselineSourcePaths).not.toContain('src/added.ts')
  })

  it('rejects an unavailable reference instead of silently comparing against HEAD', () => {
    expect(() => refs('refs/remotes/origin/missing-fixture')).toThrow()
  })
})
