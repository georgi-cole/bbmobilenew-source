// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
  getPresentationOwner,
} from './presentationOwnership'

const releases: Array<() => void> = []

function acquire(token: symbol, groupId: string, priority: number): () => void {
  const release = acquirePresentationOwnership(token, groupId, priority)
  releases.push(release)
  return release
}

async function flushRelease(): Promise<void> {
  await Promise.resolve()
}

afterEach(async () => {
  releases.splice(0).forEach((release) => release())
  await flushRelease()
})

describe('presentation ownership', () => {
  it('keeps the highest-priority group exclusive and restores a still-mounted owner', async () => {
    const gameplayToken = createPresentationOwnerToken()
    const cinematicToken = createPresentationOwnerToken()
    const releaseGameplay = acquire(gameplayToken, 'gameplay', 10)
    const releaseCinematic = acquire(cinematicToken, 'cinematic', 30)

    expect(getPresentationOwner()).toMatchObject({ groupId: 'cinematic', priority: 30 })

    releaseCinematic()
    await flushRelease()
    expect(getPresentationOwner()).toMatchObject({ groupId: 'gameplay', priority: 10 })

    releaseGameplay()
    await flushRelease()
    expect(getPresentationOwner()).toBeNull()
  })

  it('does not release an owner during StrictMode-style cleanup and immediate re-registration', async () => {
    const token = createPresentationOwnerToken()
    const releaseFirstMount = acquire(token, 'credits', 40)
    releaseFirstMount()
    const releaseSecondMount = acquire(token, 'credits', 40)

    await flushRelease()
    expect(getPresentationOwner()).toMatchObject({ groupId: 'credits', priority: 40 })

    releaseSecondMount()
    await flushRelease()
    expect(getPresentationOwner()).toBeNull()
  })

  it('lets the most recently requested group win a priority tie', async () => {
    const firstToken = createPresentationOwnerToken()
    const secondToken = createPresentationOwnerToken()
    const releaseFirst = acquire(firstToken, 'first', 20)
    const releaseSecond = acquire(secondToken, 'second', 20)

    expect(getPresentationOwner()).toMatchObject({ groupId: 'second' })

    releaseSecond()
    await flushRelease()
    expect(getPresentationOwner()).toMatchObject({ groupId: 'first' })

    releaseFirst()
    await flushRelease()
    expect(getPresentationOwner()).toBeNull()
  })

  it('keeps nested surfaces in one presentation group until its last owner releases', async () => {
    const ambienceToken = createPresentationOwnerToken()
    const finaleToken = createPresentationOwnerToken()
    const creditsToken = createPresentationOwnerToken()
    const releaseAmbience = acquire(ambienceToken, 'weekend-ambience', 10)
    const releaseFinale = acquire(finaleToken, 'season-finale', 100)
    const releaseCredits = acquire(creditsToken, 'season-finale', 100)

    expect(getPresentationOwner()).toMatchObject({ groupId: 'season-finale', priority: 100 })

    releaseCredits()
    await flushRelease()
    expect(getPresentationOwner()).toMatchObject({ groupId: 'season-finale', priority: 100 })

    releaseFinale()
    await flushRelease()
    expect(getPresentationOwner()).toMatchObject({ groupId: 'weekend-ambience', priority: 10 })

    releaseAmbience()
    await flushRelease()
    expect(getPresentationOwner()).toBeNull()
  })

  it('does not let a just-unmounted high-priority group block a new presentation', async () => {
    const finaleToken = createPresentationOwnerToken()
    const twistToken = createPresentationOwnerToken()
    const releaseFinale = acquire(finaleToken, 'finale', 100)

    releaseFinale()
    acquire(twistToken, 'twin-shock', 50)

    expect(getPresentationOwner()).toMatchObject({ groupId: 'twin-shock', priority: 50 })
    await flushRelease()
    expect(getPresentationOwner()).toMatchObject({ groupId: 'twin-shock', priority: 50 })
  })
})
