# Changing room market design preview

All 35 published looks stay in the carousel. Looks 1–5 are free. Locked looks show the existing marketplace VIP eye and a 30,000 Eyeros badge. Free, VIP-accessible and permanently purchased looks show the normal selection button without an availability label.

Tapping VIP opens the real Store directly on its VIP shelf (`/store`, `shelf: 'all-access'`), preserving the selected look and profile-creation state for Back. There is no intermediate VIP look-market panel. Tapping Eyeros retains the portrait-led look market, balance/shortfall explanation and explicit purchase confirmation. Its VIP option also opens the VIP shelf directly. Browsing and navigation do not spend currency.

The preview uses the production `AppearanceCarousel`, `LookAccessBadges`, `LookMarket`, shared `StoreProductIcon` VIP artwork and their styles. It bundles actual repository character art and the existing changing-room stage; it does not replace them with generated stand-ins.

## Build and test

```sh
npm ci
node scripts/build-changing-room-preview.mjs
npx playwright install chromium
node scripts/test-changing-room-preview.mjs
```

Open `artifacts/changing-room-preview/changing-room-test.html` directly in a browser. It is self-contained, including its 35 character looks, and does not need a server or network connection. The Changing room design preview CI workflow publishes the HTML, desktop/mobile screenshots and interaction-test results in its `changing-room-interactive-preview` artifact.

## Isolation

The test page has its own in-memory 45,000-Eyeros demo wallet. Standard, Free, Low balance, VIP and Owned presets are provided. The VIP destination is a clearly labelled navigation stand-in, not the full production marketplace or billing screen. Activate demo VIP simulates an entitlement; it never starts a native-store transaction. Returning preserves the selected look and wallet. Reset demo restores all test state. No application Redux store, real saved profile, local storage, native purchase service or analytics are imported by the test entry.

The lock-in reveal is not played by this isolated test page; choosing an available look shows a demo confirmation. The real changing room retains its existing lock-in cinematic.
