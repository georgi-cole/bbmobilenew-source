const paidFeaturePaths = [
  /^src\/(vip|economy|modes|social|publicOpinion|appearance)\//,
  /^src\/minigames\//,
  /^src\/components\/(MinigameHost|StoreProductModal|GlassBridgeComp|CrystalPathShatteredGame|RiskWheelComp|HouseOfCardsComp|HouseOfDarknessComp|ChainOfGreed|QuickTapRace|Vox[^/]*|Tribunal[^/]*)\//,
  /^src\/screens\/(Store|Settings|QuickTapSeasons|Surviv[^/]*|Rules\/VoxPopuliRules)\//,
  /^src\/features\/(twists|houseOfCards|glassBridge|riskWheel)\//,
  /^src\/store\/(vipSlice|challengeSlice|gameSlice|settingsSlice|settingsHelpers|profilesSlice|vox[^/]*|surviv[^/]*)\.ts$/,
  /^src\/services\/.*[Aa]d/,
  /^src\/(data\/skinRegistry\.json|hooks\/useBackgroundTheme\.ts|utils\/backgroundTheme\.ts)$/,
  /^public\/assets\/(skins|minigames)\//,
]

const reviewPaths = new Set([
  'src/vip/vipConfig.ts',
  'docs/MARKETPLACE_CATALOG.md',
  'docs/marketplace-maintenance.md',
])

export function getMarketplaceReviewIssue(changedPaths) {
  const paths = changedPaths.map((path) => path.replaceAll('\\', '/'))
  const paidChanges = paths.filter(
    (path) =>
      !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path) && paidFeaturePaths.some((rule) => rule.test(path))
  )
  if (paidChanges.length === 0 || paths.some((path) => reviewPaths.has(path))) return null

  return (
    'Paid-feature changes need a marketplace review: ' +
    paidChanges.join(', ') +
    '. Update the product/game catalog and run npm run generate:marketplace. ' +
    'If the offer is unchanged, add a dated explanation to docs/marketplace-maintenance.md.'
  )
}
