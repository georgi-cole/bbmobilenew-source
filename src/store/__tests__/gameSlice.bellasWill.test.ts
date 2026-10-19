import { describe, expect, it } from 'vitest'
import { createBellaWillState } from '../../features/twists/bellasWill'
import gameReducer, {
  advance,
  createInitialGameState,
  finalizeFinal3Decision,
  finalizeFinal3Eviction,
  finalizePendingEviction,
} from '../gameSlice'

function prepareBellaEviction(remainingPlayers: number) {
  const state = createInitialGameState({ seed: 7319 })
  let bella = state.players.find((player) => player.id === 'bella')
  if (!bella) {
    bella = state.players.find((player) => !player.isUser)
    if (!bella) throw new Error('Expected an AI player to cast as Bella')
    bella.id = 'bella'
  }
  bella.name = 'Bella'
  bella.avatar = 'assets/skins/Bella_avatar.webp'

  const heirs = state.players.filter((player) => player.id !== bella!.id).slice(0, remainingPlayers)
  state.players.forEach((player) => {
    player.status =
      player.id === bella!.id || heirs.some((heir) => heir.id === player.id) ? 'active' : 'evicted'
  })
  state.bellaWill = createBellaWillState({
    active: true,
    seed: state.seed,
    season: state.season,
    reward: 'extra_vote',
  })
  state.bellaWill.heirId = heirs[0]?.id ?? null
  state.phase = 'eviction_results'
  state.nomineeIds = [bella.id]
  state.pendingEviction = {
    evicteeId: bella.id,
    evictionMessage: 'Bella has been eliminated from the Hub.',
  }

  return { state, bella }
}

function prepareBellaFinalThree() {
  const prepared = prepareBellaEviction(2)
  const finalists = prepared.state.players.filter((player) => player.status === 'active')
  const finalLoh = finalists.find((player) => player.id !== prepared.bella.id)
  const secondNominee = finalists.find(
    (player) => player.id !== prepared.bella.id && player.id !== finalLoh?.id
  )
  if (!finalLoh || !secondNominee) throw new Error('Expected two active Final Three opponents')
  finalLoh.status = 'loh'
  prepared.state.lohId = finalLoh.id
  prepared.state.phase = 'final3_decision'
  prepared.state.nomineeIds = [prepared.bella.id, secondNominee.id]
  prepared.state.awaitingFinal3Eviction = false
  prepared.state.awaitingFinal3Plea = false
  return { ...prepared, finalLoh, secondNominee }
}

function expectFinalThreeWillReveal(result: ReturnType<typeof gameReducer>) {
  expect(result.bellaWill).toMatchObject({
    active: true,
    inherited: false,
    expiredAtEndgame: true,
  })
  expect(
    result.tvFeed.find((event) => event.text.includes("Bella's Will is revealed."))?.text
  ).toContain('expired when the House reached the Final 4')
}

describe("Bella's Will eviction announcement", () => {
  it('reveals the heir and reward when Bella leaves at Final 5, while keeping the reward expired', () => {
    const { state, bella } = prepareBellaEviction(4)

    const result = gameReducer(state, finalizePendingEviction(bella.id))

    expect(result.players.filter((player) => player.status === 'active')).toHaveLength(4)
    expect(result.bellaWill).toMatchObject({
      active: true,
      inherited: false,
      expiredAtEndgame: true,
      extraVotePending: false,
    })
    const willAnnouncement = result.tvFeed.find((event) =>
      event.text.includes("Bella's Will is revealed.")
    )
    expect(willAnnouncement).toBeDefined()
    expect(willAnnouncement?.text).toContain("Bella's Will is revealed.")
    expect(willAnnouncement?.text).toContain('is named heir')
    expect(willAnnouncement?.text).toContain('expired when the House reached the Final 4')
    expect(willAnnouncement?.meta?.forceOnTv).toBe(true)
  })

  it('continues to activate Bella’s Will when her exit leaves more than four players', () => {
    const { state, bella } = prepareBellaEviction(5)

    const result = gameReducer(state, finalizePendingEviction(bella.id))

    expect(result.bellaWill).toMatchObject({
      inherited: true,
      expiredAtEndgame: false,
      extraVotePending: true,
    })
    expect(
      result.tvFeed.find((event) => event.text.includes("Bella's Will is now in effect."))?.text
    ).toContain("Bella's Will is now in effect.")
  })

  it('reveals the expired Will when the human Final LOH evicts Bella directly', () => {
    const { state, bella } = prepareBellaFinalThree()

    const result = gameReducer(state, finalizeFinal3Eviction(bella.id))

    expectFinalThreeWillReveal(result)
  })

  it('reveals the expired Will when the Final Three ceremony records Bella as third place', () => {
    const { state, bella, finalLoh } = prepareBellaFinalThree()

    const result = gameReducer(
      state,
      finalizeFinal3Decision({ hohWinnerId: finalLoh.id, evicteeId: bella.id })
    )

    expectFinalThreeWillReveal(result)
  })

  it('reveals the expired Will on the AI Final LOH eviction path', () => {
    const { state, bella, finalLoh } = prepareBellaFinalThree()
    // The AI fallback is a Classic ceremony path. Expansion finales use their
    // own audience-vote flow and never auto-evict from this reducer branch.
    if (state.voxPopuli) state.voxPopuli.status = 'inactive'
    state.nomineeIds = [bella.id]
    state.pendingEviction = null
    state.players = state.players.map((player) =>
      player.id === finalLoh.id ? { ...player, isUser: false } : player
    )

    const result = gameReducer(state, advance())

    expectFinalThreeWillReveal(result)
  })
})
