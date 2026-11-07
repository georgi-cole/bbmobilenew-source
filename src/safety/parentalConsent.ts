/**
 * The provider is deliberately unconnected. No client callback, URL parameter,
 * checkbox, purchase receipt, or local flag can approve a child for play.
 * See docs/player-age-and-parental-consent.md before implementing this boundary.
 */
export interface ParentalConsentProvider {
  start(): Promise<{ verificationUrl: string; requestId: string }>
  status(requestId: string): Promise<'pending' | 'verified' | 'declined' | 'revoked'>
}

export function getParentalConsentAvailability(): 'unavailable' {
  return 'unavailable'
}

export async function requestVerifiedParentalConsent(): Promise<never> {
  throw new Error(
    'Parent verification is not available in this version. Play remains locked. No consent request or personal information has been sent.'
  )
}
