# The Big Eye weather proxy

This Worker uses MET Norway's global Locationforecast data. MET Norway publishes its data for commercial use under open-data terms, requires attribution, and asks client applications to use a proxy. The app does not call the provider directly.

## Cost and limits

- Run this Worker on Cloudflare's Workers Free plan only. Do not enable billing or upgrade the account for this feature.
- The worker requires no API key, KV namespace, or paid database. It uses a SQLite-backed Durable Object for a shared, strongly consistent cache; this service is available on the Free plan.
- Cloudflare's free Worker request quota is 100,000 requests per day; over-quota requests fail instead of automatically upgrading the account.
- Durable Objects on the Free plan also have included daily request, compute, and storage limits; requests fail when a free quota is reached rather than creating an automatic paid upgrade.
- The game only uses the result to choose an ambient background. Coordinates are rounded to 0.1 degrees on the device and again by this Worker.

## Setup

1. Read and accept the current MET Norway API Terms of Service as the account owner before first use.
2. Install the Wrangler dependency already declared in `../vip-confessional/package.json` with `npm ci` from that directory.
3. Create a Cloudflare Worker named `the-big-eye-weather-proxy` using this configuration, keeping the account on the Free plan:

   ```powershell
   npx wrangler --config ..\weather-proxy\wrangler.jsonc deploy
   ```

4. Set `VITE_WEATHER_API_URL` in each private store-build environment to the resulting `https://<worker>.<account>.workers.dev/v1/current-weather` URL.
5. Keep the MET Norway credit in the in-app Legal screen and privacy policy.

The Worker stores normalized responses in one globally coordinated Durable Object for at least three hours and honors any later MET `Expires` time. When refreshing an expired forecast, it sends the provider's `Last-Modified` value with `If-Modified-Since` when available. Concurrent requests for the same rounded area share a single provider request. The Worker does not log request coordinates, and response logs are disabled.

## Local validation

```powershell
npx wrangler --config ..\weather-proxy\wrangler.jsonc deploy --dry-run
```
