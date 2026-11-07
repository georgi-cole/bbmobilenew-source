# CS-00 candidate 01 art pack

**State: user-accepted art candidate (26 October 2026).** This is a technically checked, isolated art pack. Nothing here is in `public/`, a runtime catalog, or the player selector. Candidate 01 is accepted as-is; future portraits should match the existing in-game gold-particle treatment, and future grey-lux portraits should follow the darker outer tones visible in Ali's `backup-grey-lux` reference.

## Deliverables

Seven deterministic WebP exports are in [`exports/identity-01-r1/`](exports/identity-01-r1/): casual, main, grey, formal, sad, paparazzi and a thumbnail derived from the casual cutout. The authoritative measurements and SHA-256 values are in [`report-v3.json`](exports/identity-01-r1/report-v3.json). Combined delivery size: **358,964 bytes (350.55 KiB)**.

The six frozen PNG masters are in [`masters/`](masters/). Reused casual and main sources are exact copies of the earlier candidate-01 masters; their original files and full source prompts remain in [`look-pilot/masters/`](../look-pilot/masters/) and [`look-pilot/source-prompts.md`](../look-pilot/source-prompts.md). Four new masters were generated for this ticket. See [`identity-sheet.md`](identity-sheet.md), [`prompts.md`](prompts.md), [`provenance.json`](provenance.json), and [`review.md`](review.md) for identity freeze, source lineage, hashes, technical findings and the acceptance gate.

## Visual evidence

- [Six-role contact sheet](evidence/six-image-contact-sheet.png)
- [Casual and formal alpha on dark, light and saturated backgrounds](evidence/alpha-three-backgrounds-v2.png)
- [Full-resolution casual alpha: dark](evidence/alpha-fullsize-casual-dark.png), [light](evidence/alpha-fullsize-casual-light.png), [teal](evidence/alpha-fullsize-casual-teal.png)
- [Full-resolution formal alpha: dark](evidence/alpha-fullsize-formal-dark.png), [light](evidence/alpha-fullsize-formal-light.png), [teal](evidence/alpha-fullsize-formal-teal.png)
- [Main, grey and sad at 32/48/64/72 px](evidence/portrait-states-32-48-64-72.png)
- [Candidate 01 beside existing cast for style only](evidence/cast-style-comparison.png)
- [Derived thumbnail on three backgrounds](evidence/thumbnail-128-backgrounds.png)
- After the Eye CSS crops at [360x780](evidence/after-eye-photo-crop-360x780.png), [390x844](evidence/after-eye-photo-crop-390x844.png) and [1280x900](evidence/after-eye-photo-crop-1280x900.png), with a [comparison sheet](evidence/after-eye-crop-comparison.png)
- CSS-derived Tribunal art-fit boards at [360x780](evidence/tribunal-stage-static-360x780.png), [390x844](evidence/tribunal-stage-static-390x844.png) and [1280x900](evidence/tribunal-stage-static-1280x900.png)
- [Combined static scene previews at 360x780](evidence/scene-static-360x780.png), [390x844](evidence/scene-static-390x844.png) and [1280x900](evidence/scene-static-1280x900.png)

All scene boards are static CSS-derived previews, not runtime or native screenshots. The existing After the Eye photo card uses `object-fit: cover` and `object-position: center top`; its responsive photo crops were measured from the current stylesheet. The selected paparazzi source/export remains 2:3 to match the reviewed in-game photo set. This decision does not change build-validator policy.

## Reproducibility and prior evidence

Run `python docs/character-customization/cs-00/prepare_pack.py` from the repository root to rebuild the same exports from the frozen masters. The script records Pillow 12.3.0 and Python 3.14.6, resampling, WebP settings, dimensions, bytes, alpha counts and hashes. It confirms that an in-memory second WebP encode matches each saved output byte-for-byte. It refuses to replace differing outputs and writes a versioned report/evidence file when a prior result differs.

`exports/identity-01-r1/report.json` and `evidence/alpha-three-backgrounds.png` are retained from the first partial evidence run; the overview sheet cut off the final row. `report-v2.json` supersedes the initial report, and `report-v3.json` is authoritative because it records the corrected complete sheet and six full-resolution alpha composites. The old files are not the acceptance evidence.

## Acceptance status

The user accepted candidate 01 on 26 October 2026, with the style note above for future portraits. The gold-particle placement and grey-lux background on this accepted pack remain unchanged. This accepts the art direction for candidate 01; it does not integrate the pack into runtime or catalog code.
