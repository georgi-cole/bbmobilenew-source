import { useState } from 'react'
import { getAppearanceAsset, type AppearanceSelection } from '../../appearance/catalog'
import { getLocalAvatarFallback, joinPublicAssetPath } from '../../utils/avatar'

export default function ProfilePhotoPreview({
  photoUrl,
  appearance,
  className,
  alt = 'Profile portrait',
}: {
  photoUrl?: string | null
  appearance?: AppearanceSelection | null
  className: string
  alt?: string
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const portrait = getAppearanceAsset(appearance, 'main')
  const fallback = getLocalAvatarFallback('You', true)
  const candidates = [photoUrl, portrait ? joinPublicAssetPath(portrait) : null, fallback]
  const source =
    candidates.find(
      (candidate): candidate is string => typeof candidate === 'string' && !failed.has(candidate)
    ) ?? fallback
  return (
    <img
      className={className}
      src={source}
      alt={alt}
      onError={() =>
        setFailed((previous) => (previous.has(source) ? previous : new Set([...previous, source])))
      }
    />
  )
}
