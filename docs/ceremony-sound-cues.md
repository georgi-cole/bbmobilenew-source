# Ceremony accent cues

The VIP renderer adds seven short synthetic placeholder effects over existing
phase music. Standard presentations and music selection are unchanged. These
are accents, not new background soundtracks. SFX mute/volume settings apply
through SoundManager's `tv` category. Files load lazily; playback never blocks
preparation, animation, gameplay or a required decision.

## Replacing recordings

Replace files in `public/assets/sounds/ceremonies/`, keeping their filenames.
Their stable keys are `tv:ceremony_<name>`. Asset bindings and default volumes
live in `public/assets/audio.config.json`; clip timings live separately in
`src/cinematic/ceremonies/ceremony-audio.ts`. Run `npm run generate:audio`
after replacing assets. If a recording's length changes, update `durationMs`
in `CEREMONY_CUES` to its new length. Keep files short with soft beginnings
and endings, and test at the existing conservative gain before raising volume.

| File           | Intended visual moment                           |
| -------------- | ------------------------------------------------ |
| transition.wav | Film entry and final doorway camera transition   |
| suspense.wav   | Decision-maker's suspense hold                   |
| reveal.wav     | Incoming nominee or verdict reveal               |
| shield.wav     | Shield/crown arrival and immunity lighting       |
| save.wav       | Nominee saved from the block                     |
| impact.wav     | Shock interruption, Ambush or Vox public verdict |
| door.wav       | Exit door closing                                |

Replacement and Co-LOH consequences use the actual `replacementBeats` clock,
including Double Trouble, Detox, linked pairs and sequential Vox replacements.
Simultaneous identical cues are deduplicated. Exit timings come directly from
the doorway timeline, including a royal decision lead-in. Other established
films use named cue offsets in the same central plan. Human thinking time is
never timed: leaving for Confessional stops the old clip's sounds.

Clip-owned timers schedule cues alongside animation completion. Pausing aborts
only that clip's active sound instances and freezes future cues. Resume seeks
to the remaining part of an interrupted cue. Skip, seek, completion and teardown
cancel pending/playing sounds via instance AbortSignals, including delayed
media-start callbacks. Older clips cannot stop a newer clip's instance.

The deterministic offline source is `scripts/generate-ceremony-cues.mjs`.
It generates mono 24 kHz PCM WAVs with smooth envelopes and bounded peaks.
It does not run in production or builds. Do not rerun it over commissioned
replacements unless you intend to restore the synthetic placeholders.
