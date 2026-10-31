// @vitest-environment node
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import configuration from '../vite.config'

async function ignored(path: string): Promise<boolean> {
  const config = await (typeof configuration === 'function'
    ? configuration({ command: 'serve', mode: 'development' })
    : configuration)
  const watch = config.server?.watch
  if (!watch || typeof watch.ignored !== 'function') throw new Error('Missing watch filter')
  return Boolean(watch.ignored(path))
}

describe('development watch roots', () => {
  it('ignores generated reports with native and normalized separators', async () => {
    const report = resolve(process.cwd(), 'renders', 'capture', 'trace.html')
    expect(await ignored(report)).toBe(true)
    expect(await ignored(report.replaceAll('\\', '/'))).toBe(true)
  })

  it('keeps the current managed worktree source watched', async () => {
    expect(await ignored(resolve(process.cwd(), 'src', 'main.tsx'))).toBe(false)
  })

  it('does not ignore a sibling whose name only shares a prefix', async () => {
    expect(await ignored(resolve(process.cwd(), 'renders-archive', 'index.html'))).toBe(false)
  })
})
