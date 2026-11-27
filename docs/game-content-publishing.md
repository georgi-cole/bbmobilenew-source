# Publish game content

Edit the content in `bbmobilenew-source`, open a review PR, and merge it once
**Validate content revisions** passes. **Publish game content** publishes the
reviewed JSON and media to the GitHub Pages site. It uses the existing
`PAGES_DEPLOY_TOKEN`. For recovery, run **Publish game content** on `main` from
GitHub Actions.

| Content                                                                 | Source                                                                                    | When an installed app sees an update                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Broadcasts, supported game and social settings, and Confessional tuning | `public/config/live-config.json`                                                          | Launch, foreground, and periodic refresh                         |
| Simulated weather and bulletins                                         | `public/config/weather-config.json` and `public/config/weather-bank.json`                 | The next weather refresh                                         |
| Credits cards and video                                                 | `public/config/credits.json` and `public/assets/credits/big-eye-cinematic-background.mp4` | The next visit to Credits on a build with the manifest loader    |
| After the Eye                                                           | `public/config/afterTheEyeOutcomes.json`                                                  | The next new issue generated on a build with the manifest loader |
| Don't Go Over questions                                                 | `content/cwgo.json`                                                                       | The next competition on a build with the manifest loader         |

Remote Manager and the individual manager screens publish into the source repo.
The workflow maintains the existing `config/` URLs for distributed builds. The
new loader reads `content/manifest.json` and downloads only the revisions it
needs. Each path includes the SHA-256 of its bytes. The workflow keeps previous
revisions online. To roll back, revert the affected content in the source repo
and merge the revert. The workflow publishes the earlier revision again.

The game can use a validated cached JSON revision offline, then falls back to its
bundled data. A Don't Go Over competition keeps the bank it started with. Credits
play the hosted video on first use and have an offline scene with the card copy.
The video is delivered as media and uses the existing playback timeout.

The mobile build stages the runtime assets approved in
`scripts/lib/mobile-cinematic-assets.mjs` and reports the uncompressed web size
by directory. The budget applies before Capacitor builds the native packages.
Use the store consoles to compare device download and install sizes.

For a local publication check, run these commands:

```sh
node scripts/prepare-game-content.mjs --check
npx vitest run tests/unit/gameContent
node --test scripts/content-publish-workflow.test.mjs scripts/mobile-cinematic-assets.test.mjs
npm run build:mobile
```
