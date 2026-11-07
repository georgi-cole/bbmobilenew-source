# Character Store and Dressing Room architecture

Revision: 25 October 2026. Active scope: CS tickets in [BACKLOG.md](BACKLOG.md). This is a design, not an implementation-completion claim. It supersedes the 24-identity complete-look plan and the rejected modular experiment. Related contracts: [UX_FLOWS.md](UX_FLOWS.md), [ROSTER_PLAN.md](ROSTER_PLAN.md), [ART_BRIEF.md](ART_BRIEF.md), [ACCESSORY_PIPELINE.md](ACCESSORY_PIPELINE.md), [RESEARCH.md](RESEARCH.md).

## Product decisions

- Launch 12 original adult character packs: eight free and four permanent Eyeolean unlocks. The existing six are candidates toward this total, not six completed packs. All requested representation is available within the free selection. No existing AI character becomes a new selectable identity.
- Each pack includes casual and formal full figures, main/grey/sad portraits, paparazzi artwork, and a derived thumbnail. These scene variants are included together and are not separate purchases.
- Use one shared picker/preview in profile creation, Dressing Room and Market. Appearance remains optional: uploaded photos and emoji continue to work; a chosen character can still supply figures when a photo supplies the portrait.
- Dressing Room equips owned content. Market acquires content. Try-on is a temporary preview, buying adds ownership, and Apply separately saves equipment.
- Launch eight cosmetic items: three eyewear designs, three outer profile frames, two profile-card backdrops. Free: one eyewear, two frames including an optional spectrum/pride design usable by anyone, one backdrop. Unlockable: two eyewear, one frame, one backdrop. The four unlockable cosmetics are individually purchasable with Eyeoleans or together through one native non-consumable bundle.
- Eyewear supports explicitly fitted main, grey and sad character portraits. It does not change figures, paparazzi, uploaded photos or emoji. Frames/backdrops support Profile and Dressing Room initially. No unimplemented wigs/makeup/clothing tabs.
- Preserve the existing VIP promise: the proposed launch cosmetic bundle and the four launch character unlocks are explicitly included for verified permanent VIP owners. Record an exact grant manifest; do not redefine VIP as ownership of every future item. Do not narrow previously advertised rights through this work. CS-19 must reconcile final copy and existing products before billing is enabled.
- Ordinary Eyeolean unlocks remain per local profile. Native bundle/VIP access is shared by the app's local profiles under the restoring store account, with separate equipment per profile. There is no new cloud account or cross-platform synchronization.
- No cash sale of Eyeoleans, loot boxes, trading, user uploads of paid items, subscriptions or algorithmically generated personal likenesses in this release.

These choices bound content production and commerce. Twelve is a coverage starting point, not a claim that every phenotype is represented or a research-derived optimum. Complete all 12 packs before describing the release as the complete launch roster.

## Current game and integration points

Implementation update, 28 October 2026: new installations can create three player
profiles; existing fourth/fifth profiles remain usable. `/new-season` selects a
contestant for each run. `GameState.seasonContestant` records the selected identity
and artwork revision. Resume preserves saved gameplay attributes, and EditProfile
changes player details/defaults without rewriting an active contestant. Future
Dressing Room work must use a cosmetic-only update path and retain these gameplay
identity and real-player age boundaries.

The app uses React/TypeScript, Redux, React Router, Vite and Capacitor. It renders ordinary image URLs. Local profiles have independent saves and Eyeolean wallets; native purchases already use @capgo/native-purchases.

| Area                   | Current integration boundary                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creation and switching | src/screens/ProfilePicker/ProfilePicker.tsx; three-profile creation limit, legacy fourth/fifth retained, uploaded photos, guest-run adoption, autosave suspension |
| Profile and editing    | src/screens/Profile/Profile.tsx and EditProfile.tsx; header currently renders an emoji string when no photo                                                       |
| Entry points           | src/screens/HomeHub/HomeHub.tsx, src/components/layout/NavBar.tsx, GameBottomNav.tsx, src/routes.tsx                                                              |
| Market                 | src/screens/Store/Store.tsx; existing VIP/Game Modes/Expansion/Extras/Powers shelves and return navigation                                                        |
| Portraits              | src/utils/avatar.ts, presentationAvatar.ts, useResolvedAvatarSrc.ts, ResolvedAvatarImage, HouseguestGrid/AvatarTile and two PlayerAvatar paths                    |
| Figures                | src/components/FullSizeCutoutImage/FullSizeCutoutImage.tsx and direct casual/formal candidate consumers                                                           |
| Sad state              | src/features/twists/depressionShock.ts; several current portrait paths exclude the human player                                                                   |
| After the Eye          | src/screens/GameOver/aftermath.ts; cast-name-based tabloid photo selection                                                                                        |
| Profile storage        | src/store/profilesSlice.ts and store.ts subscriber; localStorage writes currently catch and hide failure                                                          |
| Durable storage        | src/store/durablePersistence.ts; existing run/archive storage abstraction, not yet authoritative for profiles                                                     |
| Cash flow              | src/vip/vipPurchaseService.ts, vipStorage.ts, vipConfig.ts, effectiveEntitlements.ts                                                                              |

Refresh this audit when each ticket starts. Existing dirty files are not authorization to reset or replace other work. CP-01 types/validator cover body/portrait/thumbnail only. Keep their IDs readable through an explicit adapter; do not reinterpret legacy three-image presets as completed six-image packs.

## Catalog and asset contracts

Use a new stable namespace such as char-001 and immutable pack revisions. Display names and fictional biographies can change without renaming references.

| Record                      | Responsibility                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CharacterDefinition         | Stable ID, label, descriptive visual traits, optional fictional bio, default pack revision, selectability             |
| CharacterPackRevision       | Six explicit asset roles, thumbnail, art revision, portrait-layer references, acceptance/provenance reference         |
| CosmeticDefinition/Revision | Kind, slot, material/color choices, item/art revision, supported surfaces, conflicts, source assets                   |
| CosmeticFit                 | Exact item revision + character + pack/base revision + portrait state + transform/mask/recipe revision and acceptance |
| CatalogCollection           | Immutable explicit grant set; no implicit coverage of future characters/items                                         |
| StoreOffer                  | Canonical offer/version, free/Eyeolean/native access, grant set, platform product mapping                             |
| ProfileAppearance           | Versioned character/pack IDs, portrait-source preference, cosmetic IDs/revisions and per-character eyewear selections |
| ProfileCosmeticOwnership    | Permanent earned item/character grants, origin and stable purchase identifiers                                        |
| StoreLicense                | Reconciled native product entitlement and verification state, stored separately from profile equipment                |
| AppearanceSnapshot          | Versioned selection carried by a live player/run/archive; never ownership evidence                                    |
| DraftAppearance             | Temporary editor state bound to a captured profile ID/revision or an uncommitted creation draft                       |

A proposed schemaVersion 3 distinguishes packs from earlier CP preset and CL look drafts. Released schema versions must be discovered before choosing the exact migration tag. Validate IDs, revisions, selectable/default completeness and explicit mappings. No naming convention or player name is an authoritative character lookup.

Pack roles: casualBody, formalBody, mainPortrait, presentationPortrait, sadPortrait, paparazzi. The six are mandatory before a pack is selectable or purchasable. Thumbnail is derived. Optional accessory layer bases do not make a pack incomplete, but eyewear cannot be advertised for it until every supported portrait state has reviewed fits. The glasses-wearing candidate 02 is initially eyewear-incompatible; never draw a second pair over painted glasses.

Catalog assets live under assets/characters/char-001/r1/... and assets/cosmetics/item-id/r1/... with base-aware URLs. Sources, prompts, rejected artwork, fit review sheets and alpha corrections stay outside public. Retain released revisions for historical views. New catalog validation counts every unique packaged file, including nonselectable legacy revisions.

## Identity, gender and gameplay

Visual traits describe artwork. Choosing a character never copies fictional biography, age, ethnicity, pronouns, gender, sexuality, reproductive capabilities or gameplay sex into the profile. Identity labels are optional self-description; queer or nonbinary is not inferred from a haircut or body.

Add optional profile gender identity and a constrained pronoun preference with neutral name/they fallback. Appearance filters describe hair/style/build; store categories never sell an ethnicity, albinism or orientation. No gender restrictions on compatible cosmetic items.

Creation currently requires Male/Female and game logic uses sex separately from display identity. CS-06 must remove that requirement from the shared creation flow while preserving old records and documented story rules. Store optional legacy story sex/capabilities separately from gender/pronouns; do not insert 'nonbinary' into a binary eligibility field.

Persist story setup distinctly as legacy (migrated old behavior), unconfigured (new profile skipped setup), disabled (explicit opt-out), or configured (explicit capabilities). Do not use undefined for both skipped and disabled. Preserve old binary fallback only for migrated legacy records; explicit settings take precedence. New skipped/disabled profiles gain no sex-specific capabilities from artwork, identity or pronouns. For configured both-capability participants, retain an explicit story-role preference or ask at the existing story-role boundary when a pairing has no unambiguous carrier; do not infer a role from gender/appearance or silently choose both. Audit resolveProfileSex, pregnancy.ts and the SocialPanelV2 prompt together, including consistent participant eligibility and role selection. This narrow compatibility correction needs existing pregnancy/Cupid regressions; do not broaden into a new attraction simulation. Existing orientation metadata remains biography unless a separate gameplay feature explicitly uses it.

Use a shared display-pronoun/name resolver for human-facing copy while preserving existing AI copy. Prevent houseguestLookup name enrichment from replacing a human's metadata when their name matches Nova or another cast member. Recheck existing age gates; adult-looking character art never makes a 16-year-old profile eligible for adult-only content.

## Durable profiles, wallets and grants

Make profiles/wallet/grants one authoritative, versioned durable aggregate, using the existing durable-storage abstraction after proving atomic replacement and flush behavior on each supported backend. Keep cache reads synchronous after hydration for existing loadActiveProfile/buildUserPlayer callers.

Critical bootstrap: the store currently loads profiles before initializeDurablePersistence completes. CS-04 must change startup ordering or explicitly hydrate/rebind the profile state before any run construction, reset, route creation or autosave. Migrate the old localStorage key once; retain a recovery copy until a durable write and cold-read verify. An empty transient cache must never overwrite legacy data.

All writers to the aggregate must use one serialized repository/commit gateway: profile creation/edit/switch/delete, appearance Apply, season/forecast rewards, existing power purchases/reservations and cosmetic purchases. A second subscriber must not later persist a stale wallet or restore deleted fields. Existing reducer validation can remain, but publication and durable commit have explicit success/failure semantics. Flush queued storage operations before reporting success; a setter returning true can mean only queued.

For an Eyeolean purchase:

1. Capture profile ID, expected aggregate revision, canonical offer/version and stable operation ID. Re-read current balance/grants inside the serialized operation.
2. Reject deleted profiles, unavailable/incompatible offers, duplicate operations and already-owned content; resolve price from the catalog, never the button payload.
3. Produce one next aggregate containing debit, grant and idempotency record. Commit it atomically and await durable success.
4. Publish the committed state and show Owned. Retrying a completed operation is a no-op; failing a write leaves the prior durable state authoritative.
5. Preserve independent newer edits/rewards; never roll back an entire stale Redux snapshot after an asynchronous failure.

Do not put cosmetic grants in season consumable inventory. Compact display ledgers independently from operation deduplication. Address multi-tab stale writes with supported revision/locking behavior; at minimum detect competing writers and force reload rather than silently lose money. Local storage is not a secure server economy and is not promised to resist a user editing their own device.

Profile deletion removes its earned items, equipment and local records after flushing; it does not delete store-account cash licenses. Explain local-only earned progress and uninstall limitations. A failed save or restore is visible and recoverable. Before Eyeolean checkout opens, the ownership adapter must include the explicit launch grants from already verified permanent VIP licenses. An indeterminate VIP ownership refresh blocks affected purchases rather than charging for possibly included content; a previously reconciled valid offline license remains usable under the existing cache policy. CS-05 establishes this read path; CS-20 adds the new bundle and audited reconciliation. Do not defer all VIP grant recognition until after earned checkout is live.

## Preview, purchase and Apply

A draft binds to an owner and starting revision. New-profile selection stays in one parent creation draft until the full profile can be committed. It does not create a temporary billable profile or invoke new-season reset.

Preview may show locked content; it cannot write equipment/grants or affect gameplay. Incompatible eyewear is explained before selection. Switching character remembers valid per-character eyewear, or uses none with a clear notice. Ownership persists regardless of equipment.

A Market purchase grants ownership; cancellation of a later Dressing Room draft does not undo the purchase. Use 'Bought — Use in Dressing Room' after success. Recheck current ownership, compatibility and art revision on Apply. Guests can preview but must create/select a profile before earning purchases; no native purchase prompt during new-profile setup.

Use explicit portraitSource: character, photo or emoji, preserving the original photoId/emoji. Eyewear is suspended while photo/emoji is used, with saved selections retained. Frames and card backdrops can continue on their supported containers. Failed photos fall back safely without destroying the reference.

## Shared scene resolver and portrait composition

A central resolveAppearancePresentation(actorSnapshot, context) resolves explicit pack IDs before legacy AI paths. Context includes casual/formal body or portrait surface, current permitted mood and historical/live semantics. Apply deterministic precedence: a relevant live sad state wins over normal/grey treatment; otherwise grey presentations use presentationPortrait and main views use mainPortrait. Sad state never globally mutates pack selection. Archive views use stored scene context, not today's live Depression Shock flag.

Human character packs opt into sad portraits; photo/emoji retain existing behavior. Preserve AI remote overrides, twin aliases, fallbacks and status visuals. Unknown or unreadable pack assets use an accepted bundled fallback, report the content problem, and retain IDs for recovery rather than resolve another person by name. Paparazzi for a selected character resolves by ID from its saved snapshot, not profile name.

Compose accepted portrait bases and fitted eyewear using a shared 2D recipe when selection/state changes. Keep complete faces/bodies intact. Canvas composition is a delivery mechanism, not anatomical assembly. Store only selection IDs; composite URLs are derived and disposable. Native/image-only consumers may need asynchronous preparation, but all receive the same resolved output.

Key the bounded cache by character/pack/base/item revisions, state, recipe, material and output size; discard stale async results by actor/profile/selection generation. Hold main/grey/sad outputs for the current selection, not every store combination. Revoke object URLs and release bitmap handles. Never run composition every frame or inside each tile render. A failure preserves the previously applied portrait/equipment or disables Apply; it must not show a successful paid equip while silently omitting the item. ACCESSORY_PIPELINE defines fitting and fallback details.

## Runs, archives and appearance timing

Profile ownership and active run ownership are separate. Bind runs to saved profileId; do not identify a run by Player.id === 'user' alone. Carry appearance through player projections, minigame inputs, save compaction, hydration, guest adoption and restart.

Profile Apply persists the preference immediately. If a run belonging to that profile is idle at a tested boundary, update its human appearance without reset or game-stat changes. While a challenge/cinematic/transition owns presentation, queue the change for the next safe boundary and state that timing in the UI. A loaded run belonging to another profile stays unchanged. A resumed run reconciles the latest committed selection for that owner at its safe resume boundary; historical archives retain their own immutable snapshots. Coordinate EditProfile's existing direct updateUserPlayerIdentity/photo/avatar dispatch with the same captured-owner mechanism so it cannot bypass the safe boundary promised by Dressing Room.

Audit both archive writers/readers and After the Eye. New archives freeze pack/cosmetic revisions and relevant scene selection; old archives retain legacy behavior. Current wallet/ownership changes must not rewrite past appearances. Confirmed license revocation affects future live equipment at a safe boundary, never historical records.

## Market, economy and cash

Extend /store rather than create a second shop. Add Characters and Accessories shelves with stable query/deep-link state, compatible active-character preview, balance, Owned/Equipped/Free/locked labels and a return path. Preserve existing shelf aliases and VIP/mode/power behavior.

Provisional Eyeolean tuning, to be validated against src/economy/eyeoleans.ts: basic premium frame 5,000; eyewear 10,000/15,000; backdrop 10,000; character unlock 25,000. Current LOH win is 5,000, Safety win 4,000, Public Favorite 25,000 and winner 100,000. CS-16 must model early-eliminated, jury, finalist and winner outcomes and existing power spending before freezing these prices. These are design starting values, not live prices or a claim about average earnings. Buying never changes game stats.

Native cash offers use provider-localized prices and one explicit cosmetic collection. Exact product IDs/configuration are prerequisites, not invented values. An already wholly owned collection cannot be purchased again; partial ownership is shown, with no automatic prorating/refund promise. Native grants are not manufactured by generic VIP/debug effective-entitlement helpers.

Reconcile VIP launch grants explicitly from genuine permanent ownership, including any valid previously shipped developer/test semantics only as separately labeled preview. Restore/reinstall recovers the platform license, not local Eyeolean wallets. Store account changes, cancellation, pending, interruption, refunds/revocations and offline caches are explicit states.

CS-19 audits the installed plugin version and current native guarantees; current public docs alone cannot prove the installed bridge verifies or refreshes ownership adequately. If verification/reconciliation needs backend work, CS-19V must provide concrete backend/provider dependent tickets and complete them before CS-20. Real-money support remains disabled on unverified platforms. Web supports free/Eyeolean items and clear native-availability messaging; no simulated successful cash checkout.

## Performance and delivery

Use lazy routes, catalog metadata and visible thumbnails. Preload only currently needed portraits, one selected figure, and the next scene's assets when justified. Do not import/eagerly decode the entire roster into JavaScript.

Proposed 16 MiB total for all new/legacy character assets, portrait bases, layers, masks and initial decorations; retain current 8 MiB policy until CS-03 measures the proof and formally changes it. Proposed role caps: each body 400 KiB at 768x1152, each flattened portrait 40 KiB at 256-square, paparazzi 160 KiB at 768x1024, thumbnail 12 KiB at 128-square. Retain high-resolution sources outside public. Twelve maximum-size six-image packs plus thumbs would be about 12.8 MiB before optional layers/legacy files, so measure and deduplicate; not every file can hit its ceiling. Review scene aspect/crops in CS-00 before fixing policy.

Bound composite retention by both entries and estimated decoded bytes. A 256-square RGBA bitmap alone is 256 KiB; encoded WebP size is not decoded memory. Measure cold gallery, rapid switches, 20 equip cycles, 12 visible cards, scene transitions and native memory against baseline. Provisional targets on a named reference device: cached preview <100 ms, uncached local composition <300 ms after decoding, visible shell <1 s, no growing memory trend after repeated cycles. Report actual measurements, not unsupported cross-device guarantees.

## Ready means

A release candidate has 12 visually accepted six-image packs, all advertised accessory fits, eight free/four unlock access, profile creation selection, Dressing Room, reachable menu/Profile actions, Market purchases, durable ownership, all six scene paths, safe resume/archive behavior and passing focused/core checks. A free/Eyeolean candidate can be locally ready while native billing remains gated; never call that fully paid-release ready. Paid readiness additionally requires configured products, actual sandbox/restore evidence on supported native devices and cleared verification prerequisites. No deployment or store publication is authorized by this plan.
