import type { RealityDomainState, RealityFacadeAgreement } from './types'

export function getActiveFacadeAgreement(
  state: RealityDomainState,
  lohId: string,
  facadeId: string,
  day: number,
  stage: RealityFacadeAgreement['stage']
): RealityFacadeAgreement | null {
  return (
    Object.values(state.facadeAgreements).find(
      (agreement) =>
        agreement.lohId === lohId &&
        agreement.facadeId === facadeId &&
        agreement.day === day &&
        agreement.stage === stage &&
        agreement.status === 'ACCEPTED'
    ) ?? null
  )
}

/** Saves a proposal/response without letting it leak into a later ceremony. */
export function upsertRealityFacadeAgreement(
  state: RealityDomainState,
  agreement: RealityFacadeAgreement
): RealityFacadeAgreement {
  state.facadeAgreements[agreement.id] = agreement
  return agreement
}

export function expireRealityFacadeAgreements(state: RealityDomainState, day: number): void {
  for (const agreement of Object.values(state.facadeAgreements)) {
    if (
      agreement.day < day &&
      (agreement.status === 'PROPOSED' || agreement.status === 'ACCEPTED')
    ) {
      agreement.status = 'EXPIRED'
    }
  }
}
