# Luna handoff — Character Store and Dressing Room

Active revision: 25 October 2026. Use Luna with extra-high reasoning when the user starts a ticket. This document is ready for execution, but no CS implementation ticket has started. The planning request did not authorize bulk generation or coding now.

## Read first

1. Repository AGENTS.md and current git status.
2. [ARCHITECTURE.md](ARCHITECTURE.md) and [UX_FLOWS.md](UX_FLOWS.md).
3. [ROSTER_PLAN.md](ROSTER_PLAN.md) and [ART_BRIEF.md](ART_BRIEF.md).
4. [ACCESSORY_PIPELINE.md](ACCESSORY_PIPELINE.md), [ASSET_VALIDATION.md](ASSET_VALIDATION.md), [RESEARCH.md](RESEARCH.md).
5. The requested ticket in [BACKLOG.md](BACKLOG.md) and its prerequisites' actual evidence.

IMPLEMENTATION_NOTES and old CP/CL evidence are dated background, not current scope. CP/CL/MP/MC/DR/PAY execution instructions are superseded. Preserve released IDs/revisions and unrelated dirty work. Never restart the rejected modular head/body assembly.

## Concrete scope

Twelve original adult character packs, each with casual body, formal body, main portrait, grey portrait, sad portrait and paparazzi. Eight free, four permanent Eyeolean unlocks; verified VIP inclusion is explicitly mapped. Six new identity candidates count toward 12 only when complete/accepted; none is complete today.

A shared picker supports profile creation and a new Dressing Room. Existing Profile/Edit/Home/game menus connect to it. Existing Market gains Characters and Accessories. Eight initial cosmetics: three fitted portrait eyewear, three Profile/Dressing Room frames, two card backdrops. Four free items and four items unlockable through Eyeoleans or one native cash bundle. The bundle/VIP license is separate from profile-local earned grants and equipment.

No avatar choice assigns personal identity, age or gameplay capabilities. Optional gender/pronouns and existing story eligibility remain separate. No independent body garments, wigs, makeup or anatomy sliders in this release. Native billing has explicit verification/provider/sandbox dependencies before readiness.

## Current source state

- Candidate 01 has an accepted six-role pack and thumbnail under `cs-00/`; its casual/main sources were reused. For future avatar art, match the existing game's gold-particle placement and the darker outer tones in `public/assets/skins/backup-grey-lux/Ali_avatar.webp`; leave candidate 01 unchanged.
- look-pilot/masters identity 02: casual + main portrait candidates, plus a separate streetwear edition.
- 03–06: unaccepted casual body masters, no delivered portraits. Studio haze/alpha requires correction; metadata alpha alone is insufficient.
- No other complete grey/formal/sad/paparazzi set exists.
- Earlier four-look delivery report: 12 WebP files, 397,566 bytes, technical checks only. It does not cover the revised six-image contract.
- Candidate 02 has painted-in glasses; exclude additional eyewear unless a separately approved source revision addresses that.
- Existing presets under public/assets/characters are legacy CP compatibility content, not automatically accepted new characters.

## Copyable starting instruction

> CS-00 was accepted on 26 October 2026. Start CS-01 using Luna extra-high. Follow BACKLOG.md and ACCESSORY_PIPELINE.md; use candidate 01 and candidate 03 for one original eyewear design with six main/grey/sad fits. Preserve candidate 01 as-is. For new main portraits, match the existing in-game gold-particle placement; for new grey-lux portraits, match the darker outer tones in Ali_avatar.webp. Keep all pilot art outside `public` and the runtime catalog. Retain sources, prompts, lineage, hashes and fit evidence. Stop at the CS-01 visual-acceptance gate and report.

## Execution boundaries

One requested ticket at a time, including each art batch. Record user acceptance separately from technical checks. Report an unresolved aesthetic gate as awaiting acceptance. Do not ask for permission repeatedly for already authorized local work; finish the concrete requested ticket first.

Run relevant tests. Before PR/push/update or reporting repository validation complete, npm run check:pr must pass after the final code edit. If manifests are changed by the ticket, also run npm audit --omit=dev --audit-level=high. Do not bypass hooks or repair unrelated baseline failures silently.

Use evidence/<CS-ticket>/ for results. Include outcome, files, user-visible behavior, exact validation results, source/art acceptance, bytes/performance where relevant, unresolved external prerequisites and the next eligible ticket. Stop before it.

A free/Eyeolean-ready local flow is a real milestone; it is not proof of native paid readiness. Real configured products, verification/reconciliation and supported-device sandbox/restore tests are required before that claim. No deployment, real charge or store publication follows automatically.
