// Asset loading is redirected solely for the self-contained review bundle.
// The actual Final Three component and its presentation logic are unmodified.
export async function prepareCompetitionBroadcastArtwork(players, signal) {
  if (signal.aborted) throw new Error('Scene cancelled')
  const artwork = window.__f3Assets
  if (!artwork || !players.every(player=>artwork.contestants[player.id]))
    throw new Error('Missing approved production artwork')
  return artwork
}
