# Repository validation rules

Before creating or updating a pull request, run:

```bash
npm run check:pr
```

Do not push, open a PR, or report validation as complete until this command passes after the final code edit.

`check:pr` is the local equivalent of the PR static-quality gates. It checks changed-file formatting, focused/disabled tests, ESLint with zero warnings, TypeScript, and the core season/profile lifecycle regressions.

If `package.json` or `package-lock.json` changed, also run:

```bash
npm audit --omit=dev --audit-level=high
```

Do not bypass the pre-push hook with `--no-verify` to get a failing change onto GitHub. Fix the underlying validation failure instead.

Targeted feature tests are still required when relevant. Passing `check:pr` does not replace tests specific to the code being changed.

## Marketplace and paid features

Every change to paid modes, expansions, premium minigames, themes, ads, purchases,
or Eyeolean powers must include a marketplace review. Follow
[docs/marketplace-maintenance.md](docs/marketplace-maintenance.md).

- Premium Challenges and VIP both unlock **all premium minigame versions**.
- Register upgraded games with `premiumExperience` or `premiumReplacementKey` in
  `src/minigames/registryBase.ts`. Use Premium Challenges access for launch gates,
  saved-session variant selection, and AI simulation.
- Update product copy, benefits, availability, and shelf in `src/vip/vipConfig.ts`
  when the offer changes. Do not hardcode counts or separate game lists in the UI.
- Run `npm run generate:marketplace`, then `npm run check:marketplace`.
- For paid-feature maintenance that leaves the offer unchanged, record the review
  and reason in the review log in `docs/marketplace-maintenance.md`.
- Keep this review in the same change as the feature; do not leave it for the user.
