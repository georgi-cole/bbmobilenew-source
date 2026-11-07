# CS-00 result — candidate 01 art pack

**Status:** technically complete and user-accepted on 26 October 2026. CS-01 is now eligible; later tickets remain subject to their own dependencies and acceptance gates.

## Deliverable

Candidate 01 has the six required scenes plus a derived thumbnail in [`cs-00/exports/identity-01-r1/`](../../cs-00/exports/identity-01-r1/). The frozen masters, identity sheet, prompts, lineage, hashes and export script are retained under [`cs-00/`](../../cs-00/). The art remains outside `public/` and is not selectable at runtime.

- [Six-role review sheet](../../cs-00/evidence/six-image-contact-sheet.png)
- [Technical and internal visual review](../../cs-00/review.md)
- [Frozen identity sheet](../../cs-00/identity-sheet.md)
- [Prompts and generation lineage](../../cs-00/prompts.md)
- [Provenance ledger](../../cs-00/provenance.json)
- [Authoritative export measurements and SHA-256](../../cs-00/exports/identity-01-r1/report-v3.json)

## Validation

- Ran `python docs/character-customization/cs-00/prepare_pack.py` from the repository root; exit code 0. It decoded/re-exported all seven roles and reported **358,964 bytes** of delivery artwork plus **13,070,561 bytes** of retained PNG masters.
- Each role met its recorded dimensions and byte ceiling. A second WebP encode matched each export's recorded SHA-256.
- Casual and formal cutouts were inspected full-size over dark, light and saturated teal backgrounds. Alpha-threshold-127 bounds align at the crown (3.45%) and soles (~96.4%); no visible haze, matte rectangle, halo or missing hair, hands or footwear was noted in those composites. Maximum source alpha is 254.
- Main, grey and sad portraits and CSS-derived scene crops were reviewed at the sizes described in [`cs-00/review.md`](../../cs-00/review.md). The 360x780, 390x844 and 1280x900 boards are static previews, not runtime screenshots.
- No source code or package manifest was changed, so repository-wide `check:pr` and dependency audit were not run for this art-only ticket.

## Acceptance and next work

The user accepted candidate 01 as-is and specified the visual standard for future portrait work: match the placement/distribution of the existing game's gold particles and the darker outer tones of the Ali grey-lux portrait. The accepted candidate-01 backgrounds remain unchanged. The pack is still isolated outside runtime/catalog integration. Image-generation model/version metadata was unavailable and is documented as a provenance limitation.
