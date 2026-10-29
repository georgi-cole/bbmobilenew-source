# Tribunal invitation preview

Use the local development build to inspect the production post-elimination invitation in the Faux TV.

1. Start the app with `npm run dev`.
2. Open `http://localhost:5173/bbmobilenew/#/game?debug=1`.
3. In the QA Control Center's Overview, choose **Load Tribunal invitation preview**. It closes the panel and loads the actual GameScreen invitation.
4. Resize to a narrow phone (320 × 568) and desktop width. Both **Agree** and **Exit** must remain within the Faux TV. The main Play control waits for your decision.
5. **Agree** opens the sequester arrival, using your character and up to four current Tribunal members. **Continue season** returns to the active season without advancing its phase.
6. Reload the preview, choose **Exit**, and watch the doorway departure and fade to black. **Return home** abandons the current run and removes its Continue save. This uses the same durable-save cleanup as the existing Abandon Season action.
7. **Load first Tribunal arrival preview** gives you an empty lounge; the copy explains that you are first to arrive. **Load Back 2 the Game suppression preview** checks that the invitation waits for the return competition.

Both scenes have **Skip animation** and respect the operating system's reduced-motion preference and the game's animation settings. Reduced motion shows the final composition immediately. The chosen handoff survives a saved-run reload; a failed storage cleanup keeps Exit open with a retry.

The animations use finite CSS transforms and opacity, with no video, canvas, particles, or frame-by-frame JavaScript during gameplay. Scene code and art load only after the choice. Existing cutouts are resized to 240 × 360 WebP; at most five are mounted. The room is 480 × 720. The doorway is the 32,250-byte generated frame from the [event animation lab](codex://threads/01a1839f-741b-74c3-a77c-a6c78bac5065); its original generation is recorded in that lab's ceremony-artwork.json. The departure keeps the current player's artwork, with a small vector suitcase.

Regenerate the thumbnails after changing source artwork with `node scripts/prepare-tribunal-artwork.mjs` (requires the development Playwright Chromium install). The source lounge and character art remain shared with existing game scenes. Real-device performance has not been measured.

The QA Control Center is available only through the existing local debug access. The invitation preview resets the current local season state.

For repeatable layout checks with saved screenshots, run:

```bash
npx playwright test e2e/playwright/tribunal-invitation-preview.spec.ts --project=narrow-chromium --project=wide-desktop-chromium
```
