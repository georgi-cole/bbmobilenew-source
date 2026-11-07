# Candidate 04 — complete-look draft r1

**Status: six game roles assembled for review; not user-accepted or runtime-ready.** This folder contains one final intended image per scene role, plus format exports and a derived thumbnail. Grey-lux is a separate portrait with the neutral grey and darker outer tones from Ali’s backup. No game code, catalog, store offer, or public asset changed.

## Identity and art direction

Candidate 04 is the existing fictional adult woman from `look-pilot/masters/identity-04-everyday-body.png`: fair freckled skin, green eyes, long auburn curls. Her casual outfit was changed to a forest-green cropped knit cardigan, ivory blouse, charcoal wide-leg trousers, and ankle boots to give this roster more silhouette variety. The formal look is a deep forest-green midi dress. Paparazzi art uses a sunny art-gallery courtyard rather than the repeated night-street setting.

## Review

![Candidate 04 six-role review](exports/candidate-04-r1/six-role-review.jpg)

## Delivery

The WebP exports are in `exports/candidate-04-r1/`; exact dimensions, alpha extrema, byte counts, and hashes are recorded in `export-report.json`. `build_pack.py` deterministically creates the resized WebP files, a 128 px thumbnail, and the review sheet from the retained single-role masters.

## Validation

- Casual and formal are RGBA full-body cutouts with non-opaque alpha; their transparency is preserved in WebP.
- Main and sad portraits use one gold-particle treatment; the main portrait is reused in the grey-lux slot.
- Paparazzi image has a distinct daytime courtyard background.
- The original generated casual draft that had an opaque background was discarded; it is not included in this pack.
- Character continuity and cast distinctness still need visual acceptance.
