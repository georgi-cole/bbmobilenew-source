# The Road from the Eye

The eight launcher icons follow the image order **7 → 2 → 1 → 8 → 3 → 4 → 5 → 6**. Each entry in `sequence.json` records the original image number and its PNG.

## iOS releases

Version `1.0.0` uses frame 1. When cutting the next App Store version, run this command from the repository root with the version you're releasing.

```sh
node scripts/set-ios-release.mjs 1.0.1
```

Commit the updated `ios/App/Release.xcconfig` with the release. The command sets the version and advances one frame, wrapping from frame 8 to frame 1. Passing the same version again keeps its assigned frame. Xcode and the iOS Store Cloud Build use this file, so TestFlight rebuilds and archive retries also keep their version's icon. The store workflow verifies the version and default icon in the archive before export.

## Android and artwork

Android advances one frame on foreground activation. The remote `iconRotation.enabled` setting can stop rotation and restore frame 1. Run `python scripts/generate-story-icon-assets.py` after editing the source artwork or sequence manifest to regenerate the native icon sets.
