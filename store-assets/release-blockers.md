# Remaining release actions requiring owner or store-console access

The repository-side release blockers have been addressed. The game is still **not ready to submit** until every item below is completed with the developer accounts, signing keys, public URLs, and physical devices.

## 1. Reserve the permanent app identity

- Confirm `com.georgicole.thebigeye` is available in Apple Developer/App Store Connect and Google Play Console.
- Create both store records with that exact identifier.
- Confirm the public app name “The Big Eye” is available and legally cleared for the intended territories.

## 2. Create and protect signing credentials

- Android: create the Play upload keystore, keep it outside the repository, and fill `android/local.properties` from `android/local.properties.example` (or use the documented `ANDROID_*` CI secrets).
- Enroll in Play App Signing and securely back up the upload key.
- Apple: select the Apple Developer team, create distribution certificates/profiles, and archive with the current required Xcode/iOS SDK.

## 3. Connect the published legal and support pages

- Privacy, Terms, and support are published from the separate public `georgi-cole/big-eye-legal` repository.
- The monitored support email is `kolequant@gmail.com`.
- Copy `.env.android.example` and `.env.ios.example` to the ignored real files and run:
  - `npm run verify:store-env:android`
  - `npm run verify:store-env:ios`
- Enter the published privacy and support URLs in both store consoles.

## 4. Configure released purchases and VIP upgrade tiers

Create the eight user-facing products documented in `docs/STORE_PRODUCTS_SETUP.md` as one-time,
non-consumable products on both stores, together with the VIP upgrade SKUs used by the 75% credit
resolver.

Then:

- Complete paid-app agreements, banking, and tax setup.
- Add localized names, descriptions, prices, and review screenshots.
- Keep Tribunal Mode inactive; it remains intentionally unreleased.
- Configure No Ads now, but do not activate it for sale until the signed binary also contains the
  native advertising integration that gives the entitlement real value.
- Test direct VIP and every VIP-upgrade tier for purchase, cancel, pending payment,
  restore, refund/revocation, reinstall, account switching, and offline launch.

## 5. Complete the store compliance forms

- Apple: privacy nutrition label, age rating, export-compliance answers, territories, category, pricing, review contact, and IAP review submission.
- Google: Data safety, target audience, content rating, app access, the ads declaration matching the
  exact signed binary, financial features, government apps, health, and any other required policy
  declarations.
- Disclose optional precise location for weather personalization and store purchases. If the native
  advertising SDK is added before release, update both stores' advertising/privacy answers before
  submission.
- Rate simulated chance/casino-like mechanics honestly; no real-money gambling was found.

## 6. Produce and test signed native builds

- Android: run `npm run prepare:store:android`, build a signed AAB, upload it to Internal testing, and install it from Google Play.
- iOS: on a Mac, run `npm run prepare:store:ios`, archive the app, validate it, upload it to TestFlight, and install it from TestFlight.
- Test on physical low- and high-end phones: first launch, denied/allowed location, offline play, save/resume, full season completion, background/foreground recovery, audio, purchases, and restore.
- Test the final UI on a 13-inch iPad. Replace the supplied tablet marketing compositions with direct native captures if the layout differs, or intentionally change the target to iPhone-only before submission.

## 7. Complete required pre-release testing

- Run the GitHub Release Product Quality workflow and require every job to pass.
- Complete the Google closed-testing requirement if the Play account is a personal account subject to it.
- Run TestFlight external/internal testing appropriate to the release risk.
- Resolve all crash, ANR, pre-launch report, TestFlight, and accessibility findings before production rollout.

## 8. Keep online AI disabled for 1.0

Do not set `VITE_BIG_EYE_AI_ENABLED=true` or a VIP Diary Room endpoint for this release. Enabling it requires a production backend security review, authentication/rate limiting, documented retention and deletion, updated policy/manifest/store disclosures, and end-to-end moderation testing.

## Repository-side work already completed

- Android and iOS now share the permanent bundle ID and version.
- Native location permissions, user-facing rationale, and iOS privacy declaration are aligned.
- Capacitor placeholder icons and splashes were replaced with the approved store artwork.
- Tribunal remains hidden; No Ads and VIP-upgrade entitlement plumbing are implemented and ready
  for store-console configuration.
- Privacy, terms, and support information is reachable in-app.
- Release environment validation and Android signing templates are present.
- Pull requests now compile Android and iOS native projects; Swift CodeQL receives synced native assets.
- Type checking, linting, formatting, web builds, and Capacitor syncs pass locally.
- Android native lint and debug assembly pass locally.
- The authoritative suite passes all 4,804 tests, with no disabled tests, and the risk-based coverage gate passes.
