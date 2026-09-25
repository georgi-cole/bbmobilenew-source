# Ads Integration Guide

This document describes the ad hook architecture implemented in the game layer, what placements exist, what rewards they grant, and what native Android/iOS wrappers must implement to activate real ad monetisation.

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
  └── window.GameAds (injected by native wrapper)
        ├── showInterstitial(placement)
        └── showRewarded(placement)

Native Wrapper (Android / iOS)
  │
  ├── Injects window.GameAds into the WebView JS environment
  ├── Shows real ads via AdMob / ironSource / MAX / etc.
  └── Calls window.onAdRewardGranted(placement, payload?) on reward completion
```

The game never shows real ad UI itself — it only calls the bridge.  
If `window.GameAds` is absent (web / dev), every call is a **safe no-op** and gameplay continues normally.

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

| Placement | Trigger |
|---|---|
| `live_vote_auto` | Before each normal house vote when the game enters `live_vote` |
| `safety_decision_auto` | Every second applicable Safety day, just before the POS decision presentation (`pos_ceremony_results`) |
| `final3_part1_break` | After Final 3 Part 1, before Part 2 begins (`final3_comp2`) |
| `final3_part2_break` | After Final 3 Part 2, before Part 3 begins (`final3_comp3`) |
| `final3_part3_break` | After Final 3 Part 3, before the final decision/ceremony (`final3_decision`) |

Every automatic placement is preceded by the in-game **SHORT BREAK** announcement. The game records a stable season/day/phase break key when the break is queued, so a reload or re-render cannot stack the same automatic commercial twice.

Advertising V2 intentionally has **no post-eviction interstitial and no finale-recap interstitial**.

### Optional Rewarded Ads

These are opt-in; the user must tap "Watch Ad" to proceed.  
**They remain available even if the user owns the No Ads Pack.**

| Placement | Trigger | Reward | Limit |
|---|---|---|---|
| `competition_retry` | User finishes last in a LOH or POS competition (except during the Final-3 week) | Re-enter the competition (native wrapper controls re-entry UX) | No daily limit (suppressed automatically during Final-3 week) |
| `social_energy_recharge` | User's social energy drops to 0 **and** week ≠ 1 **and** not Final-3 week **and** current phase is `social_1` or `social_2` | +6 social energy | Once per day |
| `public_meter_audience_insight` | User's public approval is below 40% in Public Mode | One qualitative Focus Group insight drawn from the player's real audience-model history; **does not change approval** | Once per day |

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

After passing guards, `recordAdShown(placement)` is dispatched to persist the daily-limit date.

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

## What Native Android / iOS Must Implement

### 1 — Inject `window.GameAds`

The native wrapper (Capacitor plugin, WebView bridge, etc.) must inject a JavaScript object before the page loads, or as early as possible:

```js
// Android: use addJavascriptInterface / evaluateJavascript
// iOS:     use WKUserContentController or evaluateJavaScript

window.GameAds = {
  showInterstitial: function(placement) {
    // Load and show a full-screen interstitial ad.
    // The game does NOT wait for a callback — it continues immediately.
    NativeBridge.showInterstitial(placement);
  },
  showRewarded: function(placement) {
    // Load and show a rewarded ad.
    // When the user completes the ad, MUST call window.onAdRewardGranted().
    NativeBridge.showRewarded(placement);
  }
};
```

### 2 — Fire the reward callback

After the user completes a rewarded ad, the native side **must** call:

```js
window.onAdRewardGranted(placement, payload);
```

Examples:

```js
// competition_retry — no extra payload needed
window.onAdRewardGranted('competition_retry');

// social_energy_recharge — no extra payload needed (game adds +6 energy)
window.onAdRewardGranted('social_energy_recharge');

// public_meter_audience_insight — no payload needed.
// The game selects one grounded Focus Group insight from current Public Mode data.
window.onAdRewardGranted('public_meter_audience_insight');
```

**Important:** only call `window.onAdRewardGranted` when the user actually *completed* the ad.  If they skip or the ad fails, do not call it — the game will not grant the reward.

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
import { resetDailyUsage } from '../store/adsSlice';
dispatch(resetDailyUsage());
```

Or directly in the browser console:

```js
window.__store.dispatch({ type: 'ads/resetDailyUsage' });
```
