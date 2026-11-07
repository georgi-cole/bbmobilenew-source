# Release 1.0 privacy disclosures

These answers describe the planned 1.0 mobile builds with Supabase profile backups and contact preferences. Confirm against the exact signed build before completing either store form.

## Supabase profile backup and analytics

The app automatically sends a limited profile backup (profile ID, display name, avatar, selected appearance, achievements, and unlock progress) and pseudonymous gameplay events to Supabase. Events include screen visits and visible time, game mode and day, minigame duration/placement/exits, Social usage and action categories, selected gameplay decisions, elimination and season placement, marketplace product choices and purchase outcomes, session activity, and coarse device context. Analytics may include guest activity. Purchase prices, profile photos, biographies, wallet data, and conversation text stay out of these payloads. The analytics profile ID can be joined to a profile backup and display name. Separate anonymous installation identities are used for backup and analytics. Profiles and seasons cannot currently be recovered on another device through the service.

Players can optionally save an unverified contact email. A separate, initially unchecked choice permits game news and playtest invitations. Supabase stores the address and preference privately, outside the backup and event payloads. Players can clear the email or switch off updates in Edit Profile. Deleting a profile queues deletion of its backup, contact, and linked gameplay events for the current installation. Players can also request access or deletion through the public support page.

- Apple: disclose Name, Email Address, User ID, Gameplay Content, Purchase History, Product Interaction, and Other Data Types as linked where associated with an installation or profile. Use the purposes declared in `ios/App/App/PrivacyInfo.xcprivacy`. Supabase is not used for cross-app tracking.
- Google: disclose display name, optional email address, user IDs and other identifiers, gameplay interactions and other player-generated data, and marketplace purchase outcomes. Use app functionality and analytics as applicable. The optional updates choice adds developer communications for the email address. Review deletion answers against the installation-scoped data and actual in-app and public request paths.

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
