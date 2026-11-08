# App review notes

## Access

- No account, sign-in, subscription, or demo credentials are required for the core game.
- The app opens directly into the game hub. A reviewer can create a player and start a season from the main menu.
- The iOS listing targets iPhone. On iPad the app runs in iPhone compatibility mode.

## Network-dependent and optional behavior

- The core season uses local game logic and remains playable without the optional AI responder service.
- If the premium Diary Room service is not configured or unavailable, the app uses deterministic local replies.
- Location is optional and is used only to select an ambient weather/day-night visual theme. The app rounds it to a 0.1° area and gets weather data from MET Norway through The Big Eye's Cloudflare proxy. Denying location does not block play.
- The submitted native build includes Google AdMob and Google's User Messaging Platform. Advertising is available only after an adult enables it in **Settings → Player privacy & family** and Google consent permits requests. Requests use non-personalized ads. Google consent choices can be revisited from that screen. The store listing should declare that the app contains ads.

## Suggested review path

1. Create a player.
2. Start a new season.
3. Advance to a competition and play the displayed minigame.
4. Open the social panel and complete an interaction.
5. Continue to a nomination or vote decision.

The Big Eye is an original fictional game and is not affiliated with a television network or reality-show franchise.
