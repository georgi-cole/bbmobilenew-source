# CL-00 results

**Historical evidence, superseded as an execution contract on 25 October 2026.** The active [Character Store plan](../../README.md) uses CS tickets and twelve six-image packs. The results below describe the earlier four-look proof only; they do not establish acceptance or readiness of the new packs/accessories. Do not start CL-01 from this record.

Date: 25 October 2026  
Status: **Complete-image proof has passed technical asset checks and is awaiting the user's visual acceptance. CL-01 has not started.**

## Current complete-image bundle proof

The user selected the complete-look image-bundle route. This proof contains two new clearly adult identities aged 23–27, each with a free everyday look and a premium expressive outfit, plus a matching portrait and derived thumbnail for each look. The primary target is 16–29; later launch art should weight roughly 16–18 of 24 identities toward ages 18–29 while retaining adults 30+. No minors are depicted. No existing game-cast image, including Nova, was used as a generation reference or recreated. See [the retained prompts and lineage](../../look-pilot/source-prompts.md).

| Look                 |   Body WebP | Portrait WebP | Thumbnail WebP | Triplet bytes |
| -------------------- | ----------: | ------------: | -------------: | ------------: |
| Identity 01 everyday |     110,842 |        17,538 |          4,664 |       133,044 |
| Identity 01 premium  |      80,118 |        13,288 |          4,044 |        97,450 |
| Identity 02 everyday |      65,546 |        10,876 |          3,746 |        80,168 |
| Identity 02 premium  |      71,764 |        11,022 |          4,118 |        86,904 |
| **Total**            | **328,270** |    **52,724** |     **16,572** |   **397,566** |

All 12 files decode successfully and meet 768 × 1152 transparent body, 256 × 256 opaque portrait, and 128 × 128 transparent thumbnail dimensions. Each file is below its existing 400/40/12 KiB ceiling. Bodies contain true transparent pixels and opaque subject pixels; no background rectangle or distracting halo was visible in the three-color review. The full checksums and pixel counts are in [`exports/report.json`](../../look-pilot/exports/report.json). The delivery is about 0.38 MiB and remains outside `public/` and the runtime catalog.

Static QA evidence:

- [Bodies on dark, light, and saturated backgrounds](../../look-pilot/review/body-alpha-backgrounds.png)
- [256 px portrait comparisons](../../look-pilot/review/portrait-256.png)
- [Portraits beside Nova, Bea, and Ash for style/distinction review](../../look-pilot/review/cast-portrait-style-comparison.png)
- [New and existing portraits at 32/48/64/72 px](../../look-pilot/review/cast-avatar-size-comparison.png)
- [72 px circular profile-avatar preview](../../look-pilot/review/profile-avatar-72px-preview.png)
- [32/48/64/72 px circular avatar size check](../../look-pilot/review/profile-avatar-small-sizes.png)
- [128 px thumbnail review](../../look-pilot/review/thumbnail-128.png)
- [390 × 844 Tribunal fit mockup](../../look-pilot/review/tribunal-fit-390x844-mockup.png)
- [360 × 780 narrow-view mockup](../../look-pilot/review/tribunal-fit-360x780-mockup.png)
- [768 × 1024 larger-view mockup](../../look-pilot/review/tribunal-fit-768x1024-mockup.png)

The Tribunal composition follows the existing cutout wrapper values and bottom-aligned `object-fit: contain`, but is a labeled mockup rather than a live app screenshot. Visual inspection found readable faces and outfit differences at small sizes, complete visible shoes/hands, and reasonable identity continuity between outfits and portraits. These findings are preliminary internal review; **user visual acceptance is pending**. Image generation is nondeterministic; the accepted masters are frozen and the WebP export is deterministic from those masters. Re-running the export left the report SHA-256 unchanged.

No game code, production catalog, package manifest, public asset, or payment behavior changed in this proof. `npm run check:pr` and `npm audit` were not run because this ticket made no application or dependency changes and no PR is being created. CL-01 remains closed until the user accepts this proof. Commercial rights/provenance and final accidental-mark review remain release checks.

## Historical MPFB feasibility test (superseded)

## Scope and outcome

This was a source-workflow test, not the four-look proof. I did not change application code, the public asset catalog, or shipped player artwork. I stopped after one character because the first render was visibly too far from the existing cast to justify producing more candidates from the same source.

The tested offline stack was Blender 5.2.3 LTS with MPFB 2.0.18. Both downloads were obtained from their official distribution sites and checked against their published SHA-256 values. The MakeHuman system asset pack was downloaded from its official mirror; its included base assets are listed as CC0. The preview used one Hair 02 style by Elvaerwyn, listed by MakeHuman Community as CC-BY. That preview was not shipped. If that hair pack is reused later, include its required attribution. The CC0 Dress 01 and Suits 01 thumbnails were inspected but were not rendered in this test.

The test created one editable Blender project containing a generated human, a skin material, eyes, brows, lashes, hair, a casual shirt-and-jeans outfit, shoes, studio lights, and full-body/portrait cameras. The saved project was reopened in background mode and the portrait was rendered again. Decoded RGBA pixels were identical between renders; PNG byte hashes differed, so only pixel-level reproducibility was confirmed.

## Technical measurements

| Output                    | Dimensions | Format/mode |                       Bytes | Alpha                |
| ------------------------- | ---------: | ----------- | --------------------------: | -------------------- |
| Casual full-body preview  | 768 × 1152 | PNG RGBA    |                     577,447 | Present, range 0–255 |
| Matching portrait preview |  512 × 512 | PNG RGBA    | 263,272 after repeat render | Present, range 0–255 |
| Editable Blender source   |          — | `.blend`    |                  27,882,417 | —                    |

These are diagnostic PNGs, not the planned 768 × 1152 / 256 × 256 / 128 × 128 WebP delivery triplet. No thumbnail, second outfit, second identity, in-game placement, catalog entry, or packaged-size result was produced.

## Visual review

**Fail.** The base model held a rigid arms-out pose; its face and eyes looked mannequin-like at portrait size; the selected hair read as oversized clumps; and the casual top carried a prominent source logo. The overall render looked like a generic 3D model, while the existing Nova figure and portrait use polished, realistic, photographic-style art. The silhouette, pose, surface treatment, hair, and clothing do not pass the cast-consistency requirement.

This is a source-art limitation, not an export-size or client-performance problem. More preset combinations from the same stock source would multiply the mismatch. Do not add these renders to `public/`, the catalog, or the chooser, and do not treat the successful decode or rerender checks as visual approval.

## Superseded conclusion for the MPFB attempt

Select a style-capable source before producing another batch. It must provide a posed complete figure, face/hair/skin detail, and wardrobe quality that can match the existing cast, with an editable or repeatable source and clear commercial rights. The current repository contains no such editable player source, and the stock MPFB source tested here does not meet the bar.

This conclusion was superseded when the user selected the complete-image bundle route. The current proof above tests that route; the MPFB failure remains only historical evidence. No paid asset or artist engagement was authorized by the original test.

## Source references and verification

- Blender 5.2.3 official release index: https://download.blender.org/release/Blender5.2/ — archive hash matched `723f08a4401502561eb763cdeacf8745b31e5f3f154d287d3830d97cf75dc2fb`.
- MPFB Blender extension: https://extensions.blender.org/add-ons/mpfb/ — v2.0.18 package hash matched `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad`.
- MakeHuman system assets and licenses: https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html — downloaded archive SHA-256 `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`.
- Hair 02 pack and license: https://static.makehumancommunity.org/assets/assetpacks/hair02.html — downloaded archive SHA-256 `c681e5efd37df4007a52253a8d071aedbfe3b614f199d8dae4ae76d5bd7d95c9`.
- CC0 Dress 01 and Suits 01 pack listing: https://static.makehumancommunity.org/assets/assetpacks/index.html.
- Visual reference checked: `public/assets/Informal_attires/Nova_informal.png`, `public/assets/skins/Nova_avatar.webp`, and `public/assets/formal_attires/Nova_formal.png`.

Repository tests and `npm run check:pr` were not run because this attempt changed no application code or package manifests. CL-00 needs a new art-source decision and a fresh style proof; no later ticket was started.
