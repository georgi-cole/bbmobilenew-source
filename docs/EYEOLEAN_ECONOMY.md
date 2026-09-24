# Eyeolean Economy

Eyeoleans are the persistent soft currency for the player profile. They replace XP as the player-facing progression/reward loop and are designed to fund a future Store without turning normal gameplay into a grind.

## Product rules

Eyeoleans reward **authoritative season outcomes**, not raw click volume or arbitrary minigame score. Season-performance rewards are calculated from canonical stats and banked at settlement, so the finale acts as a payday rather than every individual action minting currency.

| Result                           |                                          Eyeoleans |
| -------------------------------- | -------------------------------------------------: |
| Season winner                    |                                            100,000 |
| Runner-up                        |                                             50,000 |
| Public Favorite                  | 25,000 by default; uses the admin-configured award |
| Final LOH                        |                                             10,000 |
| LOH win                          |                                         5,000 each |
| Safety win                       |                                         4,000 each |
| Back 2 the Game win              |                                         6,000 each |
| Tribunal member                  |                                              2,000 |
| Survive double eviction          |                                              3,000 |
| Survive triple eviction          |            5,000 when an authoritative flag exists |
| Correct Public Favorite forecast |                                              5,000 |

The three anchor rewards remain intentionally large: 100,000 for winning, 50,000 for runner-up, and 25,000 for Public Favorite. Secondary achievements are deliberately smaller so a competition-heavy non-finalist does not routinely out-earn a finalist. Currency rewards remain additive, including winner + Public Favorite.

## What does not pay Eyeoleans

For the first economy version, these do **not** credit the persistent wallet:

- raw minigame score;
- repeatable social actions;
- nominations received;
- individual taps, moves, coins, or other farmable interactions;
- Secret Mission completion when the mission already grants a gameplay reward;
- local Eyeolean-like balances used inside a competition as that competition's scoring mechanic.

This prevents players from optimizing repetitive actions instead of trying to play the season well, and keeps future Store prices economically meaningful.

Double-eviction survival is already recorded by the game when that twist resolves. Triple-elimination history exists in recap data, but there is not yet a canonical player-level triple-survival mutation in the current engine; the 10,000 reward is therefore reserved and will only pay once that authoritative flag is produced.

## Persistence and idempotency

The wallet lives on the selected local profile and is persisted by the existing profile persistence layer.

A season is settled with a stable settlement ID. Reopening/reloading the finale therefore cannot pay the same season twice. Store debits also require a transaction ID and are rejected when duplicated or when the balance is insufficient. Recent ledger rows can be trimmed for display without losing the longer-lived processed transaction IDs used for duplicate protection.

Guest play can show the season's calculated payout, but does not bank it because guest profiles are intentionally non-persistent.

Profiles created before the Eyeolean economy keep any already-earned Public Favorite forecast rewards. Existing forecast event IDs are migrated at 5,000 Eyeoleans per paid event. Legacy XP remains readable for compatibility but is no longer displayed or awarded.

## Future Store contract

The profile wallet already supports atomic soft-currency debits, so future Store items can use stable transaction IDs such as:

- skins / themes;
- cast or player unlocks;
- one-time gameplay rewards;
- other permanent or consumable unlocks.

Do not implement real-money-to-Eyeolean purchases by directly crediting the current local reducer. The current wallet is client/localStorage state and is appropriate only for non-paid soft currency.

Before real money is enabled:

1. make the wallet/ledger server-authoritative for signed-in users;
2. validate App Store / Google Play / payment-provider receipts on the server;
3. create idempotent purchase-credit transactions server-side;
4. return the authoritative balance and entitlements to the client;
5. support purchase restoration and reconciliation across devices.

That boundary prevents a modified client or edited localStorage value from minting paid currency.


## Calibration layer

Reward values are not considered permanently balanced just because the arithmetic is correct. The repository now has a calibration layer that measures the distribution produced by real or simulated completed-season summaries before Store prices are locked.

`src/economy/eyeoleanCalibration.ts` reports:

- minimum, mean, median, P25, P75, P90, P95, and maximum payout;
- finalist, winner, runner-up, Public Favorite, comeback, competition-heavy, and non-finalist segments;
- reward-source contribution to total minted currency;
- how often a non-finalist reaches the 25,000 Public Favorite anchor or 50,000 runner-up anchor.

The human-like Playwright season simulator now writes an `economySample` into completed simulation reports. It uses an authoritative archived summary when the eliminated-season resolver has already produced one, otherwise it accepts the live state only after `seasonComplete`. Partial/action-budget runs are excluded instead of being treated as zero-payout seasons.

Run the calibration matrix with:

```powershell
npm run test:eyeolean-calibration
```

The default matrix runs one seeded Classic season for each of the 15 existing simulation personas and rotates competition skill. It is a calibration smoke, not a statistically sufficient balance study. For a product-tuning batch, raise the sample count explicitly, for example:

```powershell
$env:EYEOLEAN_CALIBRATION_COUNT = '1000'
npm run test:eyeolean-calibration
```

The batch command generates the normal per-season Playwright reports and then writes `test-results/eyeolean-calibration-summary.json`. Existing reports can be re-aggregated with `npm run report:eyeolean-calibration`.

A 1,000-season run is intentionally manual rather than PR CI: these are full UI-driven seasons and are much more expensive than reducer/unit tests. Calibration reports also exclude simulation samples that contain an error-severity auditor finding.

The first balance guardrail is that the P90 non-finalist payout should remain below the 50,000 runner-up anchor. We should also inspect the share of currency coming from secondary rewards before setting Store prices. The calibration report is evidence for price bands; it does not auto-change rewards or prices.

The 5,000 correct Public Favorite forecast reward is a separate meta-game credit and is not part of the season-settlement distribution. It should be calibrated separately once forecast-attempt and forecast-hit rates are collected at scale.
