# Marketplace maintenance

Premium Challenges and VIP both unlock **every premium minigame version**. VIP also
includes all released standalone products and VIP themes. This policy covers
enhanced presentations, alternate premium rules, and replacement remasters.

## What updates automatically

- The Premium Challenges game list, count, tagline, and badge come from the game
  registry. Deck of Light, Deck of Darkness, Quick Tap Race, Quick Tap Seasons,
  Risk Wheel, both Crystal Path games, Chain of Greed, and both Find Your Twin
  remasters are included.
- Store shelves and VIP bundle benefits derive from the product catalog. A new
  released standalone product appears on its declared shelf and in the VIP bundle.
- `npm run generate:marketplace` produces
  [MARKETPLACE_CATALOG.md](MARKETPLACE_CATALOG.md) from the same catalogs, including
  hidden products, access instructions, legal notes, and Eyeolean power prices,
  season limits, and mode rules. Development startup also runs this generator.
- `npm run check:marketplace` rejects a stale generated reference and paid-feature
  changes without a marketplace review, and runs Store/access regressions. This
  runs inside the full local `check:pr` command and on pull requests that touch
  paid-feature/catalog paths, marketplace policy files, dependencies, or the PR
  workflow. Release builds also reject a stale reference. The existing pre-push
  hook runs `check:pr`.

## Making a change

1. For a minigame presentation or alternate rules version, set `premiumExperience`
   to `presentation` or `variant` in `src/minigames/registryBase.ts`. For a remaster,
   set the canonical game's `premiumReplacementKey` to its replacement. Use
   `selectHasPremiumChallengesAccess` / `hasEffectiveStoreEntitlement` with
   `premiumChallenges` for rendering, saved-session selection, and AI rules.
2. For other paid features, edit `src/vip/vipConfig.ts`: title, descriptions,
   benefits, access instructions, shelf, release availability, and legal note.
   Eyeolean powers use `src/economy/storeCatalog.ts`. Add coverage to
   `scripts/marketplace-review-policy.mjs` for new paid implementation locations.
3. Run `npm run generate:marketplace`. Review the resulting catalog alongside the
   feature. If a behavior change needs different wording, update its source copy.
4. If a maintenance change leaves the offer unchanged, add a dated entry below
   explaining what was reviewed and why the listing remains accurate.
5. Run `npm run check:pr` and relevant feature tests. When either package manifest
   changes, also run `npm audit --omit=dev --audit-level=high`.

Catalog-derived information stays synchronized automatically. Changes in behavior
still need a wording review; the path-based review gate makes that part of the
change. New paid features must use the catalog and extend the gate's coverage.

Apple App Store Connect and Google Play Console descriptions are managed separately.
Use the generated reference when updating them; repository checks do not publish
native store listings or change their configured prices.

## Review log

- 2026-11-07: Reviewed native store preparation against both developer consoles
  and AdMob. Release validation now rejects every developer build target,
  undeclared cloud backup/analytics, and a configured online Diary Room endpoint.
  Platform environment templates use the current VIP upgrade IDs and explicitly
  override development-only unlocks and cloud defaults. Cupid's shared rose-gold
  texture now resolves through the build base on native apps as well as the web.
  Ordinary tests also disable ignored local developer unlocks so they exercise
  real ownership gates by default. Premium Challenges and
  VIP still grant every premium edition; product contents, credit, prices, access,
  and the distinction between automatic and voluntary ads remain unchanged.
- 2026-11-06: Reviewed durable competition attempts across standard and premium
  minigames, Classic, Cupid, Vox, Surveyeval, Final 3, and Back 2 the Game.
  Gameplay starts after its attempt checkpoint is saved. Unfinished attempts
  reopen as an exit result; finished scores, standings, co-winners, vote effects,
  and social effects survive before Continue. Accepted results remain recoverable
  during ceremonies. Existing rewarded retries retain their grants and limits;
  finished premium results are displayed without launching another paid edition.
  Product contents, access grants, prices, and benefits remain accurate.
- 2026-11-06: Reviewed the shared late-season social update optimization for Vox,
  Cupid, and Surveyeval. Day-start relationships now commit in one ordered update;
  twin echoes, Bella's warmth, Reality relationships, moods, and existing history
  retain their outcomes. Cupid's Tribunal resume presentation is checked without
  changing ballots, winners, rewards, or timing for an uninterrupted finale.
  Paid access, mode contents, benefits, prices, ads, and Store copy remain accurate.
- 2026-11-06: Reviewed Vox, Cupid and Surveyeval late-season diagnostics, saved browser checkpoints, and Surveyeval's fresh run seed. The seed now varies normal gameplay outcomes across new runs while the same elimination rules and paid access remain in place. Ad recovery is no longer selected automatically by the browser journey. Product contents, benefits, prices, ads, and Store copy are unchanged.
- 2026-11-04: Reviewed Cupid's Arrow spell-break timing and Tribunal finale handoff.
  The spell-break animation now completes on schedule across parent state updates;
  Detox replacement choices now use the same eligibility checks as the game rules,
  so protected contestants cannot be offered as invalid picks, and the second pick
  remains available after the first. Mode access, product copy, prices, benefits,
  and paid contents are unchanged.
- 2026-10-31: Reviewed Vox, Cupid, Survival and Quick Tap compatibility repairs. Shared roles, paired audience results, replacement arrivals and season contestant introductions follow the existing offers. Unfinished Quick Tap attempts restart without a retry charge when verified access changes edition. Premium Challenges and VIP continue to unlock all premium versions; prices and product contents remain unchanged.

- 2026-10-31: Reviewed winner ceremonies after an early competition exit.
  Early exits retain their losing placement and existing retry eligibility;
  the winner ceremony now precedes the existing result commit. No rewards,
  retry limits, paid access, offers or Store copy change.

- 2026-10-31: Reviewed the local VIP game-screen preview. VIP is enabled only
  through an in-memory QA override in the authoring server. Existing game
  ceremonies hand over to their original components; no live purchase, stored
  entitlement, offer, pricing or released feature changes. Store copy remains
  accurate. Production ceremony integration and its access gates are still pending.

- 2026-10-31: Reviewed ceremony-flow compatibility and integration regressions.
  An omitted morning-shock field now counts as inactive, allowing queued
  post-competition and post-elimination prompts to appear. Existing rewarded-ad
  requirements, retry limits, rewards, purchases, premium access and offer copy
  are unchanged. Current marketplace listings remain accurate.

- 2026-10-31: Reviewed the 55-character ceremony fitting and native-elimination
  rehearsal. It runs only in a separate development app with an in-memory
  fixture, reuses the existing game elimination component and Grey Lux artwork,
  and loads authoring packs only for the selected sample. It does not enable
  premium ceremonies in live seasons or alter VIP access, settings, purchases,
  prices, availability or benefits. Existing Store copy remains accurate.
  Production rollout still requires its own access and offer review.

- 2026-10-30: Reviewed the human-player ceremony artwork expansion. Existing
  character portraits, ownership/access, products, prices, benefits and Store
  listings are unchanged. The new pose packs and review gallery are authoring
  resources outside public game delivery; they do not enable or release VIP
  ceremonies. Shared props are reused from the AI library. The later game
  integration still requires its own loading, entitlement and offer review.

- 2026-10-30: Reviewed AI ceremony artwork authoring and character-pack
  organization. These resources remain outside the public game delivery paths;
  no ceremony loader, VIP entitlement, animation setting, purchase flow or
  existing Grey Lux elimination behavior changes in this artwork preparation.
  Products, prices, benefits and availability remain unchanged, so current
  Store copy remains accurate. A later premium ceremony release requires its
  own entitlement, loading, device-performance and offer review.

- 2026-10-28: Reviewed lossless delivery optimization of the existing skin
  collection, including standard portraits, sad-state fallbacks, grey/gold
  presentation backups, and Cupid artwork. Image URLs, dimensions, visible
  pixels, transparency, theme selection, and fallback ordering are preserved.
  Large SVG bitmap payloads use lossless WebP; PNGs are recompressed only when
  smaller with identical decoded pixels. Original source artwork is retained
  outside the public delivery directory. Products, prices, VIP theme access,
  purchase restoration, benefits, and Store copy remain unchanged and accurate.

- 2026-10-28: Reviewed minigame runtime and artwork loading for all existing
  standard and premium editions. Per-game reducers and question banks now load
  with the selected screen, and the shared host prepares the selected Quick Tap
  presentation before its countdown. Twin remasters share optimized character
  assets and signal when their presentation is ready. Canvas pixel budgets,
  elapsed-time display updates, and cooperative Fit Me In AI calculations are
  presentation and scheduling improvements. Question content/order, precise
  scoring clocks, seeded AI results, premium selection, purchase restoration,
  product contents, prices, and benefits remain unchanged. Existing Store
  listings and the Premium Challenges/VIP offer remain accurate.

- 2026-10-28: Reviewed launch pricing for the permanent product catalog. Survival
  Mode's nominal price is now $6.99 and VIP's bundle price is $19.99. The 75%
  standalone purchase credit remains unchanged; VIP upgrade tiers were rebalanced
  from $4.99 through $18.49 so the bundle discount remains available at each
  ownership level. App Store and Google Play localized checkout prices remain
  authoritative; configure these nominal values and upgrade products in both
  stores before release.

- 2026-10-28: Reviewed the AdMob connection for the existing automatic breaks and
  voluntary rewards, including vote/nomination reveals, audience insight/surge,
  competition retries, Crystal Path hints, Big Spender rescue, Surveyeval recovery,
  and the Aftermath unlock. No Ads and VIP still suppress automatic placements
  while voluntary rewards remain available. Prices, product contents, reward
  amounts, and season limits are unchanged. Native rewards now require SDK
  completion; cancellation/load failure releases the prompt and does not consume
  a daily reward allowance. Live advertising requires adult opt-in and Google's
  UMP permission. Test mode uses Google demo units. The No Ads listing remains
  accurate; only activate that product for an advertising-capable store binary.

- 2026-10-28: Reviewed loading optimizations and optional reuse of the previous
  contestant across Classic, Cupid's Arrow, Vox Populi, and Surveyeval. The
  audience-vote interface now loads when presented; its forecast rewards and
  audience-surge power callbacks are unchanged. House of Cards' existing style
  layers load with that game in their existing order; its rules, results, premium
  variants, and availability are unchanged. Mode access, purchases, wallet
  ownership, prices, benefits, and premium minigame variants remain unchanged.
  Existing saved contestants and the three-profile creation limit are preserved.

- 2026-10-28: Reviewed contestant selection and saved identity across Classic,
  Cupid's Arrow, Vox Populi, and Surveyeval. New runs choose a contestant before
  mode initialization; resuming retains the original contestant. Existing paid
  launch gates, wallet ownership, power limits, bundles, and prices are unchanged.
  The listings remain accurate. Profile creation is capped at three; legacy
  fourth/fifth profiles and their purchases/progress are not removed.
  Also reviewed public background URLs without eager image imports; theme
  availability and ownership are unchanged.

- 2026-10-27: Reviewed the shared native immersive display, screen-awake policy,
  Game Mode eligibility, and orientation handling for all minigames, including
  premium versions. These changes apply equally to eligible gameplay and do not
  change product contents, access gates, prices, benefits, or purchase restoration.
  The existing Premium Challenges and VIP listings remain accurate.

- 2026-10-27: Reviewed the opt-in Supabase profile backup and gameplay measurement.
  Wallet and power metadata are stored only as private, client-supplied backup
  data; they are never imported or used to grant currency, VIP, paid modes, or
  Premium Challenges. Purchase verification, launch gates, prices, bundle contents,
  and Store copy remain accurate and unchanged. Photos, biography, and purchase
  credentials are excluded. Cloud recovery needs separate trusted economy rules.

- 2026-10-27: Reviewed player-age safeguards across paid modes, ads, purchases,
  restoration, and online VIP requests. Product contents, prices, the Premium
  Challenges/VIP bundle, and cached local ownership are unchanged. Player
  eligibility now defaults to 18+ until content/store review permits a lower
  build-time minimum; parent permission cannot override it. Native purchase
  and restore requests now require adult admission; ads additionally require an
  explicit adult choice. Teen and unknown-age players cannot initiate these
  services. Adult Reality access also requires the admission decision. See
  `player-age-and-parental-consent.md` for the disconnected parent-verification
  flow and remaining release requirements. No new paid product is introduced.

- 2026-10-27: Premium Challenges now grants every premium minigame version, matching
  VIP's minigame access. Reviewed host rendering, direct Quick Tap entry points,
  saved-session variant selection, AI simulation, Store copy, VIP benefits, and
  release setup documentation. Tribunal remains hidden from the release catalog.
