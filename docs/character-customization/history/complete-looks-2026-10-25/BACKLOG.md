# Character looks implementation backlog

> Archived planning snapshot. Superseded by the [active Character Store plan](../../README.md) and CS tickets. Statements below describe the earlier scope; do not execute their CL instructions.

Revision: 25 October 2026. Handoff target: Luna with extra-high reasoning. The user selected complete-look image bundles and started CL-00. The four-look proof passed technical checks and awaits visual acceptance; CL-01 remains closed. The earlier MPFB feasibility failure is historical and does not block this selected route. See [the CL-00 result](evidence/CL-00/RESULT.md) for the active proof and prior attempt.

Read [LUNA_HANDOFF.md](LUNA_HANDOFF.md), [ARCHITECTURE.md](ARCHITECTURE.md), [ART_BRIEF.md](ART_BRIEF.md), and the dated findings in [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md). Old CP/MC/DR/PAY ticket instructions are superseded. MP-00 remains rejected.

## Execution rules

1. Work on one explicitly requested ticket, complete its relevant checks, report, and stop. For art batches, CL-07A and CL-07B are separate tickets. Do not start the next batch automatically.
2. Inspect git status and applicable AGENTS.md first. This checkout has extensive unrelated changes. Do not reset, stage, reformat, or fix them incidentally.
3. Before a PR, PR update, push, or a claim that repository validation is complete, run npm run check:pr after the final code edit. If package.json or package-lock.json is part of the change, also run npm audit --omit=dev --audit-level=high. Never bypass the pre-push hook.
4. Run relevant feature tests as well. An unrelated failing baseline is recorded, not hidden or silently attributed to this feature. CP-00's historical failure is a starting clue; reproduce current behavior before relying on it.
5. A passing image validator or typecheck cannot approve character art. CL-00 requires recorded user visual acceptance before CL-01. Art batches also end with visual review before proceeding.
6. Keep drafts out of public and shipped catalogs. Preserve rejected MP-00 only as historical evidence. Do not reuse its fragments, masks, compositor, or styling as the new source.
7. Keep native-device, purchase-sandbox, restore/reinstall, and commercial asset-rights evidence explicit. Mocked tests cannot replace them.
8. No new paid subscription, asset purchase, message to an artist, deployment, or store release is authorized merely by starting a local ticket. Prepare concrete local work and report any required external prerequisite.
9. If missing source art or a tool prevents the art result, report the exact requirement and partial evidence. Do not substitute another unreviewed approach or mark a failed visual gate complete.
10. Keep ticket evidence under docs/character-customization/evidence/<ticket-id>, with large image sources in the designated art folders. Record durable evidence paths, not temporary browser URLs.

## Delivery order

CL-00 is technically checked and awaiting the user's visual acceptance. All later tickets remain not started. Dependencies denote acceptance, not merely files existing.

| Ticket | Depends on                                                                      | Reviewable result                                                                                                      |
| ------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| CL-00  | This handoff                                                                    | Four coherent looks matching the existing cast style, with frozen masters, reproducible exports, and visual acceptance |
| CL-01  | CL-00 accepted                                                                  | Versioned identities/looks, compatibility adapter, asset validator and combined budget                                 |
| CL-02  | CL-01                                                                           | Central body/portrait resolver and shared component support using isolated fixtures                                    |
| CL-03  | CL-01                                                                           | Durable profile appearance with explicit ownership of the edit and free-only Apply                                     |
| CL-04  | CL-02, CL-03                                                                    | Free character and look chooser with photo/character portrait choice                                                   |
| CL-05  | CL-04                                                                           | Safe new-season/resume synchronization and profile isolation                                                           |
| CL-06  | CL-05                                                                           | Remaining presentation consumers and historical archive snapshots                                                      |
| CL-07A | CL-06, CL-00 source                                                             | First six accepted free identities                                                                                     |
| CL-07B | CL-07A accepted                                                                 | Twelve accepted free identities total                                                                                  |
| CL-07C | CL-07B accepted                                                                 | Eighteen accepted free identities total                                                                                |
| CL-07D | CL-07C accepted                                                                 | Twenty-four accepted free identities total                                                                             |
| CL-08  | CL-07D accepted                                                                 | Permanent cosmetic ownership and atomic earned-currency purchase                                                       |
| CL-09  | CL-08                                                                           | Profile/Dressing Room decoration and earned store section                                                              |
| CL-10A | CL-09                                                                           | First six accepted premium collection looks                                                                            |
| CL-10B | CL-10A accepted                                                                 | Twelve accepted premium looks total                                                                                    |
| CL-10C | CL-10B accepted                                                                 | Eighteen accepted premium looks total                                                                                  |
| CL-10D | CL-10C accepted                                                                 | Complete collection for all 24 launch identities                                                                       |
| CL-11  | CL-10D accepted                                                                 | Native payment design and verified release prerequisites                                                               |
| CL-12  | CL-11 and any resulting prerequisites                                           | One native non-consumable collection with purchase/restore/reconciliation                                              |
| CL-13  | CL-12 for paid release, or CL-09 for a deliberately limited free/earned release | Tested release candidate with explicit platform/content scope                                                          |

## CL-00 Prove source art and cast consistency

Execution status (25 October 2026): complete-image bundle proof is produced and passed technical asset checks; user visual acceptance is pending. The preliminary MPFB source/render test failed visual review and is retained as historical evidence only. Do not start CL-01 before the user accepts this pilot. See [the CL-00 result](evidence/CL-00/RESULT.md).

Outcome: two visibly different adult identities, each with one everyday and one premium evening look, rendered as four whole figures with matching portraits and thumbnails.

Work:

- Use the current cast only to check rendering, framing, and scene fit. Never reuse or recreate an existing character identity; do not supply a current cast face/body as an image-generation input.
- Produce two clearly adult identities aged 18–29, each with an everyday free look and a more expressive premium complete look. Preserve recognizable face/body identity across outfits. Avoid brand marks and text. No generated body-part assembly.
- Keep the proof under docs/character-customization/look-pilot. Retain full-resolution masters, prompts and lineage, rights/provenance notes, deterministic export steps, and complete visual evidence.
- Re-export from the frozen masters and verify byte-identical or pixel-identical output where supported. Record actual effort and output bytes before estimating the 24-character production work.

Validate: decode/dimensions/alpha/bytes for all 12 delivery images; visually inspect anatomy, identity continuity, distinction from the existing cast, cast style, silhouette, portrait crops, and actual-size scene placement. Compare with existing cast and test light/dark/saturated backgrounds. Label mocked placement and any untested native behavior honestly. Confirm the young-adult styling serves the primary 16–29 audience without depicting minors or making core representation premium-only.

Exit: report technical results and present the images for user acceptance. Do not add them to public, change app code, build a selector, or start CL-01. If artwork fails, the ticket remains visually unaccepted and the report names the smallest correction or artist prerequisite.

## CL-01 Define the complete-look catalog

Outcome: typed character identities, versioned complete looks, and trustworthy asset validation.

Likely files: src/appearance/types.ts, new look catalog/resolver modules, characterAssetPolicy.json, scripts/validate-character-catalog.mjs and its fixtures. Preserve the existing preset catalog's IDs and revisions.

Work:

- Implement the architecture's identity/look distinction and an explicit compatibility path for CP-01/CP-02.
- Use a new namespace for accepted looks. Admit only the user-accepted CL-00 files; do not expose all legacy experimental presets by default.
- Define new look asset paths under assets/characters with exact case, revision, and role. Resolve both /bbmobilenew/ and ./ base paths.
- Validate look-to-character links, one free default per selectable identity, duplicate revisions, complete triplets, allowed paths, full decode, dimensions, actual alpha, bytes, and retained revisions.
- Extend validation to total unique packaged character assets, including legacy content. Encode the proposed 16 MiB combined launch ceiling only with CL-00's measured evidence. Keep the existing 400/40/12 KiB per-file caps. Reserve up to 1 MiB for initial decorations and detect unreferenced candidate images accidentally left in the new delivery folders.
- Record how old revisions remain readable. Unpublished or unaccepted images must not enter public.

Validate: meaningful valid/invalid catalog fixtures, corrupt images, path traversal and case errors, missing defaults, cross-character looks, duplicate IDs/revisions, budget overflow, and web/mobile URL cases. Run validate:characters and test:character-catalog.

Exit: a small accepted catalog and explicit schema, migration, and byte report. No profile screen or payment integration.

## CL-02 Resolve body and portrait presentation

Outcome: explicit human looks display correctly through shared components without disrupting AI rendering.

Likely files: src/appearance presentation resolver, src/utils/avatar.ts, FullSizeCutoutImage, ResolvedAvatarImage, useResolvedAvatarSrc, and both PlayerAvatar components.

Work:

- Add optional typed appearance to relevant presentation inputs.
- Explicit human body uses the equipped look in casual and formal scenes; legacy AI retains its current attire behavior.
- Portrait preference selects character portrait or existing photo/emoji. Missing photo can use character portrait without deleting the photo reference.
- Reset image state when look/revision changes. Handle stale photo promises and decode errors.
- Preserve legacy callers, remote AI overrides, and existing status/selection visuals.
- Use isolated fixtures until CL-04 exposes the user flow.

Validate: photo plus body, human named Nova, AI Nova, missing/retired/invalid look, incompatible character/look, rapid switching, failed photo load, formal scene retaining equipped look, and legacy behavior.

Exit: component-level behavior plus comparison screenshots. No profile persistence or attempt to update every consumer in this ticket.

## CL-03 Persist profile appearance safely

Outcome: a profile can durably save a valid free selection without affecting another profile.

Likely files: profilesSlice.ts, profile persistence helpers, Player/types only where necessary for a defined contract, focused persistence tests.

Work:

- Add an optional versioned appearance field; coerce old profiles safely and preserve original photo/avatar.
- Capture profile ID at edit start. Validate IDs, revisions, compatibility, and free access at Apply. CL-08 later adds earned/paid grant sources.
- Expose persistence success/failure rather than swallowing storage errors.
- A failed write leaves the previous applied value intact and the draft available. A profile switch invalidates an old draft.
- Keep selection data small; no base64, body blobs, 3D data, or temporary object URLs in localStorage.

Validate: old/malformed records, round-trip, quota/write failure, unknown IDs, locked candidate rejection, A/B profile isolation, and stale draft Apply.

Exit: tested persistence API. No live game mutation based solely on Player.id === user.

## CL-04 Build the free chooser

Outcome: Profile leads to a usable character/looks Dressing Room.

Likely files: routes.tsx, Profile/EditProfile entry, a lazy-loaded chooser screen, scoped styling and UI tests.

Work:

- Use existing buttons, typography, dark/gold styling, and mobile navigation patterns.
- Show only accepted selectable identities and useful filters backed by catalog traits. Label filters as selection, not editable features.
- Preview one body and its matching portrait. Offer existing photo/emoji versus character portrait.
- Support draft, Cancel, Apply, persisted success, failure, and profile-switch cancellation.
- Do not expose unavailable sliders or imply independent hair/makeup controls.
- Initially expose free choices; any premium pilot preview is clearly unavailable and cannot be applied. Add checkout only through later tickets.
- Load visible thumbnails and one selected body. Do not preload the wardrobe globally.

Validate: select/filter/clear, empty results, keyboard and touch, cancellation, storage failure, profile switch, image fallback, narrow screens, and no locked Apply. Capture 360 px and 390 px screens beside existing Profile styling.

Exit: functional free chooser with bounded image loading; remaining season integration is clearly identified.

## CL-05 Bind appearance to the correct season

Outcome: a saved profile choice reaches the correct new or resumed run at a safe boundary.

Likely files: gameSlice.ts, HomeHub, ProfilePicker, saveStatePersistence.ts, saveStateCompaction.ts, store persistence wiring.

Work:

- Use explicit saved-profile ownership at new-season/resume/hydrate boundaries.
- Preserve appearance through compaction, autosave, hydration, reset, and restart.
- Do not assume all players with ID user belong to the active profile.
- Defer an active-run appearance change until the next safe profile-owned boundary unless a tested runtime owner binding exists. Explain this in UI.
- Do not replace an actor during an active cinematic.

Validate: profile A/B switching with saved runs, new season, reload/resume, reset, old saves, mid-cinematic edit, and an edit made while another run is loaded.

Exit: appearance follows the right profile without leaking or changing mid-event.

## CL-06 Complete consumers and archive snapshots

Outcome: all supported live surfaces use the selected presentation and new archives retain the historical look.

Likely files: the full consumer map in IMPLEMENTATION_NOTES.md, GameScreen/MinigameHost participant builders, GameOver, eliminatedSeasonResolutionMiddleware, archive types and readers.

Work:

- Refresh the consumer audit, including direct formal/informal candidate arrays and objects projected to id/name/avatar or id/name/sex.
- Cover WeekendInterlude, Vox finale, daily shock, power battle, Final3, Tribunal, FinalFaceoff, Jury reveal, recap, spectator, roster, and supported minigames.
- Pass appearance to body consumers. Preserve a compatible resolved portrait for portrait-only minigames.
- Add compact snapshots to both archive writers; preserve older archives and avoid reading historical appearance from today's active profile.
- Record a surface matrix: call path, attire behavior, photo behavior, metadata handoff, and test/evidence.

Validate: representative stage screenshots; human and AI side by side; portrait minigame projection; both archive writers; old archive; profile switch; changed current look leaving old archive unchanged.

Exit: no known unsupported live human presentation path silently loses the selected look. Any deliberate exclusion is documented before claiming release coverage.

## CL-07A through CL-07D Produce the free starter library

Each batch is one ticket with the previous batch accepted and completed first. The first batch may include the two accepted pilot identities, for a total of six, rather than creating six additional identities. First produce candidates and report them as awaiting visual acceptance. After the user accepts the batch, finish that same ticket by adding its approved files to the local release catalog and running the catalog checks. Then report completion and stop; acceptance alone does not start the next batch.

Work per batch:

- Use the accepted source scene and Art Brief.
- Deliver six identities' everyday looks and matching portraits/thumbnails; retain saved source identities for premium variants.
- Maintain the coverage sheet across all 24 planned identities.
- Check every item visually; compare extreme silhouettes in real scene fits.
- Record rights, source versions, per-file and combined bytes.
- Add only accepted content to the selectable release catalog. Draft renders stay outside public.

Validate: complete catalog validation, every identity/portrait pair, reference comparisons, circular crops, alpha backgrounds, and scene placement. Do not generate a new test suite merely to mirror image filenames.

Exit per batch: six accepted identities in the local release catalog with passing content checks, then stop. Pending visual acceptance is an intermediate state, not completion. CL-07D additionally confirms 24 distinct identities and no unsupported likeness claims.

## CL-08 Add permanent cosmetic ownership and earned purchases

Outcome: free access and earned ownership are separate from appearance and season consumables.

Likely files: new cosmetic catalog/grant helpers, profilesSlice.ts and economy integration, focused ownership tests.

Work:

- Implement CosmeticItem, explicit collection membership, supported surfaces, and ownership resolution.
- Store earned grants permanently per profile. Debit Eyeoleans and grant once in a single successful durable operation.
- Handle already owned, insufficient funds, stale request, repeated input, and persistence failure.
- Preserve grants across seasons. Do not place cosmetics in season-reset power inventory.
- Enable locked try-on, recheck Apply access, and keep preview state separate.
- Prepare a paid-ownership adapter contract; mocks/developer previews never persist a paid grant.
- Define collection-based identity switching and free fallback for unsupported characters.

Validate: atomic debit/grant, idempotency, no negative balance, restart survival, failed-write rollback, preview rejection, profile isolation, incomplete collections, and cross-character equip rejection.

Exit: earned cosmetics work locally; no real-money checkout yet.

## CL-09 Add profile decoration and earned store UI

Outcome: Profile and Dressing Room can display a small decoration set and purchase earned items truthfully.

Work:

- Create two frame designs and two profile-card backdrop designs in the game's dark/gold visual language: one free and one earned in each category.
- Keep all initial decoration assets within the reserved 1 MiB combined budget.
- Add supported-surface previews, ownership, equipped state, affordability, Cancel, and error handling to Store using existing UI patterns.
- Frames coexist with selected/evicted/VIP indicators and keyboard focus. Backdrops decorate the card/preview, not the pixels inside flattened portraits.
- Explicitly list Profile and Dressing Room as supported. Do not advertise stage effects or worldwide avatar decoration.
- Do not let a pending purchase equip an item on a different profile after switching.

Validate: status combinations, tiny portrait/focus readability, insufficient funds, repeated purchase, restore of local earned state after reload, profile switching, and supported-surface text.

Exit: a small usable earned cosmetics section with accurate previews. Animated effects and nameplates are deferred.

## CL-10A through CL-10D Produce the premium collection

Each batch adds six corresponding complete looks for the accepted identities, following the same candidate-review-then-local-catalog sequence and one-ticket boundary as CL-07. An accepted pilot premium look may count toward its matching batch; do not duplicate it merely to reach six.

Work per batch:

- Use each retained identity source to create its premium look.
- Preserve face/body identity; fit the entire outfit and authored hair/makeup/accessories.
- Export matching portraits/thumbnails, retain sources, and review every output.
- Add locked previews and explicit collection membership, but no live paid checkout.
- Keep the complete collection within the combined asset budget.

Validate: identity continuity, exact current-character preview, cross-character mapping, alpha/crops/scenes, catalog completeness, and bytes.

Exit per batch: after visual acceptance and local catalog checks, report completion and stop. Until acceptance, retain candidates outside public and report the ticket as awaiting review. CL-10D confirms all 24 launch identities, exactly described grants, and no unsupported claim about future identities.

## CL-11 Decide native payment prerequisites

Outcome: a short, actionable payment integration specification with proven prerequisites, before real checkout work.

Inspect src/vip/vipPurchaseService.ts, vipStorage.ts, vipConfig.ts, effectiveEntitlements.ts, vipSlice.ts, Store.tsx, and current native plugin/platform documentation. Reuse existing functionality where it satisfies the requirement.

Work:

- Trace actual purchase, acknowledgement, current-entitlement, restore, cached ownership, and release/debug paths. A verifiedAt timestamp is not proof of a backend verifier.
- Define one non-consumable collection SKU per supported platform, exact grants, provider-localized pricing, and local-profile sharing under the restoring store account.
- Decide verification/reconciliation requirements from actual plugin guarantees. Document required provider/backend configuration and any implementation gap.
- Specify pending/cancelled/failed transactions, replay, offline cache behavior, restore after reinstall, refunds/revocations, store account changes, and unsupported web behavior.
- Do not promise cross-platform ownership or introduce cloud accounts implicitly.
- If a backend/service or platform prerequisite is needed, split it into named, reviewable dependent tickets with acceptance criteria before CL-12. Do not hide it inside a generic checkout ticket.
- Record existing external configuration as verified, unverified, or missing; never invent configured SKUs or sandbox results.

Validate: source-backed flow analysis and a concrete platform test matrix. No real-money transaction or production publication.

Exit: reviewed implementation contract. CL-12 cannot start while its verification or platform prerequisites remain unresolved.

## CL-12 Implement one paid collection

Outcome: the complete collection can be bought and restored on each explicitly supported native platform.

Work:

- Extend the approved existing native flow and ownership adapter according to CL-11.
- Derive durable access from reconciled store ownership, preserve developer-only access separation, and apply explicit collection grants.
- Display actual provider price and current-character preview. Disable checkout when billing/product configuration is unavailable.
- Purchase and equip remain separate; asynchronous completion cannot modify another profile's draft.
- Recover from interrupted/replayed results. Successful restore after reinstall recovers the collection under the supported store account.
- Handle confirmed revocation at a safe boundary without overwriting historical archives. Failed network refresh alone must not erase ownership.
- Do not enable a real release on a platform without its prerequisite and sandbox evidence.

Validate: focused purchase-service/state/UI tests plus actual available iOS/Android sandbox evidence for success, cancel, pending, duplicate input/callback, interrupted app, reinstall/restore, offline use, and revoke/refund/account-change behavior supported by the provider tools. Report unavailable cases and keep the corresponding release path gated.

Exit: tested native purchase path with explicit supported platforms and unresolved external checks. No store publication.

## CL-13 Validate the release candidate

Outcome: a reviewable release candidate for the declared free/earned/paid scope.

Work:

- Re-run relevant catalog, profile, run, archive, presentation, and commerce checks against final content.
- Exercise web base /bbmobilenew/ and mobile relative paths ./; use isolated output directories to avoid overwriting another task's build.
- Compare gallery loading and representative gameplay with the pre-feature baseline on the same device.
- Measure packaged byte growth, requests, selected-image latency, and memory after 20 look switches. Check transition smoothness and bounded retention.
- Validate supported native targets on physical devices. Label emulated results separately.
- Confirm rights/provenance, complete advertised collections, accepted art batches, accurate supported surfaces, and no draft/MP-00 assets in new shipping directories.
- Run npm run check:pr after the final code edit; run the required audit if dependency manifests changed. Preserve unrelated work.

Exit: report completed checks, exact release scope, evidence, remaining risks, and any external readiness gap. A limited free/earned candidate cannot be reported as paid-release ready. Stop before deployment or store publication.

## Ticket completion report

Each report should state:

- Ticket ID and outcome: completed, awaiting visual acceptance, or blocked on a named prerequisite.
- Changed files and the user-visible result.
- Relevant commands/checks and actual pass/fail results; include unresolved failures.
- Visual evidence and whether the user has accepted it.
- Content count, shipped bytes, device/platform conditions when relevant.
- Source/art/commerce limitations that affect the next ticket.
- The next eligible ticket, without starting it.

Historical CP-00 through CP-02 records remain in their existing files. The old modular backlog is retained under history/modular-2026-10-25 and must not be executed.
