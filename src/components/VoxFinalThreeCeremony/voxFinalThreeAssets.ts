import type { CeremonyCharacterArt } from '../../cinematic/ceremonies/runtime.mjs'
import type { Player } from '../../types'
import {
  prepareFinalDecisionArtwork,
  resolveFinalDecisionArtwork,
} from '../Final3Ceremony/finalDecisionAssets'

/** Immunity is presented in the contestant's own look, without the Classic holder's crown. */
export function resolveVoxFinalThreeArtwork(
  holder: Player,
  nominees: readonly Player[],
  catalog: CeremonyCharacterArt[]
) {
  return resolveFinalDecisionArtwork(holder, nominees, catalog, 'vox')
}

export function prepareVoxFinalThreeArtwork(
  holder: Player,
  nominees: readonly Player[],
  signal: AbortSignal
) {
  return prepareFinalDecisionArtwork(holder, nominees, signal, 'vox')
}
