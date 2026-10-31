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

- 2026-10-31: Reviewed Cinematic-only badge handoffs for competition wins and
  nominations, plus suppression of the redundant Vox pre-vote card. Existing
  result callbacks and Standard animations remain intact. This changes no VIP
  offer, access gate, product, price, entitlement, or Store copy.

- 2026-10-31: Reviewed the VIP Cinematic Vox public-vote reveal and Cupid paired
  exit refinements. The Vox tally is presented inside its existing premium film
  and proceeds directly to its exit film and a brief confirmation using the original
  coloured roster tiles and eviction marks. Cupid confirms both partners together;
  full native portraits remain on Standard and preparation fallback paths. Standard
  results, public-vote rules, VIP access, products, prices, benefits, and Store copy
  are unchanged.

- 2026-10-31: Reviewed Cupid paired-exit figure fitting. Wider, proportionally
  framed characters improve the VIP departure film; paired rules, entitlements,
  benefits, prices and Store copy are unchanged.

- 2026-10-31: Reviewed mode-aware VIP cinematic coverage. Classic keeps the
  approved films; Cupid uses linked-pair awards, nominations, saves and departures;
  Vox uses immunity, secret-ballot nominations and an official public-verdict
  broadcast. Survival retains its standard presentation. Updated canonical VIP
  benefit copy to state this scope. Prices, purchases, mode access, premium
  minigames and native outcome callbacks are unchanged.

- 2026-10-31: Reviewed ceremony-flow compatibility and integration regressions.
  An omitted morning-shock field now counts as inactive, allowing queued
  post-competition and post-elimination prompts to appear. Existing rewarded-ad
  requirements, retry limits, rewards, purchases, premium access and offer copy
  are unchanged. Current marketplace listings remain accurate.

- 2026-10-31: Reviewed releasing the approved cinematic ceremonies as a VIP benefit.
  Added the benefit to the canonical VIP catalog and product description;
  Standard keeps native animations, and the animation master switch and reduced
  motion retain priority. Non-VIP Cinematic selection routes to Store. Artwork
  loads by scene and character; Back 2 the Game follow-up cards cannot replay
  its main reveal. Prices and premium-minigame entitlements are unchanged.

- 2026-10-31: Reviewed the local shock-effect refinement: shared natural mist and
  selectively prepared Cupid, Halo Exchange, Twin Shock and election cutouts. The authoring preview
  retains the existing VIP/Standard gates and native announcement handoff.
  No released offer, product copy, entitlement, price or benefit changes.

- 2026-10-31: Reviewed the local full-game VIP ceremony preview and its animation
  style preference. The authoring server alone supplies the cinematic bridge;
  release routes do not expose the preview selector or import authoring artwork.
  Standard access keeps the original presentations. Cinematic requires effective
  VIP access, respects explicit Standard and the master switch, and remains a
  local test experience. Early-exit winner presentation and interruption cleanup
  preserve accepted outcomes, scoring, retry limits and rewards. No released
  products, entitlements, benefits, prices or Store listings change.

- 2026-10-31: Reviewed winner ceremonies after an early competition exit.
  Early exits retain their losing placement and existing retry eligibility;
  the winner ceremony now precedes the existing result commit. No rewards,
  retry limits, paid access, offers or Store copy change.

- 2026-10-30: Reviewed premium presentation lifecycle maintenance and the shared
  minigame host guard that suspends decorative cinematics before countdown.
  Shared TV/Cupid stingers and ceremony timelines pause with their owner and
  preserve existing decisions and outcomes; video rollback controls add no offer.
  Standard and premium games retain their rules, scoring, variants, access gates,
  products and prices. The existing Premium Challenges and VIP offers remain
  accurate; no catalog wording changes are needed.
  The subsequent scoped sound/weather/winner lifecycle fixes and isolated
  device-test packaging preserve those same offers. QA builds simulate native
  purchases, use separate identifiers, and are not store products.

- 2026-10-29: Reviewed the Tribunal Agree/Exit choice and its sequester arrival
  and season departure scenes. These are base post-elimination presentations.
  They add no purchasable content and change no premium access gates, prices,
  reward amounts, or product copy; the current marketplace listings remain
  accurate.

- 2026-10-29: Reviewed the advertising privacy footer and return navigation.
  Privacy policy and Back to settings are separate touch targets, and returning
  from Settings restores the prior history entry. Advertising opt-in, UMP choices,
  No Ads/VIP behavior, rewards, prices, and product contents remain unchanged;
  existing marketplace listings remain accurate.

- 2026-10-29: Applied the accepted $6.99 Surveyeval and $19.99 VIP launch prices
  to the upgrade resolver and documented the matching ten store product IDs
  ($4.99 through $18.49). Standalone ownership still earns 75% nominal credit.
  Checkout displays the localized price returned by Apple/Google. Product
  contents and access remain unchanged; prices must also be set in the consoles.

- 2026-10-29: Reviewed the native AdMob SDK connection, adult advertising opt-in,
  Google UMP privacy choices, and completed-ad reward handling. Existing automatic
  placements remain suppressed by No Ads/VIP; voluntary rewards stay optional.
  Product contents, prices, reward amounts, and daily limits are unchanged, so
  the existing marketplace listings remain accurate. Demo ads require explicit
  platform configuration and live builds require the publisher IDs.

- 2026-10-28: Reviewed release performance maintenance for shared minigame
  hosting, standard/VIP Quick Tap, House of Cards, and presentation assets.
  Scoring, rules, premium access, products, prices, and offer copy are unchanged.
  Reduced redundant UI work and decorative activity preserve the premium games
  and their existing entitlements. The current catalog remains accurate.

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

- 2026-10-31: Reviewed the cinematic ceremony entrance and fullscreen portrait
  framing. This presentation-only change does not alter VIP access, ceremony
  content, products, prices, or marketplace copy.

- 2026-10-31: Reviewed the Vox immunity/last-place result ceremony, persistent
  auto-nominee badge, Vox milestone wording, and removal of the classic All the
  Power presentation from Vox. Also consolidated Skip styling across cinematic
  films and the season archive. VIP access, products, prices, benefits, and Store
  copy are unchanged.

- 2026-10-31: Reviewed the VIP ceremony polish for nominations, LOH crowning,
  and Vox immunity results. The film sequence, preloader, and broadcast timing
  change presentation only. VIP eligibility, Standard animations, paid offers,
  prices, Store placement, and marketplace copy are unchanged.
