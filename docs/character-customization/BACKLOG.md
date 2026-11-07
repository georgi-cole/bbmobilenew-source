# Character Store execution backlog

> **Paused by the user on 26 October 2026.** The active request is now the fixed 15-character art roster in [`roster-15/README.md`](roster-15/README.md). Do not execute CS-02 onward or resume the CS-01 eyewear work until the user asks for integration/commerce after roster review.

Revision: 26 October 2026. Execution target: Luna with extra-high reasoning. **CS-00 candidate-01 art was accepted on 26 October 2026. CS-01's static artwork and technical evidence are prepared and awaiting user visual acceptance.** Existing CP/CL work is evidence/compatibility content only. Continue in dependency order; do not resume old CL-01 automatically.

Read [LUNA_HANDOFF.md](LUNA_HANDOFF.md), [ARCHITECTURE.md](ARCHITECTURE.md), [UX_FLOWS.md](UX_FLOWS.md), [ROSTER_PLAN.md](ROSTER_PLAN.md), [ART_BRIEF.md](ART_BRIEF.md), [ACCESSORY_PIPELINE.md](ACCESSORY_PIPELINE.md) and [ASSET_VALIDATION.md](ASSET_VALIDATION.md).

## Working rules

1. Work on one requested ticket. Complete its checks, report the exact outcome and stop before the next ticket. Each art batch below is separate.
2. Read applicable AGENTS.md and inspect git status. This checkout has extensive unrelated work; never reset, stage, reformat or fix it incidentally.
3. Before a PR/update/push or reporting repository validation complete, run npm run check:pr after the final code edit. Run relevant feature tests too. If package.json or package-lock.json is changed by the ticket, also run npm audit --omit=dev --audit-level=high. Never bypass the hook.
4. Art has separate technical and user-acceptance gates. A passing image validator does not approve identity, anatomy, alpha, style, fit or the business concept. Keep candidates outside public until their art is accepted. Report awaiting visual acceptance honestly.
5. Do not substitute MP-00 fragments, reuse an existing cast member, relabel streetwear as formal, or count incomplete packs as completed characters.
6. Record evidence under docs/character-customization/evidence/<CS-ticket>/. Retain source assets/prompts/lineage/hashes outside public and preserve old evidence.
7. No artist outreach, new paid service, asset purchase, real transaction, deployment or store publication is authorized by a local ticket. Prepare testable local work; report external configuration/device prerequisites.
8. Native sandbox, restore/reinstall, account-change and asset-rights checks cannot be replaced by mocks. A gated cash flow is not paid-release ready.
9. Do not implement future wigs, makeup/body sliders, interchangeable body garments, subscriptions, loot boxes, trading or cloud accounts as incidental scope.
10. Implementation choices are specified here to avoid repeated product questions. Ask only when an actual external prerequisite or contradictory evidence prevents completing the concrete ticket.

## Delivery order

Dependencies mean passing checks and any required visual acceptance, not simply files existing.

| Ticket | Depends on                         | Reviewable result                                                             |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| CS-00  | This plan + request to start       | Candidate-01 six-image pack; accepted 26 October 2026                         |
| CS-01  | CS-00 accepted                     | One eyewear design, two identities, six reviewed main/grey/sad fits           |
| CS-02  | CS-01 accepted                     | Versioned pack/item/fit/offer/appearance contracts and legacy adapter         |
| CS-03  | CS-02                              | Catalog/asset/compatibility validation and measured delivery budget           |
| CS-04  | CS-03                              | Durable profile repository, boot hydration and one write authority            |
| CS-05  | CS-04                              | Atomic Eyeolean debit + permanent cosmetic/character grants                   |
| CS-06  | CS-05                              | Inclusive profile presentation, optional identity and story compatibility     |
| CS-07  | CS-06                              | Central six-surface character resolver and shared image plumbing              |
| CS-08  | CS-07                              | Bounded portrait composer/cache with revision/state-aware results             |
| CS-09  | CS-08                              | Character choice during profile creation, including guest adoption            |
| CS-10  | CS-09                              | Owned-content Dressing Room and transactional Apply/Cancel                    |
| CS-11  | CS-10                              | Profile/Edit/Home/game-menu entries and coherent return navigation            |
| CS-12  | CS-11                              | Profile-owned season appearance synchronization at safe boundaries            |
| CS-13  | CS-12                              | Main/grey/sad/casual/formal consumers and minigame handoffs                   |
| CS-14  | CS-13                              | Historical appearance and After the Eye paparazzi integration                 |
| CS-15A | CS-14                              | Complete accepted packs 02–04, reusing prepared sources                       |
| CS-15B | CS-15A accepted                    | Complete accepted packs 05–08                                                 |
| CS-15C | CS-15B accepted                    | Complete accepted packs 09–12; eight free/four unlock roster                  |
| CS-16  | CS-15C accepted                    | Launch cosmetic artwork/fits, offers, Eyeolean tuning and exact grants        |
| CS-17  | CS-16 accepted                     | Market Characters/Accessories shelves and Eyeolean acquisition                |
| CS-18  | CS-17                              | Purchase-to-Dressing-Room continuity, local ready journey and UX hardening    |
| CS-19  | CS-18                              | Native billing/verification specification, VIP promise and provider readiness |
| CS-19V | CS-19 if required                  | Completed named verifier/provider prerequisites; no hidden dependency         |
| CS-20  | CS-19 and all CS-19V prerequisites | Native non-consumable bundle, explicit VIP grants, restore/reconciliation     |
| CS-21  | CS-20                              | Functional, performance, accessibility and supported-device release candidate |

Tickets CS-15A/B/C are not a request to generate all batches at once. If a later code ticket is not authorized yet, report the next eligible ticket rather than starting it.

## CS-00 — Complete one character pack — accepted

Outcome: candidate 01 has all six coherent scene images and a derived thumbnail. Existing casual/main sources were reused; new grey, formal, sad and paparazzi art was created. Technical package and user visual acceptance are complete. See [CS-00 evidence](evidence/CS-00/RESULT.md). The current four-look report is not this ticket's evidence.

Work: freeze identity sheet, retain masters/provenance, inspect actual grey/sad/formal/After the Eye framing, export six roles plus thumbnail, create side-by-side identity and cast-style review, and demonstrate real-size scene fits at 360/390 px and larger. Main/grey may share a foreground; do not assume a background swap reproduces a different pose/lighting. Confirm paparazzi aspect/resolution before policy. Record actual effort, cleanup and bytes.

Validate: full decode, true body alpha including haze on three backgrounds, framing, anatomy, same-person continuity, portraits at 32/48/64/72 px, deterministic export from frozen sources and complete source links. Label static mockups honestly.

Exit: technically checked art presented for recorded user acceptance; no runtime integration or new character production. Awaiting acceptance remains open.

## CS-01 — Prove independent portrait eyewear

Outcome: one original glasses design works on two original identities in main, grey and sad states (six reviewed fits).

Status: static pilot artwork, six per-state fits, evidence, and deterministic exports are prepared; **awaiting user visual acceptance**. See [CS-01 evidence](evidence/CS-01/RESULT.md). CS-00 remains accepted and unchanged.

Work: use 01 plus eligible 03 or another accepted second source. Prepare missing second-person portraits, retaining them for its later full pack. Candidate 02's baked glasses are excluded. Prepare intact-person portrait foregrounds, backgrounds, necessary hair occlusion masks, exact fits and a removable eyewear layer. Use shared vector artwork for appropriate geometry or an original raster master when needed. Keep faces/bodies intact. Show independent glasses + frame preview to demonstrate reuse without regenerating combinations; the frame can be a simple proposed free source.

Validate: all six fits, eyes/bridge/temples/hair, light/dark/grey backgrounds, tiny crops and direct comparison with the unchanged identity. Record fitted characters/state/revisions and output sizes.

Exit: source/fit contract accepted visually; do not scale to 12 people or promise wigs. If unusable, report the precise art prerequisite, not a passing technical-only proof.

## CS-02 — Define versioned catalog and selections

Outcome: typed immutable character packs, cosmetics, compatibility, collections, offers, profile appearance, ownership and archive snapshot contracts.

Likely files: src/appearance/types.ts and new pack/cosmetic/offer modules; profile/player types only where needed.

Work: implement the architecture's explicit six roles and distinct IDs/revisions; preserve CP IDs through an adapter and hide experimental entries. Admit only accepted pilot art. Define free access, slot occupancy, portraitSource, per-character eyewear, base revision, exact compatibility and supported surfaces. Separate free/earned/native/VIP ownership from selection, price and historical appearance. Define schema migration from discovered released versions. Native product identifiers remain unconfigured until provider work.

Validate: legacy reads, malformed IDs/revisions, retired revisions, cross-character fits, new packs missing roles, unsupported state/cosmetics, photo preference preservation and no ownership from unknown IDs.

Exit: small accepted catalog/contracts; no selector or fake paid grants.

## CS-03 — Extend content validation and policy

Outcome: build-time pack/layer validation and a truthful total asset report.

Likely files: scripts/validate-character-catalog.mjs, focused fixtures, characterAssetPolicy.json and export tools.

Work: validate six roles, full image decode, actual role formats/dimensions/alpha, safe case-correct contained paths, revisions, defaults, grant references, all advertised portrait-state fits, baked eyewear conflicts, mask/foreground sizes and SVG allowlist. Include all unique packaged legacy/new files and orphan detection. Measure CS-00/01 before replacing current 8 MiB policy with the proposed 16 MiB total. Count optional layers, retained revisions and decorations; no silent policy increase.

Validate: missing/corrupt image, opaque or empty-alpha body, transparent portrait, dimension/path/symlink/case failure, partial state fits, wrong art revision, duplicates, source drafts leaked into public, cap overflow and both /bbmobilenew/ and ./ paths.

Exit: validate:characters plus relevant catalog fixtures pass; production hooks cover the new catalog. A build validator remains distinct from aesthetic acceptance.

## CS-04 — Make profile persistence authoritative

Outcome: one durable profile/wallet/appearance/grant aggregate, safely hydrated at boot.

Likely files: profilesSlice.ts, store.ts, durablePersistence.ts, main.tsx, profile/save loaders and new profile repository.

Work: add boot ordering so durable initialization/profile hydration precede run construction and autosave. Preserve synchronous post-hydration loadActiveProfile consumers. Migrate old localStorage once with recovery and verification. Introduce serialized aggregate commits/revisions; route every profile writer through the authority, including existing rewards/powers/reservations, active-profile changes, create/edit/delete and future cosmetics. Remove/guard competing subscriber persistence. Expose commit/flush failure; do not report queued writes as durable. Handle multi-tab competition or explicitly enforce one writer.

Validate: existing profiles/cold boot/migration retry, empty-cache race, old active profile, failed storage open/write/flush, interrupted commit/restart, reward/power coexistence, concurrent edit and no resurrection after deletion. Preserve guest/run/archive behavior.

Exit: durable success/failure and writer semantics proven with existing regression tests. Do not implement a second wallet.

## CS-05 — Add permanent grants and atomic purchases

Outcome: one idempotent Eyeolean purchase operation commits debit and permanent grant together.

Work: capture profile/aggregate revision, canonical offer/version and operation ID; re-read balance/ownership inside serialization. Add grant/provenance records, free/owned checks, stable operation deduplication, ordinary rollback/retry semantics and explicit results. Establish the native-license read adapter and explicit launch grants for existing verified permanent VIP owners before earned checkout is enabled. Indeterminate VIP ownership blocks affected paid-in-Eyeoleans offers rather than double-charging; previously reconciled valid offline licenses keep their documented access. CS-20 adds the new bundle purchase/reconciliation. Profile deletion removes earned grants, not native license. No cosmetic inventory reset by season.

Validate: insufficient funds, duplicate tap/replay, two different concurrent spends, canonical price tampering, already owned/free item, verified-VIP included items versus unknown/debug entitlement, stale quote, storage failure, restart after commit, deleted/switched profile while pending, reward/power purchase racing the same wallet, old ledgers and operation compaction. No negative balances, partial debit/grant or stale whole-state rollback.

Exit: service/state tests prove durability and isolation; no checkout UI yet.

## CS-06 — Support inclusive profile presentation safely

Outcome: character art, optional gender/pronouns and story eligibility have separate meanings.

Work: add optional profile presentation metadata and neutral display fallback, coerce old records, extend create/edit payloads. Remove Male/Female as a mandatory creation condition while keeping legacy story fields separate. Persist distinct legacy/unconfigured/disabled/configured story-setup states: existing EditProfile's none-as-undefined must not collapse explicit opt-out and skipped setup. Define explicit capability precedence and both-capability role preference/prompt consistently across resolveProfileSex, pregnancy eligibility and SocialPanelV2; preserve binary fallback only for legacy records. Prevent user-by-name AI enrichment and avatar-to-age/sex/orientation assignments. Reuse the display-pronoun resolver in audited human copy. Do not infer queer identity from looks or change romance preferences implicitly.

Validate: profile with optional/no/nonbinary identity, pronoun round-trip and neutral copy, old Male/Female records, distinct disabled/unconfigured round-trips, explicit both/individual capabilities and unambiguous carrier preference/prompt, human named Nova, avatar switching with unchanged personal data, existing Cupid/pregnancy regressions and minor/adult eligibility boundaries. No new orientation simulation.

Exit: safe profile/presentation contracts ready for onboarding; report any unrelated preexisting story inconsistency rather than hide it.

## CS-07 — Resolve all character surfaces centrally

Outcome: shared rendering supports explicit main/grey/sad/casual/formal/paparazzi roles.

Work: implement selection/context resolver before legacy AI fallback; extend relevant presentation inputs/components without using player name as appearance ID. Cover FullSizeCutoutImage, ResolvedAvatarImage, useResolvedAvatarSrc and both PlayerAvatar variants. Define sad-vs-grey precedence, photo/emoji preference and normal fallback. Reset image failure state by selection revision; preserve AI remote overrides/twins/status visuals.

Validate: human selected character versus AI with same name, photo plus character figure, missing photo/asset, stale image promise, invalid/retired revision, rapid switches, sad user with photo/emoji fallback, AI regression and base paths.

Exit: isolated shared component fixtures and focused tests; full consumers audited in CS-13/14.

## CS-08 — Compose and cache portrait accessories

Outcome: a fitted item produces reusable main/grey/sad image outputs.

Work: implement ACCESSORY_PIPELINE recipes, tuple-versioned fits, occupied-slot checks, occlusion and approved color choices. Compose on selection/state change; expose resolved image output to image-only consumers. Bound entries and decoded bytes, release URLs/bitmaps, invalidate by revision and owner generation. Keep durable selection separate from derived cache. Implement offline bundled assets and explicit failure behavior; no remote canvas dependencies.

Validate: normal/grey/sad outputs, stale A/B completion, missing fit/mask/layer, baked glasses rejection, composition failure, reload without cache, photo mode suspension, 20 switches and cache cleanup. Compare actual outputs to accepted six-fit proof at avatar size.

Exit: reusable service/renderer with measured reference-device timings; no every-frame or per-tile recomposition.

## CS-09 — Add character choice to profile creation

Outcome: shared character picker is part of creating a saved profile.

Likely files: ProfilePicker, shared appearance picker/preview, routes/CreatePlayer compatibility.

Work: implement the two-step/draft flow in UX_FLOWS, free default, six scene preview and photo/emoji preference. Keep details/photo state across Back. Commit creation and valid appearance once; retain errors/draft. Converge /create-player, handle five-profile limit, guest browse and guest-run adoption without losing progress. No purchases during onboarding.

Validate: create selected/default character, previous step, Cancel, age-policy unchanged by art, storage/photo failure, guest adoption, profile limit, legacy route, keyboard/touch and 360/390 px. No ghost profile or orphaned staged photo after abandonment.

Exit: a new player can finish creation with a valid selected character using accepted fixture catalog.

## CS-10 — Build the owned-content Dressing Room

Outcome: lazy /dressing-room has Characters, Portrait accessories and Profile style.

Work: share picker/preview with creation; add All/Owned/Free filters, empty states, six scene previews, portrait-focused accessory preview, explicit incompatible/locked states and per-character eyewear. Implement captured-owner draft, Cancel, Apply, persisted success/error and photo/emoji suspension. Recheck ownership/revisions/compatibility at Apply. Locked preview links to exact Market item. Avoid unimplemented tabs/sliders.

Validate: free/owned selection, incompatible switch, clear item, source preference, unchanged/locked Apply, late save/profile switch/deletion, failed commit, filter clearing, Back with dirty draft, small-screen/safe-area/large-text layouts.

Exit: functional owned-content room with precise supported-surface labels; acquisition added later.

## CS-11 — Connect Profile and menus

Outcome: the room is reachable through existing user journeys.

Work: Profile shows shared image source and Dressing Room action; EditProfile keeps bio/photo and links to room without stale whole-profile saves. Add Home menu and in-game More entries, preserve nav locks/audio/focus and return route. No additional bottom-nav tab. Preserve existing switch/edit/Market destinations and old deep-link aliases.

Validate: Home/Profile/Edit/game entry and return, active challenge disabled navigation, no profile/guest prompt, header image/photo/emoji rendering, profile switch, local return allowlist and no season reset.

Exit: complete navigation map and screenshots integrated with existing style.

## CS-12 — Bind changes to the correct season

Outcome: profile appearance follows its own new/resumed run without disrupting play.

Work: carry snapshots through buildUserPlayer/reset/hydrate, save compaction/autosave, guest adoption and minigame projections. Explicit run owner binding. Apply at tested idle boundary; queue during cinematic/challenge and reconcile on safe resume. Replace/coordinate EditProfile's direct photo/avatar updateUserPlayerIdentity dispatch with the same captured-owner appearance timing path. Saved preferences can change while another profile's run stays untouched.

Validate: A/B profiles, the three-profile creation limit and legacy five-profile switching, new season, existing run, every supported mode, cold resume, old save, mid-cinematic Apply, queued change/restart, latest owned selection and no game-stat change. Preserve autosave suspension and the fixed gameplay identity in GameState.seasonContestant. EditProfile no longer updates the live contestant; add a cosmetic-only Apply path rather than restoring that dispatch.

Exit: tested synchronization and truthful queued-update UI; no forced restart.

## CS-13 — Cover live image consumers

Outcome: all advertised main/grey/sad/casual/formal appearances resolve correctly.

Work: refresh full source consumer map from IMPLEMENTATION_NOTES and audit projections/direct candidate arrays. Cover roster/profile/decision views, main game, Public Meter, minigames, reveal/elimination, Tribunal/finale, WeekendInterlude/Vox/Final3/Jury and spectator paths. Allow selected human packs in Depression Shock; preserve photo/AI behavior. Pass composed portrait URLs or snapshots as appropriate and preserve status rings/indicators.

Validate: actual representative scene screenshots main+grey+sad+casual+formal, human and AI side by side, tiny crops, selection/mood changes and image-only minigame participants. Record named unsupported deliberate exclusions before storefront wording.

Exit: surface matrix has code path, role, accessory scope, fallback and evidence for every advertised live consumer.

## CS-14 — Preserve archives and After the Eye

Outcome: completed seasons retain their historical appearance and paparazzi resolves by selected character.

Work: add compact snapshots to both archive writers/readers and participant handoffs; preserve legacy archives. Route paparazzi through pack ID/revision, not display name. Freeze old appearances despite later equipment/profile/license changes. Derive historical portrait state from archive, not today's Depression Shock.

Validate: both archive-writing paths, old archives, user renamed to AI name, changed current character, deleted profile behavior, photo-mode historical figure, paid item later revoked, missing retired asset and After the Eye card crops.

Exit: all six pack surfaces integrated with save/history evidence.

## CS-15A/B/C — Complete the 12-character roster

Each batch is a separate ticket: A completes 02–04; B completes 05–08; C completes 09–12. CS-00 supplies 01. Reuse accepted portrait work from CS-01 and the original sources; never generate a duplicate just to increase count.

Work per batch: correct source issues, freeze identities, author all missing six-state art, derive thumbnails, retain lineage, compare the roster at matched scale and verify diversity/access from ROSTER_PLAN. Add only accepted complete packs to local catalog. Keep four Eyeolean unlocks preview-only until purchase flow. Candidate 02 remains eyewear-incompatible unless separately approved replacement art is explicitly scoped.

Validate: full six-state identity continuity and scenes, alpha, art/rights records, all catalog checks, combined asset bytes, new-versus-AI distinction and user visual acceptance. Check mature/full-bodied and light-hair extremes in real fits.

Exit per batch: report candidates as awaiting acceptance; after acceptance, finish the same ticket's local catalog/checks and report completed. Then stop. CS-15C confirms exactly 12 accepted packs/72 roles, eight free/four unlock entries and genuine remaining gaps.

## CS-16 — Produce launch cosmetics and commercial catalog

Outcome: eight accepted cosmetics and exact compatible grant/offer mappings.

Work: finish three eyewear, three frames, two backdrops per architecture (four free/four unlockable), including optional free spectrum frame. Fit each eyewear to every promised eligible launch character in main/grey/sad; budget up to 11 eligible faces x three items x three states = 99 fit validations, with explicit exclusions and source reuse. Frames/backdrops keep their limited surface scope. Freeze pack/fit/item revisions, native bundle manifest and explicit verified-VIP launch grants. Model provisional 5k frame, 10k/15k glasses, 10k backdrop, 25k character prices against actual reward scenarios and existing Powers; document final tuning and centralize it.

Validate: all advertised fits/crops/occlusion, compatibility by exact tuple, frame/status/focus combinations, total bytes, deterministic sources, canonical grant completeness, free representation and late-added character not implicitly included. Reused pilot item counts toward three.

Exit: accepted launch art/catalog/prices; no invented provider prices or empty cosmetics categories. If universal fitting cost is too high, reduce clearly declared supported characters before sale, not after purchase.

## CS-17 — Extend Market and Eyeolean checkout

Outcome: /store Characters and Accessories shelves support permanent earned purchases.

Work: reuse current shelf/details patterns and shared preview; add durable query/deep-links, compatible-character filter, Free/Owned/Equipped/price, exact portrait-only/surface wording, active-profile balance and supported character lists. Capture profile/offer for confirmation, invoke CS-05 purchase, show Owned only after commit, then Use in Dressing Room. Existing VIP/modes/Powers remain working. Cash bundle previews remain gated pending CS-20.

Validate: already owned/free/insufficient funds, duplicate/concurrent purchase, canonical quote changes, pending profile switch/deletion, failed persistence, incompatible item, partial collection, exact return shelf/filter, guest state and unchanged legacy power/VIP purchases.

Exit: working local permanent Eyeolean acquisition for characters and accessories.

## CS-18 — Finish the local user journey

Outcome: new profile -> free character -> season -> earned purchase -> equip -> resume -> archive is seamless.

Work: preserve room draft/context across Market, explicit purchase versus Apply, ownership survives Cancel, account scope messaging, offline content, placeholders/errors, large text, keyboard/screen-reader flow, mobile safe areas and back navigation. Run performance checks on current full catalog. Resolve discovered UX gaps; do not add new art/features.

Validate: E2E paths from Home and game menu, three current profiles and legacy five-profile installs, guest adoption, photo/emoji, nonbinary optional identity, eyebrow/glasses visible at gameplay sizes, 20 swaps, disabled scene navigation, wallet failures and all six views. Capture 360/390/larger evidence. Run targeted regressions and required repository checks after final code edit.

Exit: local free/Eyeolean ready candidate, with native paid scope explicitly still gated.

## CS-19 — Specify and prepare native commerce

Outcome: current bridge guarantees, VIP inclusion, product/config prerequisites and a device-test matrix are concrete.

Work: audit installed @capgo/native-purchases version/source and current service, acknowledgement, verified transaction/current ownership, restore, offline, store-account changes, pending, revoke/refund and debug paths. Confirm explicit shared-local-profile license semantics and launch VIP grant mapping preserving existing promises. Define one non-consumable cosmetic bundle, provider-localized metadata and exact grants; no implicit future coverage. Record each platform product/config as verified, missing or unverified. Define complete verification/reconciliation architecture using current primary provider docs.

If backend verification or provider support is needed, create a concrete dependency list in evidence with endpoints, credentials/config owners, idempotency, native proof inputs, revocation/account binding and tests. Do not merely label verification out of scope or declare paid-ready based on mocks.

Validate: source-backed flow analysis, exact product/grant mapping, unavailable-web behavior, partial ownership policy, platform sandbox matrix and acceptance of commercial wording.

Exit: implementation contract and explicit prerequisites. No real charge, store publication or new subscription. CS-20 is blocked until prerequisite work is complete.

## CS-19V — Complete conditional commerce prerequisites

Run only if CS-19 identified actual missing verification/provider capabilities. That ticket must split any substantial backend work into separately named dependent sub-tickets with concrete scopes; execute only the requested one at a time.

Work: implement and validate the specified verifier/reconciliation/provider prerequisites in the existing approved stack, preserving secrets outside client bundles. Prepare reviewable local changes first. External credentials/deployment/product approvals require their actual owner; do not fabricate success.

Validate: purchased/pending/replayed/forged/expired/revoked proof cases, product/platform/account binding, idempotent grants, retry/outage/cache rules and required backend checks. Preserve supported local-only functionality while paid path stays gated.

Exit: all named prerequisites verified; otherwise report exactly what is unavailable. No generic 'backend later' loophole.

## CS-20 — Add the native bundle and restore

Outcome: supported native platforms can buy/restore the launch bundle with truthful permanent access.

Work: extend existing billing service/ownership adapter under CS-19 contract; explicit native license/VIP maps, provider price and product availability, durable reconciliation, separate purchase/equip and restore CTA. No generic effective-entitlement shortcut or developer preview as ownership. Handle cancel, pending, failure, interruption, replay, reinstall/restore, refunds/revocations, offline cache and store-account changes. Prevent wholly owned bundle re-purchase; disclose partial ownership with fixed provider pricing. Web never simulates ownership.

Validate: focused service/state/UI tests plus actual available iOS/Android sandbox evidence and cold reinstall/restore. Test licenses across local profiles/deletion, existing permanent VIP, debug flags, no wallet double-credit, pending profile switch and historical archive preservation. Unavailable native cases remain release-gated.

Exit: report exact supported paid platforms and external gaps. If sandbox/verification remains unavailable, do not mark native readiness complete.

## CS-21 — Validate the full release candidate

Outcome: fully usable Dressing Room and Market for the declared supported release scope.

Work: verify 12 complete accepted packs, all advertised eight cosmetic items/fits, exact free/earned/native/VIP grants, navigation, inclusive optional identity, no unaccepted sources in public, asset rights/provenance and full saved journeys. Compare package size/loading/composition/memory to baseline on named web/native devices, using isolated build outputs for /bbmobilenew/ and ./. Validate physical-device behavior; label emulator/mock evidence separately.

Validate: focused catalog/profile/appearance/economy/presentation/archive/commerce tests and core E2E; cold start/migration/offline/reinstall/restore; 20 switches with bounded cache; accessibility/narrow layouts; no regression to existing VIP, Powers, season lifecycle or AI. Run npm run check:pr after the final code edit, and required production dependency audit when manifests change.

Exit: final scope/evidence report, completed checks, measured bytes/performance, unresolved external risks and native sandbox state. A limited free/Eyeolean release can be reported ready only for that scope. Full paid-release readiness requires every configured native prerequisite and test; stop before deployment/publication.

## Ticket report format

State ticket and completed/awaiting acceptance/blocked status; files and user-visible result; exact tests/commands and real results; visual evidence and recorded acceptance; content count and actual bytes; device/platform conditions; unresolved prerequisites; next eligible ticket without starting it. Do not call an implementation ready because its plan is complete.
