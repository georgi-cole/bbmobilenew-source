import {
  adaptCeremonyScene,
  baseScene,
  isCupidActive,
  isVoxActive,
  MODE_BASE,
  modeActors,
} from './mode-routing.mjs'
export { adaptCeremonyScene, baseScene } from './mode-routing.mjs'
export function shouldPlayCinematic(state, vip) {
  return Boolean(
    vip &&
    !['survival', 'survivor'].includes(state.game?.mode) &&
    state.settings.gameUX.animations &&
    state.settings.gameUX.animationMode !== 'standard' &&
    !state.settings.display.reduceMotion
  )
}
export function isCinematicSceneAllowed(game, scene, shockKey) {
  if (['survival', 'survivor'].includes(game.mode)) return false
  if (!scene) return false
  if (isVoxActive(game)) {
    if (scene === 'shock') return shockKey !== 'vox_populi'
    return [
      'voxImmunity',
      'voxFinal4',
      'voxNominations',
      'voxResults',
      'safety',
      'save',
      'exit',
    ].includes(scene)
  }
  if (scene.startsWith('vox')) return false
  if (scene.startsWith('cupid')) return isCupidActive(game)
  if (isCupidActive(game) && scene === 'ambush') return false
  if (isCupidActive(game) && ['loh', 'safety', 'allPower', 'nominations', 'save'].includes(scene))
    return false
  return true
}
export function winnerScene(props, game) {
  const text = `${props.caption ?? ''} ${props.ariaLabel ?? ''}`
  const codes = (props.tiles ?? []).map((t) => t.badgeCode)
  if (/power of safety|\bPOS\b/i.test(text) || codes.includes('pos')) {
    const scene =
      !isVoxActive(game) && game.lohId && props.targetIds?.includes(game.lohId)
        ? 'allPower'
        : 'safety'
    return adaptCeremonyScene(scene, props, game)
  }
  if (isVoxActive(game)) {
    if (/final 4 competition/i.test(text)) return 'voxFinal4'
    return /immunity/i.test(text) || codes.includes('immune') ? 'voxImmunity' : null
  }
  return /leader of the hub|\bLOH\b/i.test(text) || codes.includes('loh')
    ? adaptCeremonyScene('loh', props, game)
    : null
}
export function createExitTracker() {
  let cycle,
    tie = false,
    context = null
  return {
    update(game) {
      const key = `${game.gameId ?? game.season}:${game.week}`
      if (key !== cycle) {
        cycle = key
        tie = false
        context = null
      }
      if (game.awaitingTieBreak || game.awaitingPosTieBreak || game.tiedNomineeIds?.length > 1)
        tie = true
      const id = game.pendingEviction?.evicteeId ?? game.evictionSplashId
      if (id && context?.id !== id) {
        const classic = game.voxPopuli?.status !== 'active'
        context = {
          id,
          key,
          scene:
            classic && game.phase.startsWith('final3')
              ? 'final3'
              : classic && game.phase === 'final4_eviction'
                ? 'final4'
                : classic && tie
                  ? 'tiebreak'
                  : 'exit',
        }
        tie = false
      }
    },
    scene(game, id) {
      const key = `${game.gameId ?? game.season}:${game.week}`
      if (context?.key === key && context.id === id) return context.scene
      const classic = game.voxPopuli?.status !== 'active'
      return classic && game.phase.startsWith('final3')
        ? 'final3'
        : classic && game.phase === 'final4_eviction'
          ? 'final4'
          : 'exit'
    },
  }
}
export const exitTracker = createExitTracker()
const battleBackFollowups = new Set(['battle_back_rules', 'battle_back_challenge'])
const battleBackPrimaries = new Set(['battle_back', 'battle_back_shock'])
function battleBackScope(state) {
  const game = state.game,
    bb = game.battleBack
  return JSON.stringify([
    state.profiles?.activeProfileId ?? (state.profiles?.isGuest ? 'guest' : 'none'),
    game.gameId || `${game.seed}:${game.season}`,
    bb?.weekDecided ?? game.week,
    [...(bb?.candidates ?? [])].sort(),
  ])
}
export function createBattleBackIntroGuard() {
  const seen = new Set()
  return {
    shouldSkip(state, key) {
      if (battleBackFollowups.has(key)) return true
      return (
        battleBackPrimaries.has(key) &&
        Boolean(state.game.battleBack?.winnerId || seen.has(battleBackScope(state)))
      )
    },
    mark(state, key) {
      if (!battleBackPrimaries.has(key)) return
      seen.add(battleBackScope(state))
      if (seen.size > 64) seen.delete(seen.values().next().value)
    },
  }
}
const battleBackGuards = new WeakMap()
export function battleBackIntroGuard(store) {
  if (!battleBackGuards.has(store)) battleBackGuards.set(store, createBattleBackIntroGuard())
  return battleBackGuards.get(store)
}

export const shockVariants = {
  double_eviction: 'doubleEviction',
  vox_populi_double_eviction: 'voxDouble',
  vox_double_eviction: 'voxDouble',
  battle_back: 'battleBack',
  battle_back_shock: 'battleBack',
  battle_back_rules: 'battleBackRules',
  battle_back_challenge: 'battleBackChallenge',
  vip_veto: 'vip',
  diamond_pov: 'diamond',
  coup_detat: 'coup',
  spotlight_veto: 'spotlight',
  democracia: 'democracia',
  twin_shock: 'twinShock',
  depression_shock_start: 'depressionShock',
  depression_shock_day_2: 'depressionShock',
  cupid_arrow: 'cupidArrow',
  cupid_arrow_broken: 'cupidBroken',
  day_start_shock: 'dayStartShock',
}
export function shockVariant(key) {
  return (
    shockVariants[key] ??
    (/depression/.test(key)
      ? 'depressionShock'
      : /twin/.test(key)
        ? 'twinShock'
        : /double.*eviction/.test(key)
          ? 'doubleEviction'
          : /coup/.test(key)
            ? 'coup'
            : 'generic')
  )
}
export function findArt(player, catalog) {
  if (!player) return null
  const source = player.avatar ?? ''
  const isUser = player.isUser === true || player.id === 'user'
  if (isUser && player.appearance?.kind === 'catalog') {
    const selection = player.appearance
    const number =
      typeof selection.lookId === 'string' && selection.lookId.match(/^pc-(\d{3})$/)?.[1]
    if (selection.revision !== 1 || !number) return null
    // A run's selected look is authoritative even if its serialized avatar is
    // older. Missing packs must not silently substitute another identity.
    return catalog.find((character) => character.id === `character-${Number(number)}`) ?? null
  }
  if (/^(profile-photo:|data:|blob:)/i.test(source)) return null
  let avatar
  try {
    avatar = decodeURIComponent(source).toLowerCase()
  } catch {
    return null
  }
  if (/^(profile-photo:|data:|blob:)/.test(avatar)) return null
  const idMatch = catalog.find((c) => c.id === player.id)
  if (idMatch) return idMatch
  const character = avatar.match(/character[ _-]*(\d+)/)
  if (character) return catalog.find((c) => c.id === `character-${Number(character[1])}`) ?? null
  const avatarMatch = catalog.find(
    (c) => avatar.includes(`${c.id}_avatar`) || avatar.includes(`${c.id}-avatar`)
  )
  if (avatarMatch) return avatarMatch
  if (isUser) return null
  return catalog.find((c) => c.name.toLowerCase() === player.name?.toLowerCase()) ?? null
}
export function ceremonyCast(scene, props, game, catalog) {
  const get = (id) => game.players.find((p) => p.id === id)
  if (scene in MODE_BASE) {
    const ids = modeActors(scene, props, game)
    if (!ids.length || ids.length > 6) return null
    const cast = {}
    for (const [index, id] of ids.entries()) {
      const player = get(id) ?? props.nominees?.find((t) => t.nominee.id === id)?.nominee
      const art = findArt(player, catalog)
      if (!art) return null
      cast[String.fromCharCode(97 + index)] = { ...art, name: player.name, playerId: player.id }
    }
    if (scene.startsWith('cupid') && scene !== 'cupidNominations' && ids.length !== 2) return null
    if (scene === 'cupidNominations' && (ids.length < 4 || ids.length % 2)) return null
    if (scene === 'voxImmunity' && ids.length !== 2) return null
    if (baseScene(scene) === 'nominations' && !scene.startsWith('cupid') && ids.length > 3)
      return null
    if (scene === 'voxNominations' && ids.length < 2) return null
    if (!baseScene(scene)) return cast
    // Legacy scenes address three role slots, even when a single actor is on screen.
    cast.b ??= cast.a
    cast.c ??= cast.a
    return cast
  }
  const mentioned = game.players.filter(
    (p) => p.name && `${props.caption ?? ''} ${props.ariaLabel ?? ''}`.includes(p.name)
  )
  const winner = get(props.targetIds?.[0]) ?? mentioned[0]
  const leaving = props.evictee
  let a = get(game.lohId),
    b = get(game.posWinnerId),
    c = leaving ?? get(game.nomineeIds?.[0])
  if (['loh', 'safety', 'allPower'].includes(scene)) a = winner ?? (scene === 'loh' ? a : b)
  if (scene === 'ambush') c = get(game.lohNominationPlan?.targetId)
  if (scene === 'save') a = winner ?? get(game.povSavedId)
  if (scene === 'nominations') {
    const label = props.caption ?? props.ariaLabel ?? ''
    if (/has been nominated/i.test(label)) return null
    if (new Set(mentioned.map((p) => p.name)).size !== mentioned.length) return null
    const revealed = [...mentioned].sort((a, b) => label.indexOf(a.name) - label.indexOf(b.name))
    if (revealed.length < 2 || revealed.length > 3) return null
    a = revealed[0]
    b = revealed[1]
    c = revealed[2] ?? a
  }
  if (['tiebreak', 'final3'].includes(scene))
    b = game.players.find((p) => (game.nomineeIds ?? []).includes(p.id) && p.id !== leaving?.id)
  if (scene === 'final4')
    a = game.players.find((p) => (game.nomineeIds ?? []).includes(p.id) && p.id !== leaving?.id)
  const artFor = (player) => {
    const art = findArt(player, catalog)
    return art ? { ...art, name: player.name, playerId: player.id } : null
  }
  const cast = { a: artFor(a), b: artFor(b), c: artFor(c) }
  const required =
    scene === 'shock'
      ? []
      : scene === 'exit'
        ? ['c']
        : ['final3', 'final4', 'tiebreak'].includes(scene)
          ? ['a', 'b', 'c']
          : ['nominations'].includes(scene)
            ? ['a', 'b']
            : ['loh', 'safety', 'save', 'allPower'].includes(scene)
              ? ['a']
              : ['a', 'c']
  if (required.some((k) => !cast[k])) return null
  for (const key of ['a', 'b', 'c'])
    if (!cast[key])
      cast[key] = catalog.find((c) => !Object.values(cast).some((x) => x?.id === c.id))
  return cast
}

export function createCeremonyQueue() {
  let owner = null,
    queue = [],
    scheduled = false,
    sequence = 0
  const listeners = new Set(),
    notify = () => listeners.forEach((listener) => listener())
  const drain = () => {
    if (owner || scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      queue = queue.filter((entry) => !entry.cancelled)
      if (owner || !queue.length) return
      queue.sort((a, b) => b.priority - a.priority || a.order - b.order)
      owner = queue.shift()
      notify()
      try {
        owner.start()
      } catch (error) {
        if (owner.onError) {
          owner.onError(error)
          return
        }
        owner.cancelled = true
        owner = null
        notify()
        drain()
      }
    })
  }
  return {
    acquire(start, priority = 0, onError) {
      const entry = { start, priority, onError, order: sequence++, cancelled: false }
      queue.push(entry)
      notify()
      drain()
      return () => {
        if (entry.cancelled) return
        entry.cancelled = true
        if (owner === entry) owner = null
        queue = queue.filter((candidate) => candidate !== entry)
        notify()
        drain()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get counts() {
      return { active: owner ? 1 : 0, queued: queue.filter((entry) => !entry.cancelled).length }
    },
  }
}
export const ceremonyQueue = createCeremonyQueue()

let ambushHandler = null
export function registerAmbush(handler) {
  ambushHandler = handler
  return () => {
    if (ambushHandler === handler) ambushHandler = null
  }
}
export function requestAmbush(nativeEffect) {
  return ambushHandler?.(nativeEffect) ?? false
}
