// Presentation data only. Outcomes and paired follow-up evictions remain owned by the game.
export const MODE_BASE = {
  cupidLoh: 'loh',
  cupidPower: 'loh',
  cupidSafety: 'safety',
  cupidNominations: 'nominations',
  cupidSave: 'save',
  cupidExit: 'exit',
  voxImmunity: 'safety',
  voxFinal4: null,
  voxNominations: 'nominations',
  voxResults: null,
}
export const baseScene = (scene) => (scene in MODE_BASE ? MODE_BASE[scene] : scene)
export const isCupidActive = (game) => game.cupidArrow?.status === 'active'
export const isVoxActive = (game) => game.voxPopuli?.status === 'active'
export const pairFor = (game, id) => game.cupidArrow?.pairs?.find((p) => p.memberIds.includes(id))
export function expandPair(game, ids) {
  return [
    ...new Set(
      ids.flatMap((id) => (isCupidActive(game) ? (pairFor(game, id)?.memberIds ?? [id]) : [id]))
    ),
  ]
}
export function mentionedIds(props, game) {
  if (props.actorIds?.length) return props.actorIds
  if (props.targetIds?.length) return props.targetIds
  const text = `${props.caption ?? ''} ${props.ariaLabel ?? ''}`
  return game.players
    .filter((p) => p.name && text.includes(p.name))
    .sort((a, b) => text.indexOf(a.name) - text.indexOf(b.name))
    .map((p) => p.id)
}
export function adaptCeremonyScene(scene, props, game) {
  if (!scene) return null
  if (isVoxActive(game)) {
    if (scene === 'nominations') return 'voxNominations'
    if (scene === 'allPower') return 'safety'
    if (['final3', 'final4', 'tiebreak'].includes(scene)) return 'exit'
  }
  if (!isCupidActive(game)) return scene
  // Canonical nomination planning excludes Cupid's paired ruleset.
  if (scene === 'ambush') return null
  if (['exit', 'tiebreak', 'final3', 'final4'].includes(scene)) {
    // The second native portrait still plays, but the two-person departure must not replay.
    if (game.cupidArrow.pendingPartnerEvictionId === props.evictee?.id) return null
    const pair = pairFor(game, props.evictee?.id)
    const partner = game.players.find(
      (p) => pair?.memberIds.includes(p.id) && p.id !== props.evictee?.id
    )
    return partner && !['evicted', 'jury'].includes(partner.status) ? 'cupidExit' : scene
  }
  const ids = expandPair(game, mentionedIds(props, game))
  if (!ids.some((id) => pairFor(game, id))) return scene
  return (
    {
      loh: 'cupidLoh',
      safety: 'cupidSafety',
      allPower: 'cupidPower',
      nominations: 'cupidNominations',
      save: 'cupidSave',
    }[scene] ?? scene
  )
}
export function modeActors(scene, props, game) {
  if (scene === 'voxResults') return props.nominees?.map((t) => t.nominee.id) ?? []
  if (scene === 'cupidExit') return expandPair(game, [props.evictee.id])
  return expandPair(game, mentionedIds(props, game))
}
export function publicResult(props) {
  const { nominees = [], evictee, evicteeIds = [], publicTiebreak } = props
  if (publicTiebreak) return { kind: 'public-tie', ids: publicTiebreak.evicteeIds }
  if (evictee) return { kind: 'result', ids: evicteeIds.length ? evicteeIds : [evictee.id] }
  const max = Math.max(...nominees.map((n) => n.voteCount))
  const tied = nominees.filter((n) => n.voteCount === max).map((n) => n.nominee.id)
  if (tied.length > 1) return { kind: 'tie', ids: tied }
  return { kind: 'result', ids: evicteeIds.length ? evicteeIds : tied }
}
export function modeDetails(scene, props, game) {
  if (scene !== 'voxResults')
    return {
      pairColors: modeActors(scene, props, game).map((id) => pairFor(game, id)?.color),
      names: modeActors(scene, props, game).map(
        (id) => game.players.find((p) => p.id === id)?.name ?? id
      ),
    }
  const result = publicResult(props)
  return {
    ...result,
    finalists: game.voxPopuli?.publicVoteContext === 'final3',
    tallies: props.nominees.map((t) => ({
      id: t.nominee.id,
      name: t.nominee.name,
      value: t.voteCount,
    })),
    approval:
      props.publicTiebreak?.tiedNominees.map((t) => ({
        id: t.nominee.id,
        name: t.nominee.name,
        value: t.approval,
      })) ?? [],
  }
}
