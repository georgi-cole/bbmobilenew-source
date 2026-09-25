# Store products release setup

The release includes eight permanent, user-facing one-time products for iOS and Android, plus
VIP upgrade SKUs used to honor credit from previously owned standalone products. Every product
must be configured as **non-consumable** in Apple App Store Connect and as a **one-time,
non-consumable product** in Google Play Console.

## Before creating the store listings

The permanent iOS, Android, and Capacitor identifier is
`com.georgicole.thebigeye`. Confirm that this exact ID is available in both
developer consoles before uploading the first release; changing it later creates
a different app.

Tribunal Mode remains reserved in code and hidden from the release store. No Ads is now a
released standalone product and is also included with VIP. Optional rewarded ads remain
available to No Ads and VIP owners; only automatic commercial breaks are suppressed.

## Product identifiers

Use the same IDs on both platforms:

| Product            | Product ID                                   | Grants                                        |
| ------------------ | -------------------------------------------- | --------------------------------------------- |
| The Big Eye VIP    | `com.georgicole.thebigeye.vip`               | All current standalone unlocks and VIP themes |
| Survival Mode      | `com.georgicole.thebigeye.survival`          | Survival Mode only                            |
| Public Mode        | `com.georgicole.thebigeye.publicmode`        | Public Mode only                              |
| Reality Mode       | `com.georgicole.thebigeye.dramamode`         | Reality Mode only                             |
| Cupid's Arrow      | `com.georgicole.thebigeye.cupidarrow`        | Cupid's Arrow seasonal expansion              |
| Vox Populi         | `com.georgicole.thebigeye.voxpopuli`         | Vox Populi seasonal expansion                 |
| Premium Challenges | `com.georgicole.thebigeye.premiumchallenges` | Remastered Find Your Twin 1 & 2               |
| No Ads             | `com.georgicole.thebigeye.noads`             | Removes automatic commercial breaks           |

The IDs can be overridden with the matching `VITE_*_PRODUCT_ID` values in the
platform environment files. The app always displays the localized title and
price returned by Apple or Google.

Set the normal VIP price below the combined price of the standalone products.
VIP is a permanent bundle, not a subscription.

### Launch pricing and VIP upgrade credit

The launch pricing model used by the app's upgrade resolver is:

| Product            | Nominal price |
| ------------------ | ------------: |
| Premium Challenges |          1.99 |
| Public Mode        |          2.99 |
| No Ads             |          2.99 |
| Surveyeval Mode    |          3.99 |
| Cupid's Arrow      |          3.99 |
| Vox Populi         |          3.99 |
| Reality Mode       |          4.99 |
| The Big Eye VIP    |         14.99 |

Qualifying standalone ownership earns **75% credit** toward a later VIP purchase. Credit stacks,
but never grants VIP automatically. The calculated target is mapped to the nearest configured
store tier and the upgrade cannot fall below 4.99.

Configure these additional non-consumable VIP upgrade products on both platforms:

| Nominal tier | Product ID                                 |
| -----------: | ------------------------------------------ |
|        13.49 | `com.georgicole.thebigeye.vip.upgrade1349` |
|        12.99 | `com.georgicole.thebigeye.vip.upgrade1299` |
|        11.99 | `com.georgicole.thebigeye.vip.upgrade1199` |
|        10.99 | `com.georgicole.thebigeye.vip.upgrade1099` |
|         9.99 | `com.georgicole.thebigeye.vip.upgrade999`  |
|         8.99 | `com.georgicole.thebigeye.vip.upgrade899`  |
|         7.99 | `com.georgicole.thebigeye.vip.upgrade799`  |
|         6.99 | `com.georgicole.thebigeye.vip.upgrade699`  |
|         5.99 | `com.georgicole.thebigeye.vip.upgrade599`  |
|         4.99 | `com.georgicole.thebigeye.vip.upgrade499`  |

Each upgrade SKU grants the same permanent VIP entitlement as the normal VIP SKU. The client
selects the correct SKU from currently owned standalone entitlements immediately before purchase,
so a purchase restored or completed on another device receives the same credit treatment.

The IDs can be overridden with the corresponding `VITE_VIP_UPGRADE_*_PRODUCT_ID` environment
variables.

## Apple App Store Connect

1. Accept the Paid Apps agreement and complete banking and tax information.
2. Under the app's In-App Purchases, create the eight released products and all VIP upgrade SKUs as
   **Non-Consumable**.
3. Add localization, price, review screenshot, and review notes to each product.
4. In Xcode, confirm that the app target has the In-App Purchase capability.
5. Test purchases and Restore Purchases with StoreKit local testing and App
   Store Sandbox accounts.
6. Submit the products for review with the app version that first exposes them.

Apple setup reference:
https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-non-consumable-or-consumable-in-app-purchases/

## Google Play Console

1. Complete the payments profile.
2. Under Monetize > Products > In-app products, create all eight released IDs plus the VIP
   upgrade IDs.
3. Make each product active and assign its one-time price.
4. Upload a signed build to an internal test track.
5. Add license testers and test purchase, pending payment, refund, reinstall,
   and restore behavior.

Google setup reference:
https://developer.android.com/google/play/billing/one-time-products

## Native project sync

After installing dependencies or changing the web app, run:

```powershell
npm run sync:android
npm run sync:ios
```

The Android manifest includes the Play Billing permission. On iOS, open the
project in Xcode and confirm the In-App Purchase capability before archiving.

## Production verification

The client checks StoreKit current entitlements on iOS and currently owned,
acknowledged products on Google Play. Ownership is cached so permanent unlocks
remain available offline and is reconciled after the next successful store
refresh.

Before public release, add server-side purchase verification and store
notifications so refunds and account changes are authoritative even when the
app is not opened. The purchase bridge exposes the Android purchase token and
Apple StoreKit receipt/JWS needed by that backend.

- Google backend guide:
  https://developer.android.com/google/play/billing/backend
- Apple in-app purchase security:
  https://developer.apple.com/documentation/storekit/in-app_purchase

## Release checklist

- Add working Privacy Policy and Terms of Use links to the store listing and
  purchase screen before review.
- Test purchase, restore, pending payment, refund, reinstall, account switching,
  and offline launch on physical iOS and Android devices.
- Confirm VIP grants every released standalone entitlement, including No Ads, and VIP-only
  themes.
- Confirm No Ads suppresses automatic interstitials while leaving optional rewarded ads
  available.
- Confirm each standalone purchase grants only its advertised feature.
- Verify the 75% VIP-credit resolver selects the expected native upgrade SKU for single and
  multi-product ownership and never selects a tier below 4.99.
- Test restoring every VIP upgrade SKU and confirm it restores full VIP ownership.
- Remove `VITE_VIP_DEV_ENTITLEMENT=true` from every release environment.
