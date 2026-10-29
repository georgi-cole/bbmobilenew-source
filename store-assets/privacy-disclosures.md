# Release 1.0 privacy disclosures

These answers describe the offline-first 1.0 mobile binary. Reconfirm them against the exact signed build before completing either store form. Supabase builds also need the disclosures below before submission.

## Supabase profile backup and analytics

When configured, the app automatically sends a limited profile backup (profile ID, display name, avatar, selected appearance, achievements, and unlock progress) and pseudonymous gameplay events to Supabase. Events include screen visits and visible time, game mode and day, minigame duration/placement/exits, Social usage and action categories, selected gameplay decisions, elimination and season placement, marketplace product choices and purchase outcomes, and session activity. Purchase prices are not sent. Profile photos, biographies, wallet data, player names, and conversation text are not sent. The analytics profile ID can be joined to a profile backup and display name. Separate anonymous installation identities are used for backup and analytics. The app does not currently provide cross-device account recovery. Assess store categories for user content and usage data against the final signed build and the applicable store forms.

## On-device data

Game saves, settings, player profiles, optional profile photos, season archives, ad-state flags, and Diary Room session history are stored on the device. Data that never leaves the device is not collected under the store definitions. Operating-system backup may include app data according to the player's Apple or Google backup settings.

## Optional location

If the player grants location access, latitude and longitude are sent to Open-Meteo to obtain current weather for an ambient background. The game does not intentionally retain coordinates after the request.

- Apple: Location / Precise Location, used for App Functionality and Product Personalization, not linked to identity, and not used for tracking.
- Google: Precise location, optional, transmitted for app functionality and personalization, not used for advertising, and not sold.

## Diary Room

The 1.0 release leaves the online Diary Room flags and endpoint unset. Diary Room text is processed on-device and is not collected.

If a later build enables the online service, update the policy and store forms before release. That build would need to disclose Diary Room text and player display name as user content, along with its encryption, retention, logging, access-control, and deletion behavior.

## Purchases, advertising, and tracking

The 1.0 release includes native, one-time store purchases. Apple or Google processes payment and the app reads product and entitlement status to unlock and restore purchases. The developer does not receive payment-card details.

Native projects now include Google Mobile Ads and UMP through the Capacitor AdMob
plugin. Advertising is off unless configured; the current local iOS configuration
uses Google demo ads. Live initialization requires adult advertising opt-in and
UMP permission. The app requests non-personalized ads; this does not mean the SDK
collects no data. Google may receive IP addresses, device identifiers, diagnostic
information, and ad interaction data. Review Google's current SDK disclosures
and complete both store privacy forms against the exact signed binary before
release. Do not claim that the binary contains no advertising SDK.

Do not activate No Ads for a binary that cannot show ads. No Ads/VIP suppress
automatic breaks; voluntary rewarded opportunities remain available. Publish the
updated policy on the separately hosted legal site before live ads. Apple
tracking may remain false only if the final configuration does not introduce
cross-app tracking. See `docs/ads_integration_guide.md` for configuration and the
remaining AdMob/consent/store steps.
