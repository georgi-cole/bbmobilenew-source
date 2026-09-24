# Eyeolean Economy

Eyeoleans are the persistent soft currency for the player profile. They replace XP as the player-facing progression/reward loop and are designed to fund a future Store without turning normal gameplay into a grind.

## Product rules

Eyeoleans reward **authoritative season outcomes**, not raw click volume or arbitrary minigame score. Season-performance rewards are calculated from canonical stats and banked at settlement, so the finale acts as a payday rather than every individual action minting currency.

| Result                           |                                          Eyeoleans |
| -------------------------------- | -------------------------------------------------: |
| Season winner                    |                                            100,000 |
| Runner-up                        |                                             50,000 |
| Public Favorite                  | 25,000 by default; uses the admin-configured award |
| Final LOH                        |                                             15,000 |
| LOH win                          |                                        10,000 each |
| Safety win                       |                                         8,000 each |
| Back 2 the Game win              |                                         8,000 each |
| Tribunal member                  |                                              5,000 |
| Survive double eviction          |                                              7,000 |
| Survive triple eviction          |              10,000 when an authoritative flag exists |
| Correct Public Favorite forecast |                                              2,500 |

The starting values deliberately preserve the relative shape of the former season score model at 1 point = 1,000 Eyeoleans, while removing the old special-case rule that reduced the combined reward when one player won both the season and Public Favorite. Currency rewards are additive.

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

Profiles created before the Eyeolean economy keep any already-earned Public Favorite forecast rewards. Existing forecast event IDs are migrated at 2,500 Eyeoleans per paid event. Legacy XP remains readable for compatibility but is no longer displayed or awarded.

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
