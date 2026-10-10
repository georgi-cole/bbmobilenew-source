type FeedbackGameContext = {
  season?: number
  day?: number
  week?: number
  phase?: string
}

type FeedbackWindow = Window & {
  game?: { hub?: { openFeedback?: () => void } }
  __bigEyeFeedbackContext?: FeedbackGameContext
}

/**
 * Allows players to report problems without leaving a running season.
 * The legacy IntroHub script owns the shared feedback dialog; on a direct
 * /game deep-link we load it on demand instead of requiring a Home visit.
 */
export function openBugReportFromGame(context: FeedbackGameContext): void {
  const gameWindow = window as FeedbackWindow
  gameWindow.__bigEyeFeedbackContext = context

  const showDialog = () => {
    if (typeof gameWindow.game?.hub?.openFeedback !== 'function') return false
    gameWindow.game.hub.openFeedback()
    return true
  }
  if (showDialog()) return

  const base = import.meta.env.BASE_URL || '/'
  const scriptUrl = new URL(`${base}js/ui/introHub.js`, window.location.href).href
  const existing = Array.from(document.scripts).find((script) => script.src === scriptUrl)
  const script = existing ?? document.createElement('script')
  script.addEventListener('load', showDialog, { once: true })
  script.addEventListener(
    'error',
    () => {
      // A usable fallback when the feedback runtime itself cannot be loaded.
      window.location.href = 'mailto:kolequant@gmail.com?subject=The%20Big%20Eye%20bug%20report'
    },
    { once: true }
  )
  if (!existing) {
    script.src = scriptUrl
    script.async = true
    document.body.appendChild(script)
  }
}
