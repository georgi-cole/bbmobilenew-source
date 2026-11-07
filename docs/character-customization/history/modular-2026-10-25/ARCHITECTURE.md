# Modular character creator and Dressing Room architecture

**Status: Abandoned at the user's request after MP-00 visual review.** The assembled combinations were rejected. This document is retained as a record of the explored approach, not an approved implementation plan. Do not start MC-01 or produce more modular art from this rig.

Planning revision: 25 October 2026. This document supersedes the static-only R1 proposal after CP-02. CP-00 through CP-02 remain completed historical work; the four complete cutouts and the preset validator are real assets, but they do not prove that interchangeable artwork works. Execution and acceptance are in BACKLOG.md; the art contract is in ART_BRIEF.md.

## Product contract

A player may start from a ready-made adult character and alter it until it feels personally recognisable. The starter is a saved recipe of parts, not a separate face that can only wear its own clothing. Show a small, diverse starter gallery first; tapping Customize opens the Dressing Room with that recipe. The four CP-02 complete cutouts may remain legacy quick-start choices or visual references while modular art is developed. They cannot silently be declared modular.

The basic identity promise needs a useful free range of facial structures, skin tones, body silhouettes, natural hair textures and colours, adult age appearances, facial hair, and common glasses. The store sells additional range and expression: fashion hair, makeup, eyewear, jewellery, clothing, accessories, frames, backdrops, and supported visual effects. A locked item may be previewed but never applied or persisted as equipped without a valid grant. Show ownership, price, currency, and supported surfaces before purchase. Distinguish earned Eyeolean unlocks from verified real-money purchases. A ready-made character must remain usable without purchase; a premium starter's locked parts are only a preview until obtained.

Do not claim photo-accurate reproduction. A controlled two-dimensional, fixed-pose assembly can offer recognisable stylized likeness. User photos remain an optional portrait source, never an automatically converted body or a source for undeclared image generation. Appearance does not alter Player age, sex, stats, gameplay, or biography.

## Current game boundaries

The app uses React, TypeScript, Redux Toolkit, Vite, and Capacitor. Existing profile records are in localStorage; imageDb.ts stores blobs in IndexedDB. Saved runs are profile-scoped at the snapshot boundary, while Player.id is the common value user across profiles. Appearance Apply must carry an explicit profile ID and only affect a known matching run at a safe boundary. See IMPLEMENTATION_NOTES.md for the CP-00 consumer map and baseline. The four released static presets in src/appearance and public/assets/characters remain validated compatibility content. No game screen currently assembles layered human characters.

Existing portrait and body components, AI cast aliases, and archive writers remain integration constraints. The explicit human appearance recipe has priority over name-based AI lookups. A portrait can use either the composed character or the existing photo/emoji preference; a full-body view uses the composed character when a recipe exists. A missing part or failed composition gets a stable bundled fallback and a recoverable error in the creator. Never substitute an uploaded rectangular photo as a full-body cutout. Both web base path /bbmobilenew/ and mobile relative base path ./ must work.

## Appearance and commerce data

Introduce a separate versioned modular catalog; do not reinterpret the released static CharacterPreset JSON as layers. A compact selection contains schemaVersion, rigId, part IDs, bounded colour-token IDs, outfit ID, portrait preference, and the art revisions needed to reproduce it. Store only IDs and small values in profile and Player/save snapshots. The catalog describes file paths, anchor offsets, draw order, masks, compatible rigs/body fits, default free grants, and accessory slots. Body silhouette is a chosen authored size step; an optional slider is a UI for those steps, not a request to stretch one picture. Hair length likewise chooses authored styles.

A slider may be shown for skin or natural hair colour only if a tested colour map supports a useful range. The UI snaps to approved palette stops and saves the stop ID. A premium extended palette can have its own separately granted tokens. An unconstrained RGB/HSL slider would produce implausible skin and muddy shaded hair; do not expose it until a proof demonstrates reliable output. Eye and makeup colour controls likewise require isolated masks and size-appropriate visible results. No slider is promised merely because the UI can render one.

Small continuous adjustments may be useful for an accessory's position or scale, or for makeup opacity, if the pilot proves a safe range across the relevant faces. Save bounded numeric values and test the extremes. Such controls do not turn a fixed raster body into continuous anatomy editing. Keep a premium item's adjustable parameters available only while the item has a valid grant; locked previews remain drafts.

A starter recipe references the same catalog parts as the editor. A cosmetic item is separate from a store offer and from a grant. The item declares category, slot, compatible rig/body shapes, render layer, display surfaces, and preview assets. A grant has a source: free, earned, or verified purchase. Effective ownership is derived from grants, never a user-editable paid boolean. Price and currency belong to the offer, not the artwork. Existing Eyeolean balances are profile-local; real-money restoration needs a verified durable purchasing principal and transaction ledger, addressed by PAY tickets before paid checkout.

Missing or retired catalog entries must not erase a valid saved choice. Keep old released art revisions resolvable for saved seasons, or document a migration to visually equivalent replacements. Unknown item IDs never imply ownership. Incompatible or revoked equipment falls back to a free default for rendering while retaining the underlying selection for possible recovery. Draft preview may use locked parts; Apply validates every part and grant again against the captured profile.

## Art rig and composition

Use one canonical 2:3 canvas, upright pose, camera, lighting, head and neck anchor, and feet baseline. Head/face, back hair, front hair, brows, facial hair, glasses, accessories, and the body/outfit fit occupy declared layers. Hair needs front/back components where it crosses shoulders. Face bases may vary within a controlled hairline and neck envelope; extra fit variants or anchors are required where a part cannot align across faces. Age should be authored in real face structures and details; a universal wrinkle filter is insufficient.

The first clothing unit is a complete outfit fitted to each supported body silhouette. Do not promise independently interchangeable tops, trousers, sleeves, and shoes until fitting is demonstrated. Clothing and skin masks must include visible hands, ears, neck, and other exposed regions. Tone mapping must preserve highlights and shadows and avoid halos at joins. Keep the production masters and masks outside public; ship trimmed alpha layers and manifest offsets where useful. Derive portrait and thumbnail from the same selected composition.

The composer loads only selected layers. In the editor it renders after a meaningful selection change, not every animation frame. On Apply, export body and portrait blobs, store them in a bounded IndexedDB cache keyed by a deterministic recipe/art-version hash, and render ordinary image URLs in gameplay. Regenerate on a cache miss. Revoke object URLs and close decoded bitmap resources when unused; limit in-flight compositions and clear stale previews. The existing imageDb helper is a starting point, not a finished bounded cache. Use a normal canvas fallback if worker/offscreen support is missing. The final still image keeps game-scene cost close to the current cutout path, while the editor's decode and compositing memory must be measured.

## Performance and delivery decisions

Measure modular asset bytes separately from generated cache bytes, peak editor memory, composition latency, restart/regeneration time, and installed mobile package growth. A 768 by 1152 RGBA canvas alone is about 3.4 MiB decoded; simultaneous layer and intermediate allocations add to that. Preload visible starter thumbnails only and one active body. Current global preload helpers retain links and must not receive the whole wardrobe. The route is lazy-loaded. Catalog files may be bundled for offline use initially; Vite still copies public assets into the native package, so lazy loading does not solve package size. Remote asset packs need integrity, versioning, and offline rules and are deferred until measured growth requires them.

The modular pilot must measure representative desktop and narrow mobile-browser behavior and explicitly state whether physical-device testing happened. Do not claim native performance from browser emulation. Keep quality targets provisional until the pilot measures the actual rig and device class.

## Player flow and save lifecycle

Open Profile -> starter gallery -> Dressing Room. The first preview is local draft state. Free controls work immediately. Locked choices show a try-on and a route to a matching offer, with no silent charge. Cancel restores the saved look; Apply validates, composes, then persists the small recipe for the captured profile. A failed write leaves the draft and reports failure. Profile switching invalidates another profile's draft. Returning players can keep their current photo/emoji-only presentation.

A newly started season copies the profile recipe into its Player presentation snapshot. A saved run resumes with the active profile's currently applied look only at the known profile-owned resume boundary. Editing during a cinematic must not replace its actor mid-event. New completed archives capture a compact appearance snapshot at both existing archive writers; older archives remain unchanged. The compatibility Player.avatar field can hold the derived portrait URL or existing photo token, but the recipe remains the source of truth for full-body presentation.

## Release sequence

1. MP-00 proves the modular art rig, composition, colour stops, body-fit steps, preview/access boundary, and measurable output with a small isolated pilot. It is a proof, not a store release.
2. MC tickets turn that proof into catalog validation, bounded composition, profile persistence, starter flow, shared presentation, archive support, and the reviewed free launch range.
3. DR tickets add compatible cosmetic catalog/equipment and earned Eyeolean purchases and expose a truthful store section.
4. PAY tickets define and implement verified paid ownership, restore/revocation, then release premium packs after sandbox and device evidence.

The intended launch content target is twelve face bases, four body silhouettes, around ten approved skin stops, sixteen hair styles plus bald, eight hair-colour stops, six facial-hair styles plus none, six brows, three complete outfits fitted to four bodies, and a small glasses set. These are estimates to revise after MP-00. They imply dozens of reusable parts and fitting/mask exports, not dozens of fixed identities. Preserve broad free identity coverage before reserving premium fashion variants. Never expand the launch art count without a combination review at actual 72 px profile and full-body scene sizes.

## MP-00 evidence and resulting constraint

The isolated MP-00 viewer demonstrates that a recipe can assemble reusable face, hair, outfit, and accessory layers, export matching images, and prevent a locked preview from being applied. Its generated masters came from separate image renders. Their combined art still shows inconsistent face/body proportions and tone, blunt hair ends, and a finish more photographic than the existing cast. This is a source-art and rig issue, not something a larger catalog or more UI controls will fix. Production art needs one shared authored character template or an offline rig/render source that fixes camera, anatomy, lighting, and clothing joins across parts; it must preserve source provenance and rights review.

MP-00 measured roughly 0.8–1.1 seconds cold and 17–20 ms warm in throttled phone-sized Chromium emulation with a four-layer cache. The estimated retained RGBA is 30.3 MiB, with a 72.3 MiB temporary upper bound before browser/GPU overhead. This is not a physical-device result. Before scaling content, reduce cold composition and peak memory, then test a named low-end target phone. MC-01 remains gated while these art and device questions are unresolved; the detailed evidence is in mp-00/README.md.
