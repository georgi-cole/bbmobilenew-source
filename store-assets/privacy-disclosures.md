# Release 1.0 privacy disclosures

These answers describe the offline-first 1.0 mobile binary. Reconfirm them against the exact signed build before completing either store form.

## Player-age safeguards

The current product access policy defaults to 18+ pending content-rating review.
This is not an assigned store rating. Only lower `VITE_GAME_MINIMUM_AGE` after
reviewing the actual content, store answers, and release territories. Parental
permission must never override the configured minimum.

Admission stores a local age group, household-permission acknowledgment, and
optional-feature choices. Under-13 play stays locked; verified parent consent is
not connected. Teen local-play permission is not verified privacy consent.
Location, measurement, online services, ads, purchases, and restoration are
unavailable for teens and unknown-age players. Optional data features start off
for adults and require separate choices. Review
`docs/player-age-and-parental-consent.md`, the actual content rating, and each
release territory before submission. Do not declare this an all-ages game or
claim that a checkbox verifies parental consent.

If optional adult measurement is configured, disclose screen/game events and a
session identifier, including the actual recipient, retention, and deletion
arrangements. A remote configuration must not activate collection without the
adult's separate in-app choice. Static content requests can reach the game's
host after admission and expose ordinary network metadata.

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
