# Marketplace maintenance

Premium Challenges and VIP both unlock every premium minigame version. VIP also
includes every released standalone product. This covers enhanced
presentations, alternate premium rules, and replacement remasters.

## What stays synchronized

- The Premium Challenges list, count, tagline, and badge derive from the game
  registry. Register premium presentations and alternate rules with
  `premiumExperience`; connect remasters with `premiumReplacementKey`.
- Store shelves and VIP bundle benefits derive from each standalone product's
  shelf and release availability in `src/vip/vipConfig.ts`.
- `npm run generate:marketplace` updates the reference from the runtime store,
  minigame, upgrade-pricing, and Eyeros catalogs. Development startup also
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
   `src/vip/vipConfig.ts`; Eyeros powers are in `src/economy/storeCatalog.ts`.
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

- 2026-11-28: Reviewed the Faux TV Social and Incoming prompts for Standard
  and VIP/Reality. The prompts open existing moves and replies under their
  current eligibility rules and retire a Safety or nomination prompt once
  the player contacts the holder. Product access and benefits are unchanged.

- 2026-11-27: Reviewed the Incoming response requirement and phase-specific Social
  opportunities for Standard, VIP/Reality, Classic, Cupid's Arrow, Vox Populi, and
  Surveyeval. A Hubmate's accepted private campaign promise can influence their
  house vote within the existing Reality action. The catalog's Social benefits,
  access rules, and mode descriptions still match the game.

- 2026-11-27: Restored the approved Risk Wheel: Abyss Standard and VIP
  Cinematic presentations. Register the cinematic version under Premium
  Challenges and VIP, using the existing presentation upgrade flow. Both
  versions use the same scoring, handoffs, playoffs, and contest eligibility.
  Stop the wheel sound when a spin completes or the app enters the background.

- 2026-11-27: Reviewed the addition of Risk Wheel: Abyss to the standard
  competition registry. Standard, Premium Challenges, and VIP use the shared
  Abyss rules and artwork. The existing premium Risk Wheel presentation and
  the entitlements listed in the Marketplace catalog continue to apply.

- 2026-11-27: Reviewed the wider POS pool in Classic, Cupid, and Vox Populi.
  Approved daily games retain their roster requirements and story unlocks.
  Standard uses the base versions, and Premium Challenges and VIP continue to
  unlock all premium versions under the existing catalog and prices.

- 2026-11-27: Reviewed the restored campaign rotation in Classic, Cupid, and
  Vox Populi. The premiere uses Majority Rules or Percentage Panic for LOH,
  with Quick Tap Race for POS. Later competitions use the original cast-size
  priorities, eligibility, and season history for the approved competition games.
  Games marked for calibration stay outside the automatic campaign map. The
  marketplace catalog continues to reflect the released products and entitlements.

- 2026-11-27: Reviewed save recovery in the shared competition host for Standard,
  Premium Challenges, and VIP. Retry save reopens local writes and repeats the
  original checkpoint for the same attempt. The marketplace catalog still
  describes the current products, access, and competition rules.

- 2026-11-25: Reviewed the mobile Vox Populi handbook, including the day
  overview, practice vote and Final 4 ballot explanation. The existing rules,
  expansion access, price and marketplace description remain accurate.

- 2026-11-22: Reviewed The Last Light and Rock, Paper, Scissors in the
  Minigame Lab and season competition rotation. Both games are available
  in Standard play. The VIP Cinematics pack supplies their optional
  artwork, with shared rules and results across presentations.

- 2026-11-19: Reviewed Quick Tap Race and Quick Tap Race 2: Seasons in Standard
  and premium play. The new AI band tuning applies to new attempts. Saved
  attempts preserve their AI tuning, and Premium Challenges and VIP both
  include the existing premium variants. Also reviewed the Vox Final 3 and
  shock broadcast repairs. The catalog still describes the voting rules,
  rewards, products, prices and entitlements.

- 2026-11-18: Reviewed the Deck of Light AI memory changes. Preliminary
  opponents play through every pair, and finale opponents recall observed pairs
  more reliably while still making mistakes. Rules, rewards, pricing and access
  remain as described in the marketplace catalog.

- 2026-11-18: Reviewed Cupid's Arrow, Vox Populi, and VIP ceremony maintenance.
  The game applies the stated Final 4 ballot rule and shared Cupid powers.
  Competition labels, post-elimination TV, and the VIP backup ceremony reflect
  the active rules. Existing product descriptions, access, prices, rewards,
  and premium benefits remain accurate.

- 2026-11-17: Reviewed the Safety Confessional handoff. Standard ceremonies let
  players resume in the Hub after sealing their save target. The review confirmed
  that VIP ceremony playback, its existing access rules, and marketplace
  benefits continue as advertised.

- 2026-11-16: Reviewed VIP ceremony Skip and AI continuation recovery. Media-start
  claims and broadcast acknowledgements no longer interrupt a committed Safety
  or replacement sequence; an unexpectedly empty ceremony falls back to the
  existing native flow. Pending human choices, nomination outcomes, AI rules,
  rewards, products, prices, entitlements and Store benefits remain unchanged.
  Existing marketplace copy accurately describes the offer.

- 2026-11-15: Reviewed removal of the separate local advertising opt-in switch.
  Standard adult play now uses existing automatic ad placements without that
  extra gate, including installs whose legacy ads flag is false. Google UMP
  privacy choices and canRequestAds remain mandatory before live requests;
  undeclared-age and under-18 players remain blocked. No Ads/VIP still suppress
  automatic breaks, and rewarded ads still require a voluntary Watch action and
  real completion. Products, prices, reward amounts, limits, entitlements, and
  Store benefits are unchanged; existing No Ads copy remains accurate. Updated
  Settings, both published privacy policies, and device-test guidance.

- 2026-11-16: Reviewed the TestFlight follow-up batch. Chain of Greed reports
  actual match placement separately from its unchanged winner-only Influence
  payout, so Reverse Time remains restricted to actual last place or early exit.
  Both existing versions keep their rules, access and rewards. Democracia again
  excludes self-votes; shock commentary and alliance/LOH consultation windows
  follow the actual decision context. Credits automatically start their muted
  video after the first decoded frame, with one bounded autoplay retry and the
  existing live fallback. No products, prices, entitlements, ad reward amounts,
  premium benefits or Store copy change; the current offer remains accurate.

- 2026-11-15: Reviewed the 23-report TestFlight regression batch. Hosted premium
  minigames retain reachable controls/results, Twin remasters retain concurrent
  movement/jump input, and Deck of Light offers vary fairly by round for human
  and AI players. VIP and Premium Challenges continue to unlock all premium
  versions. Reverse Time remains an opt-in rewarded retry and requires a real
  native reward completion; advertising readiness and consent failures now have
  visible recovery paths. Consent, No Ads/VIP automatic-break suppression,
  reward limits, products, prices, entitlements and Store benefits are unchanged.
  Social consistency, reunion action costs and cinematic playback maintenance
  do not change the marketplace offer; existing copy remains accurate.

- 2026-11-15: Reviewed the Number Trivia broadcast-stage refresh and built-in
  numeric keypads for Number Trivia and Don't Go Over. The question bank,
  qualifier eliminations, tied finalist cutoff, three-life duel, AI, scoring,
  rewards and result checkpoints retain their existing rules. The presentation
  and input repair are available with the existing games; no new premium edition,
  entitlement, product contents, price or Store benefit is introduced. Existing
  marketplace copy remains accurate.

- 2026-11-15: Reviewed automatic Google Play Internal Testing delivery. Validated
  main builds retain their signed AAB, use scoped Google authentication, and
  verify the exact internal-track version without changing other tracks, tester
  lists or an existing review. Missing credentials remain explicit. Existing
  Android/iOS ad configuration, products, prices, rewards, entitlements, premium
  content and marketplace copy are unchanged.

- 2026-11-15: Reviewed Faux TV delivery and recovery across Classic, Vox, Cupid
  and Surveyeval, including Safety shock streams, ambient weather, vote receipts
  and mode-specific recaps. The changes preserve event outcomes, powers, rewards,
  paid access, ads, product contents, prices and benefits. Existing Store copy
  and Premium Challenges/VIP coverage remain accurate; the offer is unchanged.

- 2026-11-14: Reviewed the Reality social flow revision. Alliance vote requests
  now reuse action cards and nominee chips; the backup decision opens the existing
  Social module from the existing briefing slot without spending resources or
  committing a nominee. Matching vote-request reactions are summarized together;
  hidden loyalties and actual ballot choices remain private. Group vote
  requests use the existing per-recipient pitch costs and responses, with up to
  two selected targets in double elimination. VIP access, prices, entitlements,
  product contents, benefits and Store copy remain unchanged.

- 2026-11-14: Reviewed the player-reported alliance, confessional, portrait,
  finale platform, Mystic Chamber, Twin remaster rotation and competition retry
  fixes. Both Twin remasters remain included with Premium Challenges and VIP;
  removing their browser fullscreen control does not change access or contents.
  Restored the existing opt-in rewarded retry for score-only results. The
  TestFlight workflow now uses the documented iOS AdMob integration IDs instead
  of forcibly disabling advertising, with repository-variable overrides. Adult
  advertising consent, No Ads/VIP automatic-break suppression, reward limits,
  prices, and product contents remain unchanged. Existing Store copy is accurate.

- 2026-11-14: Reviewed automatic TestFlight delivery and signed Android upload
  bundles. Builds preserve production account services, disable development
  entitlements, and use existing signing identities. Store offers, products,
  prices, access rules and Premium Challenges coverage do not change.

- 2026-11-14: Reviewed alliance and relationship consistency across Reality social
  play, Classic, Cupid, Vox and Survival. Departures retain responsibility and
  context, independent pacts survive group formation, and voting uses shared bond
  facts with motive-driven uncertainty. Observed reactions and commitment scope
  are shown without exposing private ballots. Existing VIP/Reality access, mode
  contents, benefits, prices, ads and Premium Challenges coverage remain accurate;
  the offer does not change.
- 2026-11-13: Reviewed account/profile flow maintenance. Profile creation uses
  one three-profile device limit before and after sign-in; existing extra
  profiles and their saves remain available for management. Account-wide
  linking, sync retries, deletion reconciliation, and account-only management
  navigation do not change wallet balances, Eyeros inventory, purchases,
  entitlements, ads, prices, rewards, or premium benefits. VIP and Premium
  Challenges still unlock every premium minigame version; offer copy is accurate.

- 2026-11-13: Reviewed the cumulative TestFlight follow-up fixes. Retired the
  selectable player themes from Settings and Advanced Settings, normalized saved
  selections to Midnight, and removed the theme benefit from VIP and Store copy.
  Reviewed shared minigame safe areas, Famous Figures standings and mission
  receipts, Social scrolling, broadcast wording, vote-reveal log timing, and
  adaptive public-vote precision. VIP and Premium Challenges still unlock every
  premium minigame version. All other benefits, purchase access, prices, ads,
  scoring and rewards are unchanged.
  Also reviewed Android billing serialization and reconnect recovery, one-time
  purchase-only restoration, production account build validation, and fresh
  profile season-pill visibility. Checkout is never automatically repeated;
  permanent acknowledgment and durable consumable delivery retain their rules.
  Classic and premium Quick Tap overlays also remain inside the hosted safe
  viewport; standalone launches retain their existing page portal. Variant
  access, game rules, scores and rewards are unchanged.

- 2026-11-13: Reviewed the Android startup investigation candidate. Foreground
  launcher-icon rotation is paused for both remote-switch values, retaining the
  currently enabled alias on launch and resume. This tests a possible cause of
  repeated splash-screen exits reported before and after build 5; the cause and
  device outcome remain unconfirmed. Paid access, purchases, ads, offers, prices
  and rewards are unchanged.

- 2026-11-13: Reviewed Safety/replacement cinematic sequencing. Committed saves
  play before backup nominations and consumed saves cannot replay through the
  standalone ceremony. VIP cinematic access, paired/special-power rules,
  purchases, offers and rewards remain unchanged.

- 2026-11-13: Reviewed the shared shock cinematic art-plane alignment and
  pre-merge TestFlight candidate upload path. Premium cinematic eligibility,
  VIP and Premium Challenges benefits, purchases, prices and rewards are
  unchanged. Candidate uploads use the existing production iOS configuration.

- 2026-11-13: Reviewed TestFlight Package 9 season competition AI calibration.
  Active Classic, Vox and Cupid launches capture bounded skill or local decision
  capability once, including premium variants and Battle Back. Surveyeval, Lab,
  legacy active attempts, fair chance draws, social decisions, prices, rewards,
  products and entitlements retain their existing policy. VIP and Premium
  Challenges still unlock every premium minigame version. Offer copy remains
  accurate; no promised win-rate or score increase is added. Also reviewed
  complete legacy score receipts for retry eligibility; purchase/ad gates stay intact.
  Serpentine now accepts contact presses, buffered corners and early swipes, with
  larger controls, food guidance and goal progress. The 1000-point target, speed,
  food distribution, AI simulation, scoring and rewards remain unchanged.

- 2026-11-13: Reviewed TestFlight Package 8 Social fallback audio and HomeHub
  utility spacing. Social reuses the existing Confessional loop only when no
  phase music owns playback; explicit local/remote assignments remain in force.
  Corner stacks use equal 4px gaps at desktop and narrow sizes. Standard/VIP
  access, products, prices, benefits, rewards, and marketplace copy are unchanged.

- 2026-11-12: Reviewed Social catalogue ordering, Group Chat discovery and
  selection resets, subject-picker navigation, and focused-player swipes.
  Existing execution eligibility, group prices, resource costs, paid access,
  products, benefits, and marketplace copy remain unchanged.

- 2026-11-12: Reviewed shared minigame eye positioning and Hub Says swipe paging.
  These input and accessibility changes preserve rules, scoring, exits, paid
  access, marketplace products, benefits, prices, and rewards.

- 2026-11-12: Reviewed chocolate roster targeting and animation completion,
  weekend energy, mission reward, and Confessional presentation start claims.
  These repairs change no grants, wallet balances, rewards, products, access,
  prices, premium benefits, or marketplace copy.

- 2026-11-12: Reviewed Faux TV delivery scope, unread broadcast pinning,
  competition-rules handoff, and durable shock-intro claims. These repairs
  preserve the existing Standard and VIP presentations, game results, paid
  access, products, prices, rewards, benefits, and marketplace copy.

- 2026-11-12: Reviewed competition result receipt identity, last-place retry
  eligibility, and Risk Wheel terminal handling. These changes align campaign
  results with completed game outcomes and preserve existing retry behavior.
  They do not change products, paid access, entitlements, prices, benefits, or
  marketplace catalog copy.

- 2026-11-11: Reviewed the Deck of Light tool revision in both presentations.
  Bright Pair awards 120 points. Bonus Bet requires two never-revealed cards,
  Shield deducts one or two misses by round, Keep Open holds one attempt visible,
  and Replay reveals two random previously seen hidden cards once per round.
  Human and AI play share these rules. Existing Premium Challenges and VIP
  listings still describe the included premium presentation accurately.

- 2026-11-10: Reviewed WebP artwork, the smaller credits video, and duplicate
  media removal across the Cupid and VIP themes and shared game screens.
  The media stays bundled for offline play, and legacy portrait and tabloid
  paths resolve to the corresponding artwork. The VIP test now uses the
  production entitlement reducer. Store offers, access, benefits, and prices
  are unchanged.

- 2026-11-10: Reviewed the Reality Social regression fixes for locked
  double-elimination plans and invalid pact selections. These restore the
  intended dialogue and feedback within the existing mode. Store offers,
  entitlements, and prices are unchanged.

- 2026-11-10: Reviewed removal of the duplicate reply-button descriptions in
  Reality and Classic. The reply labels still state any promise the player
  makes, and this presentation change leaves the Store offers and access rules
  unchanged.

- 2026-11-09: Reviewed the Reality and Classic nomination-advice, Reassure, and
  Incoming fixes, including Cupid's separate consent for each partner. This is
  maintenance of the existing conversations and ceremony rules. Store offers,
  access, and prices are unchanged.

- 2026-11-09 — Reviewed the Home Hub glass finish, the order of the Safety
  ceremony announcements, and the Twin Shock portrait reveal. This review
  covers the shared presentation of the standard and VIP ceremonies, paid-mode
  buttons, and existing roster artwork.

- 2026-11-09 — Reviewed the TestFlight fixes for the Store, paid-mode launch
  buttons, Reality Mode portraits, and elimination markers. The VIP card now
  shows Owned in place of the purchase price when VIP access is active. Prices,
  product contents, upgrade credit, eligibility, and benefits stay the same.
  Premium Challenges and VIP both continue to grant all premium minigame versions.

- 2026-11-08: Reviewed direct nomination, Safety replacement, and house-vote
  conversations in Classic, Reality, and the Cupid and Vox formats. The routing
  and saved inbox changes restore the existing conversations within each
  format's rules. The Reality offer and its access rules are unchanged.

- 2026-11-08: Reviewed Incoming and Social fixes across Classic and Reality,
  including Safety advice, explicit promises and consent, linked relationship
  and intel effects, and saved conversation continuity. The changes repair
  existing scenes and gameplay effects. Reality Mode's access, benefits, price,
  and Store copy continue to describe the existing offer.

- 2026-11-09: Reviewed optional player sign-in and local profile linking. The
  account link grants no entitlements. Store receipts and local profile progress
  continue to determine purchase access and Eyeros balances. Prices, benefits,
  listings, and premium minigame availability stay as currently published.

- 2026-11-06: Reviewed durable competition-attempt and result checkpoints across
  minigames, including restored paid variants. Interrupted attempts forfeit, while
  completed results remain available before Continue. Premium entitlements,
  variants, products, benefits, pricing and Store copy are unchanged.

- 2026-11-05: Reviewed the immediate Public Favorite handoff, late-season-only
  vote-bundle preparation and opaque Eye cover for cold loading. The old hidden
  five-second TV wait is removed, including on resumed votes. Voting rules,
  forecasts, prizes, music cues, mode access, VIP benefits, products, pricing and
  Store copy are unchanged.

- 2026-11-05: Reviewed nomination and finale foot anchoring, a shared Continue
  control for result and Final Two gates, the single-winner public celebration
  backdrop and finite fireworks, and the shared Eye ident on all VIP departures.
  These repair existing presentation coverage. Standard results remain manual,
  reduced-motion/Off preferences remain authoritative, and VIP eligibility,
  game rules, rewards, products, benefits, pricing and Store copy are unchanged.

- 2026-11-04: Reviewed Final Three presentation acknowledgements, visible finalist
  staging, reuse of existing marble podium artwork, nomination ordinal cleanup,
  and native-only messages for declined Safety uses. These are presentation and
  progression repairs. VIP/Standard gates, offers, prices, rewards and Store copy
  remain unchanged; no new artwork or paid product is added.

- 2026-11-03: Reviewed local strategic preference rollback and regression
  hardening for epic #1711 phase 6. The build control affects new AI preference
  weights only; paid offers, access, prices, power limits and products are
  unchanged. Privacy, legal mode rules and recorded decisions remain enforced.

- 2026-11-03: Reviewed grounded audience consequences, private-event filtering,
  persisted reaction receipts and existing audience-feed feedback for epic #1711
  local phase 5. Mode access, product benefits, prices, minigame versions,
  purchases and Eyeros powers are unchanged. Audience eviction and finale
  formulas remain unchanged; existing Store wording remains accurate.

- 2026-11-03: Reviewed mode-aware AI social preferences, observer privacy and
  action-specific conflict dialogue (epic #1711, local phase 4). Existing modes,
  purchases, benefits, prices, paid access and powers are unchanged. New AI
  preferences use existing actions, costs and execution guards; the Store's
  existing product descriptions remain accurate.

- 2026-11-03: Reviewed mode-aware alliance choices and nonbinding faction agendas
  for Classic and Vox (epic #1711, local phase 3). Existing consent, capacity,
  purchases, mode access, prices, premium games and Eyeros powers remain
  unchanged. The AI now considers witnessed public conflict, known reliability
  and immediate risk; no product contents or Store wording change is needed.

- 2026-11-03: Reviewed the restored headless social simulation entry point for
  epic #1711. It reuses production selection, legality, budgets and action caps;
  browser gameplay scheduling and all paid gates, offers, prices and powers
  remain unchanged. The existing marketplace listings remain accurate.

- 2026-11-03: Reviewed the diagnostic strategic context resolver for Classic, Vox
  Populi, Cupid and Survival (epic #1711, PR 2). It describes existing authority
  and public powers without connecting new weights to gameplay. Mode access,
  paid benefits, prices, minigame versions, Eyeros powers and Store copy remain
  unchanged; the existing listings remain accurate.

- 2026-11-03: Reviewed replacement-ceremony outcome routing and the shared film
  family for ordinary replacements, power overrides, Vox and Cupid. Reuses existing
  character packs and sets, adds no product or gameplay advantage, and preserves
  VIP access, Standard/reduced-motion fallback, pricing and Store copy.

- 2026-11-03: Reviewed the compact VIP Cinematic badge handoffs. Saved-by-Safety
  cinematics now finish with a short badge landing; replacement nominations
  use the same short badge reveal in VIP Cinematic mode, while public saves
  retain a shortened outward badge extraction. Standard-mode and motion
  preferences remain unchanged; VIP offers, entitlements, benefits, prices,
  and Store copy are unaffected.

- 2026-11-02: Reviewed enabling the existing Big Eye closing ident at the end of
  every shared VIP departure film, including ordinary weekly exits. The Eye asset,
  choreography, and handoff remain shared; VIP eligibility, animation settings,
  products, prices, benefits, entitlements, and Store copy are unchanged.

- 2026-11-01: Reviewed Home Hub weather recovery on entry and foreground return,
  current rain detection, and the deployment-relative embroidered favicon. The
  background repairs select from the existing artwork and preserve the existing
  theme access rules. Products, VIP benefits, entitlements, prices, and Store copy
  are unchanged.

- 2026-11-01: Reviewed ceremony coverage for all 35 existing selectable player
  looks, including six matching poses for Looks 28–35 and resolution from the
  season-owned appearance. Also reviewed immediate first-character selection
  when registering during a guest season and owner-checked repair of adopted
  silhouette saves. These fixes fulfill existing character and VIP cinematic
  behavior; they add no product, paid look, entitlement, price or Store-copy
  change. VIP access and animation preferences remain the existing gates, and
  photo-only characters retain native animations.

- 2026-11-01: Reviewed optional profile email, inline updates consent, and the
  separate administrator sign-in for player audience reporting. Stable draft
  profile IDs preserve the existing profile creation and wallet ownership rules;
  administrator authentication grants no gameplay purchases or entitlements.
  Products, prices, premium access, rewards, and Store copy are unchanged, so the
  existing marketplace catalog remains accurate.

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
  start and result, and Eyeros purchases. Reviewed the runtime catalog,
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

- 2026-10-31: Reviewed the Vox immunity film title timing and Finale Ready Faux TV
  state. This is presentation maintenance; VIP eligibility, paid offers, prices,
  Store placement, and marketplace copy are unchanged.

- 2026-11-01: Reviewed the Classic human Final LOH decision scene and its four
  modular stage assets. The live monitor, paged dialogue, explicit choice,
  sentence-aware captions, automatic entry, shared Skip control, closer staging,
  directed camera/light/audio cues and corrected elimination-to-exit handoff improve the
  existing VIP cinematic-ceremony benefit under the same entitlement
  and animation preferences. They introduce no separate product or purchase,
  price change, reward change or new gameplay advantage. Standard and unsupported
  presentation paths retain the native decision. Existing Store listings and
  marketplace product descriptions remain accurate.

- 2026-11-03: Reviewed pair-scoped audience evidence, current-alliance Nemesis
  escalation, and bounded Nemesis episode history. These social and relationship
  consistency safeguards do not add or change purchasable items, entitlements,
  prices, rewards, or marketplace copy.

- 2026-11-04: Reviewed the replacement-ceremony choreography, nominee staging,
  Co-LOH assignments, Vox/Cupid variants, and solo nomination treatment. These
  changes refine the existing VIP cinematic benefit and its preview assets only;
  VIP eligibility, Standard behavior, product availability, prices, rewards,
  benefits, and Store copy remain unchanged.

- 2026-11-04: Reviewed connected VIP replacement decision scenes, slower Double
  Trouble pacing, actual LOH/Safety/mission-holder shots, and pauses for mandatory
  human decisions. The same VIP entitlement and animation preferences apply.
  This is presentation maintenance: products, prices, rewards, access gates,
  benefits, and marketplace copy remain unchanged.

- 2026-11-04: Reviewed royal precedence for shared LOH/Safety holders, paired
  thrones, continuous Vox ballot-ranked replacements, Co-LOH ownership, and
  automatic ceremony continuation through the existing required Confessional.
  These maintain the existing optional VIP cinematic benefit; Standard and
  Survival behavior, paid access, products, prices, rewards, and Store copy
  remain unchanged.

- 2026-11-04: Reviewed removal of costly live shadow filters from moving VIP
  ceremony layers. Existing artwork lighting and contact shadows remain; this
  rendering maintenance changes no offers, prices, entitlements, or rewards.

- 2026-11-04: Reviewed replaceable synthetic accent cues synchronised with VIP
  ceremonies. Existing SFX settings apply; phase music, Standard/Survival paths,
  entitlement gates, offers, prices, rewards and Store copy remain unchanged.

- 2026-11-06: Reviewed week-start batching in Drama mode and the resumed Tribunal
  winner handoff. The same relationship, twin, Bella, jury, and winner rules apply.
  This changes no VIP or Premium Challenges entitlement, product, price, reward,
  availability, or Store copy.

- 2026-11-10: Reviewed the Survival run Store layout and age guidance, plus the
  full-screen minigame host. Survival runs remain the same consumable recovery
  credit at the same price and purchase gate; the Store presents them only under
  Extras and uses the compact power-button style. The minigame change covers the
  phone status area during play. No product, entitlement, reward, or premium
  minigame access changes.

- 2026-11-12: Reviewed TestFlight mission request retirement, LOH pact protection
  acknowledgements, and Social access during voting. Existing VIP/Classic/Vox
  access and promise fulfilment apply; offers, prices, rewards, entitlements and
  marketplace copy are unchanged.

- 2026-11-12: Reviewed TestFlight minigame maintenance: Verdict Board has at
  most five boards and three wrong qualifying guesses; Deck of Light offers
  three sampled tools per attempt and removes Bright Pair scoring for human/AI.
  Crystal Path hint/fracture and Vault history layout fixes preserve scoring.
  Premium Challenges and VIP still unlock all premium versions. Product prices,
  availability, benefits and entitlements are unchanged; registry rules updated.

- 2026-11-14: Reviewed the optional VIP cinematic pack preparation. Ceremony
  loaders can resolve a complete verified local image pack, while normal builds
  continue to bundle their current media. The export includes future walking
  frames and retains shared finale artwork, music and credits in the base game.
  This pass adds no download offer or new entitlement and changes no price,
  benefit, purchase flow, gameplay reward or marketplace copy.

- 2026-11-14: Reviewed optional cinematic downloads after VIP purchase/restore
  and in Settings. Standard remains available offline; a verified download is
  retained for offline cinematics, with progress, cancellation/retry and removal.
  Music and credits stay bundled. The VIP cinematic benefit description now
  explains the optional mobile download; ownership, prices and gameplay rewards
  are unchanged. Online-only playback and base-app media removal are deferred.

- 2026-11-14: Reviewed the public-vote nomination cinematic: the committed
  automatic nominee is established before the LOH insert, chosen nominees receive
  separate light reveals, and the film closes on the complete block. This
  maintains the existing VIP cinematic benefit and animation preferences. No
  nomination ownership, offer, price, entitlement, reward, availability or
  marketplace copy changes.

- 2026-11-14: Reviewed all 63 character departure cycles, empty-handed reusable
  movement beyond Ali’s approved pilot, continuous doorway travel and recorded
  departure Foley. Updated the optional VIP media inventory for the new atlases;
  existing installations use the compatible bundled fallback until updated.
  Animation, reduced-motion and SFX settings remain authoritative. Eye closing
  choreography, offers, prices, rewards, entitlements and availability are unchanged.

- 2026-11-14: Reviewed secret mission acceptance, deadline, legacy-save and energy tracking repairs. Existing reward boxes, Eyeros power eligibility, prices, entitlements and paid-mode availability remain unchanged.

- 2026-11-14: Reviewed mobile base-app media exclusion. The existing optional VIP
  image pack is now omitted from Android/iOS builds; Standard is used until a full
  local installation is verified. Final decisions and competition results retain
  their native continuation paths. Browser cinematics, music, credits and shared
  finale artwork stay bundled. Ownership, prices, rewards and product copy do not
  change. The 63 walking atlases from #1762 are included in the optional inventory;
  transparency compression preserves their decoded pixels, frames and timing.

- 2026-11-16: Reviewed bounded mobile layouts for premium and standard challenges,
  finale/aftermath presentation, Deck of Light tool choices, Battery Low selections,
  and fresh Don't Go Over Reverse Time draws. The isolated development review page
  simulates ad rewards; release purchase/ad gates are unchanged.
  Premium Challenges and VIP still unlock all premium minigame versions. This
  maintenance changes no product, price, entitlement, reward, offer or Store copy.

- 2026-11-17: Reviewed pre-release presentation and retry repairs: credits startup,
  departure Skip lifecycle, shared finale Eye ident, spectator ballots, phone
  viewport fit, Risk Wheel appearance and fresh Reverse Time seeds. The ident
  precedes the existing finale interstitial boundary; VIP and ad-free entitlements
  retain their current exemptions. No product, price, entitlement, reward,
  marketplace copy, wheel odds or competition difficulty changes.

- 2026-11-18: Reviewed Standard alliance previews with the existing VIP Eye
  and upgrade destination. Locked cards keep alliance actions gated. In-season
  premium challenge offers occur before the attempt begins and preserve the
  attempt through Marketplace purchase or return. Cinematic setup waits until
  the challenge ends. VIP and Premium Challenges still unlock all registered
  premium versions. Lia & Ali's artwork extends the shared cast and optional
  cinematic pack. Product benefits, prices, rewards and entitlement rules are
  unchanged.

- 2026-11-18: Reviewed group alliance visibility after accepting an AI
  invitation. Standard players see the group name and VIP Eye, which opens
  Marketplace. Reality Mode members open the existing alliance details with
  their actual role. Standard players can accept incoming invitations, and
  opening alliance details still uses the existing Reality Mode entitlement.
  The current Marketplace copy and pricing describe that access.

- 2026-11-18: Reviewed contextual interstitials for Standard players under 18
  and players of unknown age. Configured inventory uses the existing break
  schedule, with child-directed treatment and general-audience creative.
  VIP and No Ads continue to remove automatic ads, and adults can choose
  rewarded ads. The existing product copy describes that access.

- 2026-11-18: Reviewed the Tribunal's paired entrance, stepped vote reveal and
  champion portrait selection. Standard and VIP use the shared ceremony and
  champion coronation. The presentation update preserves existing marketplace
  products, pricing, benefits and entitlement rules.

- 2026-11-27: Reviewed the Final Three Circuit qualifier routing and separate
  portraits for Lia and Ali during Tribunal voting. The twins retain their
  shared ballot and vote tally. Marketplace benefits, prices and entitlements
  are unchanged.

- 2026-11-27: Reviewed the restoration of Down Memory Lane as the dedicated
  third Final 3 competition in Classic, Cupid, and Vox Populi. Marketplace
  products, benefits, and prices are unchanged.

- 2026-11-27: Reviewed the usage measurement switch on the Advertising privacy
  screen. It controls gameplay analytics. The game uses the existing rules for
  ad breaks, rewarded ads, and purchase access. Android internal builds run with
  ads off so verification activity stays out of live ad metrics.

- 2026-11-27: Reviewed the mobile asset list and remotely published Don't Go Over
  question bank. The asset list retains Standard and shared ceremony media and
  uses the existing verified VIP pack for VIP-only artwork. The question update
  applies to the Standard ruleset. Existing prices, access and Premium Challenges
  and VIP catalog coverage continue to apply.
