import type { RelationshipsMap } from '../../social/types'
import { mulberry32 } from '../../store/rng'

export type ChamberAction =
  | 'surge'
  | 'share'
  | 'siphon'
  | 'ward'
  | 'double'
  | 'immunity'
  | 'drain'
  | 'gamble'
  | 'echo'
  | 'forbidden'

export type ChamberBoxEffect = 'execution' | 'steal' | 'swap' | 'hex'
export type ChamberBoxOutcome = 'boon' | 'twist' | 'setback' | 'wipe' | 'execution' | 'backfire'
export type ChamberTieBreakMethod = 'score' | 'round-gain' | 'sigil'

export interface ChamberParticipant {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
}

export interface ChamberPlayer extends ChamberParticipant {
  power: number
  ward: boolean
  immune: boolean
  doubleGain: boolean
  doubleLoss: boolean
  eliminated: boolean
}

export interface ChamberEvent {
  round: number
  actorId: string
  action: ChamberAction
  copiedAction?: ChamberAction
  targetId?: string
  message: string
  changes: Array<{ playerId: string; before: number; after: number }>
  boxOutcome?: ChamberBoxOutcome
  eliminatedPlayerId?: string
}

export interface ChamberTieBreak {
  method: ChamberTieBreakMethod
  contenderIds: string[]
  sigils?: Array<{ playerId: string; value: number }>
}

export interface ChamberState {
  players: ChamberPlayer[]
  completedTurns: number
  offers: ChamberAction[]
  previousOffers: ChamberAction[]
  forbiddenOpeningsUsed: number
  events: ChamberEvent[]
  lastEvent: ChamberEvent | null
  pendingBox: { actorId: string; effect: ChamberBoxEffect } | null
  winnerId: string | null
  tieBreak: ChamberTieBreak | null
}

export interface ForbiddenOdds {
  boon: number
  twist: number
  setback: number
  wipe: number
  lethal: number
}

export const CHAMBER_ROUNDS = 6
export const CHAMBER_FORBIDDEN_OPENINGS = 3
export const CHAMBER_ACTIONS: ChamberAction[] = [
  'surge',
  'share',
  'siphon',
  'ward',
  'double',
  'immunity',
  'drain',
  'gamble',
  'echo',
]

export const CHAMBER_ACTION_INFO: Record<
  ChamberAction,
  { title: string; symbol: string; description: string; needsTarget: boolean }
> = {
  surge: {
    title: 'Gather power',
    symbol: '✦',
    description: 'Gain 130 Power now.',
    needsTarget: false,
  },
  share: {
    title: 'Share power',
    symbol: '🤝',
    description: 'You and one player you choose each gain 60 Power. You cannot choose yourself.',
    needsTarget: true,
  },
  siphon: {
    title: 'Siphon power',
    symbol: '⛧',
    description: 'Steal Power from another player.',
    needsTarget: true,
  },
  ward: {
    title: 'Raise a Ward',
    symbol: '🛡',
    description: 'Protect yourself or someone else from an incoming attack.',
    needsTarget: true,
  },
  double: {
    title: 'Prime a gain',
    symbol: '⬖',
    description: 'Your next Power gain is doubled. This stays active until used.',
    needsTarget: false,
  },
  immunity: {
    title: 'Veil of immunity',
    symbol: '☉',
    description: 'Become untouchable by hostile powers for a time.',
    needsTarget: false,
  },
  drain: {
    title: 'Drain the leader',
    symbol: '♛',
    description: 'The highest-scoring rival loses up to 110 Power. A Ward can block it.',
    needsTarget: false,
  },
  gamble: {
    title: 'Risky bargain',
    symbol: '⚖',
    description: 'Stake 90 Power for a chance at a 300 Power windfall.',
    needsTarget: false,
  },
  echo: {
    title: 'Echo the last power',
    symbol: '🜁',
    description:
      'Repeat the last eligible power. The copied power will be shown before you choose.',
    needsTarget: false,
  },
  forbidden: {
    title: 'Forbidden Box',
    symbol: '☠',
    description:
      'A forbidden rite: protection, rival curses, theft, exchanges, a Power wipe, or execution.',
    needsTarget: false,
  },
}

const FORBIDDEN_TWISTS: ChamberBoxEffect[] = ['steal', 'swap', 'hex']

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!]
  }
  return result
}

function getLivingPlayers(state: ChamberState): ChamberPlayer[] {
  return state.players.filter((player) => !player.eliminated)
}

export function getChamberRound(state: ChamberState): number {
  if (state.players.length === 0) return 1
  return Math.min(CHAMBER_ROUNDS, Math.floor(state.completedTurns / state.players.length) + 1)
}

export function getChamberActor(state: ChamberState): ChamberPlayer {
  const count = state.players.length
  if (count === 0) {
    return {
      id: 'none',
      name: 'Nobody',
      isHuman: false,
      power: 0,
      ward: false,
      immune: false,
      doubleGain: false,
      doubleLoss: false,
      eliminated: true,
    }
  }
  const round = getChamberRound(state)
  const turnInRound = state.completedTurns % count
  const playerIndex = (round - 1 + turnInRound) % count
  return state.players[playerIndex] ?? state.players[0]!
}

export function isChamberFinished(state: ChamberState): boolean {
  return state.completedTurns >= state.players.length * CHAMBER_ROUNDS
}

function hasElimination(state: ChamberState): boolean {
  return state.events.some((event) => event.eliminatedPlayerId !== undefined)
}

export function getForbiddenOdds(
  state: ChamberState,
  round = getChamberRound(state)
): ForbiddenOdds {
  if (round <= 4) return { boon: 35, twist: 35, setback: 20, wipe: 10, lethal: 0 }

  const lethalAvailable = getLivingPlayers(state).length >= 4 && !hasElimination(state)
  return {
    boon: lethalAvailable ? 30 : 35,
    twist: lethalAvailable ? 30 : 35,
    setback: 20,
    wipe: 10,
    lethal: lethalAvailable ? 10 : 0,
  }
}

export function getForbiddenBoxDescription(): string {
  return CHAMBER_ACTION_INFO.forbidden.description
}

function getEligibleEcho(state: ChamberState): ChamberAction | null {
  const event = [...state.events]
    .reverse()
    .find(
      (entry) =>
        entry.action !== 'forbidden' &&
        entry.action !== 'echo' &&
        entry.action !== 'immunity' &&
        entry.action !== 'double' &&
        entry.action !== 'drain' &&
        entry.action !== 'gamble'
    )
  return event?.action ?? null
}

export function getEffectiveChamberAction(
  action: ChamberAction,
  state: ChamberState
): ChamberAction {
  return action === 'echo' ? (getEligibleEcho(state) ?? 'surge') : action
}

export function getChamberActionInfo(
  action: ChamberAction,
  state: ChamberState
): { title: string; symbol: string; description: string; needsTarget: boolean } {
  if (action === 'forbidden') {
    return {
      ...CHAMBER_ACTION_INFO.forbidden,
      description: getForbiddenBoxDescription(),
    }
  }
  if (action !== 'echo') return CHAMBER_ACTION_INFO[action]
  const copied = getEligibleEcho(state)
  if (!copied) {
    return {
      ...CHAMBER_ACTION_INFO.echo,
      description: 'No power can be echoed right now. The chamber gathers 130 Power instead.',
    }
  }
  const info = CHAMBER_ACTION_INFO[copied]
  return {
    ...CHAMBER_ACTION_INFO.echo,
    title: 'Echo: ' + info.title,
    description: 'Repeat the latest echoable power: ' + info.description,
    needsTarget: info.needsTarget,
  }
}

export function getChamberActionNeedsTarget(action: ChamberAction, state: ChamberState): boolean {
  return getChamberActionInfo(action, state).needsTarget
}

export function getChamberTargetPlayers(
  state: ChamberState,
  action: ChamberAction
): ChamberPlayer[] {
  const effective = getEffectiveChamberAction(action, state)
  const actor = getChamberActor(state)
  if (effective === 'ward') return state.players.filter((player) => !player.eliminated)
  if (effective === 'share' || effective === 'siphon') {
    return state.players.filter((player) => !player.eliminated && player.id !== actor.id)
  }
  return []
}

export function getChamberActionTitle(action: ChamberAction, copiedAction?: ChamberAction): string {
  if (action === 'echo' && copiedAction) return 'Echo: ' + CHAMBER_ACTION_INFO[copiedAction].title
  return CHAMBER_ACTION_INFO[action].title
}

function createOffers(
  rng: () => number,
  previousOffers: ChamberAction[],
  canEcho: boolean,
  echoAction: ChamberAction | null
): ChamberAction[] {
  const available = CHAMBER_ACTIONS.filter((action) => action !== 'echo' || canEcho)
  let visible = shuffle(available, rng).slice(0, 3)
  const normalPrevious = previousOffers.filter((action) => action !== 'forbidden')
  let bestScore = Number.POSITIVE_INFINITY
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = shuffle(available, rng).slice(0, 3)
    const overlap = candidate.filter((action) =>
      normalPrevious.some((previousAction) => previousAction === action)
    ).length
    const echoesVisiblePower =
      candidate.includes('echo') &&
      echoAction !== null &&
      candidate.some((action) => action === echoAction)
    const score = overlap * 10 + (echoesVisiblePower ? 100 : 0)
    if (score < bestScore) {
      visible = candidate
      bestScore = score
    }
    if (score === 0) break
  }
  return [...visible, 'forbidden']
}

export function createChamberState(participants: ChamberParticipant[], seed: number): ChamberState {
  const players: ChamberPlayer[] = participants.map((participant) => ({
    ...participant,
    power: 500,
    ward: false,
    immune: false,
    doubleGain: false,
    doubleLoss: false,
    eliminated: false,
  }))
  const rng = mulberry32(seed >>> 0)
  const initial: ChamberState = {
    players,
    completedTurns: 0,
    offers: [],
    previousOffers: [],
    forbiddenOpeningsUsed: 0,
    events: [],
    lastEvent: null,
    pendingBox: null,
    winnerId: null,
    tieBreak: null,
  }
  if (players.length > 0) initial.offers = createOffers(rng, [], false, null)
  return initial
}

function affinity(
  relationships: RelationshipsMap | undefined,
  actorId: string,
  targetId: string
): number {
  return relationships?.[actorId]?.[targetId]?.affinity ?? 0
}

function hasRelationshipTag(
  relationships: RelationshipsMap | undefined,
  actorId: string,
  targetId: string,
  tag: string
): boolean {
  return relationships?.[actorId]?.[targetId]?.tags?.includes(tag) ?? false
}

function isAlly(
  relationships: RelationshipsMap | undefined,
  actorId: string,
  targetId: string
): boolean {
  return (
    affinity(relationships, actorId, targetId) >= 30 ||
    hasRelationshipTag(relationships, actorId, targetId, 'alliance')
  )
}

function isRival(
  relationships: RelationshipsMap | undefined,
  actorId: string,
  targetId: string
): boolean {
  return (
    affinity(relationships, actorId, targetId) <= -25 ||
    hasRelationshipTag(relationships, actorId, targetId, 'rivalry')
  )
}

function rankOf(state: ChamberState, playerId: string): number {
  return [...getLivingPlayers(state)]
    .sort((left, right) => right.power - left.power)
    .findIndex((player) => player.id === playerId)
}

function chooseShareTarget(
  state: ChamberState,
  relationships: RelationshipsMap | undefined,
  actor: ChamberPlayer
): ChamberPlayer | undefined {
  return getLivingPlayers(state)
    .filter((player) => player.id !== actor.id)
    .sort((left, right) => {
      const relationDifference =
        affinity(relationships, actor.id, right.id) +
        (isAlly(relationships, actor.id, right.id) ? 35 : 0) -
        (affinity(relationships, actor.id, left.id) +
          (isAlly(relationships, actor.id, left.id) ? 35 : 0))
      return relationDifference || left.power - right.power
    })[0]
}

function chooseHostileTarget(
  state: ChamberState,
  relationships: RelationshipsMap | undefined,
  actor: ChamberPlayer
): ChamberPlayer | undefined {
  return getLivingPlayers(state)
    .filter((player) => player.id !== actor.id)
    .sort((left, right) => {
      const leftValue =
        left.power +
        (isRival(relationships, actor.id, left.id) ? 120 : 0) +
        (left.ward ? -250 : 0) +
        (left.immune ? -400 : 0)
      const rightValue =
        right.power +
        (isRival(relationships, actor.id, right.id) ? 120 : 0) +
        (right.ward ? -250 : 0) +
        (right.immune ? -400 : 0)
      return rightValue - leftValue
    })[0]
}

export function chooseChamberExecutionTarget(
  state: ChamberState,
  relationships: RelationshipsMap | undefined
): ChamberPlayer | undefined {
  const actor =
    state.players.find((player) => player.id === state.pendingBox?.actorId) ??
    getChamberActor(state)
  return chooseHostileTarget(state, relationships, actor)
}

function findLeaderRival(state: ChamberState, actorId: string): ChamberPlayer | undefined {
  return getLivingPlayers(state)
    .filter((player) => player.id !== actorId)
    .sort((left, right) => right.power - left.power)[0]
}

function estimateActionValue(
  state: ChamberState,
  actor: ChamberPlayer,
  action: ChamberAction,
  relationships: RelationshipsMap | undefined
): number {
  const round = getChamberRound(state)
  const rank = rankOf(state, actor.id)
  const behindBy = Math.max(
    0,
    (getLivingPlayers(state).sort((left, right) => right.power - left.power)[0]?.power ??
      actor.power) - actor.power
  )
  const turnsLeft = CHAMBER_ROUNDS - round

  if (action === 'surge') return 130 + Math.min(45, behindBy * 0.08)
  if (action === 'share') {
    const target = chooseShareTarget(state, relationships, actor)
    return target ? 64 + (isAlly(relationships, actor.id, target.id) ? 32 : 0) : 130
  }
  if (action === 'siphon') {
    const target = chooseHostileTarget(state, relationships, actor)
    return target && !target.ward && !target.immune ? 95 + Math.min(target.power, 80) * 0.8 : 20
  }
  if (action === 'ward') {
    const alreadyProtected = state.players.filter((player) => player.ward).length
    return alreadyProtected >= state.players.length - 1
      ? 45
      : 62 + (rank <= 1 ? 34 : 0) + (round < CHAMBER_ROUNDS ? 12 : 0)
  }
  if (action === 'double') return actor.doubleGain ? 20 : 72 + Math.min(36, turnsLeft * 8)
  if (action === 'immunity')
    return actor.immune ? 15 : 50 + (rank <= 1 ? 42 : 0) + (round < CHAMBER_ROUNDS ? 15 : 0)
  if (action === 'drain') {
    const leader = findLeaderRival(state, actor.id)
    return leader && !leader.ward && !leader.immune ? 74 + Math.min(40, leader.power * 0.04) : 30
  }
  if (action === 'gamble')
    return 78 + (behindBy > 180 ? 68 : behindBy > 80 ? 35 : 0) - (rank === 0 ? 45 : 0)
  if (action === 'echo')
    return estimateActionValue(
      state,
      actor,
      getEffectiveChamberAction(action, state),
      relationships
    )
  if (action === 'forbidden') {
    const odds = getForbiddenOdds(state, round)
    const expected =
      odds.boon * 1.25 +
      odds.twist * 0.65 -
      odds.setback * 0.95 -
      odds.wipe * 1.7 -
      odds.lethal * (actor.isHuman ? 7 : 4)
    return 58 + expected * 0.45 + (behindBy > 160 ? 62 : 0) - (rank === 0 ? 34 : 0)
  }
  return 0
}

export function chooseChamberAiAction(
  state: ChamberState,
  relationships: RelationshipsMap | undefined,
  rng: () => number
): { action: ChamberAction; targetId?: string } {
  const actor = getChamberActor(state)
  const available = state.offers.filter(
    (action) => action !== 'forbidden' || state.forbiddenOpeningsUsed < CHAMBER_FORBIDDEN_OPENINGS
  )
  const scored = available.map((action) => ({
    action,
    score: estimateActionValue(state, actor, action, relationships) + rng() * 12,
  }))
  const action = scored.sort((left, right) => right.score - left.score)[0]?.action ?? 'surge'
  const effective = getEffectiveChamberAction(action, state)

  if (effective === 'share')
    return { action, targetId: chooseShareTarget(state, relationships, actor)?.id }
  if (effective === 'siphon' || effective === 'ward') {
    if (effective === 'ward') {
      const target = [...getLivingPlayers(state)].sort((left, right) => {
        const leftValue =
          (left.id === actor.id ? 0 : affinity(relationships, actor.id, left.id)) +
          (left.ward ? -500 : 0) +
          (left.power >= actor.power ? 24 : 0)
        const rightValue =
          (right.id === actor.id ? 0 : affinity(relationships, actor.id, right.id)) +
          (right.ward ? -500 : 0) +
          (right.power >= actor.power ? 24 : 0)
        return rightValue - leftValue
      })[0]
      return { action, targetId: target?.id }
    }
    return { action, targetId: chooseHostileTarget(state, relationships, actor)?.id }
  }
  return { action }
}

function changePower(
  players: ChamberPlayer[],
  playerId: string,
  delta: number,
  doubleLoss = false
): { before: number; after: number } {
  const player = players.find((entry) => entry.id === playerId)!
  const before = player.power
  let appliedDelta = delta
  if (delta > 0 && player.doubleGain) {
    appliedDelta *= 2
    player.doubleGain = false
  } else if (delta < 0 && doubleLoss && player.doubleLoss) {
    appliedDelta *= 2
    player.doubleLoss = false
  }
  player.power = Math.max(0, player.power + appliedDelta)
  return { before, after: player.power }
}

function addChange(
  changes: ChamberEvent['changes'],
  players: ChamberPlayer[],
  playerId: string,
  delta: number,
  doubleLoss = false
): number {
  const change = changePower(players, playerId, delta, doubleLoss)
  changes.push({ playerId, ...change })
  return change.after - change.before
}

function applyHostileLoss(
  players: ChamberPlayer[],
  target: ChamberPlayer,
  amount: number,
  changes: ChamberEvent['changes']
): { applied: number; message: string } {
  const current = players.find((player) => player.id === target.id)!
  if (current.immune)
    return { applied: 0, message: current.name + "'s immunity blocks the hostile effect." }
  if (current.ward) {
    current.ward = false
    return { applied: 0, message: current.name + "'s Ward blocks the effect and fades." }
  }
  if (current.power <= 0 || amount <= 0)
    return { applied: 0, message: current.name + ' has no Power to lose.' }
  const applied = addChange(changes, players, current.id, -Math.min(amount, current.power), true)
  return { applied: -applied, message: '' }
}

function availableActorTargets(state: ChamberState, actorId: string): ChamberPlayer[] {
  return getLivingPlayers(state).filter((player) => player.id !== actorId)
}

function applyVisibleEffect(
  state: ChamberState,
  players: ChamberPlayer[],
  actor: ChamberPlayer,
  action: ChamberAction,
  targetId: string | undefined,
  rng: () => number
): {
  message: string
  changes: ChamberEvent['changes']
  targetId?: string
  copiedAction?: ChamberAction
} {
  const changes: ChamberEvent['changes'] = []
  const actorCopy = players.find((player) => player.id === actor.id)!
  const chosen = targetId
    ? players.find((player) => player.id === targetId && !player.eliminated)
    : undefined
  let message = ''
  let resolvedTargetId: string | undefined

  if (action === 'echo') {
    const copied = getEligibleEcho(state) ?? 'surge'
    const outcome = applyVisibleEffect(state, players, actor, copied, targetId, rng)
    return {
      message: 'The chamber echoes ' + CHAMBER_ACTION_INFO[copied].title + '. ' + outcome.message,
      changes: outcome.changes,
      targetId: outcome.targetId,
      copiedAction: copied,
    }
  }

  if (action === 'surge') {
    addChange(changes, players, actor.id, 130)
    message = actor.name + ' gathers 130 Power.'
  } else if (action === 'share') {
    const recipients = availableActorTargets(state, actor.id)
    const recipient =
      chosen && chosen.id !== actor.id
        ? chosen
        : recipients.sort((left, right) => left.power - right.power)[0]
    if (!recipient) {
      addChange(changes, players, actor.id, 120)
      message = actor.name + ' had no one to share with and gained 120 Power.'
    } else {
      addChange(changes, players, actor.id, 60)
      addChange(changes, players, recipient.id, 60)
      resolvedTargetId = recipient.id
      message =
        actor.name + ' shared power with ' + recipient.name + '; each gained up to 60 Power.'
    }
  } else if (action === 'siphon') {
    const victim =
      chosen && chosen.id !== actor.id ? chosen : chooseHostileTarget(state, undefined, actor)
    if (!victim) {
      addChange(changes, players, actor.id, 130)
      message = 'No rival remained, so the chamber gave ' + actor.name + ' 130 Power.'
    } else {
      resolvedTargetId = victim.id
      const loss = applyHostileLoss(players, victim, Math.min(80, victim.power), changes)
      if (loss.applied > 0) {
        addChange(changes, players, actor.id, loss.applied)
        message = actor.name + ' siphoned ' + loss.applied + ' Power from ' + victim.name + '.'
      } else {
        message = loss.message
      }
    }
  } else if (action === 'ward') {
    const recipient = chosen ?? actorCopy
    if (recipient.ward) {
      addChange(changes, players, recipient.id, 70)
      message = recipient.name + "'s existing Ward became 70 Power."
    } else {
      recipient.ward = true
      message = actor.name + ' raised a Ward for ' + recipient.name + '.'
    }
    resolvedTargetId = recipient.id
  } else if (action === 'double') {
    actorCopy.doubleGain = true
    message = actor.name + ' primed their next Power gain to double.'
  } else if (action === 'immunity') {
    actorCopy.immune = true
    message = actor.name + ' is immune to hostile powers until their next turn.'
  } else if (action === 'drain') {
    const leader = findLeaderRival(state, actor.id)
    if (!leader) {
      addChange(changes, players, actor.id, 100)
      message = 'No rival could be drained, so the chamber granted 100 Power.'
    } else {
      resolvedTargetId = leader.id
      const loss = applyHostileLoss(players, leader, Math.min(110, leader.power), changes)
      message =
        loss.applied > 0
          ? leader.name + ' lost ' + loss.applied + ' Power to the leader drain.'
          : loss.message
    }
  } else if (action === 'gamble') {
    if (rng() < 0.45) {
      addChange(changes, players, actor.id, 300)
      message = actor.name + ' won the risky bargain and gained 300 Power.'
    } else {
      const change = changePower(players, actor.id, -90, true)
      changes.push({ playerId: actor.id, ...change })
      message =
        actor.name + ' lost ' + (change.before - change.after) + ' Power on the risky bargain.'
    }
  }

  return { message, changes, targetId: resolvedTargetId }
}

function drawForbiddenOutcome(
  state: ChamberState,
  round: number,
  rng: () => number
): ChamberBoxOutcome {
  const odds = getForbiddenOdds(state, round)
  const roll = rng() * 100
  if (roll < odds.boon) return 'boon'
  if (roll < odds.boon + odds.twist) return 'twist'
  if (roll < odds.boon + odds.twist + odds.setback) return 'setback'
  if (roll < odds.boon + odds.twist + odds.setback + odds.wipe) return 'wipe'
  return rng() < 0.5 ? 'execution' : 'backfire'
}

function drawBoxTwist(rng: () => number): ChamberBoxEffect {
  return FORBIDDEN_TWISTS[Math.floor(rng() * FORBIDDEN_TWISTS.length)] ?? 'steal'
}

function resolveForbiddenOutcome(
  players: ChamberPlayer[],
  actor: ChamberPlayer,
  outcome: Exclude<ChamberBoxOutcome, 'execution' | 'twist'>,
  rng: () => number
): {
  message: string
  changes: ChamberEvent['changes']
  targetId?: string
  eliminatedPlayerId?: string
} {
  const changes: ChamberEvent['changes'] = []
  const actorCopy = players.find((player) => player.id === actor.id)!

  if (outcome === 'boon') {
    const boon = Math.floor(rng() * 3)
    if (boon === 0) {
      actorCopy.immune = true
      return {
        message: 'The box veiled ' + actor.name + ' from hostile powers until their next turn.',
        changes,
      }
    }
    if (boon === 1) {
      actorCopy.ward = true
      return { message: 'The box revealed a Ward. It blocks one hostile power effect.', changes }
    }
    actorCopy.doubleGain = true
    return {
      message: 'The box revealed an Attunement. ' + actor.name + "'s next Power gain will double.",
      changes,
    }
  }

  if (outcome === 'setback') {
    actorCopy.doubleLoss = true
    return {
      message:
        'The box marked ' + actor.name + ' with a curse. Their next Power loss will be doubled.',
      changes,
    }
  }

  if (outcome === 'wipe') {
    const change = changePower(players, actor.id, -actorCopy.power)
    changes.push({ playerId: actor.id, ...change })
    return {
      message: 'The box stripped ' + actor.name + ' of all Power. They remain in the chamber.',
      changes,
    }
  }

  if (outcome === 'backfire') {
    const before = actorCopy.power
    actorCopy.power = 0
    actorCopy.eliminated = true
    changes.push({ playerId: actor.id, before, after: 0 })
    return {
      message: 'The Forbidden Box backfired and eliminated ' + actor.name + '.',
      changes,
      eliminatedPlayerId: actor.id,
    }
  }

  return { message: 'The box revealed a forbidden effect.', changes }
}

function decideWinner(state: ChamberState, rng: () => number): ChamberState {
  if (!isChamberFinished(state)) return state
  const living = getLivingPlayers(state)
  const rankingPool = living.length > 0 ? living : state.players
  const highestPower = Math.max(...rankingPool.map((player) => player.power))
  let contenders = rankingPool.filter((player) => player.power === highestPower)

  if (contenders.length === 1) {
    return {
      ...state,
      winnerId: contenders[0]?.id ?? null,
      tieBreak: { method: 'score', contenderIds: [contenders[0]!.id] },
    }
  }

  const finalRoundGains = new Map<string, number>()
  contenders.forEach((player) => finalRoundGains.set(player.id, 0))
  state.events
    .filter((event) => event.round === CHAMBER_ROUNDS)
    .forEach((event) => {
      event.changes.forEach((change) => {
        if (finalRoundGains.has(change.playerId)) {
          finalRoundGains.set(
            change.playerId,
            (finalRoundGains.get(change.playerId) ?? 0) + change.after - change.before
          )
        }
      })
    })
  const bestFinalGain = Math.max(...contenders.map((player) => finalRoundGains.get(player.id) ?? 0))
  contenders = contenders.filter(
    (player) => (finalRoundGains.get(player.id) ?? 0) === bestFinalGain
  )
  if (contenders.length === 1) {
    return {
      ...state,
      winnerId: contenders[0]?.id ?? null,
      tieBreak: {
        method: 'round-gain',
        contenderIds: rankingPool
          .filter((player) => player.power === highestPower)
          .map((player) => player.id),
      },
    }
  }

  const sigilOrder = shuffle(
    contenders.map((player) => player.id),
    rng
  )
  const sigils = sigilOrder.map((playerId, index) => ({
    playerId,
    value: sigilOrder.length - index,
  }))
  const winnerId = sigils[0]?.playerId ?? contenders[0]?.id ?? null
  return {
    ...state,
    winnerId,
    tieBreak: {
      method: 'sigil',
      contenderIds: contenders.map((player) => player.id),
      sigils,
    },
  }
}

function finishTurn(
  state: ChamberState,
  players: ChamberPlayer[],
  event: ChamberEvent,
  forbiddenOpeningsUsed: number,
  rng: () => number
): ChamberState {
  const events = [...state.events, event]
  let completedTurns = state.completedTurns + 1
  const base: ChamberState = {
    ...state,
    players,
    completedTurns,
    previousOffers: state.offers,
    forbiddenOpeningsUsed,
    events,
    lastEvent: event,
    pendingBox: null,
    offers: [],
  }

  while (
    completedTurns < players.length * CHAMBER_ROUNDS &&
    completedTurns % players.length !== 0 &&
    getChamberActor({ ...base, completedTurns }).eliminated
  ) {
    completedTurns += 1
  }

  let next: ChamberState = { ...base, completedTurns }
  if (!isChamberFinished(next)) {
    const canEcho = getEligibleEcho(next) !== null
    next = {
      ...next,
      offers: createOffers(rng, state.offers, canEcho, getEligibleEcho(next)),
    }
  }

  return decideWinner(next, rng)
}

export function skipEliminatedTurn(state: ChamberState, rng: () => number): ChamberState {
  if (isChamberFinished(state) || !getChamberActor(state).eliminated) return state
  let completedTurns = state.completedTurns + 1
  while (
    completedTurns < state.players.length * CHAMBER_ROUNDS &&
    completedTurns % state.players.length !== 0 &&
    getChamberActor({ ...state, completedTurns }).eliminated
  ) {
    completedTurns += 1
  }
  let next: ChamberState = { ...state, completedTurns, previousOffers: state.offers, offers: [] }
  if (!isChamberFinished(next)) {
    const canEcho = getEligibleEcho(next) !== null
    next = { ...next, offers: createOffers(rng, state.offers, canEcho, getEligibleEcho(next)) }
  }
  return decideWinner(next, rng)
}

export function resolveChamberAction(
  state: ChamberState,
  action: ChamberAction,
  targetId: string | undefined,
  rng: () => number
): ChamberState {
  const actor = getChamberActor(state)
  if (actor.eliminated || isChamberFinished(state)) return state
  const players = state.players.map((player) => ({ ...player }))
  const actorCopy = players.find((player) => player.id === actor.id)!
  const round = getChamberRound(state)
  let forbiddenOpeningsUsed = state.forbiddenOpeningsUsed

  if (action === 'forbidden') {
    if (forbiddenOpeningsUsed >= CHAMBER_FORBIDDEN_OPENINGS) return state
    forbiddenOpeningsUsed += 1
    const outcome = drawForbiddenOutcome(state, round, rng)
    if (outcome === 'execution') {
      return {
        ...state,
        players,
        forbiddenOpeningsUsed,
        pendingBox: { actorId: actor.id, effect: 'execution' },
      }
    }
    if (outcome === 'twist') {
      const effect = drawBoxTwist(rng)
      return {
        ...state,
        players,
        forbiddenOpeningsUsed,
        pendingBox: { actorId: actor.id, effect },
      }
    }
    const resolved = resolveForbiddenOutcome(players, actor, outcome, rng)
    const event: ChamberEvent = {
      round,
      actorId: actor.id,
      action,
      message: resolved.message,
      changes: resolved.changes,
      boxOutcome: outcome,
      eliminatedPlayerId: resolved.eliminatedPlayerId,
    }
    return finishTurn(state, players, event, forbiddenOpeningsUsed, rng)
  }

  const effect = action === 'echo' ? getEffectiveChamberAction(action, state) : action
  const resolved = applyVisibleEffect(state, players, actor, action, targetId, rng)
  const priorImmunity = actorCopy.immune
  if (priorImmunity && action !== 'immunity') actorCopy.immune = false
  const actualAction = action === 'echo' ? effect : action
  const event: ChamberEvent = {
    round,
    actorId: actor.id,
    action,
    copiedAction: action === 'echo' ? actualAction : undefined,
    targetId: resolved.targetId,
    message: resolved.message,
    changes: resolved.changes,
  }
  return finishTurn(state, players, event, forbiddenOpeningsUsed, rng)
}

export function resolveChamberBoxTarget(
  state: ChamberState,
  targetId: string,
  rng: () => number
): ChamberState {
  const pending = state.pendingBox
  if (!pending) return state
  const actor = state.players.find((player) => player.id === pending.actorId)
  const target = state.players.find((player) => player.id === targetId && !player.eliminated)
  if (!actor || !target || target.id === actor.id) return state

  const players = state.players.map((player) => ({ ...player }))
  const changes: ChamberEvent['changes'] = []
  const actorCopy = players.find((player) => player.id === actor.id)!
  const targetCopy = players.find((player) => player.id === target.id)!
  let message = ''
  let eliminatedPlayerId: string | undefined

  if (pending.effect === 'execution') {
    if (targetCopy.immune) {
      message = targetCopy.name + "'s immunity defied the execution."
    } else if (targetCopy.ward) {
      targetCopy.ward = false
      message = targetCopy.name + "'s Ward blocked the execution and faded."
    } else {
      const before = targetCopy.power
      targetCopy.power = 0
      targetCopy.eliminated = true
      changes.push({ playerId: targetCopy.id, before, after: 0 })
      eliminatedPlayerId = targetCopy.id
      message = actorCopy.name + ' executed ' + targetCopy.name + ' with the Forbidden Box.'
    }
  } else if (pending.effect === 'steal') {
    const loss = applyHostileLoss(players, targetCopy, Math.min(140, targetCopy.power), changes)
    if (loss.applied > 0) {
      addChange(changes, players, actorCopy.id, loss.applied)
      message = actorCopy.name + ' stole ' + loss.applied + ' Power from ' + targetCopy.name + '.'
    } else {
      message = loss.message
    }
  } else if (pending.effect === 'hex') {
    if (targetCopy.immune) {
      message = targetCopy.name + "'s immunity repelled the curse."
    } else if (targetCopy.ward) {
      targetCopy.ward = false
      message = targetCopy.name + "'s Ward absorbed the curse and faded."
    } else {
      targetCopy.doubleLoss = true
      message =
        actorCopy.name + ' hexed ' + targetCopy.name + '. Their next Power loss will be doubled.'
    }
  } else {
    const difference = actorCopy.power - targetCopy.power
    const amount = Math.min(120, Math.floor(Math.abs(difference) / 2))
    if (amount <= 0) {
      message = 'The capped exchange found equal Power totals and changed nothing.'
    } else {
      const lower = difference > 0 ? targetCopy : actorCopy
      const higher = difference > 0 ? actorCopy : targetCopy
      const protection = applyHostileLoss(players, higher, amount, changes)
      if (protection.applied > 0) {
        addChange(changes, players, lower.id, protection.applied)
        message =
          'The capped exchange shifted ' +
          protection.applied +
          ' Power from ' +
          higher.name +
          ' to ' +
          lower.name +
          '.'
      } else {
        message = protection.message
      }
    }
  }

  const event: ChamberEvent = {
    round: getChamberRound(state),
    actorId: actor.id,
    action: 'forbidden',
    targetId: target.id,
    message,
    changes,
    boxOutcome: pending.effect === 'execution' ? 'execution' : 'twist',
    eliminatedPlayerId,
  }
  return finishTurn(state, players, event, state.forbiddenOpeningsUsed, rng)
}

export function getChamberRelationshipLabel(
  relationships: RelationshipsMap | undefined,
  humanId: string | undefined,
  playerId: string
): 'Ally' | 'Rival' | null {
  if (!humanId || humanId === playerId) return null
  const edge = relationships?.[humanId]?.[playerId]
  if (!edge) return null
  if (edge.affinity >= 30 || edge.tags.includes('alliance')) return 'Ally'
  if (edge.affinity <= -25 || edge.tags.includes('rivalry')) return 'Rival'
  return null
}

