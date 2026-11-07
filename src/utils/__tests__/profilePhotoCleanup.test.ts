import { afterEach, describe, expect, it, vi } from 'vitest'

async function photoStore(keys: string[]) {
  vi.resetModules()
  const deleted: string[] = []
  const request: { result: unknown; onsuccess?: () => void } = { result: null }
  const transaction: { oncomplete?: () => void; objectStore: () => unknown } = {
    objectStore: () => ({
      delete: (key: string) => deleted.push(key),
      openKeyCursor: () => {
        let index = 0
        const next = () => {
          request.result =
            index < keys.length
              ? {
                  key: keys[index],
                  continue: () => {
                    index += 1
                    queueMicrotask(next)
                  },
                }
              : null
          request.onsuccess?.()
          if (index >= keys.length) queueMicrotask(() => transaction.oncomplete?.())
        }
        queueMicrotask(next)
        return request
      },
    }),
  }
  const database = { transaction: () => transaction }
  vi.stubGlobal('indexedDB', {
    open: () => {
      const openRequest: {
        result: unknown
        onsuccess?: (event: { target: { result: unknown } }) => void
      } = { result: database }
      queueMicrotask(() => openRequest.onsuccess?.({ target: openRequest }))
      return openRequest
    },
  })
  const { pruneProfilePhotos } = await import('../imageDb')
  return { deleted, pruneProfilePhotos }
}

describe('profile portrait cleanup isolation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps saved portraits and never treats a longer profile ID as the same owner', async () => {
    const { deleted, pruneProfilePhotos } = await photoStore([
      'photo-owner-100',
      'photo-owner-200',
      'photo-owner-extra-100',
      'photo-other-100',
      'legacy-saved-photo',
    ])
    await pruneProfilePhotos(
      'owner',
      ['photo-owner-200', 'legacy-saved-photo'],
      ['legacy-saved-photo']
    )
    expect(deleted).toEqual(['photo-owner-100'])
  })

  it('removes the deleted profile revisions and explicit legacy photo without touching another profile', async () => {
    const { deleted, pruneProfilePhotos } = await photoStore([
      'photo-owner-100',
      'photo-owner-extra-100',
      'legacy-photo',
      'unrelated-photo',
    ])
    await pruneProfilePhotos('owner', [], ['legacy-photo'])
    expect(deleted).toEqual(['photo-owner-100', 'legacy-photo'])
  })
})
