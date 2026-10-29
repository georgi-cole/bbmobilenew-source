# Tribunal invitation preview

Use the local development build to review the production choice and cinematic handoffs.

1. Run `npm run dev` and open `http://localhost:5173/bbmobilenew/#/game?debug=1`.
2. In the QA Control Center, choose **Load Tribunal invitation preview**.
3. Check the **Agree** and **Exit** controls inside the Faux TV at 320 × 568 and desktop widths. Play waits for the decision.
4. **Agree** opens a first-person view into sequester. At most two anonymous seated members provide background presence; the still is illustrative and does not assign identities to current roster members. The selected occupancy matches zero, one, or at least two available members.
5. **Continue season** resumes the current phase. **Exit** leads to a matching closed-door frame and a quiet fade to black; **Return home** retires the run using the existing durable Abandon Season flow.
6. Reload the QA fixture to try both choices. **Load first Tribunal arrival preview** checks the empty lounge. **Load Back 2 the Game suppression preview** checks that the offer waits for the return competition.

The fixtures reset the current local season. Access remains behind the existing development/debug controls.

The visual treatment uses a single complete photographic frame and restrained opacity fades. There are no moving character cutouts, silhouette actors, vector props, scaling doors, particles, zooms, or continuous animation. Skip and reduced-motion/animation-off settings are supported. The selected handoff survives a saved-run reload; failed storage cleanup keeps Exit available for retry.

Only the selected 640 × 960 WebP loads when a scene mounts (2.34 MiB decoded). Current lounge variants are about 52–54 KiB each; the departure frame is about 24 KiB. The browser test checks a 3 MiB decoded-image budget and confirms no scene animations run once settled. Real-device performance has not been measured.

The complete built-in image-generation prompt set and generation filenames are recorded in [tribunal-artwork-v2.json](tribunal-artwork-v2.json). To encode approved PNG masters named `arrival-empty.png`, `arrival-one.png`, `arrival-two.png`, and `departure.png`, run:

```bash
node scripts/prepare-tribunal-artwork.mjs <source-directory>
```

Repeat the browser review with saved screenshots:

```bash
npx playwright test e2e/playwright/tribunal-invitation-preview.spec.ts --project=narrow-chromium --project=wide-desktop-chromium
```
