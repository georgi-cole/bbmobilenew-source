# Private QA environment

The `Deploy private QA site` workflow builds QA from `main` after relevant changes and deploys it to Cloudflare Pages. Production stays on GitHub Pages and only changes when `Deploy production site` is started manually from `main`.

## Supabase choice

The free plan allows two active projects across the account. Both are already in use: `The Big Eye` is production, and `The Crystal Path Infinity DEV` is development. QA will use the latter to avoid a new monthly charge.

This is a shared development database, not a completely separate QA database. The two games share project-level Supabase Auth settings and resources. Big Eye stores its data in its own `player_profiles`, `player_events`, and `player_profile_contacts` tables; Crystal Path currently has a public `profiles_public` table and its own `cpi_private` schema.

The DEV project already has Crystal Path migration history. For that reason, the QA deploy workflow does **not** run Supabase CLI migrations against it. Do not run `supabase db push` from this repository against the shared DEV project. Apply Big Eye schema changes manually through the Supabase SQL Editor, reviewing and running each repository migration once, in filename order. Keep future Big Eye schema changes on that same manual path unless a dedicated QA project becomes available. This manual step is less convenient, but it avoids mixing the two apps' migration histories.

## One-time setup

1. In Cloudflare Pages, create a **Direct Upload** project named `bbmobilenew-qa` with `main` as its production branch. Add `qa.kolequant.xyz` as its custom domain.
2. In Cloudflare Zero Trust, protect `qa.kolequant.xyz`, `bbmobilenew-qa.pages.dev`, and `*.bbmobilenew-qa.pages.dev` with an allow policy for the intended testers. Check that a signed-out browser is blocked on all three before enabling the deployment workflow.
3. Create a Cloudflare API token scoped to your account with only the Cloudflare Pages edit permission needed to deploy. Add it to the source repository as the Actions secret `CLOUDFLARE_API_TOKEN`. Add the Cloudflare account ID as the Actions variable `CLOUDFLARE_ACCOUNT_ID`.
4. In the source repository's Actions variables, add:
   - `CLOUDFLARE_QA_ACCESS_CONFIGURED` = `true` (only after steps 1–2 are completed and checked)
   - `VITE_SUPABASE_QA_ENABLED` = `true`
   - `VITE_SUPABASE_QA_URL` = `https://jbyguybxhezjhdbenevh.supabase.co`
   - `VITE_SUPABASE_QA_PUBLISHABLE_KEY` = the publishable key from `The Crystal Path Infinity DEV`
5. Add a Cloudflare Pages deployment token as the Actions secret `PAGES_DEPLOY_TOKEN`. This lets the workflow remove the old public `/qa/` copy from the separate GitHub Pages deployment repository after the private QA deployment succeeds.
6. After the access rules and Supabase schema are ready, start `Deploy private QA site` on `main`. The workflow then removes the old public `/qa/` copy from GitHub Pages.

The Supabase publishable key is intended for browser use. Never use a Supabase secret/service-role key in either build. Do not add database passwords or Supabase migration tokens for the shared QA database to GitHub Actions.

## Releasing to production

After checking the latest QA build, open Actions, choose `Deploy production site`, select `main`, and run the workflow. This builds the production version with the existing production Supabase settings and publishes only the production files to GitHub Pages. The QA build's unlocked features and DEV Supabase URL are not included.

Production migrations remain controlled by `SUPABASE_MIGRATIONS_ENABLED`; if enabled, they run only when the production deployment workflow is run.
