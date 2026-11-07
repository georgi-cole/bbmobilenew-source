# Research and repository findings

Checked 25 October 2026. These are primary-source examples and local source observations, not evidence that a particular roster size, conversion rate or price is optimal for this game. Product choices are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Comparable-game lessons

| Primary source                                                                                                                              | What the source supports                                                                                                                                                                                            | Decision for this game                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Wolvesville: Cartoon Update, 3 March 2025](https://blog.wolvesville.com/2025/03/03/update-cartoon/)                                        | Outfit changes are reachable from the lobby menu; offers have preview variants; buying the battle-pass background no longer equips it automatically; earned membership cosmetics remain owned after membership ends | Put Dressing Room in the existing menu, preview the actual equipped character, and separate purchase from Apply. Keep ownership independent of the current appearance. This does not establish Wolvesville's rendering internals or our economics |
| [EA: The Sims 4 gender, romance and attraction guide](https://help.ea.com/en/articles/the-sims/the-sims-4/gender-romance-attraction-guide/) | Frame/clothing settings and sexual-orientation options are distinct controls; clothing filters can be adjusted                                                                                                      | Separate appearance, optional self-description and gameplay eligibility. Do not derive the player's identity or romance rules from selected art                                                                                                   |
| [EA: Adding More Choices roundtable](https://www.ea.com/amp/news/the-sims-roundtable--adding-more-choices-to-the-sims-4)                    | Clothing, makeup, accessories and voices were opened beyond the original gender setting                                                                                                                             | Offer compatible cosmetics to everyone without a gender purchase restriction. The artwork still needs physical fit                                                                                                                                |
| [Roblox: Understanding an item's details page](https://en.help.roblox.com/hc/en-us/articles/206142306-Understanding-an-item-s-details-page) | Item details identify type/description/price, offer Try On and a purchase confirmation                                                                                                                              | Give Market items an exact preview, supported-surface description, clear price and separate acquisition. Roblox's 3D marketplace is not an implementation template for our raster artwork                                                         |
| [Roblox Creator Hub: Avatar Inspect Menu](https://create.roblox.com/docs/players/avatar-inspect-menu)                                       | A game can expose inspecting, trying and purchasing avatar items within its own experience                                                                                                                          | Keep discovery and the current-character preview reachable inside the existing app rather than redirecting users to an unrelated customization flow                                                                                               |

These lessons are UX patterns. They do not justify subscriptions, scarcity timers, loot boxes or a large wardrobe before testing visual quality. BitLife and Tengaged were useful search suggestions, but no sufficiently useful primary implementation documentation was verified in this pass; this plan does not attribute technical internals or accessory counts to them.

## Rendering and payment references

- [MDN: Canvas compositing and clipping](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Compositing) documents layering, clipping and compositing. Our inference: compatible 2D portrait layers can be composed at equip/state changes and cached; the API does not create correct fits or recover hidden scalp/body artwork.
- [Unity: Sprite swapping](https://docs.unity.cn/Packages/com.unity.2d.animation%406.0/manual/SpriteSwapIntro.html) describes organized sprite libraries and matching structures for swaps. Our inference: interchangeable avatars require prepared compatible assets; existing flattened images do not acquire that structure automatically. No Unity migration is proposed.
- [Capgo native-purchases documentation](https://capgo.app/docs/plugins/native-purchases/) lists native product metadata, purchases, restore and current-purchase APIs. The installed package version and native source must be checked separately; public current documentation is not evidence of the installed implementation's exact verification/acknowledgement behavior.
- [Apple: restoring purchased products](https://developer.apple.com/documentation/storekit/restoring-purchased-products) explains restoration of eligible purchases and user-controlled restore. Cash bundles therefore require an actual restorable entitlement path; local Eyeolean records are a different ownership source.
- [Google Play Billing overview](https://developer.android.com/google/play/billing) recommends a secure backend for billing tasks including verification. CS-19 must decide the actual verifier/reconciliation architecture; an SDK success flag or a verifiedAt timestamp alone is not a backend-verification claim.

Native product creation, installed-plugin compatibility and device sandbox evidence remain implementation prerequisites. No product has been configured or purchase tested by this research.

## Representation reference

[NOAH: What is Albinism?](https://albinism.org/information-bulletin-what-is-albinism/) explains that albinism occurs across ethnic groups and that red eyes are a common misconception; blue, hazel and brown eyes occur. The art decision is one natural fictional South Asian woman with albinism, pale hair/brows and blue-gray eyes. This is an individual design, not a claim that every person with albinism looks alike. No medical mechanics or health inference about players is proposed.

## Local implementation audit

Update, 28 October 2026: profile creation is now capped at three without deleting
legacy extra profiles. NewSeason selects a per-run contestant; saved gameplay
details stay with that run. EditProfile no longer dispatches identity changes to
the active player. The dated observations below describe the earlier audit and
must not be used to restore that behavior.

The following observations were read from this checkout on 25 October 2026. Refresh them before implementing the relevant ticket; line numbers are intentionally omitted because the checkout is actively changing.

- ProfilePicker creates/switches up to five local profiles and adopts guest runs with autosave suspension. It currently requires Male/Female. EditProfile already has optional sexuality and reproductive capability fields. There is no explicit profile gender identity/pronoun contract.
- Profile's no-photo header treats profile.avatar as text; simply saving an image path there would show a path instead of a character.
- /create-player is a separate legacy creation route; it must converge on the shared flow.
- The central appearance preset schema currently contains body, portrait and thumbnail only. Existing CP presets are not complete character packs.
- Grey portrait selection rewrites skins filenames. Sad switching in several paths excludes the human user. After the Eye resolves paparazzi by cast names. These need explicit selected-character/snapshot resolution.
- houseguestLookup can enrich by a human's chosen display name; preserve user metadata when a name matches the AI cast.
- profilesSlice wallet/purchase reducers contain useful price/idempotency checks, but profile localStorage persistence hides failures. Durable storage is currently initialized after static store construction. A purchase-safe aggregate requires startup and writer coordination.
- Native purchases already exist through @capgo/native-purchases. Current VIP copy promises the complete current Store collection, so cosmetic rollout needs explicit inclusion/copy rather than accidental exclusion.
- The current reward catalog pays 5,000 for an LOH win, 4,000 for a Safety win, 25,000 for Public Favorite and 100,000 for winning a season. Proposed cosmetic prices are design tuning against these rules, not research-backed willingness-to-pay estimates.
- Existing cast has 27 casual/formal figure identities and matching main/grey/sad filenames; 26 have tabloid photos. These stay AI assets. Six original player candidates exist; none has the required complete six-image set.
- The prior four-look technical report totals 397,566 delivery bytes. It covers two casual/main pairs and two streetwear/main pairs with thumbnails, not the revised roster, six-state packs or portrait-accessory system.

Useful files: src/routes.tsx; src/screens/ProfilePicker/ProfilePicker.tsx; src/screens/Profile/{Profile,EditProfile}.tsx; src/screens/HomeHub/HomeHub.tsx; src/screens/Store/Store.tsx; src/components/layout/{NavBar,GameBottomNav}.tsx; src/store/{profilesSlice,store,durablePersistence,gameSlice}.ts; src/utils/{avatar,presentationAvatar,houseguestLookup}.ts; src/hooks/useResolvedAvatarSrc.ts; src/components/ResolvedAvatarImage/ResolvedAvatarImage.tsx; src/components/HouseguestGrid/AvatarTile.tsx; src/screens/GameOver/aftermath.ts; src/vip/{vipPurchaseService,vipConfig,effectiveEntitlements}.ts.

## Deferred learning

After the complete flow works, use voluntary resemblance feedback, aggregate character selections, preview-to-equip rates, accessory preview legibility, load timings and purchase errors to prioritize additions. Do not infer ethnicity, gender, sexuality or health from selected images. No new analytics backend, identity profiling or personal-data collection is included in the launch plan.
