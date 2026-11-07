# Character 02 — complete-look draft r1

**Status: six role images assembled for review; not user-accepted or runtime-ready.** No code, catalog entry, store offer, or public asset was changed.

## Review

![Character 02 six-role review](six-role-review.jpg)

- [Six roles at export dimensions](exports/candidate-02-r1/six-role-review-export.jpg)
- [Gold and grey backgrounds beside the game's real references](exports/candidate-02-r1/background-reference-comparison.jpg)

The casual full figure, main portrait and thumbnail reuse the earlier character-02 everyday look. New draft images provide the grey-lux portrait, formal full figure, sad portrait, and After the Eye scene. The main portrait keeps the existing black-and-gold art, and the sad expression keeps its particle placement. Grey-lux uses Ali's neutral grey treatment as a background reference only. Paparazzi composition references the existing scene format only.

## Files

| Role                      | File               | Source/revision                                                                                                                 |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Casual full figure        | `casual.webp`      | Reused from `look-pilot/exports/identity-02-everyday/body.webp`                                                                 |
| Main avatar               | `main.png`         | Revised 26 October 2026 against Nova's actual game gold-particle treatment; original retained as `main-original-r0.png`         |
| Grey-lux avatar           | `grey-r1.png`      | Generated 26 October 2026, imagegen output `exec-73461566-3d0a-49c8-baa2-b136e81370ed.png`                                      |
| Formal full figure        | `formal-r1.png`    | Generated 26 October 2026, output `exec-eebcf0da-ce9e-4bdf-93b2-177364de0076.png`                                               |
| Sad avatar                | `sad-r1.png`       | Generated 26 October 2026 from revised main to retain its particle composition; earlier draft retained as `sad-original-r0.png` |
| After the Eye paparazzi   | `paparazzi-r1.png` | Generated 26 October 2026, output `exec-60d9a184-6f20-417c-aaf4-3ce0d9b9a05e.png`                                               |
| Store thumbnail (derived) | `thumbnail.webp`   | Reused from `look-pilot/exports/identity-02-everyday/thumbnail.webp`                                                            |

See [`prompts.md`](prompts.md) for the exact new-image prompts and identity/style reference separation. `make_review.py` rebuilds the contact sheet only; it does not change source images.

The compressed review delivery is in [`exports/candidate-02-r1/`](exports/candidate-02-r1/) and totals **283,818 bytes** including the derived thumbnail. The three portraits export at 256 × 256; the casual and formal figures at 768 × 1152; the After the Eye scene at 768 × 1152. See [`export-report.json`](exports/candidate-02-r1/export-report.json) for exact hashes, modes and sizes. Masters remain separate so the delivery can be regenerated.

## Known review points

- Check the generated grey-lux edge darkening against Ali at the actual 256 px shipped size.
- Check the revised main gold-particle layout against Nova at actual gameplay size; it is intentionally a sparse, uneven edge treatment.
- Check the generated formal figure's face, body proportions, shoe baseline, transparent edges and scale beside the casual source.
- Check same-person continuity in the paparazzi image and actual After the Eye card crop.
- Check the sad face is restrained enough for the game's state treatment.
- Convert to final shipping dimensions/format only after visual approval; current generated PNGs are retained as masters.
