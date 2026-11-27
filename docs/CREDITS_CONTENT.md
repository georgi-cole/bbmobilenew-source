# Runtime credits content

The Credits screen uses the card revision in the
[published content manifest](game-content-publishing.md). Edit
`public/config/credits.json` to update the names, copy or timing.

For a server-managed file, set either:

- `window.__BIG_EYE_CREDITS_URL__` before the app mounts; or
- `<meta name="big-eye-credits-url" content="https://…/credits.json">`.

The remote document must use version `1`, contain unique card IDs, use non-overlapping time ranges, stay inside the 54-second composition, and use one of the supported text styles from `cinematicConfig.ts`. Invalid or unavailable documents fall back to the bundled credit list, so the screen never opens blank.

The source background is the silent H.264 video at
`public/assets/credits/big-eye-cinematic-background.mp4`. Production fetches it
when Credits opens. The live text follows the playback clock. The offline scene
keeps the text visible when the clip is unavailable.

The separately replaceable soundtrack is configured in `src/cinematic/config/cinematicConfig.ts`. It is synchronized to the video and follows the cinematic fade-to-black. Rebuild only the background after visual changes with `npm run cinematic:render-background`; credit or music changes do not require a video render.
