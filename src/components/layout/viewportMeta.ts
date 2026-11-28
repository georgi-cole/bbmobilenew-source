export function buildViewportMetaContent(enhancedZoom: boolean, nativeIos = false): string {
  // Older iOS WebKit can smart-zoom on a double tap even with touch-action
  // manipulation. Keep the native iOS game fixed even with a saved zoom preference.
  const maximumScale = nativeIos ? 1 : enhancedZoom ? 10 : 5
  const zoomLock = nativeIos ? ', user-scalable=no' : ''
  // Avoid `interactive-widget`: WebKit rejects it as an unknown viewport token
  // and emits a console error that breaks the mobile browser smoke suite.
  return `width=device-width, initial-scale=1.0, maximum-scale=${maximumScale}${zoomLock}, viewport-fit=cover`
}

export function isNativeIosViewport(): boolean {
  return document.documentElement.classList.contains('is-capacitor-ios')
}

export function applyViewportMeta(enhancedZoom: boolean): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!meta) return
  meta.content = buildViewportMetaContent(enhancedZoom, isNativeIosViewport())
}
