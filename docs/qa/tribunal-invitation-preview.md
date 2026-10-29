# Tribunal invitation preview

Use the local development build to review the production choice and cinematic handoffs.

1. Run `npm run dev` and open `http://localhost:5173/bbmobilenew/#/game?debug=1`.
2. In the QA Control Center, choose **Load Tribunal invitation preview**.
3. Check the **Agree** and **Exit** controls inside the Faux TV at 320 × 568 and desktop widths. Play waits for the decision.
4. **Agree** reveals the actual player's chosen figure and the two Tribunal members eliminated immediately before them. A nearby doorframe passes the camera, then the camera moves past the cast toward the window and settles on the city lights. Four small windows vary gently in brightness. The welcome copy appears on this held final view, with Continue available after 4.8 seconds. The exit history determines order, including same-week double eliminations and returning contestants. First and second arrivals show zero and one waiting jurors. Names identify the cast; their existing standing poses remain intact.
5. The compact gold **Continue season** button resumes the current phase. **Exit** shows a final look back: the player and luggage stand beyond the outward-facing Hub threshold, then generated walnut doors close in front of them. The doors hide both figures through physical overlap; the closed set remains visible. The compact gold **Home** button retires the run through the existing durable Abandon Season flow. Neither button has an arrow.
6. Reload the QA fixture to try both choices. **Load first Tribunal arrival preview** checks no waiting jurors; **Load second Tribunal arrival preview** checks one. **Load Back 2 the Game suppression preview** checks that the offer waits for the return competition.

The fixtures reset the current local season. Access remains behind the existing development/debug controls. A legacy QA profile receives sample Look 1; a selected catalogue look or uploaded portrait is preserved.

The scenes use generated empty architectural backplates, with the actual cast on independent layers. A fixed 4:5 composition preserves the window, doorway and figure anchors across portrait phone sizes. Uploaded photos, legacy profiles without a body, and failed body assets use framed portraits. There is no walking simulation, particle system, video or runtime canvas. Camera and door motion stop at the final composition; only four tiny light-opacity animations continue on the city. Skip shows the final city view or closed doorway immediately. Reduced-motion/animation-off settings also keep the lights static. The selected handoff survives a saved-run reload; failed storage cleanup keeps Exit available for retry.

Only the selected scene and cast load. Cast WebPs are bounded at 400 × 600 pixels; backplates are 800 × 1000. The window is about 131 KiB; the exit set, shared door leaf, and luggage total about 138 KiB. The browser tests check a 6 MiB conservative decoded-image budget for the catalogue arrival, chronological juror identities, portrait geometry, compact controls, the final city framing, door occlusion, and only four light animations after settling. Review at 320 × 568 and 402 × 874 first; desktop remains a portrait presentation. Real-device performance has not been measured.

The reusable placement and asset contract is recorded in [tribunal-stage.md](tribunal-stage.md). To prepare compact derivatives after changing existing casual cast artwork, run:

```bash
node scripts/prepare-tribunal-artwork.mjs
```

The complete built-in generation prompts and source filenames are in [tribunal-artwork-v4.json](tribunal-artwork-v4.json). Encode approved PNG masters named `sequester-window.png`, `farewell-set.png`, `farewell-door.png`, and `farewell-luggage.png` with:

```bash
node scripts/prepare-tribunal-environment.mjs <source-directory>
```

Repeat the browser review with saved screenshots:

```bash
npx playwright test e2e/playwright/tribunal-invitation-preview.spec.ts --project=narrow-chromium --project=iphone-17-chromium --project=wide-desktop-chromium
```
