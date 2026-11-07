# CL-00 complete-image bundle pilot

**Historical pilot.** The active [Character Store plan](../README.md) uses CS tickets. These retained sources may be reused after review, but no identity here is a completed six-image pack. Four later body masters (03–06) also exist and remain unaccepted; the table below covers only the earlier exported proof. Do not execute its old CL-01 next-step instruction.

**State:** four-look proof produced and technically checked; awaiting the user's visual acceptance. Nothing here is in `public/`, the runtime catalog, or the player selector. CL-01 remains closed.

This pilot uses two newly generated fictional adults in their 20s. No existing player character, cast portrait, personal photo, or external character image was used as an identity reference. Existing cast assets informed only written rendering/framing guidance and later visual QA. The first identity is a 23–26-year-old dark-brown-skinned woman with a long microbraid ponytail. The second is a 24–27-year-old East Asian man with layered dark hair and glasses. Their everyday looks are free-style examples; premium looks test more expressive bundled fashion and accessories. These two samples are not the launch roster and do not claim to cover the full audience.

| Complete look        | Body                                     | Portrait                                     | Thumbnail                                     | Bytes (body / portrait / thumbnail) |
| -------------------- | ---------------------------------------- | -------------------------------------------- | --------------------------------------------- | ----------------------------------: |
| Identity 01 everyday | `exports/identity-01-everyday/body.webp` | `exports/identity-01-everyday/portrait.webp` | `exports/identity-01-everyday/thumbnail.webp` |            110,842 / 17,538 / 4,664 |
| Identity 01 premium  | `exports/identity-01-premium/body.webp`  | `exports/identity-01-premium/portrait.webp`  | `exports/identity-01-premium/thumbnail.webp`  |             80,118 / 13,288 / 4,044 |
| Identity 02 everyday | `exports/identity-02-everyday/body.webp` | `exports/identity-02-everyday/portrait.webp` | `exports/identity-02-everyday/thumbnail.webp` |             65,546 / 10,876 / 3,746 |
| Identity 02 premium  | `exports/identity-02-premium/body.webp`  | `exports/identity-02-premium/portrait.webp`  | `exports/identity-02-premium/thumbnail.webp`  |             71,764 / 11,022 / 4,118 |

The 12 delivery images total **397,566 bytes (about 0.38 MiB)**. All four bodies are 768 × 1152 WebP with alpha; portraits are opaque 256 × 256 WebP; thumbnails are transparent 128 × 128 WebP. Every file is below its 400/40/12 KiB ceiling. The exact dimensions, bytes, alpha pixel counts, source/output SHA-256 values, and chosen export qualities are in [`exports/report.json`](exports/report.json).

## Visual QA

- [Four body cutouts on dark, light, and saturated teal backgrounds](review/body-alpha-backgrounds.png)
- [Four 256 px portraits](review/portrait-256.png)
- [Portrait style comparison against Nova, Bea, and Ash](review/cast-portrait-style-comparison.png)
- [Existing-cast and new-identity avatars at 32/48/64/72 px](review/cast-avatar-size-comparison.png)
- [Portraits in circular profile-avatar treatments at 32, 48, 64, and 72 px](review/profile-avatar-small-sizes.png)
- [128 px thumbnail review](review/thumbnail-128.png)
- [72 px profile-avatar preview](review/profile-avatar-72px-preview.png)
- [390 × 844 Tribunal fit mockup](review/tribunal-fit-390x844-mockup.png)
- [360 × 780 narrow-view fit](review/tribunal-fit-360x780-mockup.png)
- [768 × 1024 larger-view fit](review/tribunal-fit-768x1024-mockup.png)

The Tribunal image is a static placement mockup using the current `.tms-cutout-wrap` bounds and `object-fit: contain` / bottom alignment. It is not a live application screenshot or renderer integration test. The images were inspected at body, portrait, and 72 px profile size. The transparent cutouts remain clean on all three tested colors; hands, hair, and shoes are inside frame; faces and outfit differences remain readable. The two outfits for each identity remain recognizable as the same person at the proof size. These are internal visual observations, not user acceptance.

## Re-export

Run `py docs/character-customization/look-pilot/prepare_exports.py` from the repository root to regenerate delivery WebPs from the retained masters. The export is deterministic for the current Pillow/libwebp environment; image generation itself is not deterministic. `report.json` was regenerated twice and retained the same SHA-256. Use the `make_review.py` helper to rebuild static QA sheets. Neither script writes to `public/` or edits the master artwork.

## Provenance

Read [`source-prompts.md`](source-prompts.md) for the retained generation prompts and lineage. Full-resolution images are in `masters/`. All art was generated with the built-in image-generation tool on 25 October 2026; no external character references were supplied. Commercial-release rights and accidental mark checks remain release gates. Rejected edits and first-pass branded-shoe variants were deliberately excluded from the retained masters.

## Next step

Present these candidates for the user's visual review. If accepted, CL-01 can begin in a later, separately requested ticket. If rejected, keep the files isolated, record the requested correction, revise only CL-00, and do not begin integration.
