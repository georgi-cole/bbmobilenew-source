let verified = false

export const requiresCinematicDownload = () =>
  import.meta.env?.VITE_CINEMATIC_PACK_EXTERNAL === 'true'

export const isCinematicMediaAvailable = () => !requiresCinematicDownload() || verified

export function setCinematicPackVerified(value) {
  verified = value
}
