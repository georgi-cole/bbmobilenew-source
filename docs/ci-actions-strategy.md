# CI / GitHub Actions strategy

The repository uses three quality tiers so routine pull requests do not pay for the same coverage repeatedly.

## Pull request gate

Every pull request keeps the named static checks:

- Formatting
- Test hygiene
- ESLint
- TypeScript
- Core regressions

Runtime builds run only when runtime/build inputs changed.

Android and iOS native compilation are **targeted**. They run when their native project, Capacitor configuration, package manifests, or build/sync scripts changed. Ordinary React/TypeScript gameplay changes are already covered by TypeScript, web/mobile production builds, Vitest, and browser smoke coverage and do not require a Gradle + Xcode compile on every commit.

Browser PR coverage is intentionally a focused mobile-Chromium smoke/finale gate. Cross-browser and wider viewport coverage lives in scheduled and release workflows.

Minigame Certification remains change-aware and runs its expensive audit only when minigame-relevant files change.

## Security analysis

CodeQL is scheduled weekly and can be run manually. It is not run on every pull request.

The repository currently has GitHub Code Scanning disabled, so CodeQL uses `upload: never`. Running four CodeQL languages on every PR—especially Swift on macOS—spent substantial Actions minutes without creating repository Code Scanning alerts.

If Code Scanning is enabled later, reconsider restoring PR-triggered analysis for the languages that provide useful alerts.

## Scheduled coverage

Scheduled Product Quality runs once per week and keeps:

- the full Vitest suite with coverage in a **single** execution;
- risk-based coverage enforcement;
- the 50-seed minigame stress matrix;
- representative desktop Chromium, mobile Chromium, and mobile WebKit browser coverage.

The former daily six-project browser matrix and separate active-minigame browser job were redundant with release/minigame coverage.

## Release coverage

`Release Product Quality` remains manual and deliberately exhaustive. It retains the full browser viewport matrix, complete product tests, coverage, deterministic minigame stress, web/mobile builds, and dependency audit.

Use this before store/public releases when full certification is worth the additional runner cost.

## Public deployment

A merge to `main` deploys only when files that affect the built site changed. Deployment performs the actual production and QA builds; it no longer repeats PR formatting, lint, typecheck, and mobile-build gates immediately after a successful merge.

## Manual browser regression

`Browser Regression Coverage` is retained as a manual workflow for targeted cross-browser core-journey investigation. It no longer duplicates the scheduled suite on every merge and every night.
