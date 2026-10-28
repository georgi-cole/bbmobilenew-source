import type { SavedSeasonSnapshot } from '../../src/store/saveStatePersistence'

// This entry is built only by run-profile-performance.mjs, never by the app build.
const startedAt = performance.now()
let fixtureSeed = 0x4f1bbcdc
Math.random = () => {
  let value = (fixtureSeed += 0x6d2b79f5)
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}
const persistence = await import('../../src/store/durablePersistence')
const persistenceStartedAt = performance.now()
await persistence.initializeDurablePersistence()
const persistenceStartupMs = performance.now() - persistenceStartedAt
const { store } = await import('../../src/store/store')
const saves = await import('../../src/store/saveStatePersistence')
const game = await import('../../src/store/gameSlice')
const { hydrateSocial } = await import('../../src/social/socialSlice')
const { hydrateFinale } = await import('../../src/store/finaleSlice')
const { hydratePublicOpinion } = await import('../../src/publicOpinion/publicOpinionSlice')
const { hydrateChallenge } = await import('../../src/store/challengeSlice')
const { withRunAutosaveSuspended } = await import('../../src/store/runAutosaveGate')
const { createRunSnapshotAutosaveController } = await import('../../src/store/runSnapshotAutosave')
const { saveSeasonArchives } = await import('../../src/store/archivePersistence')
const { archiveKeyForProfile } = await import('../../src/store/profilesSlice')
const runtimeStartupMs = performance.now() - startedAt

function populatedSnapshot(
  profileId: string,
  survival: boolean,
  archives: number
): SavedSeasonSnapshot {
  const snapshot = saves.createSavedSeasonSnapshot(profileId, store.getState())
  const runId = `profile-benchmark-${profileId}-${survival ? 'survival' : 'classic'}`
  snapshot.game = {
    ...snapshot.game,
    gameId: runId,
    runId,
    mode: survival ? 'survival' : 'classic',
    expansionMode: null,
    status: 'active',
    season: survival ? 1 : archives + 1,
    week: 8,
    phase: 'week_start',
    seasonContestant: {
      version: 1,
      name: `Contestant ${profileId}`,
      avatar: '🧑',
      bio: { age: '28', sex: 'Female' },
    },
    players: snapshot.game.players.map((player) =>
      player.isUser
        ? { ...player, name: `Contestant ${profileId}`, avatar: '🧑', age: 28, sex: 'Female' }
        : player
    ),
    // Generated populated fixtures, not a claim that a human played this season.
    // Both run slots have the same capped, nonempty feed in every profile.
    tvFeed: Array.from({ length: 400 }, (_, index) => ({
      id: `${runId}-event-${index}`,
      type: 'game' as const,
      timestamp: 1_790_000_000_000 + index,
      text: `Day ${1 + (index % 8)}: The housemates discussed the nominations, formed alliances and reflected on the latest competition. Every choice changes their relationships and the story of this season. Event ${index}.`,
      meta: { week: 1 + (index % 8), phase: 'week_start' },
    })),
  }
  return snapshot
}

async function seed({ count, archives }: { count: number; archives: number }) {
  const profiles = Array.from({ length: count }, (_, index) => ({
    id: `benchmark-player-${index + 1}`,
    name: `Benchmark player ${index + 1}`,
    avatar: '🧑',
    bio: { age: '28', sex: 'Female' },
    createdAt: '2026-10-27T00:00:00.000Z',
    eyeoleans: 500,
    eyeoleanTransactions: Array.from({ length: 100 }, (_, index) => ({
      id: `reward-${index}`,
      amount: 50,
      source: 'season_reward',
      label: `Season ${index + 1} rewards`,
      createdAt: '2026-10-27T00:00:00.000Z',
    })),
    processedEyeoleanTransactionIds: Array.from({ length: 100 }, (_, index) => `reward-${index}`),
    achievements: ['public_favorite_oracle'],
  }))
  localStorage.setItem(
    'bbmobilenew:profiles:v1',
    JSON.stringify({ profiles, activeProfileId: profiles[0].id, isGuest: false })
  )
  // Use the normal reset middleware to initialize the real social/relationship
  // structures before adding synthetic historical volume.
  withRunAutosaveSuspended(() => store.dispatch(game.resetGame([])))
  for (const profile of profiles) {
    saveSeasonArchives(
      archiveKeyForProfile(profile.id),
      Array.from({ length: archives }, (_, index) => ({
        seasonIndex: index + 1,
        seasonId: `${profile.id}-completed-${index + 1}`,
        startAt: '2026-01-01T00:00:00.000Z',
        endAt: '2026-01-02T00:00:00.000Z',
        summaryText: 'A completed season with competition, nomination and placement statistics.',
        playerSummaries: store.getState().game.players.map((player, place) => ({
          playerId: player.id,
          displayName: player.name,
          finalPlacement: place + 1,
          lohWins: place % 3,
          posWins: place % 2,
          timesNominated: place % 4,
          daysAlive: 8,
          weeksAlive: 8,
          madeJury: place < 7,
        })),
      }))
    )
    for (const survival of [true, false]) {
      if (!saves.saveRunSnapshot(profile.id, populatedSnapshot(profile.id, survival, archives))) {
        throw new Error('Benchmark fixture could not be saved')
      }
    }
  }
  if (!(await saves.flushSavePersistence())) throw new Error('Fixture flush failed')
  return { profiles: count, bytes: persistence.inspectDurableStorageUsageBytes() }
}

async function resume() {
  const began = performance.now()
  const profile = saves.loadSavedRunProfile('benchmark-player-1')
  const snapshot = profile.runs.classic
  if (!snapshot) throw new Error('Missing Classic fixture')
  withRunAutosaveSuspended(() => {
    store.dispatch(game.hydrateGame(snapshot.game))
    store.dispatch(hydrateFinale(snapshot.finale))
    store.dispatch(hydrateSocial(snapshot.social))
    if (snapshot.publicOpinion) store.dispatch(hydratePublicOpinion(snapshot.publicOpinion))
    if (snapshot.challenge) store.dispatch(hydrateChallenge(snapshot.challenge))
  })
  return { resumeMs: performance.now() - began, runId: store.getState().game.runId }
}

async function autosave() {
  const controller = createRunSnapshotAutosaveController(saves.saveRunSnapshot)
  const synchronousMs: number[] = []
  const flushMs: number[] = []
  const frameGapsMs: number[] = []
  let previousFrame = 0
  let frameId = 0
  const frame = (at: number) => {
    if (previousFrame) frameGapsMs.push(at - previousFrame)
    previousFrame = at
    frameId = requestAnimationFrame(frame)
  }
  frameId = requestAnimationFrame(frame)
  for (let index = 0; index < 12; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const began = performance.now()
    // Exercise the shipped Redux snapshot queue, compaction and serializer.
    controller.scheduleLazy(
      'benchmark-player-1',
      'classic',
      store.getState().game.runId ?? null,
      () => saves.createSavedSeasonSnapshot('benchmark-player-1', store.getState())
    )
    controller.flush()
    if (saves.getSavePersistenceDiagnostics().blockedReason) throw new Error('Autosave failed')
    synchronousMs.push(performance.now() - began)
    const flushBegan = performance.now()
    if (!(await saves.flushSavePersistence())) throw new Error('Autosave flush failed')
    flushMs.push(performance.now() - flushBegan)
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  cancelAnimationFrame(frameId)
  return {
    synchronousMs,
    flushMs,
    frameGapsMs,
    diagnostics: persistence.getDurablePersistenceDiagnostics(),
  }
}

Object.assign(window, {
  profileBenchmark: {
    seed,
    resume,
    autosave,
    startup: { persistenceStartupMs, runtimeStartupMs },
    diagnostics: persistence.getDurablePersistenceDiagnostics,
  },
})
document.getElementById('status')!.textContent = 'Ready'
