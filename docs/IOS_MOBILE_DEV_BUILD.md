# iOS mobile developer build

Use this build when installing The Big Eye directly on a physical iPhone from Xcode before App Store purchases and the native ad provider are configured.

## Open Xcode with developer monetisation enabled

```powershell
npm run open:ios:dev
```

This performs the iOS web build, syncs Capacitor, normalizes the Swift package path, and opens Xcode.

If Xcode is already open and you only need to refresh the web bundle, run:

```powershell
npm run sync:ios:dev
```

Then build/run the app on the connected iPhone from Xcode as usual.

## What mobile-dev changes

- all effective VIP/store entitlements are available
- StoreKit is not contacted and raw purchase ownership remains false
- rewarded-ad requests succeed through the development simulator when no native ad bridge exists
- automatic ads remain suppressed because the effective No Ads entitlement is active
- gameplay debug shortcuts and special QA settings remain locked like a release build

The Marketface screen labels this state as **VIP Dev Access** / **Developer access** so it is not confused with a real Apple purchase.

## Normal/store builds

`npm run open:ios`, `npm run sync:ios`, and `npm run prepare:store:ios` continue to use the normal iOS release behavior.

The store environment validator rejects `VITE_BUILD_TARGET=mobile-dev` and `VITE_VIP_DEV_ENTITLEMENT=true`, so the development entitlement bypass cannot be used by the validated store-release workflow.

## Installed game display checks

Both native platforms use the same display policy. Gameplay hides the status and
navigation bars (the iPhone home indicator auto-hides), keeps the screen awake in
the foreground, and defaults to portrait. The existing landscape-capable minigames
may rotate; returning to menus restores portrait, phone controls, and normal sleep.
UIKit/Capacitor safe-area measurements still protect camera cutouts and swipe areas.

Android declares the app category as `game`, leaving performance/battery interventions
to the device and player. iOS declares the games category and both current and
legacy Game Mode support keys. These settings make the installed app eligible for
the platform's gaming features; they do not force Game Mode or silence notifications.

After syncing and rebuilding the installed app, verify on a real phone:

1. Open the home menu and a profile form. The system bars are visible, the keyboard
   fits, and buttons remain reachable without zooming or horizontal scrolling.
2. Start or resume a season. The phone bars disappear; no button overlaps the camera
   cutout or the bottom swipe area. On Android, an edge swipe temporarily reveals
   system navigation.
3. Leave active gameplay untouched beyond the phone's screen-sleep interval. It
   should stay awake; a menu should allow the normal sleep timer again.
4. Background and reopen the app, including after a phone lock or native dialog.
   Gameplay should regain immersive display without losing the saved season.
5. Open a landscape-capable Castle Rescue minigame, rotate, then return to the season
   or a menu. The game should return to portrait and recalculate its safe areas.
6. Check Game Mode on a supported device with the player's Game Mode settings
   enabled. Availability and performance changes depend on the OS/device.

Browser phone previews reproduce the hidden bars and safe-area layout; they cannot
verify native sleep timers, rotation, or the phone's performance Game Mode.
