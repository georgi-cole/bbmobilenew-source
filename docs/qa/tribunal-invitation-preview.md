# Tribunal invitation preview

Use the development build to review the actual invitation and cinematic handoffs.

1. Run `npm run dev` and open `http://localhost:5173/bbmobilenew/#/game?debug=1`.
2. In the QA Control Center, choose **Load Tribunal invitation preview**.
3. Check **Agree** and **Exit** inside the Faux TV at 320 × 568 and 402 × 874. Play waits for the decision.
4. **Agree** reveals the actual selected player and the two jurors eliminated immediately before them. The camera moves past the cast toward the window, keeps feet on the floor until figures clear, then holds the sharp city view. The welcome message and compact gold **Continue season** appear after the hold.
5. **Exit** frames the complete departure doorway, closes the doors over the player and luggage, then pans and pushes toward a separate city window. The city holds before the goodbye message and compact gold **Home** appear. Home retires the run through the existing durable Abandon Season flow.
6. Keep Music enabled to hear the existing Twin Shock presentation cue. It continues on the held city view until Continue season or Home is clicked, when a short fade starts immediately. Skip finishes the camera sequence while retaining that cue.
7. Reload the fixture to try both choices. **Load first Tribunal arrival preview** checks zero waiting jurors; **Load second Tribunal arrival preview** checks one. **Load Back 2 the Game suppression preview** checks that the offer waits for the return competition.

The fixtures replace the current local season and stay behind the development/debug controls. A legacy QA profile receives sample Look 1; a selected catalogue look or uploaded portrait is preserved.

Both films fill a portrait phone screen. Names have no visual tags; actual cast identity remains available through image alternatives. The gold actions are at most 180 pixels wide, at least 44 pixels tall, and have no arrow. Reduced-motion and animations-off settings show the final city with static lights. The chosen handoff survives a saved-run reload; failed durable cleanup keeps Exit available for retry.

A browser-reported data-saving preference or 2G/slow-2G connection selects a complete charcoal-and-gold title card without requesting scene images or a new cinematic cue. Elsewhere, the same card takes over if artwork misses its 1.8-second preparation deadline or critical scene art fails. It stays in place if late images arrive. To review this manually, use a data-saving browser where available or throttle uncached artwork past that deadline. The automated browser cases emulate both paths. Uploaded portraits and failed body derivatives retain the normal portrait presentation when scene art is available.

Only the chosen scene and cast load. A native tall phone city is revealed through masked window openings, so the final image is not an enlarged crop of a small room backplate. Cast images are bounded at 400 × 600; architectural backplates are 800 × 1000. Browser checks enforce a conservative 14 MiB decoded-image budget and sufficient native pixels for the phone close-up. Four small window lights animate gently after the camera stops; reduced motion disables them. There is no gameplay video, canvas or continuous camera loop. Real-device performance has not been measured.

The placement, camera and audio contract is in [tribunal-stage.md](tribunal-stage.md). Prepare compact cast derivatives with:

```bash
node scripts/prepare-tribunal-artwork.mjs
```

Generated architecture prompts and source filenames are in [tribunal-artwork-v4.json](tribunal-artwork-v4.json) and [tribunal-artwork-v8.json](tribunal-artwork-v8.json). Keep the approved PNG masters together and encode the current departure/window and phone-city derivatives with:

```bash
node scripts/prepare-tribunal-environment.mjs <source-directory> farewell-window
node scripts/prepare-tribunal-environment.mjs <source-directory> phone-city
```

The native phone-city master is named `phone-city.png`; the departure master is `farewell-window.png`. Originals remain unchanged. Omitting the optional asset name also prepares the existing v4 masters found in that source directory.

Repeat the browser review with saved screenshots:

```bash
npx playwright test e2e/playwright/tribunal-invitation-preview.spec.ts --project=narrow-chromium --project=iphone-17-chromium --project=wide-desktop-chromium
```
