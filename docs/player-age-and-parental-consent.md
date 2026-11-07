# Player age and parental consent

Reviewed October 27, 2026. These are product safeguards, not worldwide legal clearance.

## Release behavior

- The initial release uses an **18+ product access policy** until its content
  rating is confirmed. This is not an assigned store rating. Build-time
  `VITE_GAME_MINIMUM_AGE` accepts only `13`, `16`, or `18`; missing or invalid
  values default to `18`. Only lower it after content, store, and territory review.
  Parent permission cannot override the configured minimum. The teen local-play
  flow below is prepared for a reviewed build whose minimum allows those players.

- A neutral, empty actual-age question appears before the router, gameplay,
  global overlays, remote configuration polling, or purchase synchronization mounts.
  Guest entry and new-profile creation ask who is playing before collecting profile
  details. No age is preselected and the question does not advertise an unlock age.
- Only the age group, policy version, household-permission acknowledgment, and
  optional-feature choices are kept in the local admission record. Guest screening
  does not store a birth date or exact age. A voluntarily created profile still
  stores its age locally as part of that profile.
- Under-13 declarations lead to the parent-information flow. Play stays locked.
  `src/safety/parentalConsent.ts` exposes the provider contract and an unavailable
  implementation. It makes no network request and accepts no contact details,
  identity documents, approval flags, callback URLs, or purchase receipts.
- Teens 13–17 are asked to involve their parent/guardian in local-play permission.
  The acknowledgment is explicitly **not verified parental consent** and is never
  used as the legal basis for online processing. Location, analytics, online
  Diary Room/result services, advertising, native purchases, and restoration are
  unavailable for teens. Both the configured minimum and store content rating
  must permit play; this release defaults to 18+.
- Adults start with all optional data features off. Location, analytics, online
  services, and ads each require a separate choice in **Settings → Player privacy
  & family** (`#/player-privacy`). OS location permission alone is insufficient.
- Saved, selected, edited, and imported active-profile ages can tighten the local
  decision. Legacy ranges use the youngest plausible age. Switching to guest,
  changing a profile to an older age, browser Back, and refreshing do not provide
  an in-app way to lift a known lower age group. Shared devices and genuine age
  corrections need a verified adult-management flow before restrictions can be
  relaxed. Do not tell children to reinstall or clear storage to bypass screening.
- The local record is self-declared and can be lost through uninstall, data
  clearing, or device storage failure. It is not tamper-proof age verification.
  Unreadable records give no admission; failed adult writes give no admission.
- Profile deletion remains reachable in the locked screen’s **Privacy, saved data,
  and help** section. It removes the selected profile/photo/saves without lifting
  the age restriction or deleting other profiles.

## Service enforcement

Restrictions are checked in the location resolver, ad bridge/reward callback,
telemetry sender, purchase/restore service, Diary Room APIs, weekly log APIs, and
challenge-result API, rather than only disabling buttons. Optional fetch requests
are cancelled while pending when their permission is withdrawn; coordinates are
rechecked before transmission. Disabling analytics removes its session buffer.
Store synchronization is not started for restricted players, and cached local
entitlements are preserved rather than replaced by a fabricated empty receipt.
The adult Reality preset also checks the admission decision, so editing a profile
age cannot lift teen restrictions. Adult self-declaration is not proof of identity.

Feedback composition is unavailable until an adult has enabled online services.
Sharing the public game link contains no player profile. Local gameplay can fetch
static content/configuration from the game's host after admission; these requests
do not include profile fields, conversation history, or measurement identifiers.
Hosts can still receive normal network metadata. Web delivery inherently requires
requests for the application files before screening. The final native build must
be checked for SDK initialization and background requests outside JavaScript.

## Connecting verified parental consent later

Keep under-13 admission closed until all of the following are implemented and
reviewed together. Merely setting an environment URL or a local `verified` field
must never enable child play.

1. Select a verification provider and production backend, document controller /
   processor responsibilities, security, purpose limitation, retention/deletion,
   geographic coverage, and the method used to verify parental responsibility.
2. Give a parent a direct notice of the actual data, uses, recipients, optional
   disclosures, and rights **before** collection. Minimize child and parent data;
   do not put names, emails, ages, or consent tokens in URLs or telemetry.
3. Implement `ParentalConsentProvider.start/status` against authenticated,
   server-owned requests. Verify provider callbacks on the server, bind consent to
   the intended player and policy/scopes, and prevent replay and cross-profile
   approvals. A browser redirect is not evidence of approval.
4. Gate admission and each processing purpose using server-verified, expiring
   evidence. Pending, denied, expired, unavailable, offline-unverifiable, and
   revoked states remain locked. Do not let the browser manufacture approval.
5. Provide parent access, deletion, refusal of optional sharing, and revocation;
   propagate revocation to active sessions, stop collection, and apply retention
   rules to existing data. Review separate consent for third-party disclosures.
6. Test independent devices/accounts, shared devices, age corrections, callback
   tampering, policy changes, expiry, provider outage, and revocation before
   enabling any child admission. Keep age-appropriate content and purchases scoped
   separately: parental privacy consent cannot override a legal content restriction.

## Release review still required

- Complete accurate Apple age-rating and Google target-audience / content-rating
  forms against the signed build. Assess blackjack/casino simulation, mature
  storylines, paid random items, and all reachable modes. A hidden adult preset
  does not determine the store rating. Do not advertise this build as all ages.
- Review whether the presentation, marketing, and actual audience make the game
  child-directed or mixed-audience. An age gate does not change that classification.
  COPPA treats these differently from a genuinely general-audience service.
- Have counsel confirm target countries, GDPR lawful bases and consent thresholds,
  the UK Children’s Code, purchases/consumer rules, and local game distribution /
  playtime requirements. A 13+ or 18+ declaration is not a worldwide safe harbor.
- Publish the updated public legal pages from the separate `big-eye-legal`
  repository before release; editing copies here does not publish them.
- Before adding an ad/analytics SDK or enabling online Diary Room, confirm native
  initialization, all recipients/data flows, appropriate age assurance, disclosure,
  withdrawal, retention, and store declarations. The preference switches here do
  not substitute for those reviews.

Primary guidance reviewed:

- [FTC COPPA FAQs, especially age screening and parental consent](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [GDPR Article 8](https://eur-lex.europa.eu/eli/reg/2016/679/oj#art_8)
- [ICO age-appropriate application](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/3-age-appropriate-application/)
- [Apple age ratings](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- [Google Play Families policies](https://support.google.com/googleplay/android-developer/answer/9893335)

Run the safety, profile entry, ad, purchase, VIP client, feedback, and weather
regressions, followed by `npm run check:pr`. This verifies implementation behavior;
it does not establish that all legal release requirements have been met.
