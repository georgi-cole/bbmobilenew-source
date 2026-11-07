# Character appearance implementation plan

> Archived planning snapshot. Superseded by the [active Character Store plan](../../README.md) and CS tickets. Statements below describe the earlier scope; do not execute their CL instructions.

This is the active handoff for Luna at extra-high reasoning, revised 25 October 2026. The user selected complete-look image bundles and started CL-00; its four-look proof passed technical checks and awaits the user's visual acceptance. The primary audience is 16–29, so the launch roster should lean toward clearly adult 18–29 identities while retaining adults 30+. Existing cast members are visual style references only and must never be recreated as selectable identities. CL-01 remains closed until the user accepts the art.

Produce complete character looks as offline-authored image bundles, matching the game's existing cast rendering and framing. The game continues rendering ordinary images. Players choose a free identity and can later buy complete looks and supported profile decoration. The first release offers approximate resemblance through curated choices, not face/body sliders or independent garment assembly.

Start with [LUNA_HANDOFF.md](LUNA_HANDOFF.md). It contains the copyable first-ticket instruction and the required reading order.

| Document                                           | Purpose                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                 | Product scope, catalog, profile/run lifecycle, presentation, commerce and performance |
| [ART_BRIEF.md](ART_BRIEF.md)                       | Actual cast references, framing measurements, source workflow and visual acceptance   |
| [BACKLOG.md](BACKLOG.md)                           | Ordered tickets with scope, dependencies, checks and stop conditions                  |
| [ASSET_VALIDATION.md](ASSET_VALIDATION.md)         | Current CP-01 validation behavior and proposed extension boundary                     |
| [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) | Dated CP-00 source audit and baseline evidence                                        |

The first ticket is CL-00: two new adult identities in their 20s, each in an everyday free look and a premium expressive look, with matching portraits and thumbnails. Only the user's acceptance of this four-look proof opens integration work. The current route freezes accepted generated masters and makes deterministic exports; image generation itself is not claimed to be reproducible.

After acceptance, the content target is 24 free identities and one paid collection covering those identities, developed in batches of six. Every ticket and every batch ends with a report before the next begins.

The rejected modular experiment remains in [mp-00/README.md](mp-00/README.md). Its superseded planning documents are retained under [history/modular-2026-10-25](history/modular-2026-10-25/ARCHITECTURE.md). Do not execute the old MP/MC/DR/PAY backlog or reuse its assembled art. Existing CP-02 presets are retained compatibility content and must pass the new art review before entering the new chooser.
