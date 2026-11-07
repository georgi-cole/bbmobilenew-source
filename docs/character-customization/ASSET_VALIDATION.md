# Character pack and cosmetic asset validation

Revision: 25 October 2026. This separates the existing validator from planned CS-02/CS-03 behavior. No validator, policy or runtime code was changed by the planning revision.

## Existing behavior

npm run validate:characters runs scripts/validate-character-catalog.mjs. Focused fixtures use npm run test:character-catalog; current release/mobile builds invoke the validator. src/appearance/characterCatalog.data.json currently describes four CP-02 presets, each body/portrait/thumbnail, under assets/characters/preset-_/r_/.

The existing policy in src/appearance/characterAssetPolicy.json caps bodies/portraits/thumbs at 400/40/12 KiB and total shipped preset assets at 8 MiB. It checks IDs/revisions, traits, path containment/case, file presence, dimensions, WebP metadata, full decode via development sharp, body alpha and per-file/total bytes. Existing checks do not prove the new six-image pack/layer/fit/offer contracts, face continuity or aesthetic acceptance.

Keep these legacy IDs resolvable. Experimental CP art must not automatically enter the new chooser. Draft masters stay outside public, even if an old catalog format could reference them.

## Planned CS-02/CS-03 extension

Validate a separate versioned six-role pack catalog and explicit legacy adapter:

- Mandatory casualBody, formalBody, mainPortrait, presentationPortrait, sadPortrait, paparazzi and derived thumbnail for every selectable/purchasable pack. No duplicate current revision/default ambiguity.
- Exact character/art revision ownership of every portrait base, mask and fit. Complete advertised main/grey/sad state coverage for each item/character pair; no universal-fit shortcut.
- One occupied eyewear slot; baked glasses incompatibility; supported surfaces and collection/offer grants match real complete content.
- Immutable accepted source/provenance references and no unaccepted/unreferenced draft assets leaking into new shipping folders.
- Safe relative, contained, case-correct paths on web/mobile; no traversal, escaped symlinks, remote artwork dependency or name-based identity inference.
- Full decode and true dimensions/role format, finite/allowed transforms, aligned portrait/mask dimensions, actual visible foreground plus empty transparent background. A few transparent corner pixels cannot establish a usable body cutout.
- SVG allowlist for original self-contained vectors: disallow scripts, external references/fonts, arbitrary foreignObject and unapproved embedded content. Do not process player-provided SVG as cosmetic art.
- Total unique packaged bytes across old/new characters, bases/masks/layers/frames/backdrops and retained revisions. Hiding an old revision does not remove its packaged cost. Deduplicate by physical asset reference and count unreferenced accidental files.

Proposed new delivery policy, subject to CS-00 scene measurements:

| Role                                              | Dimensions                                                          |            Proposed byte ceiling |
| ------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------: |
| Casual/formal body                                | 768x1152 WebP, meaningful alpha                                     |                     400 KiB each |
| Main/grey/sad portrait                            | 256x256 opaque WebP                                                 |                      40 KiB each |
| Paparazzi                                         | Provisional 768x1024 WebP, opaque                                   |                          160 KiB |
| Thumbnail                                         | 128x128 WebP                                                        |                           12 KiB |
| Optional portrait foreground/background/mask/item | Explicit per-role dimensions and cap from CS-01 source measurements | Included in total; not unbounded |
| Profile frames/card backdrops                     | Explicit role policy after authored samples                         |                Included in total |

The combined proposal is 16 MiB, not a policy already enforced. Twelve maximum-ceiling packs would consume about 12.8 MiB before optional bases/cosmetics/legacy content. CS-03 must show measured headroom and deduplication or revise the proposal explicitly; do not silently increase caps. Asset-by-asset ceilings are not expected target sizes.

## Technical evidence

Retain exported path, role, source SHA-256, output SHA-256, dimensions, bytes, encoding/tool settings, alpha extrema/counts/bounds and deterministic re-export result. Frozen sources produce repeatable delivery exports; image generation is not deterministic. A changed source or fit requires a new reviewable revision.

Meaningful fixtures include missing/corrupt/truncated/mislabelled files, opaque/empty body, transparent portrait, wrong dimensions, duplicate IDs/revisions, wrong-case/escape paths, invalid fit target/state/revision, absent masks, baked-slot collision, incomplete grants, missing default, total budget overflow and orphan artwork.

Do not create tests that merely duplicate a list of filenames. Validate contracts and failure behavior.

## Visual evidence

Each pack still needs user visual acceptance of same-person consistency, distinctness, adult age/build, anatomy, natural skin/hair/eyes, main/grey/sad readability, scene framing, feet baseline, alpha on three backgrounds and After the Eye crop.

Each eyewear fit needs eyes/bridge/temple alignment, hair occlusion, lens/material appearance and 32/48/64/72 px square/circle checks. Frames/backdrops need focus/status/name/selection/VIP checks on their declared containers.

Keep implementation test results, static mockups, actual browser screenshots, native/emulated observations and user acceptance separately labeled. Technical validation cannot grant aesthetic acceptance.

## Release checks

Refresh the surface matrix and packaged-byte report after final accepted art. Run relevant catalog/appearance/profile/commerce tests and npm run check:pr after the final code edit before PR/update/push or a complete repository-validation claim. If package manifests are changed by the ticket, also run npm audit --omit=dev --audit-level=high. Existing unrelated changes are neither silently fixed nor claimed as part of this feature.

Native billing, restore/reinstall, physical-device performance, asset rights and configured products remain separate release evidence; an image validator does not prove any of them.
