# Automatic TestFlight and signed Android builds

Every push to main, including a merged pull request, starts the **Build TestFlight
and signed Android apps** workflow. Each run checks out the triggering commit,
passes `npm run check:pr`, then builds both platforms. Runs queue in order; a new
merge does not cancel a signing/upload operation or replace an older pending run.

## iOS: automatic TestFlight uploads

The existing Apple distribution certificate, provisioning profile and App Store
Connect API key are used to sign and upload each validated main build. The build
number includes the GitHub run ID and attempt, so retrying a run uses a new number.

Configure these repository secrets once under **Settings > Secrets and variables >
Actions**:

- `IOS_DISTRIBUTION_P12_BASE64`
- `IOS_DISTRIBUTION_P12_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `ASC_API_ISSUER_ID`
- `ASC_API_KEY_ID`
- `ASC_API_KEY_P8_BASE64`

The existing production Supabase/account repository variables must remain set.
Apple still processes uploaded builds. In App Store Connect, enable automatic
distribution for your internal TestFlight group so processed builds reach it.
Device installation follows the tester's TestFlight automatic-update setting.

Manual runs remain available on main and `release/testflight-*` candidate branches.
Candidate branch runs upload iOS only. This workflow does not submit an App Store
release or send builds for external beta review.

## Android: signed Google Play upload bundles

Each validated main build produces a signed `app-release.aab`. Download the
`google-play-signed-<run>-<attempt>` artifact from the workflow run, then upload
the AAB in Play Console. It is already signed: uploading does not ask for the
keystore password. This does not automatically publish an Android release.

Cloud bundles default to ads off for internal testing, matching the TestFlight
pipeline. Before using one for an ads-supported production release, set repository
variable `ANDROID_ADMOB_MODE` to `live` and provide the existing real
`ANDROID_ADMOB_APP_ID`, `ANDROID_ADMOB_INTERSTITIAL_ID` and
`ANDROID_ADMOB_REWARDED_ID` variables. The store validator rejects test mode and
demo IDs for a live-ads build.

Configure these repository secrets once:

| Secret                      | Value                                                           |
| --------------------------- | --------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64 contents of the existing Google Play **upload** keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Password that opens that keystore                               |
| `ANDROID_KEY_ALIAS`         | Existing upload-key alias in that keystore                      |
| `ANDROID_KEY_PASSWORD`      | Private-key password, if different from the keystore password   |

If the private-key password is the same, omit `ANDROID_KEY_PASSWORD`; the workflow
uses the keystore password. Use the current Play upload key so Google accepts the
bundle. Do not generate a replacement key for an already published app.

The workflow restores the key into temporary storage, verifies its alias, signs
through Gradle's environment configuration, verifies the bundle signature, and
deletes the temporary key even on failure. Only the signed AAB becomes an artifact;
passwords and keystores must never be committed.

Release builds use an increasing Unix-seconds Android version code, both locally
and in CI, so a later local release can follow a cloud build. Debug builds retain
the checked-in version code. `ANDROID_VERSION_CODE` can explicitly override the
release number. This scheme reaches Google Play's version-code ceiling in 2036;
replace it before then.

For local unattended release signing, fill the existing ignored
`android/local.properties` using `android/local.properties.example`, or provide
the four `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` environment values. Then run
`gradlew.bat bundleRelease` from `android` on Windows (or `./gradlew bundleRelease`
on macOS/Linux). Keep the local properties file private.

## Checking a run

The workflow summary records the exact source commit, iOS build number and Android
version code. Missing credentials fail early with the missing secret's name.
A successful upload means Apple accepted the binary; allow its processing to
finish before expecting it in TestFlight. No secret values appear in the summary.
