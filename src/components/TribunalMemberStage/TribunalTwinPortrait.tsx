import { joinPublicAssetPath } from '../../utils/avatar'
import './TribunalTwinPortrait.css'

export const TRIBUNAL_TWIN_NAMES = ['Lia', 'Ali'] as const

const twinArtwork = joinPublicAssetPath('assets/formal_attires/Lia_Ali_formal.webp')

export default function TribunalTwinPortrait({
  name,
}: {
  name: (typeof TRIBUNAL_TWIN_NAMES)[number]
}) {
  return (
    <span className="tribunal-twin-portrait" aria-hidden="true" data-twin={name}>
      <span style={{ backgroundImage: `url("${twinArtwork}")` }} />
    </span>
  )
}
