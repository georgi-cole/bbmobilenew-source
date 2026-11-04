# Private QA environment

The `Deploy private QA site` workflow builds QA from `main` after every relevant push and deploys it to the Cloudflare Pages project `bbmobilenew-qa`. Production stays on GitHub Pages and only changes when `Deploy production site` is started manually from `main`.

## One-time setup

1. Create a separate Supabase project for QA. Do not use the production project's URL or key. Keep its schema current with the repository migrations.
2. In Cloudflare Pages, create a **Direct Upload** project named `bbmobilenew-qa` with `main` as its production branch. This lets GitHub Actions publish the already-built QA files. Add `qa.kolequant.xyz` as its custom domain.
3. In Cloudflare Zero Trust, use Access to protect `qa.kolequant.xyz`, `bbmobilenew-qa.pages.dev`, and `*.bbmobilenew-qa.pages.dev`. Use an allow policy for the intended tester email addresses. Verify a signed-out browser is blocked on all three before enabling the workflow.
4. Create a Cloudflare API token scoped to your account with only the Cloudflare Pages edit permission needed to deploy. Add it to the source repository as the Actions secret `CLOUDFLARE_API_TOKEN`. Add the Cloudflare account ID as the Actions variable `CLOUDFLARE_ACCOUNT_ID`.
5. In the source repository's Actions variables, add:
   - `CLOUDFLARE_QA_ACCESS_CONFIGURED` = `true` (only after steps 2–3 have been completed and checked)
   - `VITE_SUPABASE_QA_ENABLED` = `true`
   - `VITE_SUPABASE_QA_URL` = the QA project's HTTPS URL
   - `VITE_SUPABASE_QA_PUBLISHABLE_KEY` = the QA project's publishable key
   - `SUPABASE_QA_PROJECT_REF` = the QA project's reference

6. Add the QA database password as the Actions secret `SUPABASE_QA_DB_PASSWORD`. The existing `SUPABASE_ACCESS_TOKEN` must have access to both projects for automatic migrations.
7. Start `Deploy private QA site` on `main`. Once the protected deployment succeeds, the workflow removes the old public `/qa/` copy from GitHub Pages.

The project publishable key is intended for browser use. Never use a Supabase secret/service-role key in either build.

## Releasing to production

After checking the latest QA build, open Actions, choose `Deploy production site`, select `main`, and run the workflow. This builds the production version with the existing production Supabase settings and publishes only the production files to GitHub Pages. QA's unlocked features and QA Supabase credentials are not included in that build.

If `SUPABASE_MIGRATIONS_ENABLED` is `true`, migrations are applied to QA on the QA deployment and to production only when the production workflow is run.
