# Character artwork brief

> Archived planning snapshot. Superseded by the [active Character Store plan](../../README.md) and CS tickets. Statements below describe the earlier scope; do not execute their CL instructions.

Revision: 25 October 2026. Active brief for complete character looks. Read with [ARCHITECTURE.md](ARCHITECTURE.md) and CL-00 in [BACKLOG.md](BACKLOG.md). The existing Big Eye cast defines rendering and framing only. MP-00 remains rejected; CP-02 legacy presets are not automatic player identities.

## Visual direction

Create realistic adult cast publicity images: believable anatomy, warm natural skin, soft controlled lighting, readable fabric, plausible hair, and restrained retouching. Portraits are comparatively photographic; some full figures have a softer rendered finish. Match the existing treatment for each surface while preserving the same identity. Avoid plastic skin, exaggerated eyes, mannequin expressions, pasted heads, and mismatched sharpness or lighting across the figure.

Portraits show face and shoulders against black with subtle gold texture near the lower sides. Bodies are isolated transparent cutouts. Preserve all existing AI assets. Their occasional alpha noise, framing differences, or imperfect identity continuity are not defects to reproduce.

## Audience and identity boundaries

The primary audience is 16–29. Make most launch characters adult-looking people aged 18–29, while retaining recognizable options for adults 30 and older. All depicted characters are clearly adults; do not generate minors. Free identity choice must carry the core range of skin tones, facial features, body silhouettes, hair textures, and ages. Premium bundles may sell expressive fashion, accessories, hairstyle or makeup changes; they must not be the only way to access a demographic identity range.

Nova, Ash, Bea, Sol, Rune, and the rest of the existing cast are never new player presets. Their images may guide rendering quality, light, crop, and game framing, but must not be supplied as face/identity references or copied into another name. Every new face and signature hair/outfit combination must be visibly distinct from the roster.

## Inspected cast references

Paths are relative to the repository root. These images were inspected on 25 October 2026. Luna must open them before authoring.

| Character | Portrait                             | Everyday figure                                  | Evening figure                               | Main reference                                                       |
| --------- | ------------------------------------ | ------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------- |
| Nova      | public/assets/skins/Nova_avatar.webp | public/assets/Informal_attires/Nova_informal.png | public/assets/formal_attires/Nova_formal.png | Face detail, lavender knit/denim, evening dress, feminine silhouette |
| Ash       | public/assets/skins/Ash_avatar.webp  | public/assets/Informal_attires/Ash_informal.png  | public/assets/formal_attires/Ash_formal.png  | Facial hair, T-shirt/trousers, suit, identity continuity             |
| Bea       | public/assets/skins/Bea_avatar.webp  | public/assets/Informal_attires/Bea_informal.png  | Not selected as a reference                  | Curly updo, friendly expression, bright fabric                       |
| Sol       | public/assets/skins/Sol_avatar.webp  | public/assets/Informal_attires/Sol_informal.png  | Not selected as a reference                  | Short curls, facial hair, mustard fabric and casual footwear         |
| Rune      | public/assets/skins/Rune_avatar.webp | public/assets/Informal_attires/Rune_informal.png | Not selected as a reference                  | Long hair, dark clothing detail and stronger body silhouette         |

Nova and Ash are the primary paired references. Extend the comparison to other cast members when a new identity needs a closer reference. These five examples do not establish the complete planned identity range.

The inspected portraits are opaque 512-square WebP images. The selected full figures are 1024 by 1536 PNGs with alpha. New delivery files use the smaller CP-01 dimensions while preserving the 2:3 body ratio and visible scale.

Measured bounds for alpha greater than 127:

| Source figure | Bounds in 1024 by 1536 source |
| ------------- | ----------------------------- |
| Nova everyday | x 308–721; y 45–1481          |
| Nova evening  | x 219–777; y 58–1472          |
| Ash everyday  | x 329–733; y 82–1473          |
| Ash evening   | x 335–752; y 82–1460          |
| Sol everyday  | x 257–699; y 81–1469          |
| Rune everyday | x 302–786; y 60–1503          |

These place the crown around 3–5 percent of canvas height and the lowest visible figure/shadow around 95–98 percent. Treat them as composition guidance, not exact anatomy measurements. Clothing width varies naturally. Do not stretch bodies to equal widths or mistake alpha noise for the foot baseline.

## Complete-image bundle workflow

The game consumes complete static images, so each identity/look is an offline-authored body cutout, matching square portrait, and derived thumbnail. CL-00 uses image generation for a small style/continuity proof; it does not add image generation, a 3D model, or a compositor to the game. Generate each identity from a written description without a current cast face as input. Generate outfit variants from that new identity's accepted full-body master, then visually check facial and body continuity.

Retain full-resolution accepted masters, prompt text, generation lineage, source filenames, dates/tool details available, checksums, and rights/provenance notes. Repeatable production means deterministic exports from those frozen masters. Since generation itself is nondeterministic, any regenerated image is a new revision that needs review. Keep drafts and rejected images outside `public/` and the runtime catalog. Check all images for logos, unintended text, recognizable third-party marks, artifacts, and commercial-release rights before admitting them to a paid collection.

Do not assemble independent generated head/body/hair layers, use skin masks, or promise player body/anatomy sliders. Existing cast images set visual quality only; a black-and-gold portrait background may be newly authored, but never extract a current player's face or character-specific backdrop.

## Identity and framing

Create distinct fictional identities, using written art direction derived from the cast's rendering style. Do not repurpose a cast member's body, face, signature hair, or complete outfit as a new human character. Preserve facial structure, skin tone, adult age appearance, body shape, and distinguishing features across looks. Hairstyle, grooming, makeup, jewelry, and clothing may change as a complete authored look.

Use a natural standing pose, relaxed shoulders, believable hands, complete footwear, and perspective consistent with the cast. Preserve camera scale and feet baseline between looks. Small approved pose changes are acceptable without apparent height jumps. Maintain head/body proportions; do not correct them by independently resizing a raster head.

Center the figure on a 2:3 transparent canvas with side clearance and complete hair, hands, clothing, and feet. Start with the reference crown/feet range, then verify in scenes. Avoid large transparent margins that shrink the person in the game's contain-fit wrappers. No baked floor, rectangle, podium, text, logo, large prop, or stage glow.

The game already applies shadows. Keep contact shadows subtle and avoid a second floating floor. Inspect alpha on light, dark, and saturated backgrounds, especially blonde hair, curls, dark clothes, and sheer fabric. Reject halos, matte rectangles, missing fingers, detached shoes, and translucent faces.

Portraits must retain recognizable facial detail at 32/48/64/72 px in square and circular crops. Match the cast's face-and-shoulder scale. Hair, face, and visible clothing must agree with the equipped body. Retain at least 512-square portrait masters; export 256-square portraits and 128-square thumbnails. Enlarging a tiny body-face crop is insufficient.

The initial portrait includes its black-and-gold background. Store frames are separate interface decoration. Initial profile backdrops surround the portrait/full-body preview; they cannot replace the background inside a flattened portrait.

## CL-00 proof

Produce two visibly different, clearly adult identities in the 18–29 age range, each with an everyday look and a premium expressive look. Deliver four complete figures and four matching portrait/thumbnail pairs. This is a source-art proof, not a released catalog or payment implementation. Both pilot people must be distinct from every existing cast identity; use no existing character portrait as an image-generation input.

Use contrasting skin tones, facial features, hair textures, and body silhouettes. The everyday looks establish appealing free starting options. The paid looks test a visibly more expressive outfit/accessory bundle while preserving the same character identity. Premium means distinctive styling, not access to an otherwise missing identity group. Broader launch art will add the 30+ adult range.

Keep candidates, sources, export instructions, and evidence under docs/character-customization/look-pilot, outside public. Required evidence:

1. Both identities and their two looks side by side, with matching portraits.
2. Portrait comparisons beside Nova, Ash, and another cast member at full portrait and 32/48/64/72 px circular sizes.
3. New and existing figures on a common canvas/baseline without per-character stretching.
4. Casual reveal and Tribunal/finale placement at 390 by 844, narrow 360 px, and a larger viewport. Use actual components in an isolated fixture where practical. Otherwise label faithful placement mockups clearly; they do not prove runtime integration.
5. Light/dark/saturated alpha comparisons.
6. A deterministic re-export from the frozen accepted master files.
7. Actual effort for the first identity, second identity, and alternate outfit; identify manual cleanup that affects scale, continuity, or production time.

The Tribunal's main cutout wrapper currently uses bottom -1 percent, left -9 percent, width 70 percent, height 100 percent, contain fit, and bottom-center positioning. Other portrait/carousel crops and responsive overrides exist. Use current scene styles. A standalone figure on white is insufficient.

## Acceptance

Inspect every image before presenting it. Record each result separately:

| Criterion              | Required result                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Cast style             | No obvious style break beside existing portraits and figures                               |
| Identity               | Everyday, evening, and portrait clearly depict the same person                             |
| Anatomy and fit        | Natural proportions, connected neck, convincing extremities, no garment/hair intersections |
| Framing                | Appropriate apparent height, feet baseline, portrait face scale and scene clearance        |
| Materials and lighting | Consistent face/body tone, readable fabric, no plastic shine or abrupt lighting changes    |
| Alpha                  | Clean edges on three backgrounds, no rectangle or distracting halo                         |
| Delivery               | Successful decode, correct dimensions, actual transparency, acceptable bytes               |
| Repeatability          | Retained source reproduces the look with dependencies accounted for                        |

Technical checks do not grant aesthetic acceptance. CL-00 can be technically checked and awaiting user visual acceptance. Only recorded user acceptance opens CL-01. Failed essential criteria require a correction or a concrete artist/source requirement; do not expand the library or claim success.

## Production batches

After the proof, create 24 free identities in four separately reviewed batches of six. Aim for 16–18 identities aged 18–29 and the remainder aged 30+, with coverage across skin tones/undertones, facial structure, body silhouettes, hair textures/lengths, facial hair, and glasses. Include mature faces and fuller bodies. These are coverage dimensions, not every possible combination or exact personal likeness. Every character is clearly an adult.

Create the first premium collection in four corresponding batches of six. Preserve identity and sell complete looks. All 24 launch identities must be present before advertising full launch-character support. Each batch requires contact sheets, source/rights records, and scene checks for its extreme silhouettes.

Delivery is WebP: body 768 by 1152 with alpha, portrait 256 square, thumbnail 128 square. Per-file ceilings are 400/40/12 KiB. Higher-resolution masters remain outside public. ARCHITECTURE.md defines the separate combined delivery budget. Never overwrite released art revisions. Never describe these static looks as independently adjustable hair, clothing, makeup, or body size.
