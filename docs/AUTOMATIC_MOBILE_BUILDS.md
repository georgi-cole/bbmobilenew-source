# Automatic TestFlight and Google Play test builds

Every push to main, including a merged pull request, starts the **Build TestFlight
and Google Play test apps** workflow. Each run checks out the triggering commit,
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
After upload, the workflow waits up to 20 minutes for the exact uploaded build,
copies the completed encryption answer from the user-approved build
`43605234080.1`, assigns **The Big Eye Internal**, and verifies Apple's internal
state is `IN_BETA_TESTING`. Upload alone is no longer reported as ready to test.
The existing group uses manual distribution for Xcode builds; the API assignment
handles that automatically without creating another group. Device installation
still follows the tester's TestFlight automatic-update setting.

The policy in `scripts/testflight-readiness-policy.json` refers to the completed
test-build declaration (standard encryption, France excluded). It does not claim
SQLCipher is absent or classify new encryption. It copies Apple's recorded answer
and any linked declaration, and refuses to overwrite a different completed answer.
Changes to the reviewed SQLite dependencies or native configuration stop the
automation for a fresh review. After a user approves a new encryption declaration,
update the baseline build and reviewed input hashes in that policy. Keep the
France exclusion for these test builds; production-country decisions remain
separate. No encryption exemption is hardcoded in the app's Info.plist.

Manual runs remain available on main and `release/testflight-*` candidate branches.
Candidate branch runs upload iOS only. This workflow does not submit an App Store
release or send builds for external beta review.

If Apple processing or a post-upload availability check fails after the upload
succeeded, run **Complete an uploaded TestFlight build** on main with the exact
existing build number. It validates main and runs the same compliance and group
checks without archiving, signing or uploading another binary:

```sh
gh workflow run testflight-readiness.yml --ref main -f build_number=EXISTING_BUILD_NUMBER
```

Membership is read through Apple's documented
`GET /v1/betaGroups/{id}/relationships/builds`, using the already validated
internal group and following its build-ID pages. This avoids the build-side
write-only relationship and the filtered collection query rejected by Apple's
server. Readiness still requires both confirmed membership and `IN_BETA_TESTING`.

## Android: automatic Google Play Internal Testing

Each validated main build produces a signed `app-release.aab`. With the one-time
Google Play connection below configured, the same run uploads that exact bundle
to `com.georgicole.thebigeye` on the **internal** testing track and verifies its
version in a fresh Google Play edit. The signed artifact remains downloadable as
`google-play-signed-<run>-<attempt>` for recovery.

The uploader compares the version code and SHA-256 with the signed artifact,
reuses an identical existing upload, and refuses to replace a newer internal
build. Only a completed release containing the exact version counts as verified.
Google may still need to finish processing before testers can install it. Tester
lists and other tracks are not edited.

Before Google credentials are configured, builds continue to produce the signed
artifact. The workflow explicitly reports **built only, not uploaded**. Adding
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` activates automatic uploads on future main
runs; there is no second feature flag or repeated manual upload step.

### One-time Google connection

1. Select your Google Cloud project and enable the
   [Google Play Android Developer API](https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com)
   and [IAM Service Account Credentials API](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com).
2. In **IAM & Admin > Service Accounts**, create or choose a dedicated account
   such as `big-eye-play-upload`.
3. Grant that service account **Service Account Token Creator** on **itself**
   (`roles/iam.serviceAccountTokenCreator`). Google's authentication action needs
   this to mint a short-lived OAuth access token from the key. Grant it on this
   service account rather than across the project.
4. In **Google Play Console > Users and permissions > Invite new users**, enter
   the service-account email. Give it app-level access to **The Big Eye** only,
   with **View app information (read-only)** and **Release apps to testing
   tracks**. Production-release, financial, administrator and tester-list
   permissions are not needed.
5. In the service account's **Keys** tab, create a **JSON** key. Add its complete
   contents as repository secret **GOOGLE_PLAY_SERVICE_ACCOUNT_JSON** under
   [GitHub Settings > Secrets and variables > Actions](https://github.com/georgi-cole/bbmobilenew-source/settings/secrets/actions).
   Do not commit the JSON or paste it into chat. The action uses it only after
   signing and artifact retention, does not write a credentials file, and passes
   a short-lived Android Publisher token to the uploader.
6. Run **Build TestFlight and Google Play test apps** on **main**, or let the next
   merge trigger it. Confirm the summary says **Verified Google Play internal
   release**, rather than only **Signed Google Play bundle**. Existing internal
   testers use their normal opt-in link; tester membership is not changed.

Google's default edit commit can cancel an existing review. The uploader explicitly
uses `changesInReviewBehavior=ERROR_IF_IN_REVIEW`, so it stops with the signed AAB
retained if Google will not allow the update while a review is running. It does
not silently cancel that review or fall back to an unverified draft.

References: [Google API setup](https://developers.google.com/android-publisher/getting_started),
[Play Console permissions](https://support.google.com/googleplay/android-developer/answer/9844686),
[Google authentication action](https://github.com/google-github-actions/auth), and
[edit commit behavior](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit).

### Existing Android build configuration

Android cloud bundles default to ads off for internal testing. To test live ads,
set repository variable `ANDROID_ADMOB_MODE` to `live` and provide the existing real
`ANDROID_ADMOB_APP_ID`, `ANDROID_ADMOB_INTERSTITIAL_ID` and
`ANDROID_ADMOB_REWARDED_ID` variables. The store validator rejects test mode and
demo IDs for a live-ads build. This is separate from the current iOS AdMob setup.

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

The restored certificate is checked against Google Play's registered upload-key
SHA-1 before building. The owner confirmed `65:B5:34:95:6A:38:CF:CA:4D:8C:A2:1C:B0:E9:C6:7C:DA:A8:91:12`
on November 14, 2026. The previously configured `54:E6:AD:90:FB:01:E7:71:74:86:DA:EA:45:86:38:BB:A1:20:F5:07`
certificate fails this check. When a key is deliberately reset in Play Console,
update both the saved signing secrets and the expected public fingerprint.
Correcting those encrypted repository secrets is a one-time setup; future builds
use them without an interactive password prompt.

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

### Contextual interstitials

Adult Standard players use the existing interstitial and rewarded units.
Standard players under 18 and players of unknown age can use a separate
contextual interstitial unit at the same existing gameplay breaks. The
app requests child-directed treatment, a G content cap and non-personalized
ads. Google consent checks still apply. VIP and No Ads skip automatic breaks.

Create a separate standard interstitial unit for each platform that will serve
contextual ads. Use Google demand on those units, with no third-party bidding
or mediation, and switch High-engagement ads off in the relevant AdMob app
settings. Google applies that switch across regular interstitial and rewarded
units in the app. Verify the app's audience declarations, device ad content,
and the five-second close option before setting
`IOS_ADMOB_CONTEXTUAL_INTERSTITIAL_ID` or `ANDROID_ADMOB_CONTEXTUAL_INTERSTITIAL_ID`.
Local native builds read `VITE_ADMOB_CONTEXTUAL_INTERSTITIAL_ID`. The cloud
build omits contextual requests when its variable is empty.

Keep contextual impressions measured separately by ad unit. Compare fill and
revenue per active user with session retention after rollout. Confirm
`app-ads.txt` and each app's AdMob readiness before drawing conclusions from
low fill. The app keeps voluntary rewarded ads for adults because AdMob's
rewarded close times can exceed the Families five-second limit.

[Google Play Families policy](https://support.google.com/googleplay/android-developer/answer/9893335)
and [AdMob close times](https://support.google.com/admob/answer/15525707).

## Checking a run

The workflow summary records the exact source commit, iOS build number and Android
version code. Missing credentials fail early with the missing secret's name.
TestFlight readiness is verified after Apple processing. Android publishing reports
success only after the exact completed internal version is read back from Google.
A missing Google connection is reported separately from a failed upload or a
successful signed build. No secret values appear in the summary.
