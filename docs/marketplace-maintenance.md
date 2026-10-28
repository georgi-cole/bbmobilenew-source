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

- 2026-10-28: Reviewed minigame loading and rendering optimizations. Deferred
  reducers and question banks retain the current state shapes and content.
  Screen preparation, retry handling, Twin asset readiness, canvas pixel
  budgets, timer display cadence, and cooperative Fit Me In calculation retain
  gameplay, scoring, premium access, prices, and existing Store benefits.

- 2026-10-28: Reviewed lossless skin delivery compression. Existing image URLs,
  dimensions, visible pixels, transparency, theme selection, and fallback order
  are preserved. Original artwork is archived outside public delivery. Products,
  prices, VIP theme access, restoration, and Store copy remain unchanged.

- 2026-10-28: Reviewed the non-VIP Quick Tap AI rebalance and removal of the
  already-retired Lane Racers implementation, catalog entry, and saved score
  records. Lane Racers was excluded from the premium offer. Released VIP Quick
  Tap variants, entitlements, products, prices, and Store copy are unchanged.

- 2026-10-27: Reviewed the shared native immersive display, screen-awake policy,
  Game Mode eligibility, and orientation handling for all minigames, including
  premium versions. These changes apply equally to eligible gameplay and do not
  change product contents, access gates, prices, benefits, or purchase restoration.
  The existing Premium Challenges and VIP listings remain accurate.

- 2026-10-27: Added analytics for Store shelf and product selection, purchase
  start and result, and Eyeolean purchases. Reviewed the runtime catalog,
  entitlements, prices, and offer copy; this change does not alter any offers.

- 2026-10-27: Added four more included profile looks (32-35) and wired them into
  the Changing room. These are free visual profile choices and do not add or
  alter purchasable items, entitlements, prices, or marketplace copy.
- 2026-10-27: Added four included profile looks (28-31) and their standard avatar
  framing. These are free visual profile choices and do not add or alter
  purchasable items, entitlements, prices, or marketplace copy.
- 2026-10-27: Reviewed the Changing room look-lock reveal and My profile return
  animation. This presentation-only update does not add or alter purchasable
  items, entitlements, prices, or marketplace copy.
- 2026-10-27: Premium Challenges now grants every premium minigame version,
  matching VIP minigame access. Reviewed host presentation, Quick Tap variants,
  saved-session selection, AI simulation, Store copy, VIP benefits, and release
  checks.

- 2026-10-28: Reviewed optional per-season contestant selection and three-profile creation cap across Classic, Cupid, Vox Populi, and SurveyEval. Existing access gates and wallet ownership remain. Deferred public-favorite UI and relocated House of Cards styles preserve rewards, callbacks, and style order. Current character catalog and analytics retained. Products, prices, premium variants, and offer copy are unchanged.

- 2026-10-28: Removed the unrequested contestant-setup page and restored the existing direct Classic, Cupid, Vox Populi, and SurveyEval launch controls. Reviewed existing launch gates, mode initialization, save ownership, and launch analytics; products, prices, entitlements, and gameplay offers are unchanged.
