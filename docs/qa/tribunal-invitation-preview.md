# Tribunal invitation preview

Use the local development build to inspect the production post-elimination invitation in the Faux TV.

1. Start the app with `npm run dev`.
2. Open `http://localhost:5173/bbmobilenew/#/game?debug=1`.
3. In the QA Control Center's Overview, choose **Load Tribunal invitation preview**. It closes the panel and loads the actual GameScreen invitation.
4. Resize the browser to a narrow phone (320 × 568) and a desktop width to review the Faux TV framing and Continue button.
5. Reopen the 🐛 panel and choose **Load Back 2 the Game suppression preview** to see the active return competition while the invitation waits.

The QA Control Center is available only through the existing local debug access. The invitation preview resets the current local season state.

For repeatable layout checks with saved screenshots, run:

```bash
npx playwright test e2e/playwright/tribunal-invitation-preview.spec.ts --project=narrow-chromium --project=wide-desktop-chromium
```
