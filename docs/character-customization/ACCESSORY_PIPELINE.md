# Character pack and portrait accessory pipeline

Revision: 25 October 2026. Implementation specification for the character-pack and portrait-cosmetic direction requested by the user. Read with [ARCHITECTURE.md](ARCHITECTURE.md), [ART_BRIEF.md](ART_BRIEF.md), and [BACKLOG.md](BACKLOG.md). This document does not implement or approve artwork. MP-00 remains rejected; its generated head/body assembly, masks, and anatomy controls must not be reused.

The first release offers 12 complete character packs (eight free and four permanent Eyeolean unlocks) and eight precisely scoped cosmetics. An existing complete image remains a valid character-pack asset. Independent glasses are an optional extension for artwork explicitly prepared and reviewed for it. Wigs, interchangeable full-body garments, makeup controls, face sculpting, and body sliders are outside this release.

## 1. Six-image character contract

Each selectable released identity has a versioned pack with six primary images. The casual figure is also the store's character preview; a store thumbnail is a derived delivery image, not a seventh creative scene.

| Asset role             | Purpose                                                     | Accessory behavior in the first release                                        |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `casualBody`           | Everyday full figure and store/Dressing Room figure preview | Complete authored image; portrait accessories do not change it                 |
| `formalBody`           | Formal scenes                                               | Complete authored image; portrait accessories do not change it                 |
| `mainPortrait`         | Black/gold main gameplay portrait                           | Accepted fitted glasses may appear                                             |
| `presentationPortrait` | Neutral/grey presentation portrait                          | Accepted fitted glasses may appear                                             |
| `sadPortrait`          | Depression Shock portrait                                   | Accepted fitted glasses may appear when the scene resolver requests this state |
| `paparazzi`            | After the Eye/tabloid image                                 | Complete authored image; portrait accessories do not change it                 |

The catalog resolves these roles directly from a stable character ID and pack/art revision. Do not infer identity from a player's editable name, derive a new asset role by string-replacing a URL, or use the current active profile as the identity of a historical actor. Preserve the pack and cosmetic selection in season/archive appearance snapshots.

`mainPortrait`, `presentationPortrait`, and `sadPortrait` form the first supported portrait-state set. A context/surface is separate from an emotional state: a main roster requests the main treatment, a grey presentation requests the presentation treatment, and Depression Shock can request sad artwork according to the central resolver's documented precedence. Do not compose a second normal portrait over a sad state. Audit the current human-player exclusion in sad resolution before claiming the new sad pack asset is supported.

The pack may ship ordinary flattened portrait fallbacks. A character is eligible for independently fitted glasses only after its optional portrait-layer resources meet the contract below. A complete pack can be sold without claiming accessory compatibility.

## 2. Exact launch surface scope

The eight launch cosmetics have three product scopes and four free/four unlockable items:

| Kind                  | Total | Free | Eyeolean unlocks | Supported surfaces                                           |
| --------------------- | ----: | ---: | ---------------: | ------------------------------------------------------------ |
| Portrait eyewear      |     3 |    1 |                2 | Explicitly fitted character main/grey/sad portrait consumers |
| Outer profile frame   |     3 |    2 |                1 | Profile and Dressing Room portrait containers                |
| Profile-card backdrop |     2 |    1 |                1 | Surrounding Profile and Dressing Room cards                  |
| Total                 |     8 |    4 |                4 | Exact item-level surface records remain mandatory            |

One of the two free frames may be the optional spectrum/pride design, usable by anyone. It counts as one of the three frames, not an additional item. The four unlockable cosmetics are individually purchasable with Eyeoleans or together through the single proposed native bundle; native availability and verified-VIP grants follow ARCHITECTURE and the gated commerce tickets. Trying on an item never grants ownership.

- **Profile frames** decorate the Profile and Dressing Room portrait container only. They are interface decoration outside the portrait image. They do not automatically decorate gameplay roster tiles, decision modals, minigames, figures, paparazzi photographs, or archived scenes. A later ticket can add a named surface after its status/ring/accessibility checks pass.
- **Portrait glasses** decorate the equipped character's main, grey, and sad portrait image on the supported character-portrait consumers listed in the release surface matrix. Once composed, the result remains a single image compatible with image-only consumers. The first release excludes full figures, paparazzi images, uploaded photos, emoji, and legacy cast art without an explicit fit record.
- **Profile-card backdrops** decorate the surrounding Profile and Dressing Room card. They do not replace the authored background inside main/grey/sad portraits, change scene stages, or appear behind figures in gameplay. They are container decoration, not a portrait compositor background slot. They can remain active when photo/emoji is the portrait preference.

Store cards and details must state this in plain language. Example: "Portrait glasses — supported character portraits in Profile, gameplay and the Dressing Room. Does not change full figures or After the Eye photos." Show the exact supported character list and previews for main, grey, and sad before purchase. A profile-frame or backdrop card says "Profile and Dressing Room". Do not label these products "works everywhere" or "complete outfit".

The implementation backlog must enumerate actual consumer call paths and record evidence. Having an entry in a compatibility table does not prove that every React component, minigame participant builder, fallback path, or archive reader uses the resulting image. Unimplemented surfaces remain excluded from the storefront promise until covered.

## 3. Authoring bases for portrait accessories

Existing opaque portraits contain background, hair, face, and clothing in one flattened image. They are not a set of interchangeable facial parts. Most glasses can be placed over such an image, but a reusable, correctly occluded accessory pipeline needs explicit foreground resources; do not mistake an opaque background for transparency.

For each compatible character, art revision, and portrait state, retain:

1. A complete accepted portrait fallback.
2. A transparent portrait-person foreground with the accepted face, head, hair, neck, and visible clothing intact. This is one complete person image, not an independently generated head/body assembly.
3. The authored background treatment for that state.
4. Only where needed, an occlusion mask that restores the original hair/ear/face pixels in front of glasses temples or another overlapping accessory part. The mask is derived/authored for the same frozen foreground, never a replacement face.
5. A reviewed fit record in the normalized portrait coordinate system.

Extraction must preserve original identity, expression, hair shape, lighting, and edges. If extraction or generative editing changes the face, it is a new art revision needing identity and visual review. Do not overwrite the original fallback. If a clean transparent foreground cannot be obtained, keep that revision ineligible and name the art correction required.

Main and grey should preferably use the same accepted person foreground with separately authored background treatments. This improves consistency and allows fit coordinates to be shared explicitly. The sad person foreground preserves framing, camera, scale, and head pose while changing the expression. Its fit is still reviewed separately: expression edits can move the eyes, brows, cheeks, and ears. Existing grey portraits with a different pose need their own frozen foreground and fit.

The face/shoulder composition must pass 32, 48, 64, and 72 pixel circular crops as well as the full square. A glasses bridge and lenses must fit the face without covering the eyes completely, blending into brows, crossing hair incorrectly, or turning into illegible noise at gameplay size. Avoid excessive rim thickness and tiny decorative details that only look good in a large preview.

## 4. Slots and conflict rules

Launch supports three independently equipped slots:

| Slot                  |          Maximum equipped | Placement and compatibility                                                              |
| --------------------- | ------------------------: | ---------------------------------------------------------------------------------------- |
| `eyewear`             | 1 per character selection | Accepted fitted main/grey/sad portrait states; exact face/art/state records              |
| `profileFrame`        |                         1 | Outer portrait container on Profile and Dressing Room; preserve status/focus decorations |
| `profileCardBackdrop` |                         1 | Surrounding Profile and Dressing Room card; preserve text contrast and focus             |

Reserve future slot names only when their semantics are specified; do not expose empty wigs/makeup/clothes categories or unfinished controls to users. Frames and card backdrops do not require face fitting, but need responsive container, contrast, clipping and interaction review in both supported screens.

Each portrait layer item declares its occupied slot and conflicts. Only one eyewear item may be equipped. A character with baked-in glasses is incompatible with an additional eyewear layer by default. The current pilot's Identity 02 already wears glasses and must not be used for the initial overlay demonstration.

Do not hide original glasses with an opaque rectangle, paint over a face at runtime, or apply a second pair on top. A glasses-free version would require a separately authored and reviewed portrait base for every supported state, preserved identity and eye detail, explicit art revisions, and revised pack/body consistency decisions. That is separate artwork and is not assumed by this pilot.

Future items can declare conflicts such as a temple earring occupying the same attachment area or a hair accessory needing a different occlusion contract. Unsupported combinations must be prevented before Apply and explained. A global `fitsAll` boolean is insufficient for face-mounted artwork.

## 5. Layering and alpha

Use a documented order for each supported portrait state:

1. State background.
2. Optional explicitly supported behind-person decoration.
3. Complete portrait-person foreground.
4. Accessory back/temple layer where that component belongs above the portrait foreground.
5. Accessory front layer, including rims and lenses.
6. Original-person pixels restored through the authored occlusion mask where hair/ears/face must cover the accessory.
7. Optional front portrait decoration, if a later item explicitly supports this layer.

A single glasses file is acceptable where the fit does not need separate front/back pieces. The fit record must state which composition recipe it uses. A complex lens cannot be made realistic just by lowering opacity on the entire item; keep rim opacity and lens transparency intentional. Test both dark/gold and grey backgrounds.

A behind-person halo or frame inside the square requires a transparent person foreground and additional compatibility. An opaque portrait would cover it. Such decoration is not part of the initial profile-frame product. The launch outer frame remains an interface layer around the portrait container. Preserve existing relationship/selection/status rings, nomination/VIP badges, focus outlines, readable names, clipping, and touch targets. Decorative graphics are noninteractive and hidden from the accessibility tree; the item has an accessible name in the customization UI.

Alpha QA uses light, dark, and saturated backgrounds and inspects hair, ears, lenses, bridge, temples, and crop boundaries. Reject matte rectangles, white/black fringes, detached components, transparent skin, and displaced restoration masks. A build-time alpha check cannot grant visual acceptance.

## 6. Source art and deterministic delivery

Use original, brand-free accessory design. No logos, branded silhouettes, unlicensed celebrity/character references, copied cast faces, external fonts, or unexplained third-party source assets. Keep source provenance and commercial-release review records with the art. New character faces remain distinct from the AI cast.

Use repository-native SVG for simple shared frames, clean geometric glasses, badges, and graphics that benefit from precise paths and easy color variants. These are actual authored vector source files, not raster images wrapped in SVG. SVG is self-contained: no scripts, remote references, embedded third-party fonts, arbitrary `foreignObject`, or runtime-loaded markup. Validate against an explicit allowed feature set; render accepted SVG through the same deterministic export tool when raster delivery is required.

Use the image-generation skill/tool for original raster artwork or raster edits when photographic materials or new character art require it. Record exact prompts, references, generation lineage, and frozen returned masters. Do not use programmatic drawing to imitate photographic facial art, and do not use image generation for ordinary UI frames that can be authored precisely as SVG. Existing image edits follow the active image-generation skill rather than an improvised pixel-editing pipeline.

Keep immutable accepted sources outside `public/`, for example `docs/character-customization/accessory-pilot/sources/`. A manifest records source path, SHA-256, author/tool/date, source dimensions, revision, rights/provenance notes, and acceptance evidence. Store candidate/rejected art separately. Never use a temporary generation-tool path as the only retained source.

Deterministic export performs only documented delivery transforms such as rasterizing accepted SVG, resampling, color-profile normalization, and encoding. It must not silently repair anatomy or generate missing art. Retain tool/library versions and export settings. A rerun produces byte-identical or recorded pixel-identical output for the frozen source and environment. A source, fit, or recipe change creates a new revision and invalidates dependent composite cache keys.

Published art revisions and fit records remain resolvable for saved seasons and archives. Retirement can hide a revision from new selection without mutating historical appearance. Ownership and historical appearance snapshots are separate concerns.

## 7. Catalog records

Implement typed records at the appearance boundary; the following is a contract, not existing runtime code:

| Record                     | Required fields and invariants                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CharacterPackRevision`    | Stable character ID; immutable pack/art revision; six role references; derived thumbnail; optional explicit portrait-layer-base revisions; selectable status                                                                |
| `PortraitLayerBase`        | Stable base ID/revision; character ID; pack/art revision; state (`main`, `presentation`, `sad`); background and complete-person foreground; optional occlusion masks; normalized coordinates; existing/baked slot occupancy |
| `PortraitCosmeticRevision` | Stable item ID/revision; kind/slot; display name; source/export refs; available colors if authored; composition recipe; conflicts; exact supported surface IDs                                                              |
| `CosmeticFit`              | Item ID/revision; character ID; pack/art and layer-base revisions; portrait state; reviewed transforms; mask references; allowed crop/surface contract; visual acceptance evidence                                          |
| `ProfileAppearance`        | Schema version; character/pack revision; portrait preference; retained per-character eyewear IDs/revisions; profile-frame and profile-card-backdrop IDs/revisions; no encoded image or temporary URL                        |
| `AppearanceSnapshot`       | Compact selection used by the relevant season/archive actor; independent of today's active profile                                                                                                                          |

Coordinates are in a fixed 256-square portrait space (or documented normalized 0–1 values). A fit includes translation, uniform scale and rotation where sufficient. It may reference a separately authored fitted item layer when perspective/face shape requires one. Do not distort a character's face or let the player repair artwork through unrestricted fitting sliders. Cosmetic color controls may select approved material colors; they do not recolor skin or anatomy.

Use complete tuple lookup: item revision + character ID + pack/art revision + layer-base revision + state + recipe version. A fit accepted for one face does not grant another face compatibility; a fit accepted for main does not grant sad compatibility. Main/grey can explicitly point to the same immutable fit transform when they share the exact person foreground, while retaining state-level coverage records.

At build time validate IDs, exact case-safe paths, file containment, existence/decode/format, dimensions, meaningful alpha, byte ceilings, matching revisions, slot conflicts, supported surfaces, masks/recipe references, complete promised state coverage, and all unique packaged-byte totals. Reject a purchasable eyewear offer that promises all three portrait states but lacks a fit or source for one of them.

## 8. Compose once on selection or equip

The runtime compositor accepts only trusted local catalog records and accepted assets. It resolves the exact character/state/base, checks ownership separately from preview access, applies the reviewed recipe, and returns a displayable image result. Ordinary avatar consumers continue receiving a single image source; do not add multiple live overlay elements to every roster tile or minigame.

Prepare composition when the draft character/item changes, and prepare the three supported state outputs before a successful Apply. A preview may show a locked item with an explicit preview state; it cannot create an ownership grant or become applied equipment. Purchase completes through the existing economy/store entitlement boundary; a successful debit/grant does not by itself apply a stale draft to another profile.

Use an increasing request token or abortable job. Capture profile ID, draft identity, character/pack/base revision, item set, requested state, and output size in the request key. A late result must match the current request and owner before becoming visible or being saved. Cancel or ignore obsolete work after rapid item changes, navigation, profile switching, entitlement changes, or unmount. Revoke discarded object URLs and release image bitmap/canvas resources.

Persist stable IDs and revisions only. Never persist `blob:` URLs, canvas elements, image bitmaps, or base64 composites in localStorage/profile/save JSON. Rebuild derived composites after reload. A bounded optional IndexedDB cache may retain encoded derived images keyed by all art/fit/recipe/output revisions, with integrity/eviction handling; cache presence never proves ownership. It is a later optimization unless measurement justifies it.

The in-memory cache is an LRU with explicit bounds. Provisional limit: at most 12 composite portrait results (3 MiB decoded at 256-square RGBA) and 2 MiB of encoded composite bytes, whichever limit is hit first. Account for loaded source layers separately; retain only the selected character's three state sets plus the current draft during a transition. Avoid eagerly decoding the entire shop. Validate real memory on the target browser/Capacitor device rather than treating compressed bytes as memory use.

A cache key contains character, pack/art/layer-base revisions, state, sorted equipped item IDs/revisions and approved colors, fit/recipe versions, output dimensions, and output encoder version. A state/background/color change must not reuse a stale image. Share immutable source layers across simultaneous compositions when safe, but do not retain unbounded canvas/image objects.

## 9. Offline and failure behavior

Launch sources and delivery assets are bundled local files resolved through the application's configured web/native base. Do not depend on live image generation or an external image service. Test both `/bbmobilenew/` and relative/native asset resolution. No arbitrary remote URLs or user SVG are accepted by the compositor.

If remote downloadable cosmetics become necessary later, they need a separately specified download/manifest/integrity/offline policy. Set CORS on owned sources correctly and test canvas export; a successful image load does not prove an origin-clean canvas. Do not work around canvas taint by disabling security, proxying unknown artwork, or saving a failed render. Local/bundled sources are the first-release contract.

Before Apply, a missing/undecodable layer, unsupported fit, tainted/export-failing canvas, write failure, or incomplete promised state set leaves the previous applied selection intact. Keep the draft, explain which item could not be prepared, and allow retry/remove. Do not silently charge/apply while dropping an item. If purchase ownership was already granted, retain that grant and expose an honest equip failure; retrying must not charge again.

On cold start or a later cache/device failure, retain the requested IDs for recovery. Display that same character/state's accepted flattened base with a clear cosmetic-unavailable indicator on a suitable profile/customization/status surface, retry local preparation, and avoid a wrong face, wrong glasses, normal portrait substituted for sad, or another profile's cached composite. During a live game, never interrupt a cinematic with a modal for this failure. A small persistent status/notification can lead to the Dressing Room. A degraded fallback must not be described as successful cosmetic application.

An unsupported figure or paparazzi surface deliberately uses its pack artwork according to the disclosed product scope. It is not a composition failure. Uploaded photo/emoji mode keeps that portrait preference; portrait glasses are suspended with a clear UI while saved per-character eyewear selections are retained. Returning to character portrait mode restores the compatible saved selection after the usual ownership/revision checks. Outer profile frames and profile-card backdrops can continue on their allowed containers in either portrait mode.

Do not use local cached selection or composite output as an entitlement check. Reconcile the user's permanent grants through the economy/store design. A definitive revocation uses the catalog's defined safe-boundary equipment fallback; transient network failure is not proof of revocation.

## 10. Provisional delivery and performance limits

These are proposed acceptance limits for implementation, not current validator behavior or measured guarantees. Existing CP-01 rules still govern until a separately scoped validator ticket changes them. [ASSET_VALIDATION.md](ASSET_VALIDATION.md) documents that baseline.

| Delivery asset                           | Proposed dimensions/format                                                      | Proposed byte ceiling |
| ---------------------------------------- | ------------------------------------------------------------------------------- | --------------------: |
| Casual/formal body                       | 768 × 1152 WebP with clean alpha                                                |          400 KiB each |
| Flattened main/grey/sad portrait         | 256 × 256 WebP                                                                  |           40 KiB each |
| Paparazzi image                          | Provisional 768 × 1024 opaque WebP; verify current tabloid layout/crop in CS-00 |               160 KiB |
| Store thumbnail                          | 128 × 128 WebP                                                                  |                12 KiB |
| Person foreground for one portrait state | 256 × 256 WebP with alpha                                                       |                60 KiB |
| Mask or raster accessory layer           | 256 × 256 alpha image, or smaller documented bounds                             |           24 KiB each |
| Shared approved SVG item source/delivery | Self-contained SVG with fixed viewBox                                           |                16 KiB |
| Cached composed portrait                 | 256 × 256 WebP; use PNG only with measured need                                 |                60 KiB |

High-resolution masters remain outside the shipped package. Transparent portrait foregrounds require real background alpha; opaque faces/clothes must not become translucent. Masks use an explicit channel convention and exactly match their base coordinates. Permit a reviewed, measured exception through a policy decision rather than silently raising a ceiling.

Provisional first-release combined packaged budget is 16 MiB for all retained legacy/new character delivery assets plus initial decorations and composition source layers, counting each unique packaged file once. Reserve at most 1 MiB for the initial shared decoration collection within that total; transparent foregrounds/masks also count. This proposal needs measured six-image pack/pilot exports before implementation. If quality and the intended roster do not fit, reduce the shipped batch or specify a separate content-delivery design; do not compress faces into unacceptable artifacts or hide duplicated files from the accounting.

For illustration, 12 complete packs at all six-image ceilings plus one thumb each total roughly 12.80 MiB before layer sources/legacy assets. The proposed 16 MiB total must also contain optional portrait foregrounds/masks, all initial decorations and retained revisions, so the 12-pack target does not justify letting every file reach its ceiling. Actual art is often smaller; measure every batch and retained revision. Lazy routes reduce runtime loading, not native package size.

Do not globally preload shop bodies or every item. Load visible thumbnails and the selected preview; prepare small portrait outputs at equip or a safe loading boundary. The selected character's next required sad/presentation state should be ready before the corresponding transition. Provisional performance target: an equipped portrait becomes available within 500 ms after its local source assets are decoded on the tested target device, and 20 consecutive preview switches show no persistent memory growth after idle/eviction. Record device/browser/cache conditions, actual timing, peak memory, and failures; browser emulation is not physical-device evidence.

## 11. Small accessory pilot before production

CS-00 candidate 01 was accepted on 26 October 2026. CS-01's local static art/render package is prepared and awaits user visual acceptance; see [CS-01 evidence](evidence/CS-01/RESULT.md). CS-01 does not implement the runtime compositor, store, cache or profile integration; those remain later tickets.

1. Use accepted pack 01 from CS-00 and accepted main/grey/sad portrait sources from a clearly distinct eligible second adult character, such as candidate 03. CS-01 prepares any missing second-person portraits and retains accepted sources for that person's later full-pack ticket; a completed second six-image pack is not a prerequisite. Both portrait bases have no baked eyewear. Identity 02 is excluded because glasses are already baked in.
2. Freeze their complete main, grey, and sad portrait bases and required alpha/occlusion sources. Do not generate a new face to make one glasses asset fit.
3. Author one original, brand-free glasses design, using SVG when its geometry can be expressed cleanly. Reuse that item source across both characters.
4. Produce and review six explicit fit records: two people × main/grey/sad. Identical main/grey transforms may reference shared immutable data only when the foreground pixels are the same. Six state-level coverage results are still required.
5. Export six composed portraits plus six base comparisons. Review full-square and 32/48/64/72 px circular crops, dark/light/saturated alpha sheets, hair/ear occlusion, neutral/sad continuity, and the actual main/grey consumer treatment.
6. Show the new independent glasses design together with one simple proposed free outer-frame source to demonstrate source reuse without generating every combination. Keep the example frame outside the portrait image and label its eventual Profile/Dressing Room scope.
7. Report immutable sources, exact six-fit coverage, output bytes, manual fitting effort, supported surfaces, exclusions, and remaining corrections. Obtain visual acceptance before expanding item/character coverage. CS-01 exits on accepted source/fit art and static export evidence; report and stop before the next ticket.

CS-08 later implements and checks incompatible selection (baked glasses), missing fit/mask/layer, decode/export failure, fast switching that resolves out of order, profile switching during preparation, cold offline load, cache eviction/rebuild, and missing sources. CS-21 repeats the relevant end-to-end/device release checks after the complete feature exists. These runtime checks are not CS-01 exit requirements, and static art evidence cannot be reported as passing them.

This pilot can reveal that one shared geometry needs two fitted layer variants because facial perspective differs. That is acceptable when explicit and measured. Do not falsely report one universal image if custom retouching was needed. A shared design can have authored fit variants without becoming a separate purchasable item for each person.

## 12. Content work grows by sum, not all combinations

Complete character art remains finite: `N × 6` primary scene images, plus `N` derived thumbnails. Makeup or outfit changes baked into complete pack revisions need their own explicitly scoped artwork; the layer system does not synthesize it.

For compatible portrait accessories, author and validate item layers/fit records independently. If `N` characters, `S` states, and `G` glasses items are supported, worst-case reviewed fits are `N × S × G`, with some transforms/sources shared explicitly. Additional slots add their own assets/fits and a bounded interaction QA matrix. They do not require one finished source portrait for every Cartesian product of selected items.

Example: two characters × three states × one glasses design = six reviewed fits. Adding a second glasses design adds at most another six fits, not a separate image for every future glasses/frame/background selection. Frames outside the portrait container can reuse the same source without face fitting. A frame/glasses combination still needs representative crop/occlusion checks, and conflicts prevent unreviewed visual collisions.

The launch estimate assumes up to 11 eligible faces because candidate 02 retains baked glasses. Three eyewear designs × 11 eligible characters × three portrait states means up to **99 reviewed fit validations** in CS-16, including the accepted pilot item/fits rather than adding them again. Shared exact-foreground main/grey transforms reduce source duplication, not the state-level visual coverage count. Further explicit exclusions may reduce the actual supported set, but storefront compatibility must be frozen before sale. Record fit-authoring and review effort from CS-01 before committing to that production workload; frames/backdrops add container QA, not facial fits.

Do not promise the same savings for a wig painted over existing hair or arbitrary clothing painted over a complete body. Those require missing hidden artwork, garment/body fitting, and more complex occlusion. They remain a future content-system decision with its own art proof, cost, and compatibility contract.
