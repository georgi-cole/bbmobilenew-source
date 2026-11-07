# Remaining release actions requiring owner or store-console access

Release verification is in progress as of **2026-11-07**. The game is **not ready
to submit**. The full test run currently has failures; a passing PR core check is
not a passing release suite. Do not submit either store draft until the remaining
code, signing, purchase, compliance, device, and media checks below are complete.

## Verified console progress — 2026-11-07

- Both store records already use `com.georgicole.thebigeye`; Apple app ID is
  `6828006735`. Google Play has version code 1 in Internal testing; the next
  Android project version code is 2.
- The updated Apple Developer Program License Agreement was accepted with owner
  authorization. Paid/free agreements, banking, US tax forms, and DSA trader
  status show active. DAC7 still shows missing information and needs the owner's
  accurate tax declaration.
- Apple descriptions, support URL, review contact/notes, manual release choice,
  Strategy/Simulation categories, 18+ rating, and the eight-type privacy label
  were saved. No native iOS build is uploaded yet. Content rights, encryption,
  territory availability, and purchase review material still need completion.
- Apple already has all 18 expected non-consumable products as drafts (eight
  released products and ten VIP upgrade tiers). Direct VIP's US base price is
  $19.99. The drafts are not approved for sale.
- Google Play listing text and privacy policy were saved. Ads, government,
  financial, and health declarations are being completed. Reviewer access to
  paid features must be provided truthfully; the Target audience questionnaire
  currently requires completion of Sign in details first.
- Google Play will not allow product creation until a new signed binary with
  the Billing permission is accepted. The saved local signing configuration was
  for a debug key; the password of the separate `bigeye-release` file is unknown.
  Preserve that file. Recover the password or request an official upload-key
  reset; Play App Signing is already enabled.
- Both AdMob apps have interstitial and rewarded units. Published EU and US
  consent messages cover the two The Big Eye apps. The Policy center has no
  current issues. Store linking, app-ads.txt, and AdMob app review are pending;
  serving is currently limited. Verification will be requested at the earnings
  threshold; the payment-information panel did not expose complete status.
- **The owner confirmed the existing marketing screenshots are obsolete.** Old
  screenshots currently in store drafts must be replaced with the new images
  supplied in the release conversation. They are not approval-ready media.
- Both platform web builds and Capacitor syncs completed, and Android native
  lint plus the locale-sensitive story-icon regression passed. Signed Android
  output and a native iOS archive are not yet verified. The cloud workflow is
  prepared but has not run; Apple signing/API credentials are not configured.

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

- Complete the player-age release review in `docs/player-age-and-parental-consent.md`.
  Under-13 play remains locked while verified parent consent is unconnected. Do
  not advertise unrestricted all-ages access or treat teen household permission
  as verified consent. Confirm territory-specific requirements and publish the
  updated privacy/terms pages from the separate legal repository.

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

## Repository preparation and validation limits

- Android and iOS now share the permanent bundle ID and version.
- Native location permissions, user-facing rationale, and iOS privacy declaration are aligned.
- Native icons/splashes are customized. Native story-icon progression and the
  static store-brand icon are intentionally distinct; screenshot replacement is
  still required as noted above.
- Tribunal remains hidden; No Ads and VIP-upgrade entitlement plumbing are implemented and ready
  for store-console configuration.
- Privacy, terms, and support information is reachable in-app.
- Release environment validation and Android signing templates are present.
- Pull requests now compile Android and iOS native projects; Swift CodeQL receives synced native assets.
- Earlier PR core checks passed. Run `npm run check:pr` again after the final
  code edit before any push, PR, or completed-validation claim.
- Android native lint and the story-icon unit test passed; both platform web
  preparation commands passed. Neither is proof of a signed store release.
- The full suite has unresolved failures. Re-run it with ordinary developer
  unlocks disabled, resolve the actual regressions, and then run the required
  release coverage/browser/device checks. No current full-suite or coverage
  pass is established.
