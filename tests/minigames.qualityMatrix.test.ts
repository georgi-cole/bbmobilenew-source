import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { getAllGames } from '../src/minigames/registry'
import { getMinigameQualityMatrix } from './helpers/minigameQualityMatrix'
import { isInMinigameCertificationScope } from './helpers/minigameCertificationScope'

const repositoryRoot = process.cwd()

describe('registry-driven minigame quality matrix', () => {
  it('contains exactly one detailed profile for every active release-scope registry entry', () => {
    const activeKeys = getAllGames()
      .filter(isInMinigameCertificationScope)
      .map((game) => game.key)
      .sort()
    const matrixKeys = getMinigameQualityMatrix()
      .map((row) => row.registryId)
      .sort()
    expect(matrixKeys).toEqual(activeKeys)
    expect(new Set(matrixKeys).size).toBe(matrixKeys.length)
  })

  it('excludes retired, legacy, and inactive entries while retaining active VIP and finale routes', () => {
    const activeGame = getAllGames().find((game) => isInMinigameCertificationScope(game))
    expect(activeGame).toBeDefined()
    if (!activeGame) return

    expect(isInMinigameCertificationScope({ ...activeGame, retired: true })).toBe(false)
    expect(isInMinigameCertificationScope({ ...activeGame, legacy: true })).toBe(false)
    expect(isInMinigameCertificationScope({ ...activeGame, weight: 0, vipOnly: false })).toBe(false)

    const scope = new Set(
      getAllGames()
        .filter(isInMinigameCertificationScope)
        .map((game) => game.key)
    )
    expect(scope.has('castleRescueRemastered')).toBe(true)
    expect(scope.has('castleRescue2Remastered')).toBe(true)
    expect(scope.has('finalThreeCircuit')).toBe(true)
    expect(scope.has('downMemoryLane')).toBe(true)
  })

  it('keeps retired registry entries out of the human-readable active matrix', () => {
    const document = readFileSync(resolve(repositoryRoot, 'docs/minigame-test-matrix.md'), 'utf8')
    for (const game of getAllGames().filter((entry) => entry.retired || entry.legacy)) {
      expect(document, `docs/minigame-test-matrix.md includes excluded ${game.key}`).not.toContain(
        `\u0060${game.key}\u0060`
      )
    }
  })

  it('records a usable rule, path, result, and risk contract for every active game', () => {
    for (const row of getMinigameQualityMatrix()) {
      expect(row.displayName.trim(), `${row.registryId} display name`).not.toBe('')
      expect(row.supportedModes.length, `${row.registryId} supported modes`).toBeGreaterThan(0)
      expect(
        row.minimumParticipants,
        `${row.registryId} minimum participants`
      ).toBeGreaterThanOrEqual(1)
      if (row.maximumParticipants != null) {
        expect(
          row.maximumParticipants,
          `${row.registryId} maximum participants`
        ).toBeGreaterThanOrEqual(row.minimumParticipants)
      }
      expect(row.primaryInput.trim(), `${row.registryId} primary input`).not.toBe('')
      expect(row.tiePolicy.trim(), `${row.registryId} tie policy`).not.toBe('')
      expect(row.timeoutPolicy.trim(), `${row.registryId} timeout policy`).not.toBe('')
      expect(row.authoritativeResultShape.trim(), `${row.registryId} result shape`).not.toBe('')
      expect(
        row.evidence.logic.length,
        `${row.registryId} needs rule/logic evidence`
      ).toBeGreaterThan(0)
      expect(row.evidence.playwright).toContain('e2e/playwright/minigameLab.smoke.spec.ts')
    }
  })

  it('only cites evidence files that exist in this repository', () => {
    for (const row of getMinigameQualityMatrix()) {
      for (const path of Object.values(row.evidence).flat()) {
        expect(
          existsSync(resolve(repositoryRoot, path)),
          `${row.registryId} cites missing evidence ${path}`
        ).toBe(true)
      }
    }
  })

  it('keeps the human-readable matrix complete with every active registry id', () => {
    const document = readFileSync(resolve(repositoryRoot, 'docs/minigame-test-matrix.md'), 'utf8')
    for (const row of getMinigameQualityMatrix()) {
      expect(document, `docs/minigame-test-matrix.md omits ${row.registryId}`).toContain(
        `\`${row.registryId}\``
      )
      const tableRow = document
        .split(/\r?\n/)
        .find((line) => line.startsWith(`| \`${row.registryId}\``))
      expect(tableRow, `${row.registryId} needs a display-name table row`).toBeDefined()
      expect(tableRow?.split('|')[2]?.trim(), `${row.registryId} display name`).toBe(
        row.displayName
      )
    }
    expect(document).not.toMatch(
      /\bGlass Bridge\b|\bGrid of Luck\b|\bCastle Rescue\b|\bLogic Locks\b/i
    )
  })
})
