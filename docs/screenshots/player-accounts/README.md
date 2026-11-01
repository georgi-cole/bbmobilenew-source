# Account email and player audience UI review

These screenshots are captures of the running game. Account addresses, consent choices, and
audience records are deterministic demonstration fixtures. The browser tests intercept all
Supabase requests; they do not send verification emails or access production player data.

The new screens use the shared game surfaces, violet accent, buttons, spacing, focus treatment,
and touch-target sizes. The account flow is available from **Manage profiles → Account & email**.
The audience is under **Settings Admin → Players** and requires separately authorized server access.

| Screen                                     | Capture                                        |
| ------------------------------------------ | ---------------------------------------------- |
| Manage profiles entry                      | [manage-profiles.png](manage-profiles.png)     |
| Optional email connection                  | [connect-email.png](connect-email.png)         |
| Verification code                          | [verify-email.png](verify-email.png)           |
| Independent email preferences              | [email-preferences.png](email-preferences.png) |
| Guest entry                                | [guest-entry.png](guest-entry.png)             |
| Existing-account sign-in at 320px          | [narrow-sign-in.png](narrow-sign-in.png)       |
| Player audience with demonstration records | [player-audience.png](player-audience.png)     |
| Restricted administrator access            | [admin-access.png](admin-access.png)           |

## Reproduce the browser checks

```bash
npx playwright install chromium
npx playwright test --config playwright.accounts.config.ts
```

The dedicated configuration starts an isolated local app on port 4183 with dummy backend settings
and the account feature enabled. It does not change the ordinary E2E configuration. The checks
exercise a real running season before connecting the account, verify the original profile/run and
Eyeoleans remain intact, save the two contact choices independently, exercise guest and narrow
layouts, and check authorized and denied audience states.

Browser output is written to `test-results/player-accounts/`. Production setup and SQL regression
instructions are in [SUPABASE_BACKEND.md](../../SUPABASE_BACKEND.md).
