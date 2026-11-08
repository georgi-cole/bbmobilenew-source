import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isBroadcastShockAnnouncementKey } from '../src/broadcasting/broadcastPresentationRegistry'
import {
  getRuntimeSocialActionById,
  isActionAllowedForRealityPreset,
} from '../src/social/socialActionManager'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('PR 1346 additional integration guards', () => {
  it('persists consumed Safety ceremonies across GameScreen remounts', () => {
    const safetyFlow = source('src/screens/GameScreen/flows/useSafetyFlow.ts')
    expect(safetyFlow).toMatch(/usePersistedGameScreenKey\(\s*'safety-save-ceremony'/)
    expect(safetyFlow).toContain('consumedSaveCeremonyKey === ceremonyKey')
    expect(safetyFlow).toContain('setConsumedSaveCeremonyKey(ceremonyKey)')
  })

  it('shows Battle Back rules before its question timer starts', () => {
    const capitalization = source('src/components/Capitalization/Capitalization.tsx')
    expect(capitalization).toContain("useState(context === 'battleBack')")
    expect(capitalization).toContain('<MinigameRules')
    expect(capitalization).toContain("if (rulesOpen || phase !== 'spinning'")
  })

  it('restores fullscreen Shock preludes before the inline faux-TV card', () => {
    const overlay = source('src/components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay.tsx')
    expect(isBroadcastShockAnnouncementKey('double_eviction')).toBe(true)
    expect(isBroadcastShockAnnouncementKey('battle_back')).toBe(true)
    expect(isBroadcastShockAnnouncementKey('vox_populi')).toBe(false)
    expect(overlay).toContain('isBroadcastShockAnnouncementKey(announcement.key)')
    expect(overlay).toContain('data-testid="tv-shock-prelude"')
    expect(overlay).toContain('shockPreludeVisible')
  })

  it('makes mature social actions exclusive to the Adult Reality preset', () => {
    for (const id of ['pool_makeout', 'spend_night']) {
      const action = getRuntimeSocialActionById(id, { includeDisabled: true })
      expect(action).toBeDefined()
      expect(isActionAllowedForRealityPreset(action!, 'adult')).toBe(true)
      expect(isActionAllowedForRealityPreset(action!, 'tv')).toBe(false)
    }
  })

  it('keeps Tribunal members out of active My Game relationship reads', () => {
    const ledger = source('src/components/RealityLedger/RealityLedger.tsx')
    expect(ledger).toContain("player.status !== 'evicted' && player.status !== 'jury'")
    expect(ledger).toContain('.filter((edge) => activePlayerIds.has(edge.toId))')
  })

  it('uses current-phase LOH Safety advice instead of hypothetical stale copy', () => {
    const humanFlow = source('src/social/reality/humanFlow.ts')
    expect(humanFlow).toContain('buildLohConsultationSummary')
    expect(humanFlow).toContain('The block is locked.')
    expect(humanFlow).toContain('formatLohSafetyConsultation(state.game, input.actorId)')
    const safetyCopy = source('src/social/lohSafetyConsultation.ts')
    expect(safetyCopy).toContain("Let's open the seat and spring an ambush")
    expect(safetyCopy).toContain('No—do not use it.')
  })

  it('prevents minimum-zone Pressure Plank damage from sub-pixel drift', () => {
    const logic = source('src/components/PressurePlank/pressurePlankLogic.ts')
    expect(logic).toContain('PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE')
    expect(logic).toContain('safeZoneHalfWidth + PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE')
  })
})
