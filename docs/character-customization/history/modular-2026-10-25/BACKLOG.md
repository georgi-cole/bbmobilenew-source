# Character creator implementation backlog

**Status: Stopped at the user's request.** MP-00's assembled characters were rejected on visual review. All MC, DR, PAY, and launch tickets in this document are on hold; none is the next authorized task. Keep the pilot as failed evidence only.

Revision: 25 October 2026. Intended implementer: Luna at extra-high reasoning, one ticket at a time. ARCHITECTURE.md and ART_BRIEF.md define the current product and art contract. The earlier static-preset CP-03 through CP-11 and LOOK-01 scopes are superseded by this backlog. CP-00, CP-01, and CP-02 retain their historical completion records; no completed work is represented as modular.

## Working rules

1. Inspect the working tree and applicable repository instructions before editing. This checkout contains substantial unrelated changes. Preserve them and do not reset, stage, reformat, or commit them incidentally.
2. Complete one ticket, run behavior-specific tests and appropriate visual review, record the results, then stop. A green typecheck does not prove art quality or paid ownership.
3. Before creating or updating a PR or pushing, run npm run check:pr after the final code edit. If package.json or package-lock.json changed, also run npm audit --omit=dev --audit-level=high. Do not bypass the pre-push hook.
4. Do not mark physical-device, payment-sandbox, or commercial artwork checks passed without corresponding evidence. Report unavailable checks honestly.
5. A locked preview never becomes an owned or applied item. UI prices are not an authorization source. Existing profiles, saved runs, and AI characters must keep working.
6. Keep profile ownership explicit. Never infer a saved run's owner from Player.id === user alone.
7. Update the ticket record with changed files, checks, visual evidence, limitations, and any commit/PR. Stop at the ticket boundary unless the user explicitly authorizes the next ticket.

## Historical work

| Ticket | Status   | Actual result                                                                                                                                              |
| ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CP-00  | Complete | Audited profile/run ownership, image consumers, assets, and baseline. See IMPLEMENTATION_NOTES.md.                                                         |
| CP-01  | Complete | Static preset catalog, WebP policy/validator, and targeted tests. See ASSET_VALIDATION.md.                                                                 |
| CP-02  | Complete | Four complete adult static cutouts with body/portrait/thumb exports and review evidence. See art-production/pilot/README.md. These are not modular layers. |

The prior plan's sixteen fixed-character launch and later outfit-per-character experiment are cancelled. Existing CP-02 assets stay available for compatibility and art comparison. The new ticket names avoid pretending the static preset schema already supports recipes.

## Delivery order

| Order | Ticket | Depends on               | Reviewable outcome                                                                      |
| ----: | ------ | ------------------------ | --------------------------------------------------------------------------------------- |
|     1 | MP-00  | CP-02, revised documents | Isolated modular art, colour/size controls, composer proof, and measured pilot evidence |
|     2 | MC-01  | MP-00                    | Production rig, part manifest, validator, free/premium metadata                         |
|     3 | MC-02  | MC-01                    | Bounded composer, exports, image cache, fallback                                        |
|     4 | MC-03  | MC-01, MC-02             | Versioned profile recipe, draft/apply, ownership validation                             |
|     5 | MC-04  | MC-02, MC-03             | Shared portrait/body presentation and legacy fallback                                   |
|     6 | MC-05  | MC-03, MC-04             | Starter gallery and Dressing Room with honest controls                                  |
|     7 | MC-06  | MC-03, MC-04             | Live player, saved run, profile-switch safety                                           |
|     8 | MC-07  | MC-04, MC-06             | Secondary consumer audit and archive snapshots                                          |
|     9 | DR-01  | MC-01, MC-05             | Cosmetic catalog, grant sources, try-on/equipment                                       |
|    10 | DR-02  | DR-01                    | Free starter cosmetics and compatible frames/backdrops                                  |
|    11 | DR-03  | DR-01                    | Atomic earned-Eyeolean purchase                                                         |
|    12 | DR-04  | DR-02, DR-03             | Store cosmetics section with truthful ownership                                         |
|    13 | PAY-00 | DR-01                    | Commercial principal/ledger/restore architecture against real deployment                |
|    14 | PAY-01 | PAY-00                   | Verified purchase and durable grant for one premium pack                                |
|    15 | PAY-02 | PAY-01                   | Restore, refund/revocation, offline and account reconciliation                          |
|    16 | PAY-03 | DR-04, PAY-02            | Paid UI, sandbox evidence, exact premium starter/pack behavior                          |
|    17 | MC-08  | MC-07, DR-04, PAY-03     | Reviewed launch library, performance/native QA, release gate                            |

The sequence prioritizes a usable creator and a real store foundation while protecting paid release behind verified ownership. Native paid checkout cannot be declared complete just because local Eyeolean purchases work. Content expansion may be prepared after the rig passes, but this execution queue still advances one ticket at a time.

## MP-00: Prove the modular rig and pilot

**Status: Rejected and abandoned after user visual review.** The functional proof was built, but the assembled characters did not meet the intended quality. Do not start MC-01 or any later ticket from this backlog.

**Scope:** Build an isolated, reproducible art/composition proof specified in ART_BRIEF.md: two distinct adult faces, two body silhouettes, three skin stops, four hair styles, three natural hair-colour stops, two complete outfits fitted to both bodies, one facial-hair option, and one glasses option. Provide at least two ready-made starter recipes. One item is marked locked for a simulated preview/access check. Do not add billing, persistence, production profile integration, or a public store.

**Deliverable:** An actual transparent layered rig with manifest/anchors/fit rules and a local interactive viewer or equivalent repeatable compositor; exported matching portrait/body images; source masters and reproducible export instructions; contact sheets and performance/byte measurements. An assembled person must look compatible with the game's cast style at real scene sizes. Dummy outlines, independently generated full-character swaps, or static precomputed combinations do not pass as modular proof.

**Acceptance:** A user can start from either recipe, change face, body step, tone, hair, hair colour, outfit, beard, and glasses within declared compatible combinations. The size control chooses an authored body/outfit fit. The colour control chooses approved stops and never colours clothing or changes facial shading unpredictably. Locked styling can be previewed, but a mock Apply rejects it without a grant; a free recipe can be applied/exported. Show all critical cross-combinations on dark/light/saturated backgrounds, a 72 px portrait circle, and the 390 by 844 full-body fit. Record collisions and supported fit restrictions rather than hiding failures.

**Validation:** Automated checks for part references, fit coverage, dimensions/alpha, colour stop legality, and locked/free behavior; visual contact-sheet review with source evidence; repeatable measurements of shipped pilot bytes and cold/warm composition in a narrow mobile browser. If device hardware is unavailable, mark native performance unverified. If credible art cannot be produced from the available source/creative tools, record exactly what failed and leave visual feasibility open; do not certify a schematic proof as production art.

**Boundary:** Stop and report after MP-00. The user will decide when to start MC-01.

### MP-00 completion record

Ticket: MP-00
Status: Rejected and abandoned — implementation evidence complete; visual feasibility, art provenance, and production performance were not accepted.
Base revision: `654cd9f627222c71a0192532932ebcce7c0c7514`
Changed files: `docs/character-customization/mp-00/**` (local viewer/compositor, catalog/model, reproducible layer exporter, 12 source masters, raster parts/masks, browser runner, contacts and measured evidence) and this `BACKLOG.md`. No production game flow, profile persistence, billing, store, or released static preset was changed by the pilot.
Behavior and art delivered: Two free starter recipes; two faces; two authored body steps with both outfits fitted; three approved skin stops; four hairstyles and three natural hair stops; beard, glasses, and locked braid try-on. The viewer exports body and matching portrait from the same recipe, permits free demo Apply, and rejects locked Apply while keeping the preview. Raster cache is bounded to four composition layers to avoid warm per-recipe eviction.
Targeted checks and results: `python docs/character-customization/mp-00/validate_art.py` passed for 24 referenced raster assets, hair layer alpha, exposed-skin masks, sampled clothing invariants, and face-value spread. `node --test docs/character-customization/mp-00/model.test.mjs` passed 4/4 tests. `node docs/character-customization/mp-00/run_browser_evidence.mjs` passed eight cross-combination exports, two starters, three skin stops, three hair stops, accessory fits, locked Apply rejection, free Apply, and zero browser console errors. `python docs/character-customization/mp-00/make_evidence.py` generated contacts and byte report.
Required PR gate result: Not run; no PR or push was created. `npm run check:pr` remains required before a future PR or push.
Visual/browser/native evidence: Review `docs/character-customization/mp-00/evidence/cross-combinations-{dark,light,saturated}.png`, `portraits-72px-circle.png`, `skin-stops-full-body.png`, `combinations/skin-skin-deep.png`, and `combinations/face-b-broad-lavender-straight.png`. The latest 390 × 844 Android Chromium emulation at DPR 2 / 3× CPU measured 812 ms cold and 16.8 ms warm; a second run measured 1052/20 ms. Desktop measured 424.2/6.3 ms. The four-entry cache retains 30.3 MiB estimated RGBA and the conservative temporary bound is 72.3 MiB. This is browser emulation only; no physical or native-device test occurred.
Commercial/ownership evidence: Simulated only. Locked braids can be tried on but cannot Apply; no billing, grant, transaction, or persistence is implemented.
Open limitations or dependencies: Visual acceptance is open. The art is more photographic/glossy than the softly illustrated `public/assets/Informal_attires/Nova_informal.png` cast; straight shoulder hair still ends bluntly; face/body tone and proportions vary across independently rendered combinations; some outfit/face pairs remain awkward. At 72 px both starters are identifiable but hair and facial detail lose definition. The cold cost and 72.3 MiB temporary bound are production optimization concerns, despite the improved cached warm result. Original image-generation prompts were not retained and commercial usage/rights were not reviewed; source-art provenance is a production-release blocker. No photographic-grade or native-device claim is made.
Commit/PR: None.
Next eligible ticket: None from this backlog. The user stopped the modular approach after reviewing the assembled art.

## MC-01: Lock the production rig and catalog

Turn the accepted pilot rig into versioned part IDs, offsets, mask/palette rules, fit restrictions, starter recipes, and free/premium catalog metadata. Keep the CP-01 complete-preset catalog separate. Extend validation to decode every modular layer and mask, check alpha/dimensions/path safety, enforce full body/outfit fit coverage and palette references, and record asset budgets. Test malformed catalogs, missing fits, retired revisions, and web/mobile base paths. Do not infer paid ownership from catalog data.

## MC-02: Compose and cache finished images

Implement a lazy editor compositor and body/portrait/thumb exports from one recipe. Keep a bounded IndexedDB cache keyed by recipe/art revisions and a safe fallback when composition or storage fails. Revoke URLs/release bitmaps, prevent stale selection A from replacing B, and measure memory and cold/warm latency. Outside the editor, normal game scenes load one final image. Verify cache miss, art update, eviction, offline restart, and low-memory/error recovery.

## MC-03: Save and validate profile appearance

Add a compact versioned recipe and portrait preference to StoredProfile without removing photoId or emoji. Validate part IDs, palette stops, compatibility, and effective grants at Apply; preserve valid temporarily unavailable saved references. Keep draft local to a captured profile. A persistence failure must not say Saved. Test old profiles, malformed recipes, profile A/B switching, locked Apply, Cancel, and restart. Do not store image bytes in localStorage.

## MC-04: Resolve body and portrait throughout shared components

Explicit human recipe outranks name-based AI matches; body uses the selected composed cutout while portrait respects the photo/character preference. Adapt shared image components and legacy avatar projection without breaking AI cast or special states. Test failed image load, rapid selection changes, missing revision, formal/informal scene, and web/mobile base paths. No player gameplay attributes change.

## MC-05: Build starter gallery and Dressing Room

Show 12 to 16 curated starter combinations when content exists; begin with pilot starters for development. Controls come from actual released art and include authored body steps and approved colour-stop sliders. Show free, owned, and locked states with try-on. Applying locked content leads to its offer or a clear blocked state, never silent free equipment. Validate mobile safe area, 72 px recognisability, narrow/desktop interaction, keyboard, screen reader, reduced motion, Cancel, profile switch, and missing art.

## MC-06: Bind profiles to live and saved runs

Use the verified profile-owned save/resume boundary from CP-00. A new season copies the profile recipe, a matching run updates only at a safe presentation boundary, and unrelated profile runs stay unchanged. Identity edits do not reset appearance. Test new season, resume, cinematic/deferred state, guest behavior, A/B profiles, every supported save slot, and unchanged game age/sex/stats/RNG.

## MC-07: Finish presentation and archive coverage

Audit all direct portrait/body consumers identified by CP-00, including minigame handoffs, finale, recap, and multi-eviction paths. Capture compact appearance snapshots in both archive writers. Test important supported scenes, existing photo preference, and old archives without a recipe. Document surfaces that cannot display cosmetics. Do not copy image bytes into archives.

## DR-01 through DR-04: Cosmetic store foundation

DR-01 defines compatible item slots, offers, free/earned/verified grants, and equipment validation, separate from gameplay-power inventory. DR-02 ships a small reviewed free starter set plus portrait frames/backdrops and verifies supported surfaces. DR-03 uses the existing Eyeolean wallet pattern for an atomic permanent cosmetic purchase; duplicate callbacks, stale profile dialogs, insufficient funds, and persistence errors cannot double-debit or fake durable ownership. DR-04 exposes Buy/Try/Equip/Owned states in the existing Store and checks current store/VIP/gameplay behavior. Only free and earned checkout is available until PAY tickets pass. Each ticket receives targeted reducer/UI/visual tests and required repo gates if a PR is prepared.

## PAY-00 through PAY-03: Verified paid packs

PAY-00 names the actual deployment, durable transactional ledger, purchasing principal, platform product IDs, restore/recovery rules, and VIP policy. It must resolve how one verified purchase reaches the user's local profiles across reinstall and account changes. PAY-01 verifies Apple/Google evidence server-side and grants one pack durably and idempotently. PAY-02 handles restore, refunds/revocations, offline verified cache, and principal changes. PAY-03 presents localized prices, pending/cancelled/bought states, preview/ownership, and sandbox proof on intended devices. No editable local paid flag or client-reported transaction grants premium access. Do not open native paid checkout until platform evidence and restore pass.

## MC-08: Expand, measure, and release

Produce the free inventory targets in ART_BRIEF.md and a selected premium pack inventory tied to the catalog. Review starters plus representative and high-risk combinations at actual game sizes. Record asset/package growth, mobile peak memory, composer latency, and cache recovery on named devices. Run targeted feature tests, the repository PR gate after final edits before PR/push, production/mobile build checks, store sandbox checks, and a full supported-surface visual matrix. Resolve or explicitly defer any failed art fit; no silent substitution of the sixteen static presets as modular coverage. Paid launch remains blocked unless PAY-00 through PAY-03 pass.

## Completion record template

Ticket:
Status: Not started / In progress / Waiting for dependency / Complete
Base revision and changed files:
Behavior and art delivered:
Targeted checks and results:
Required PR gate result, if applicable:
Visual/browser/native evidence:
Commercial/ownership evidence, if applicable:
Open limitations or dependencies:
Commit/PR, if applicable:
Next eligible ticket:
