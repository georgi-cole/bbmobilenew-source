# Candidate 05 — complete-look draft r1

**Status: six game roles assembled for review; not user-accepted or runtime-ready.** This folder has one intended image for each scene role, plus compressed exports and one derived thumbnail. The grey-lux role is a separate portrait with the neutral grey and darker outer tones from Ali’s backup. No game code, catalog, store offer, or public asset changed.

## Identity and art direction

Candidate 05 is the existing fictional adult woman from `look-pilot/masters/identity-05-everyday-body.png`: medium warm olive skin, long dark-brown waves, brown eyes, and gold hoops. Casual streetwear uses a rust-orange bomber jacket, black top, charcoal cargo trousers, and high-top sneakers. Formalwear is a cobalt tailored jumpsuit. Paparazzi is an airport-arrivals scene, distinct from Candidate 04's daytime gallery courtyard.

## Review

![Candidate 05 six-role review](exports/candidate-05-r1/six-role-review.jpg)

![Gold particle treatment comparison](exports/candidate-05-r1/gold-treatment-reference-comparison.jpg)

## Delivery and validation

The WebP exports are in `exports/candidate-05-r1/`; `export-report.json` records dimensions, alpha extrema, byte counts, and hashes. The build script creates the resized WebP files, 128 px derived thumbnail, role review, and gold-treatment comparison.

- Casual and formal are RGBA full-body cutouts; transparency is preserved in WebP.
- The gold-particle treatment was checked directly against `public/assets/skins/Nova_avatar.webp`. It keeps a mostly black field and subdued edge particles; no broad bright stream or gold glow was added over the subject.
- The sad portrait reuses the same subdued background treatment.
- Paparazzi uses an indoor airport arrivals background, not another generic night street or gallery courtyard.
- Character continuity and cast distinctness remain pending visual acceptance.
