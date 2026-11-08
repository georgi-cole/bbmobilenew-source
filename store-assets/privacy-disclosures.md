# Release 1.0 privacy disclosures

Prepared 2026-11-08 from the current mobile release configuration and privacy settings. Reconcile every answer against the final signed binary, SDK privacy report, and current store form before submission.

## Adult-controlled optional features

The build requires a self-declared minimum age of 18. Age group and optional-feature choices are stored locally on the device. Cloud profile backup, gameplay measurement, advertising, and weather location are independent choices; local gameplay remains available when the player declines them.

- **Cloud profile backup** starts off. When an adult enables it in Settings → Player privacy & family, profile ID, display name, avatar, selected appearance, achievements, and unlock progress are sent to Supabase. Seasons and game saves remain on device. Each installation uses an anonymous identity; the service does not restore those profiles on a different device. Turning the setting off stops future uploads, while an existing online copy remains until the profile is deleted or a deletion request is completed.
- **Usage measurement** starts off. When an adult enables it in the same screen, pseudonymous gameplay and session events are sent to Supabase. Events can include profile ID, screen visits and visible time, modes and days reached, minigame duration/placement/exits, Social usage and action categories, selected decisions, elimination timing and placement, product choices and purchase outcomes, session duration, broad device family, operating system, browser, and a build label. Purchase prices, photos, biographies, full user-agent strings, and Confessional text are excluded. Guest events use a separate installation identifier and are not merged into a later profile. Turning measurement off clears unsent events and stops new events.
- Deleting a profile queues removal of its cloud backup, optional contact record, and linked gameplay events for that installation. The device must reconnect to complete the request. Other analytics rows remain until a project-owner deletion or a valid deletion request. Public support instructions also permit deletion requests.
- **Optional email** is submitted only when a player enters and saves it. The unverified address is stored privately in Supabase and is not a sign-in or recovery credential. The separate, initially unchecked updates choice controls email news/playtest messages.

## Google Play Data safety

The current declaration selects these required data types:

- Personal info: Name, Email address, User IDs.
- Financial info: Purchase history (product and purchase outcome; no payment-card details).
- Location: Approximate location. Android requests `ACCESS_COARSE_LOCATION`; it does not request precise location. The app rounds the weather tile to 0.1° before sending it through the Cloudflare Worker to MET Norway. AdMob may also derive approximate location from IP/device information.
- App activity: App interactions.
- App info and performance: Crash logs, Diagnostics, Other app performance data.
- Device or other IDs: Device or other IDs.

The app's profile and measurement data go to Supabase only after their respective adult opt-ins. Email is sent only after explicit save. Weather location is optional and shared with the weather proxy/provider for app functionality. Ads require a separate adult choice and Google consent state. SDK-collected data types must still be included when their SDK runs. Data is encrypted in transit. The current Data safety deletion URL points to the public support page's delete-data instructions.

## Apple App Privacy

Review the final App Privacy report, including Google's SDK manifest. App-owned data types include Name, Email Address, User ID, Gameplay Content, Purchase History, Product Interaction, Other Data, and Coarse Location for weather personalization (the app rounds coordinates on-device before network transfer). Cloud backup and measurement are optional adult choices; email is explicitly submitted; weather location and advertising are optional. The GMA SDK may also collect Product Interaction, Device ID, Advertising Data, Coarse Location, Crash Data, Performance Data, and Other Diagnostic Data. Apple's nutrition label remains the developer's responsibility and must reflect the final binary's SDK practices.

The game does not request Apple's App Tracking Transparency authorization. Do not claim tracking without evidence that the exact final binary performs cross-app tracking.

## Location and weather provider

Weather location is optional and only selects an ambient background. The app rounds coordinates to a 0.1° area (about 11 km north-south) before sending them to The Big Eye's Cloudflare Worker. The Worker requests current forecast data from MET Norway and caches the rounded area and normalized result for at least three hours, honoring a later provider expiry and using the provider's last-modified time when revalidating. Cloudflare receives the request IP and serves as the proxy; MET Norway receives the rounded coordinates and the Worker request IP. The Worker does not intentionally log the coordinate request body. The game does not use weather location for ads, analytics, or tracking. The in-app Legal screen and privacy policy credit MET Norway.

MET Norway provides global forecast data for commercial use under its open-data terms, with attribution required. The current API terms require clients to identify themselves, avoid unnecessary requests, follow cache headers and product-specific intervals, and route mobile-app traffic through a proxy. The implementation has no paid weather subscription, API key, or external database. Do not enable billing or upgrade Cloudflare; keep the Worker on the free plan.

## Google Mobile Ads and UMP

The native iOS and Android projects include Google's Mobile Ads SDK and User Messaging Platform through `@capacitor-community/admob`. Live publisher IDs are configured. The app initializes the live SDK only after an adult separately enables advertising and Google's consent state permits requests; ad requests set `npa: true`. Non-personalized requests do not mean the SDK collects no data.

Google's current SDK disclosures say the SDK may collect or share IP address, app/ad interactions, diagnostics/performance data, and device or account identifiers. The iOS disclosure also includes advertising data and coarse location derived from IP or approximate-location services. Google lists advertising, analytics, SDK performance, and fraud prevention as possible uses; Android data is encrypted in transit. Reconcile the forms with the exact uploaded binary and consent configuration.

- Google Play: include Approximate location, App interactions, App info and performance, and Device or other IDs when the AdMob SDK is available and used.
- Apple: verify Product Interaction, Device ID, Advertising Data, Coarse Location, Crash Data, Performance Data, and Other Diagnostic Data against the SDK report.
- The current iOS plugin pins Google Mobile Ads SDK 13.11.0; Android resolves from its 25.4.+ dependency range. Recheck Google's disclosures when the SDK changes.

## Diary Room and purchases

Online AI flags and endpoints are unset in release builds. Diary Room text is processed on-device and is not sent to the developer or an AI provider.

Apple or Google processes one-time purchases. The app reads product and entitlement status to unlock and restore purchases; the developer does not receive payment-card details. Supabase analytics can receive product choices and purchase outcomes only when adult usage measurement is enabled.
