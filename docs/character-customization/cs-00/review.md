# CS-00 technical and internal visual review

**Ticket:** CS-00, candidate 01, pack revision r1  
**Status:** Technically checked and user-accepted on 26 October 2026.  
**Runtime/integration:** None. No files were written to `public/`; no runtime code or package manifest was changed.

## Per-role review

| Role      | Delivery                                 | Technical result                                | Internal visual observations                                                                                                                                                                                                                                      |
| --------- | ---------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Casual    | 768x1152 transparent WebP, 105,012 bytes | Full decode; RGBA; partial alpha; under 400 KiB | Reused everyday master. Hair, hands and both shoes remain in frame. Alpha was inspected at full output size over dark, light and saturated teal. No visible studio haze, colored fringe or detached parts in those checks.                                        |
| Main      | 256x256 opaque WebP, 17,538 bytes        | Full decode; RGB; under 40 KiB                  | Reused black-and-gold portrait. Calm expression, large centered face, braid silhouette and everyday outfit cues.                                                                                                                                                  |
| Grey      | 256x256 opaque WebP, 12,238 bytes        | Full decode; RGB; under 40 KiB                  | New neutral-grey background scene; the person remains in natural color. Head size and crop align with main.                                                                                                                                                       |
| Formal    | 768x1152 transparent WebP, 70,410 bytes  | Full decode; RGBA; partial alpha; under 400 KiB | New distinct evening look. Same face, braids, skin, stance and apparent height as casual. Both hands and heels are visible. Full-size alpha was inspected on dark, light and saturated teal backgrounds; no visible halo or background rectangle in those checks. |
| Sad       | 256x256 opaque WebP, 17,188 bytes        | Full decode; RGB; under 40 KiB                  | New expression variant, not a greyscale effect. Brows and mouth read as subdued/disappointed without tears or comic distress. Camera, hair, outfit cues and crop stay close to main.                                                                              |
| Paparazzi | 768x1152 opaque WebP, 132,130 bytes      | Full decode; RGB; under 160 KiB                 | New candid outside-show image. Face, braids, skin and everyday outfit remain recognizable. The top-aligned CSS crops at all three reviewed viewport sizes keep her face and upper body visible.                                                                   |
| Thumbnail | 128x128 transparent WebP, 4,448 bytes    | Full decode; RGBA; under 12 KiB                 | Deterministically derived from the framed casual cutout; margins and figure remain legible on dark, light and teal backgrounds.                                                                                                                                   |

## Framing, transparency and continuity measurements

Both body sources were normalized without non-uniform stretching. At source resolution 1024x1536, alpha-threshold-127 bounds are casual `[236, 53, 789, 1481]` and formal `[221, 53, 803, 1482]`. The top edge is 3.45% of canvas height; the soles end at 96.4%. Their figure heights differ by one source pixel. The formal silhouette is wider through the trouser legs, as authored, while the face, torso scale and feet baseline remain aligned.

The exported casual and formal PNG-style full-resolution composites are each retained on three backgrounds in `evidence/alpha-fullsize-*.png`; the overview is `evidence/alpha-three-backgrounds-v2.png`. I inspected all six full-size composites. Fine braid edges remain visible on the dark, light and teal backgrounds; hands, shoes and clothing are opaque, and no large residual haze, matte rectangle or missing body part was visible. Alpha values and full-source/output hashes are in `exports/identity-01-r1/report-v3.json`.

The main/grey/sad comparison is retained at actual 32, 48, 64 and 72 px display sizes. The face and braid silhouette remain identifiable at those sizes; brown eye color is easiest to verify in the 256 px view. The three portraits keep natural skin tone and matching head/shoulder framing. Existing cast faces are included only in a labeled style comparison, not used as identity references.

## After the Eye and scene crops

The reviewed current source photos in `public/assets/tabloid_photos/` are 2:3 portrait files. The live card stylesheet uses `object-fit: cover`, `object-position: center top`, a mobile height of `clamp(215px, 35dvh, 300px)`, and a desktop height capped at 430px. Candidate 01's 2:3 source was tested against those rules:

| Viewport | CSS-derived crop area | Result                                                  |
| -------- | --------------------: | ------------------------------------------------------- |
| 360x780  |            310x273 px | Face and upper body remain visible; head is not cropped |
| 390x844  |            340x295 px | Face and upper body remain visible; head is not cropped |
| 1280x900 |            340x387 px | Face and upper body remain visible; head is not cropped |

Exact crops and comparison sheets are in `evidence/after-eye-photo-crop-*.png`. The paparazzi role is therefore exported at 768x1152 (2:3), matching the reviewed scene-source aspect and preserving the image for the live top-aligned crop. This CS-00 art decision does not freeze validator policy.

Static, CSS-derived preview images show the casual, grey, sad and formal states at 360x780 and 390x844 and a larger 1280x900 view. Separate Tribunal previews approximate the current `.tms-cutout-wrap` settings (mobile left -9%, width 70%, bottom -1%; wider layout left -4%, width 58%; contain/bottom alignment). These are not runtime screenshots. Scene evidence: `evidence/scene-static-*` and `evidence/tribunal-stage-static-*`.

## Export reproducibility and measured bytes

`prepare_pack.py` exported all seven roles with Pillow 12.3.0 / Python 3.14.6, LANCZOS resampling, WebP method 6, alpha quality 100 and exact alpha. All seven met their role-specific dimension and byte limits at quality 88. A second in-memory encode for each role produced the exact saved bytes and SHA-256; see `deterministicRepeatMatches: true` in the report. Total delivery is 358,964 bytes / 350.55 KiB. Six retained 1024x1536 or 1254x1254 PNG masters total 13,070,561 bytes.

CS-00 work comprised two reused frozen candidate-01 sources, four distinct built-in image-generation calls (formal, grey, sad and paparazzi), deterministic body framing and WebP export, and static evidence generation. No manual pixel repaint or facial cleanup was performed. The original tool outputs and source IDs are recorded in `prompts.md`; the image-generation tool did not expose model/version metadata. Commercial-release rights and accidental-mark checks remain outside this technical pass.

## Acceptance record

The user accepted candidate 01 on 26 October 2026 and asked that future main portraits follow the existing in-game gold-particle placement, and future grey-lux portraits use the darker outer tones in the Ali grey-lux reference. Candidate 01's accepted gold treatment and grey background are left unchanged. CS-01 is now eligible. The user acceptance is distinct from later runtime/catalog integration.
