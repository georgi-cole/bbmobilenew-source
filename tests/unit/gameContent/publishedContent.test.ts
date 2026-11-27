import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createPublishedContentClient,
  parsePublishedManifest,
} from '../../../src/content/publishedContent'

const base = 'https://content.example.test/'
const asMessage = (value: unknown) => (typeof value === 'string' ? value : null)

function revision(value: unknown) {
  const body = JSON.stringify(value)
  return {
    body,
    entry: {
      revision: createHash('sha256').update(body).digest('hex'),
      bytes: Buffer.byteLength(body),
    },
  }
}

describe('published game content', () => {
  it('refreshes an installed client, rolls back and retains a checked revision when a fetch fails', async () => {
    const alpha = revision('original')
    const beta = revision('updated')
    const invalid = revision({ invalid: true })
    let selected = alpha
    let clock = 0
    let fail = false
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const fetchContent: typeof fetch = async (url) => {
      if (fail) throw new Error('Offline')
      return String(url).endsWith('manifest.json')
        ? Response.json({ schemaVersion: 1, entries: { credits: selected.entry } })
        : new Response(selected.body)
    }
    const storage = () => window.localStorage
    storage().clear()
    try {
      const installed = createPublishedContentClient(base, fetchContent, storage)
      expect(await installed.loadJson('credits', asMessage)).toMatchObject({
        value: 'original',
        revision: alpha.entry.revision,
      })
      selected = beta
      clock += 301_000
      expect(await installed.loadJson('credits', asMessage)).toMatchObject({ value: 'updated' })

      selected = invalid
      clock += 301_000
      expect(await installed.loadJson('credits', asMessage)).toMatchObject({ value: 'updated' })
      fail = true
      const reopened = createPublishedContentClient(base, fetchContent, storage)
      expect(await reopened.loadJson('credits', asMessage)).toMatchObject({ value: 'updated' })

      selected = alpha
      fail = false
      clock += 301_000
      expect(await installed.loadJson('credits', asMessage)).toMatchObject({ value: 'original' })
    } finally {
      now.mockRestore()
      storage().clear()
    }
  })

  it('rejects incompatible versions, arbitrary paths and oversized entries', () => {
    expect(parsePublishedManifest({ schemaVersion: 2, entries: {} })).toBeNull()
    expect(
      parsePublishedManifest({
        schemaVersion: 1,
        entries: { credits: { revision: '../../other.json', bytes: 1 } },
      })
    ).toBeNull()
    expect(
      parsePublishedManifest({
        schemaVersion: 1,
        entries: { credits: { revision: 'a'.repeat(64), bytes: 65_537 } },
      })
    ).toBeNull()
  })

  it('resolves video on request without fetching the clip itself', async () => {
    const fetchContent = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        schemaVersion: 1,
        entries: { 'credits-video': { revision: 'a'.repeat(64), bytes: 8_000_000 } },
      })
    )
    const installed = createPublishedContentClient(base, fetchContent)
    expect(fetchContent).not.toHaveBeenCalled()
    expect(await installed.getCreditsVideoUrl()).toBe(`${base}credits-video/${'a'.repeat(64)}.mp4`)
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })
})
