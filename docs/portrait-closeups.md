# Offline Standard portrait close-ups

All 35 changing-room looks now have a dedicated `grey-closeup.webp`, recovered from matching 1254 × 1254 source PNGs on the authoring laptop. The delivered images are resized from those masters to 960 × 960 and encoded as WebP quality 70. Faces, clothes, neutral grey backgrounds and composition are preserved; some fine texture is reduced compared with the full-size masters. No regeneration or thumbnail upscaling was needed. `portrait-closeups.json` records source identifiers, source hashes, delivered hashes and encoding settings.

The existing 256 × 256 menu portraits remain unchanged. Standard elimination/return overlays, the alternate eviction splash and Down Memory Lane portraits use the larger candidates, with the existing grey thumbnail and normal avatar as fallbacks. Regular housemates already have large grey portraits and retain those. Uploaded profile photos retain their existing handling. The existing full-size image backing layer was verified in Chromium and WebKit; no camera timing or CSS changes were necessary.

These files are ordinary bundled public assets, outside the optional VIP pack. All 35 compact portraits decoded at 960 × 960 in both engines with external requests blocked. Mobile packaging retained them byte-for-byte. Music, audio and credits matched the baseline APK byte-for-byte (26 files checked).

## Size measurement

Same source baseline and Android debug configuration, November 17, 2026:

| Measurement      |       Bytes | Decimal MB |
| ---------------- | ----------: | ---------: |
| Before APK       | 182,171,219 |     182.17 |
| After APK        | 183,828,135 |     183.83 |
| APK increase     |   1,656,916 |       1.66 |
| Added image data |   1,649,152 |       1.65 |

Both APKs were rebuilt cleanly. The earlier 5.39 MB figure included retained space in an incremental APK; the compact build adds 1.66 MB against the clean baseline. Archive overhead accounts for the small difference from image bytes. These are local debug APK measurements, not App Store or Play download estimates. No iOS build was measured or uploaded for this change.

## Validation

- `npm run check:pr`: passed, including 510 core regression tests.
- Portrait resolution, coverage, integrity, fallback and overlay tests: 27 passed.
- Chromium and WebKit: the original overlay check loaded its full-size portrait at a 390 × 844 viewport with device scale factor 3; final-size backing layer active in both. After compaction, both engines decoded all 35 bundled 960-pixel portraits with external network requests blocked.
- Full elimination integration file: two existing Battle Back replay-dialog failures, reproduced unchanged using the baseline test file. The portrait-related overlay tests pass.

This addresses the identified Standard portrait enlargement paths, not a guarantee that every asset in every game mode is free of softness. In particular, unrelated gold menu portraits, player-supplied photos and optional full-body cinematic poses have independent source resolutions. Physical-device visual acceptance remains to be checked.
