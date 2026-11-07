# Character 03 — complete-look draft r1

**Status: six role images assembled for review; not user-accepted or runtime-ready.** The prior eyewear mockup is excluded. No code, catalog entry, store offer, or public asset was changed.

## Review

![Character 03 six-role export review](exports/candidate-03-r1/six-role-review-export.jpg)

The person remains the existing candidate-03 fictional man: medium-deep warm skin, short honey-blond curls, brown eyes, clean-shaven face, plum overshirt and ivory crewneck. The casual source was redone as a transparent cutout, and the formal, paparazzi, main, grey and sad roles were newly made from his own candidate art. No glasses are present.

## Delivery

| Role                    | File                                     |          Size |
| ----------------------- | ---------------------------------------- | ------------: |
| Casual full figure      | `exports/candidate-03-r1/casual.webp`    | 126,502 bytes |
| Main avatar             | `exports/candidate-03-r1/main.webp`      |  18,138 bytes |
| Grey-lux avatar         | `exports/candidate-03-r1/grey.webp`      |  13,236 bytes |
| Formal full figure      | `exports/candidate-03-r1/formal.webp`    |  95,830 bytes |
| Sad avatar              | `exports/candidate-03-r1/sad.webp`       |  17,680 bytes |
| After the Eye paparazzi | `exports/candidate-03-r1/paparazzi.webp` | 119,918 bytes |
| Derived store thumbnail | `exports/candidate-03-r1/thumbnail.webp` |   5,020 bytes |

All seven WebP exports total **396,324 bytes**. The portraits are 256 × 256, figures are 768 × 1152, paparazzi is 768 × 1152, and thumbnail is 128 × 128. [`export-report.json`](exports/candidate-03-r1/export-report.json) records hashes, alpha channels and exact measurements. `build_pack.py` deterministically creates the thumbnail, exports and review sheet from the retained PNG masters.

## Technical notes

- All seven images decode. Casual and formal figures have real alpha transparency (0–255). The casual cutout was composited over light, dark and saturated teal backgrounds; no studio haze or rectangular matte remained visible at review scale.
- The old CS-01 accessory compositions are not copied into this pack. Main/grey/sad use separate complete portraits, without an eyewear layer.
- Visual continuity and cast distinctness remain subject to user review. Source prompts and output IDs are in [`prompts.md`](prompts.md).
