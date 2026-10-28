# Ads Integration Guide

The game is connected to Google AdMob through `@capacitor-community/admob`.
`admobBridge.ts` implements the existing `window.GameAds` contract for both native
platforms. No custom Swift/Java advertising bridge is needed.

## Configure and test AdMob

1. Copy `.env.ios.example` to `.env.ios.local` (or the Android equivalents).
   The `.local` file is ignored by Git. Keep `VITE_ADMOB_MODE=test` while testing.
   Google demo app/ad unit IDs are selected automatically in this mode, even when
   your real IDs are configured. With no mode configured, advertising is off.
2. Use Xcode 26.2 or newer on a Mac (required by the plugin’s Google Mobile Ads
   13.11.0 dependency). Run `npm run sync:ios`, then `npx cap open ios`. Use
   `npm run sync:android` and `npx cap open android` for Android. These platform
   sync commands configure the native app ID as well as copying the web build.
   Use platform-specific sync commands for advertising builds.
3. On the device, open **Settings → Advertising privacy**, enter your real age, and enable
   **Optional advertising** for an adult player. Visit an existing reward prompt.
   Test completion, early dismissal, no connection, and several repeated rewards.
   Confirm No Ads/VIP suppress automatic breaks while rewards remain opt-in.
4. Use a regular iOS/Android build for SDK testing. The separate `mobile-dev`
   target intentionally keeps its local reward simulator instead of AdMob.

The iOS AdMob records created on 2026-10-28 are public integration identifiers,
not account credentials:

| Environment key              | iOS value                                |
| ---------------------------- | ---------------------------------------- |
| `VITE_ADMOB_APP_ID`          | `ca-app-pub-9243398419153145~3393385791` |
| `VITE_ADMOB_INTERSTITIAL_ID` | `ca-app-pub-9243398419153145/1852027238` |
| `VITE_ADMOB_REWARDED_ID`     | `ca-app-pub-9243398419153145/2733864063` |

One rewarded unit serves the existing voluntary placements. The game chooses the
reward for each placement; the AdMob reward amount/item does not change it.
Create separate Android app and ad unit records before configuring Android live
ads; iOS IDs cannot be reused there.

### Before switching to live ads

- In AdMob **Privacy & messaging**, create and publish a European regulations
  message for The Big Eye, using the current published privacy policy. Enable
  a direct **Do not consent** choice. The bridge requests UMP consent before
  initializing the live SDK and requires `canRequestAds`. Non-personalized
  requests still use this consent flow. Demo mode skips publisher UMP messaging
  because Google's demo app IDs do not belong to this publisher account.
- Publish the updated policy to the separately hosted legal site; editing this
  repository's policy copies does not publish that site. Review store privacy
  forms against the signed binary, including Google's SDK data disclosures.
- If enabling an IDFA explainer, configure it through UMP. Do not additionally
  request tracking in app code. The bridge does not request ATT itself.
- Info.plist includes the 50 SKAdNetwork identifiers listed in Google's iOS setup
  guide on 2026-10-28. Review the list again when changing ad providers or SDKs.
  Complete AdMob app verification/store linking and
  app-ads.txt as required by the dashboard before expecting unrestricted live ads.
- Set `VITE_ADMOB_MODE=live` with all three real platform IDs and rebuild/sync.
  `npm run prepare:store:ios` / `npm run prepare:store:android` reject test mode
  and Google demo IDs. A test build is not a monetizing release.

AdMob SDK initialization is deferred until an adult permits advertising. Both
native platforms delay app measurement initialization. Google privacy choices
are available in **Settings → Advertising privacy** for live builds, including when
the local advertising toggle is off. Withdrawal blocks further requests and
invalidates pending rewards. Changing runs also clears pending rewards.

The native bridge permits only one full-screen request at a time, handles load
and presentation failures, and waits for dismissal before releasing its slot.
Rewards require the SDK's earned result, not an ad click or dismissal. Daily
reward allowances are recorded after successful completion. Crystal Path's
turn clock pauses while its hint ad is pending.

References: [plugin setup](https://github.com/capacitor-community/admob),
[Google iOS setup](https://developers.google.com/admob/ios/quick-start),
[iOS demo units](https://developers.google.com/admob/ios/test-ads), and
[European message setup](https://support.google.com/admob/answer/10113207).

---

## Architecture Overview

```
Game Layer (Web / React)
  │
  ├── src/services/ads/adsService.ts   ← centralized guard + bridge calls
  ├── src/store/adsSlice.ts            ← Redux state: noAdsPack, daily usage, last comp finisher
  ├── src/store/adsMiddleware.ts       ← detects competition last-place via Redux actions
  ├── src/components/AdPrompt/         ← reusable rewarded-ad prompt modal
  │
  └── window.GameAds (installed by admobBridge.ts in native builds)
        ├── showInterstitial(placement)
        └── showRewarded(placement)

Native provider (@capacitor-community/admob → Google Mobile Ads SDK)
  │
  ├── Loads and shows interstitial/rewarded ads
  └── Resolves a boolean result consumed by adsService.ts
```

The game never shows real ad UI itself — it only calls the bridge.  
If `window.GameAds` is absent, the central service safely skips ad requests.
Existing offline reveal/minigame fallbacks remain available. The dedicated
mobile-dev build simulates the central rewarded callback.

---

## Bridge Contract

### Game → Native

```js
// Show a non-rewarded full-screen interstitial ad.
window.GameAds?.showInterstitial(placement)

// Show a rewarded ad. Native code must call window.onAdRewardGranted()
// after the user completes the ad to grant the in-game reward.
window.GameAds?.showRewarded(placement)
```

### Native → Game (callback)

```js
// Called by the native wrapper when the user finishes a rewarded ad.
// placement  — matches the placement string passed to showRewarded()
// payload    — optional extra data supplied by the native bridge when a placement needs it
window.onAdRewardGranted(placement, payload)
```

The game registers `window.onAdRewardGranted` at bootstrap via `initAdBridge()` (called in `src/main.tsx`).  
If the native side calls this before `initAdBridge` runs, the reward will be silently lost — native wrappers should delay the callback until the WebView's DOMContentLoaded / load event.

---

## Placements Reference

### Automatic Interstitials

These fire without any user action.  
**They are suppressed when the user owns the No Ads Pack.**

| Placement              | Trigger                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `live_vote_auto`       | Before each normal house vote when the game enters `live_vote`                                         |
| `safety_decision_auto` | Every second applicable Safety day, just before the POS decision presentation (`pos_ceremony_results`) |
| `final3_part1_break`   | After Final 3 Part 1, before Part 2 begins (`final3_comp2`)                                            |
| `final3_part2_break`   | After Final 3 Part 2, before Part 3 begins (`final3_comp3`)                                            |
| `final3_part3_break`   | After Final 3 Part 3, before the final decision/ceremony (`final3_decision`)                           |

Every automatic placement is preceded by the in-game **SHORT BREAK** announcement. The game records a stable season/day/phase break key when the break is queued, so a reload or re-render cannot stack the same automatic commercial twice.

Advertising V2 intentionally has **no post-eviction interstitial and no finale-recap interstitial**.

### Optional Rewarded Ads

These are opt-in; the user must tap "Watch Ad" to proceed.  
**They remain available even if the user owns the No Ads Pack.**

| Placement                        | Trigger                                                                                                                     | Reward                                                                                                                | Limit                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `competition_retry`              | User finishes last in a LOH or POS competition (except during the Final-3 week)                                             | Re-enter the competition (native wrapper controls re-entry UX)                                                        | No daily limit (suppressed automatically during Final-3 week) |
| `social_energy_recharge`         | User's social energy drops to 0 **and** week ≠ 1 **and** not Final-3 week **and** current phase is `social_1` or `social_2` | +6 social energy                                                                                                      | Once per day                                                  |
| `public_meter_audience_insight`  | User's public approval is below 40% in Public Mode                                                                          | One qualitative Focus Group insight drawn from the player's real audience-model history; **does not change approval** | Once per day                                                  |
| `eviction_vote_breakdown`        | Optional ballot reveal                                                                                                      | Reveal who voted for whom                                                                                             | Current reveal                                                |
| `vox_nomination_breakdown`       | Vox nomination prompt / Confessional                                                                                        | Reveal secret nomination ballots                                                                                      | Current reveal                                                |
| `vox_audience_preview`           | Vox audience preview prompt                                                                                                 | Reveal current audience voting information                                                                            | Current preview                                               |
| `favorite_player_audience_surge` | Public Favorite spotlight prompt                                                                                            | Existing +5-point audience surge                                                                                      | Existing spotlight rules                                      |
| `glass_bridge_hint`              | Crystal Path expert help                                                                                                    | Existing hint and time penalty                                                                                        | Existing per-run hint limit                                   |
| `big_spender_rescue`             | Big Spender rescue prompt                                                                                                   | Second Chance Wallet                                                                                                  | Existing rescue rules                                         |
| `survival_continue`              | Surveyeval recovery prompt                                                                                                  | Reassemble and resume the run                                                                                         | Existing three-recovery limit                                 |
| `aftermath_unlock`               | Season Complete Aftermath prompt                                                                                            | Open the fictional tabloid edition                                                                                    | Existing unlock flow                                          |

---

## Guard Logic

All ad requests pass through `canShowAd(placement, state, options)` in `adsService.ts`:

1. **No Ads / VIP** — effective No Ads ownership suppresses automatic interstitials but never voluntary rewarded placements.
2. **Daily limit** — if `state.ads.dailyUsage[placement]` equals today's ISO date string (`YYYY-MM-DD`), the call is a no-op.
3. **Final-3 week guard** — `competition_retry` is suppressed when `options.isFinal3Week === true` (≤ 3 players alive).
4. **Automatic break ledger** — each phase-driven commercial beat has a stable key persisted in `ads.automaticBreaks`; once handled, the same beat is not queued again after reload/re-render.

### `social_energy_recharge` additional guards (enforced in GameScreen)

The `social_energy_recharge` prompt is only shown when **all** of the following are true:

- `game.week !== 1` (not week 1 of the season)
- `alivePlayers.length > 3` (not the Final-3 week)
- `game.phase === 'social_1' || game.phase === 'social_2'` (currently in a social phase)
- User's social energy is `0`
- Daily limit not already reached

Rewarded usage is recorded on completion. Native interstitial usage is recorded
after successful presentation/dismissal. Failed or dismissed rewards do not
consume a daily allowance.

### `public_meter_audience_insight` behavior

The old approval-boost reward has been removed. Watching this ad cannot add approval points. Instead the game chooses one useful qualitative signal from the player's actual Public Mode receipts, such as:

- backlash for targeting an established favourite;
- sympathy or underdog momentum after repeated targeting/survival;
- visible romance or bromance response;
- entertaining conflict versus excessive pile-on behavior;
- social warmth or social misfires;
- competition-performance perception;
- loyalty, betrayal, or integrity concerns.

If no recent receipt exists, the insight falls back to the weakest current audience dimension (Charisma, Game, or Integrity).

---

## No Ads

No Ads is a permanent Store entitlement. It is available as a standalone product and is also
included effectively with VIP. `canShowAd()` checks the Store entitlement for automatic
interstitials, so purchase and restore reconciliation in the VIP/store layer immediately suppresses
those placements.

The legacy `ads.hasNoAdsPack` flag remains readable for older local saves, but new purchases should
not mutate it directly. Optional rewarded ads deliberately remain available to No Ads and VIP
owners.

---

## Contract for alternative native wrappers

The built-in AdMob bridge already implements this contract. The following legacy
callback form remains supported for custom wrappers. The AdMob bridge instead
returns `Promise<boolean>`; adsService.ts converts an earned result into the
same one-shot reward callback. A wrapper with `managesAdLifecycle: true` must
resolve on dismissal/failure, so the app need not impose a short reward timeout.

### 1 — Inject `window.GameAds`

The native wrapper (Capacitor plugin, WebView bridge, etc.) must inject a JavaScript object before the page loads, or as early as possible:

```js
// Android: use addJavascriptInterface / evaluateJavascript
// iOS:     use WKUserContentController or evaluateJavaScript

window.GameAds = {
  showInterstitial: function (placement) {
    // Load and show a full-screen interstitial ad.
    // The game does NOT wait for a callback — it continues immediately.
    NativeBridge.showInterstitial(placement)
  },
  showRewarded: function (placement) {
    // Load and show a rewarded ad.
    // When the user completes the ad, MUST call window.onAdRewardGranted().
    NativeBridge.showRewarded(placement)
  },
}
```

### 2 — Fire the reward callback

After the user completes a rewarded ad, the native side **must** call:

```js
window.onAdRewardGranted(placement, payload)
```

Examples:

```js
// competition_retry — no extra payload needed
window.onAdRewardGranted('competition_retry')

// social_energy_recharge — no extra payload needed (game adds +6 energy)
window.onAdRewardGranted('social_energy_recharge')

// public_meter_audience_insight — no payload needed.
// The game selects one grounded Focus Group insight from current Public Mode data.
window.onAdRewardGranted('public_meter_audience_insight')
```

**Important:** only call `window.onAdRewardGranted` when the user actually _completed_ the ad. If they skip or the ad fails, do not call it — the game will not grant the reward.

### 3 — Capacitor / Cordova / React Native

If the app is wrapped with Capacitor:

- Use a custom Capacitor plugin that bridges `GameAds` calls to the AdMob SDK.
- The plugin can call `webView.evaluateJavaScript("window.onAdRewardGranted('" + placement + "')")` after rewarded ad completion.

If using Cordova, use `cordova.exec` / `window.plugins` pattern similarly.

---

## Adding New Placements

1. Add the new placement string to the `AdPlacement` union type in `src/services/ads/adsService.ts`.
2. If it is automatic/interstitial, add it to `INTERSTITIAL_PLACEMENTS`.
3. If it needs a daily limit, add it to `DAILY_LIMITED_PLACEMENTS`.
4. Call `showInterstitial(placement, state, dispatch)` or `showRewarded(placement, state, dispatch, onReward)` at the appropriate point in the game flow.
5. Update this document.

---

## Daily Usage Reset

Daily usage is keyed by ISO date (`YYYY-MM-DD`). It resets automatically each new day — no scheduled job is needed.

To manually reset (e.g. for testing):

```ts
import { resetDailyUsage } from '../store/adsSlice'
dispatch(resetDailyUsage())
```

Or directly in the browser console:

```js
window.__store.dispatch({ type: 'ads/resetDailyUsage' })
```
