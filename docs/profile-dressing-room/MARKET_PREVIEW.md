# Changing room market design preview

All 35 published looks stay in the carousel. Looks 1–5 are free; the others show a compact crown/VIP badge and a 30,000 Eyeros badge. Either badge opens the matching market option without spending currency. Buying a single look requires explicit confirmation in the market. VIP opens the real Store while preserving the selected look and profile-creation draft for the normal Back action.

The preview uses the production `AppearanceCarousel`, `LookAccessBadges`, `LookMarket` and their styles. It bundles actual repository character art and the existing changing-room stage; it does not replace them with generated stand-ins.

## Build and test

```sh
npm ci
node scripts/build-changing-room-preview.mjs
npx playwright install chromium
node scripts/test-changing-room-preview.mjs
```

Open `artifacts/changing-room-preview/changing-room-test.html` directly in a browser. It is self-contained, including its 35 character looks, and does not need a server or network connection. The Changing room design preview CI workflow publishes the HTML, desktop/mobile screenshots and interaction-test results in its `changing-room-interactive-preview` artifact.

## Isolation

The test page has its own in-memory 45,000-Eyeros demo wallet. Standard, Free, Low balance, VIP and Owned presets are provided. Activate demo VIP simulates an entitlement; it never starts a native-store transaction. Reset demo restores all test state. No application Redux store, real saved profile, local storage, native purchase service or analytics are imported by the test entry.

The lock-in reveal is not played by this isolated test page; choosing an available look shows a demo confirmation. The real changing room retains its existing lock-in cinematic.
