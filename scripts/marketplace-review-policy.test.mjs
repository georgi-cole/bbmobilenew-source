import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getMarketplaceReviewIssue } from './marketplace-review-policy.mjs'

for (const feature of [
  'src/cinematic/ceremonies/renderer.js',
  'public/assets/ceremonies/vfx/natural-mist-v2.webp',
  'src/components/HouseOfCardsComp/HouseOfCardsComp.tsx',
  'src/minigames/newPremiumGame/rules.ts',
  'src/social/socialRules.ts',
  'src/features/twists/cupidArrow.ts',
  'src/modes/survivorRun.ts',
  'src/economy/storeCatalog.ts',
  'src/store/gameSlice.ts',
  'src/vip/vipPurchaseService.ts',
  'public/assets/skins/new-theme.webp',
]) {
  test(`requires a marketplace review for ${feature}`, () => {
    assert.match(getMarketplaceReviewIssue([feature]), /marketplace review/)
    assert.equal(getMarketplaceReviewIssue([feature, 'docs/MARKETPLACE_CATALOG.md']), null)
    assert.equal(getMarketplaceReviewIssue([feature, 'docs/marketplace-maintenance.md']), null)
    assert.equal(getMarketplaceReviewIssue([feature, 'src/vip/vipConfig.ts']), null)
  })
}

test('normalizes Windows paths', () => {
  assert.match(getMarketplaceReviewIssue(['src\\vip\\vipPurchaseService.ts']), /marketplace review/)
})

test('does not demand offer changes for tests or unrelated maintenance', () => {
  assert.equal(
    getMarketplaceReviewIssue([
      'src/vip/vipPurchaseService.test.ts',
      'README.md',
      'src/weather/weather.ts',
    ]),
    null
  )
})
