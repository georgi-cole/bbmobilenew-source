# The Road from the Eye

The eight launcher icons use the exact image order selected by the user: **7 → 2 → 1 → 8 → 3 → 4 → 5 → 6**. `sequence.json` is the source of truth; each stage records its original image number and copied PNG. The same first frame is the installed default icon, so the sequence begins consistently on a fresh install or upgrade.

The native app advances one stage each time it returns to the foreground and wraps from stage 8 to stage 1. Android uses launcher activity aliases, while iOS uses the primary icon for stage 1 and alternate icons for stages 2–8. New stage artwork is bundled with the app, so changing it requires a mobile app update. The remote `iconRotation.enabled` setting can still stop rotation and restore stage 1.

Run `python scripts/generate-story-icon-assets.py` after editing the source artwork or sequence manifest. It generates the primary icon and all Android/iOS launcher icon resources from the ordered manifest.
