import { Capacitor } from '@capacitor/core'
import { finishPlayerOAuth } from './playerSignIn'

export async function registerPlayerSignInRedirects(onReturn: (error?: string) => void) {
  const native = Capacitor.isNativePlatform()

  async function handleRedirect(url: string) {
    let error: string | undefined
    try {
      if (!(await finishPlayerOAuth(url))) return
    } catch {
      error = 'Sign-in was canceled or could not be completed. Please try again.'
    }
    if (native) {
      await import('@capacitor/browser')
        .then(({ Browser }) => Browser.close())
        .catch(() => undefined)
    }
    onReturn(error)
  }

  if (!native) {
    void handleRedirect(window.location.href)
    return
  }

  const { App } = await import('@capacitor/app')
  const listener = await App.addListener('appUrlOpen', ({ url }) => void handleRedirect(url))
  const launch = await App.getLaunchUrl().catch(() => undefined)
  if (launch) void handleRedirect(launch.url)
  return () => void listener.remove()
}
