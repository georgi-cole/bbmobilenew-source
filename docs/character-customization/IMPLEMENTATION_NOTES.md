# CP-00 verified implementation map

**Historical audit.** The active replacement plan is [ARCHITECTURE.md](ARCHITECTURE.md), with execution in [BACKLOG.md](BACKLOG.md) under CS tickets. Old CP/CL ticket instructions describe earlier proposals and are superseded. Reverify source behavior before implementing; this audit's test/build results are dated evidence, not current validation. The current art standard is [ART_BRIEF.md](ART_BRIEF.md), with a refreshed repository audit in [RESEARCH.md](RESEARCH.md).

**Ticket:** CP-00 — Verify integration boundaries and record a baseline  
**Status:** Complete  
**Audit date:** 25 October 2026  
**Scope:** Read-only repository audit plus baseline tests and a production-mode Vite build. No game source code changed.

## Profile and run ownership

`StoredProfile` in `src/store/profilesSlice.ts` is the persistent profile record. `loadProfilesState`/`saveProfilesState` read and write `bbmobilenew:profiles:v1` with localStorage. `coerceStoredProfile` supplies defaults when older records omit fields. `saveProfilesState` catches storage errors and returns no result, so a screen cannot currently distinguish a saved selection from a swallowed write failure through this helper. `loadActiveProfile()` returns name, avatar, photo ID, and biography, but not the active profile ID.

The in-memory `GameState` and `Player` have no profile ownership key. `buildUserPlayer()` in `src/store/gameSlice.ts` creates a human with `id: 'user'`, deriving `avatar` from the active profile's `photoId` token or emoji. `updateUserPlayerIdentity` finds the first `isUser` player and replaces name/avatar and selected gameplay metadata. It accepts no profile ID and changes the live player immediately. A future appearance action should carry the profile ID captured by the UI and be guarded at dispatch/resume; `player.id === 'user'` is not enough to establish run ownership.

Profile-specific run ownership is at the persistence boundary. `SavedSeasonSnapshot.profileId` is checked in `src/store/saveStatePersistence.ts`; `HomeHub` loads a `SavedRunProfile` with the selected active profile ID before hydrating a snapshot. `src/store/store.ts` associates autosaved state with the current active profile ID and flushes pending saves on document hide. Profile switching in `src/screens/ProfilePicker/ProfilePicker.tsx` inspects the target run, handles the switch/reset flow, then navigates to the new profile. The profile ID is not copied into `GameState` during this lifecycle.

`src/screens/Profile/EditProfile.tsx` is a natural place to link to a separate chooser, but it is not a safe live-appearance apply boundary. Its current save sequence writes the profile, dispatches `updateUserPlayerIdentity`, then navigates to Profile. There is no existing cinematic/presentation lock in that flow, and the identity edit can update a live player immediately. A new appearance must remain stable through an already-running overlay. CP-07 should expose Apply at a known-profile boundary (such as HomeHub after reset/new-season or resume/hydrate) and test navigation from a live season; CP-05 must not invent an assumed player-to-profile mapping. If no known-profile boundary is available, defer live-run synchronization.

## Save and archive paths

- New-season construction uses `buildUserPlayer()` and `createInitialGameState()` in `src/store/gameSlice.ts`.
- Saved run slots are keyed by profile in `src/store/saveStatePersistence.ts`. `SavedSeasonSnapshot` contains `profileId` and `GameState`; `createSavedSeasonSnapshot` passes the game through `compactGameStateForPersistence()` from `src/store/saveStateCompaction.ts`. Hydration resolves in `gameSlice.hydrateGame` and is initiated by HomeHub for the active profile's snapshot.
- `src/store/archivePersistence.ts` persists season archives through durable persistence, with keys scoped by active profile in `profilesSlice.ts`.
- `GameOver.tsx` builds completed-season archives via `buildArchive`. `src/store/eliminatedSeasonResolutionMiddleware.ts` is a second writer: it resolves a pre-Tribunal eliminated season on `game/resetGame` and dispatches `archiveSeason` with compact summaries. `PlayerSeasonSummary` currently stores placement/performance fields but has no player appearance or portrait snapshot. Existing archives do not recover appearance from the active profile. CP-09 must cover both archive writers if historical appearance is required, and add only a compact preset/appearance ID snapshot; no uploaded image data belongs in archives.

The selection belongs on the profile and the player's saved presentation snapshot. Live Apply should update the profile and only a run known to belong to it. If current run ownership cannot be established at the apply boundary, defer live-run synchronization until HomeHub resumes the profile's run. Completed archives need a separate compact capture only if historical appearance is a product requirement; no archived photo image data belongs there.

## Presentation consumers and handoff shapes

The portrait stack includes `src/components/ResolvedAvatarImage/ResolvedAvatarImage.tsx`, `src/hooks/useResolvedAvatarSrc.ts`, `src/components/PlayerAvatar/PlayerAvatar.tsx`, `src/components/ui/PlayerAvatar.tsx`, `src/components/HouseguestGrid/AvatarTile.tsx`, and a large set of direct `resolveAvatarCandidates()` callers. These APIs primarily accept or project `id`, `name`, `avatar`, and sometimes `isUser`; many do not carry arbitrary appearance metadata.

Direct full-body or cutout paths currently include:

| Location                                                                                                               | Current responsibility                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/components/FullSizeCutoutImage/FullSizeCutoutImage.tsx`                                                           | Shared component; tries uploaded profile photo before its formal/informal cutout candidates     |
| `src/utils/avatar.ts`                                                                                                  | Asset manifest lookup, name/ID matching, formal and informal paths, neutral/full-body fallbacks |
| `src/components/WeekendInterludeOverlay/WeekendInterludeOverlay.tsx`                                                   | Weekend full-body presentation                                                                  |
| `src/components/VoxPopuliFinale/VoxFinalistShowcase.tsx`                                                               | Finale full-body reveal                                                                         |
| `src/components/DayStartShockPopup/DayStartShockPopup.tsx`                                                             | Daily shock full-body presentation                                                              |
| `src/components/FinalPowerBattle/FinalPowerBattleIntro.tsx`, `FinalThreeBlockReveal.tsx`, `FinalPowerHolderReveal.tsx` | Power-battle full-body stages                                                                   |
| `src/components/Final3Ceremony/Final3Ceremony.tsx`                                                                     | Final-three ceremony                                                                            |
| `src/components/TribunalMemberStage/TribunalMemberStage.tsx`                                                           | Tribunal stages; contains special-case fallback presentation                                    |
| `src/components/FinalFaceoff/FinalFaceoff.tsx`                                                                         | Directly combines avatar, informal, and formal candidates                                       |
| `src/components/JuryPhaseRevealOverlay/JuryPhaseRevealOverlay.tsx`                                                     | Directly combines avatar and formal candidates                                                  |
| `src/components/SeasonRecapCinematic/seasonRecapData.ts`, `SeasonRecapCinematic.tsx`                                   | Builds candidate arrays and displays recap cutouts                                              |
| `src/components/ui/SpectatorView/SpectatorView.tsx`                                                                    | Spectator full-body view                                                                        |

These call sites must be checked in CP-08; replacing only the shared image component would miss consumers that build candidate arrays themselves. An explicit user preset must outrank name-based AI matches. Existing photo priority at the shared cutout component means a photo currently replaces the full-body cutout. A character-aware body resolver must separate the body choice from the portrait-photo choice.

The normal React minigame participant contract is `MinigameParticipant` in `src/components/MinigameHost/MinigameHost.tsx`: ID, name, `isHuman`, optional raw `avatar: string`, and score fields. GameScreen separately builds the houseguest roster's resolved `avatarUrl` from the `profile-photo:` token or `resolveAvatar(p)`; this presentation URL is not the same field as the raw avatar token passed in minigame participants. Participant construction frequently projects away fields: `HouseOfDarknessComp` and `HouseOfCardsComp` retain only `{ id, name, avatar }` for portraits, Battle Back builds its own participant objects from those fields, and the Weekend Interlude finale-reunion cutout currently constructs `{ id, name, sex }`. The legacy `src/minigames/legacy/hold-wall.js` calls optional `g.resolveAvatar(p)`. The searched `src`, `public/js`, and `js` trees did not identify its installer in `src/minigames/compat-bridge.ts`; do not treat that bridge as its source and reverify the global contract when implementing CP-08. CP-08 must identify and test each supported participant builder; if `avatar` remains the compatibility portrait string, no body data should be sent to a minigame that only renders a portrait.

## Route and preload behavior

`src/routes.tsx` already uses `lazyWithChunkRecovery` for Profile and EditProfile. Add the selector using that pattern. `AssetPreloaderOverlay` calls `getPresentationAvatarPreloadUrls()` from `src/utils/avatarPreloadCandidates.ts`; it derives presentation portrait candidates for the existing cast. `src/screens/GameScreen/useGameScreenImagePreloads.ts` adds scene backgrounds and warms the Tribunal backdrop. `src/hooks/useHomeHubAssets.ts` preloads critical Home assets and defers other known assets until idle. The shared `preloadImages` helper in `src/utils/preloadImages.ts` deduplicates retained `<link rel="preload">` nodes but does not evict old nodes. Avoid adding every gallery body or every hovered selection to that global helper.

For R1, lazy-load the route, lazy-load offscreen gallery thumbnails, and render one selected body at a time. Current Vite configuration uses `/bbmobilenew/` for the default web build and `./` for Capacitor/iOS/Android builds. Catalog assets must resolve in both forms.

## Baseline build and asset measurements

Ran `vite build --mode release --outDir <new temporary directory>` to avoid overwriting the pre-existing ignored `dist/` tree. Vite 8.3.5 built 2,312 modules in 8.19 seconds. The output contained 1,254 files / 485.50 MiB total; the `assets/` tree contained 1,224 files / 484.44 MiB. File size is uncompressed output size; it is not an installed mobile-app measurement. The output included 203 JavaScript assets / 6.64 MiB. The informal source directory has 28 files (27 raster images plus a readme) / 6,736,693 bytes total; the raster images account for 6,736,691 bytes. The formal source directory has 34 files (27 raster images, six `.wp2` files, and a readme) / 8,592,394 bytes total; its raster images account for 8,387,350 bytes. The built informal folder had 28 files / 6.42 MiB. These asset measurements describe the existing library and are not a proposed new-preset budget.

The build succeeded with two existing warnings: Vite could not resolve the referenced `/bbmobilenew/assets/skins/cupid-love/rose-gold-unified.png` at build time and leaves it for runtime resolution; several existing JavaScript chunks exceed 500 kB minified, including the cinematic preview chunk. Vite also reported that the external temporary output directory would not be emptied; it was new before the build. The app's existing warnings are recorded as baseline and are not attributed to the character feature. No TypeScript check was run by the direct Vite build.

## Baseline tests and unresolved failure

Ran this targeted Vitest command:

```powershell
./node_modules/.bin/vitest.cmd run tests/unit/profilesSlice.test.ts src/store/saveStatePersistence.test.ts src/store/durablePersistence.test.ts src/components/FullSizeCutoutImage/__tests__/FullSizeCutoutImage.test.tsx src/screens/ProfilePicker/ProfilePicker.test.tsx
```

Result: 5 files ran, 47 tests passed and 1 failed. The existing `tests/unit/profilesSlice.test.ts` case `loadProfilesState / saveProfilesState > round-trips via localStorage` fails because the loader adds normalized defaults (including the empty inventory/transaction arrays, `eyeoleans: 0`, and optional `undefined` properties) absent from its expected fixture. The other four targeted files passed. This is a pre-existing profile serialization/test-fixture mismatch, not a regression from CP-00; no code or fixture changes were made.

The smallest persistence change needed later for an explicit Apply flow is for `saveProfilesState` to return a success/failure result (or an equivalent narrow result from the persistence boundary) so the UI can confirm only a durable selection; its current swallowed storage errors provide no such signal. The required `npm run check:pr` gate is not a CP-00 requirement because no PR is being prepared. The only feature-level validation today is the source audit: character presets are not implemented. The single baseline test failure is recorded for the implementation agent; do not fix it as part of CP-00.

## Next-ticket guidance

CP-01 has defined an empty, typed released-preset catalog and an explicit WebP asset policy. CP-02 should add only visually accepted pilot files to that catalog. Keep `Player.avatar` as a compatibility portrait string and use an explicit optional appearance snapshot for body resolution. Before CP-05, decide how a profile ID is bound to a live run at the Apply boundary; current `GameState` and `Player` do not supply that ownership mapping. Before CP-08, use the consumer list above plus a fresh `rg` audit to avoid missing scene-specific candidate construction. Keep the R1 renderer to ordinary static images; this repository already has enough portrait/cutout resolution behavior that replacing it all at once would create unnecessary risk.
