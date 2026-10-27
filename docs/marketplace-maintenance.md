# Marketplace maintenance

Premium Challenges and VIP both unlock every premium minigame version. VIP also
includes every released standalone product and VIP themes. This covers enhanced
presentations, alternate premium rules, and replacement remasters.

## What stays synchronized

- The Premium Challenges list, count, tagline, and badge derive from the game
  registry. Register premium presentations and alternate rules with
  `premiumExperience`; connect remasters with `premiumReplacementKey`.
- Store shelves and VIP bundle benefits derive from each standalone product's
  shelf and release availability in `src/vip/vipConfig.ts`.
- `npm run generate:marketplace` updates the reference from the runtime store,
  minigame, upgrade-pricing, and Eyeolean catalogs. Development startup also
  generates it automatically.
- `npm run check:marketplace` rejects stale generated documentation and paid
  feature changes without a marketplace review. It runs in `check:pr`; release
  builds also reject stale documentation. The pre-push hook runs `check:pr`.

## Making a change

1. For a minigame presentation or alternate rules version, set
   `premiumExperience` to `presentation` or `variant` in
   `src/minigames/registryBase.ts`. For a remaster, set the canonical game's
   `premiumReplacementKey`. Use Premium Challenges entitlement checks for
   presentation, saved-session selection, and AI rules. VIP includes this
   entitlement automatically.
2. For other paid features, update their source catalog. Store products are in
   `src/vip/vipConfig.ts`; Eyeolean powers are in `src/economy/storeCatalog.ts`.
   Add coverage to `scripts/marketplace-review-policy.mjs` when a paid feature
   uses a new implementation location.
3. Run `npm run generate:marketplace` and review the catalog with the feature.
   If a behavior change needs different wording, update its source copy.
4. If a maintenance change leaves the offer unchanged, add a dated explanation
   under Review log below.
5. Run `npm run check:pr` and relevant feature tests. If `package.json` or
   `package-lock.json` changed, also run
   `npm audit --omit=dev --audit-level=high`.

Native Apple and Google store listings are managed separately. Use the generated
reference when updating their descriptions; repository checks do not publish
store listings or change configured prices.

## Review log

- 2026-10-27: Reviewed the Changing room look-lock reveal and My profile return
  animation. This presentation-only update does not add or alter purchasable
  items, entitlements, prices, or marketplace copy.
- 2026-10-27: Premium Challenges now grants every premium minigame version,
  matching VIP minigame access. Reviewed host presentation, Quick Tap variants,
  saved-session selection, AI simulation, Store copy, VIP benefits, and release
  checks.
