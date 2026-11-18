export const TWIN_SHOCK_COMBINED_ART_ID = 'lia-ali'

export function isCombinedTwinAvatar(source) {
  return /(?:^|\/)Ali_lia_(?:avatar(?:_512|_grey)?|sad_avatar(?:_fallback)?)\.(?:webp|png|svg)(?:$|[?#])/i.test(
    source ?? ''
  )
}

export function isCombinedTwinIdentity(player) {
  if (!player || player.isUser || player.id === 'user') return false
  return (
    player.twinMode === 'combined' ||
    /^(?:lia[_-]ali|ali[_-]lia)$/i.test(player.id) ||
    /^(?:lia\s*(?:&|and|\+)\s*ali|ali\s*(?:&|and|\+)\s*lia)$/i.test(player.name?.trim() ?? '') ||
    isCombinedTwinAvatar(player.avatar)
  )
}
