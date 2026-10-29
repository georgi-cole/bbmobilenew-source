# Tribunal invitation preview

Use the local development build to review the production choice and cinematic handoffs.

1. Run `npm run dev` and open `http://localhost:5173/bbmobilenew/#/game?debug=1`.
2. In the QA Control Center, choose **Load Tribunal invitation preview**.
3. Check the **Agree** and **Exit** controls inside the Faux TV at 320 × 568 and desktop widths. Play waits for the decision.
4. **Agree** reveals the actual player's chosen figure and up to two current Tribunal members inside a lounge with a wide city window. Names identify the cast. The figures remain in their existing standing poses. The selected occupancy matches zero, one, or at least two available members.
5. **Continue season** resumes the current phase. **Exit** shows the departing player beside a separate outward-facing Hub exit with the city beyond. The player dissolves, the doors close, then the scene fades to dark. **Return home** retires the run using the existing durable Abandon Season flow.
6. Reload the QA fixture to try both choices. **Load first Tribunal arrival preview** checks the empty lounge. **Load Back 2 the Game suppression preview** checks that the offer waits for the return competition.

The fixtures reset the current local season. Access remains behind the existing development/debug controls. A legacy QA profile receives sample Look 1; a selected catalogue look or uploaded portrait is preserved.

The setting uses CSS architecture and existing game figures on independent layers. No generated background or bespoke character pose is needed. The cast reveals through short opacity fades with stable placement and contact shadows. Uploaded photos, legacy profiles without a body, and failed body assets use framed portraits. There is no walking simulation, particle system, video, canvas, or ongoing animation in gameplay. Skip and reduced-motion/animation-off settings are supported. The selected handoff survives a saved-run reload; failed storage cleanup keeps Exit available for retry.

Only the selected cast loads when a scene mounts: one player plus at most two waiting members. Prepared WebPs are bounded at 400 × 600 pixels each. The browser test checks a 3 MiB decoded-image budget for the catalogue fixture, actual roster identities, figure containment, and no running scene animations once settled. Real-device performance has not been measured.

The reusable placement and asset contract is recorded in [tribunal-stage.md](tribunal-stage.md). To prepare compact derivatives after changing existing casual cast artwork, run:

```bash
node scripts/prepare-tribunal-artwork.mjs
```

Repeat the browser review with saved screenshots:

```bash
npx playwright test e2e/playwright/tribunal-invitation-preview.spec.ts --project=narrow-chromium --project=wide-desktop-chromium
```
