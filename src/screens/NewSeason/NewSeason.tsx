import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { SELECTABLE_LOOKS, getAppearanceAsset } from '../../appearance/catalog'
import { joinPublicAssetPath } from '../../utils/avatar'
import { trackProductEvent } from '../../services/liveOps/productTelemetry'
import { getAnalyticsGameModeForRuleset } from '../../services/backend/analyticsGameMode'
import { contestantFromProfile } from '../../appearance/seasonContestant'
import { launchSeasonWithContestant, parseNewSeasonMode } from '../../modes/launchSeason'
import { getActiveFiniteSeason, rulesetLabel } from '../../modes/seasonRulesets'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  archiveKeyForProfile,
  rememberContestant,
  selectCurrentProfile,
} from '../../store/profilesSlice'
import {
  selectHasCupidArrowAccess,
  selectHasSurvivalModeAccess,
  selectHasVoxPopuliAccess,
} from '../../store/vipSlice'
import { selectDebugExpansionUnlocks } from '../../store/uiSlice'
import {
  clearSavedRun,
  flushSavePersistence,
  loadSavedRunProfile,
  retrySavePersistenceWrites,
} from '../../store/saveStatePersistence'
import { loadSeasonArchives } from '../../store/archivePersistence'
import { flushPendingRunSnapshots, persistCurrentRunSnapshot } from '../../store/store'
import { beginGameplayAudioExit } from '../../services/sound/audioRouteOwnership'
import { SoundManager } from '../../services/sound/SoundManager'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import { imageIdToDataUrl } from '../../utils/imageDb'
import './NewSeason.css'

export default function NewSeason() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const mode = parseNewSeasonMode(params.get('mode'))
  const profile = useAppSelector(selectCurrentProfile)
  const cupid = useAppSelector(selectHasCupidArrowAccess)
  const vox = useAppSelector(selectHasVoxPopuliAccess)
  const survival = useAppSelector(selectHasSurvivalModeAccess)
  const debugUnlocks = useAppSelector(selectDebugExpansionUnlocks)
  const access =
    mode === 'classic' ||
    (mode === 'survival'
      ? survival
      : mode === 'cupidArrow'
        ? cupid || debugUnlocks.cupidArrow
        : vox || debugUnlocks.voxPopuli)
  const initial = useMemo(() => {
    const contestant =
      profile?.contestantDefaults ?? contestantFromProfile(profile ?? { name: 'You', avatar: '🧑' })
    const age = Number(contestant.bio.age)
    return {
      ...contestant,
      bio: {
        ...contestant.bio,
        age: Number.isInteger(age) && age >= 18 && age <= 120 ? String(age) : '28',
      },
    }
  }, [profile])
  const [name, setName] = useState(initial.name)
  const [age, setAge] = useState(initial.bio.age ?? '28')
  const [sex, setSex] = useState(initial.bio.sex ?? '')
  const [location, setLocation] = useState(initial.bio.location ?? '')
  const [profession, setProfession] = useState(initial.bio.profession ?? '')
  const [story, setStory] = useState(initial.bio.story ?? '')
  const [look, setLook] = useState('profile')
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (initial.photoId) {
      void imageIdToDataUrl(initial.photoId).then((url) => {
        if (!cancelled) setProfilePhotoUrl(url)
      })
    }
    return () => {
      cancelled = true
    }
  }, [initial.photoId])
  const [reproductiveRole, setReproductiveRole] = useState(() => {
    const value = initial.bio.reproductiveProfile
    return value?.canBecomePregnant && value.canCausePregnancy
      ? 'both'
      : value?.canBecomePregnant
        ? 'become'
        : value?.canCausePregnancy
          ? 'cause'
          : 'none'
  })
  const [replacePrompt, setReplacePrompt] = useState(false)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const title = mode === 'survival' ? 'Surveyeval' : rulesetLabel(mode)

  async function start(replace = false) {
    if (startingRef.current || !access) return
    const parsedAge = Number(age)
    if (
      !name.trim() ||
      !age.trim() ||
      !Number.isInteger(parsedAge) ||
      parsedAge < 18 ||
      parsedAge > 120
    ) {
      setError('Enter a contestant name and a whole-number age between 18 and 120.')
      return
    }
    // Re-read at submission so a different saved run cannot be silently replaced.
    const saved = profile ? loadSavedRunProfile(profile.id) : null
    const existing =
      mode === 'survival' ? saved?.runs.survival : getActiveFiniteSeason(saved)?.snapshot
    if (existing && !replace) {
      setReplacePrompt(true)
      return
    }
    startingRef.current = true
    setStarting(true)
    setError('')
    try {
      SoundManager.unlockFromGesture()
      retrySavePersistenceWrites()
      flushPendingRunSnapshots()
      if (!(await flushSavePersistence()))
        throw new Error('Your current progress could not be saved. Please try again.')
      const preset = SELECTABLE_LOOKS.find((entry) => entry.id === look)
      const contestant = {
        ...initial,
        name: name.trim(),
        avatar: preset
          ? getAppearanceAsset(
              { kind: 'catalog', lookId: preset.id, revision: preset.revision },
              'main'
            )!
          : initial.avatar,
        appearanceSelection: preset
          ? { kind: 'catalog' as const, lookId: preset.id, revision: preset.revision }
          : initial.appearanceSelection,
        photoId: preset ? undefined : initial.photoId,
        ...(preset ? { presetId: preset.id, presetRevision: preset.revision } : {}),
        bio: {
          ...initial.bio,
          age: String(parsedAge),
          sex: sex || undefined,
          location: location.trim() || undefined,
          profession: profession.trim() || undefined,
          story: story.trim() || undefined,
          reproductiveProfile:
            reproductiveRole !== 'none'
              ? {
                  canBecomePregnant: reproductiveRole === 'become' || reproductiveRole === 'both',
                  canCausePregnancy: reproductiveRole === 'cause' || reproductiveRole === 'both',
                }
              : undefined,
        },
      }
      const archives = profile ? (loadSeasonArchives(archiveKeyForProfile(profile.id)) ?? []) : []
      beginGameplayAudioExit()
      if (profile && mode === 'survival')
        trackProductEvent('game_mode_selected', getAnalyticsGameModeForRuleset(mode), profile.id)
      launchSeasonWithContestant(dispatch, mode, contestant, archives)
      // Persist the complete launch once, with the selected mode and contestant.
      persistCurrentRunSnapshot()
      const replacedSlot = mode === 'survival' ? 'survival' : getActiveFiniteSeason(saved)?.ruleset
      if (profile && existing && replacedSlot && replacedSlot !== mode)
        clearSavedRun(profile.id, replacedSlot)
      if (!(await flushSavePersistence()))
        throw new Error(
          'The new season could not be saved. Please retry saving before leaving the game.'
        )
      if (profile) {
        dispatch(rememberContestant({ profileId: profile.id, contestant }))
        if (mode === 'survival')
          trackProductEvent(
            'season_started',
            {
              ...getAnalyticsGameModeForRuleset(mode),
              week: 0,
              day: 0,
              phase: mode === 'survival' ? 'survival' : 'idle',
            },
            profile.id
          )
      }
      navigate('/game', { replace: true })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The season could not be started. Please try again.'
      )
    } finally {
      startingRef.current = false
      setStarting(false)
      setReplacePrompt(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void start()
  }

  return (
    <section className="new-season">
      <GameBackButton onClick={() => navigate('/?menu=play')} label="Back to Play" />
      <p className="new-season__eyebrow">{title} · New season</p>
      <h1>Choose your contestant</h1>
      <p>
        Keep your current contestant or change them if you want. Changes apply to this new season
        and become your next-season defaults. Existing saved seasons keep their own contestant.
      </p>
      {!access ? (
        <p>
          This mode needs access from the Market.{' '}
          <button type="button" onClick={() => navigate('/store')}>
            Open Market
          </button>
        </p>
      ) : (
        <form onSubmit={submit}>
          <p>
            Ready to play as <strong>{name.trim() || initial.name}</strong>, age {age}. You can
            start without changing anything.
          </p>
          <details>
            <summary>Change contestant (optional)</summary>
            <fieldset disabled={starting}>
              <legend>Appearance</legend>
              <div className="new-season__looks">
                <label
                  className={
                    look === 'profile'
                      ? 'new-season__look new-season__look--selected'
                      : 'new-season__look'
                  }
                >
                  <input
                    type="radio"
                    name="look"
                    value="profile"
                    checked={look === 'profile'}
                    onChange={() => setLook('profile')}
                  />
                  {profilePhotoUrl ? (
                    <img src={profilePhotoUrl} alt="" width="72" height="72" />
                  ) : initial.appearanceSelection?.kind === 'catalog' ||
                    initial.avatar.startsWith('assets/') ? (
                    <img
                      src={joinPublicAssetPath(
                        getAppearanceAsset(initial.appearanceSelection, 'main') ?? initial.avatar
                      )}
                      alt=""
                      width="72"
                      height="72"
                    />
                  ) : (
                    <span className="new-season__profile-avatar" aria-hidden="true">
                      {initial.avatar.startsWith('assets/') ? '👤' : initial.avatar}
                    </span>
                  )}
                  <span>Current look</span>
                </label>
                {SELECTABLE_LOOKS.map((preset) => (
                  <label
                    key={preset.id}
                    className={
                      look === preset.id
                        ? 'new-season__look new-season__look--selected'
                        : 'new-season__look'
                    }
                  >
                    <input
                      type="radio"
                      name="look"
                      value={preset.id}
                      checked={look === preset.id}
                      onChange={() => setLook(preset.id)}
                    />
                    <img
                      src={joinPublicAssetPath(
                        getAppearanceAsset(
                          { kind: 'catalog', lookId: preset.id, revision: preset.revision },
                          'main'
                        )!
                      )}
                      alt=""
                      width="72"
                      height="72"
                      loading="lazy"
                    />
                    <span>{preset.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="new-season__fields" disabled={starting}>
              <legend>Contestant background</legend>
              <label>
                Contestant name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={24}
                  required
                />
              </label>
              <label>
                Contestant age
                <input
                  type="number"
                  min="18"
                  max="120"
                  step="1"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  required
                  aria-describedby="contestant-age-note"
                />
              </label>
              <small id="contestant-age-note">
                Fictional character age. This does not change your real-player age or access
                settings.
              </small>
              <label>
                Contestant sex
                <select value={sex} onChange={(event) => setSex(event.target.value)}>
                  <option value="">Unspecified</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </label>
              <label>
                Hometown
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={50}
                />
              </label>
              <label>
                Profession
                <input
                  value={profession}
                  onChange={(event) => setProfession(event.target.value)}
                  maxLength={50}
                />
              </label>
              <label>
                Backstory
                <textarea
                  value={story}
                  onChange={(event) => setStory(event.target.value)}
                  maxLength={200}
                />
              </label>
              {
                <label>
                  Reproductive story role
                  <select
                    value={reproductiveRole}
                    onChange={(event) => setReproductiveRole(event.target.value)}
                  >
                    <option value="none">No explicit role</option>
                    <option value="become">Can become pregnant</option>
                    <option value="cause">Can cause pregnancy</option>
                    <option value="both">Both</option>
                  </select>
                </label>
              }
            </fieldset>
          </details>
          {error && <p role="alert">{error}</p>}
          <button className="game-button game-button--primary" type="submit" disabled={starting}>
            {starting ? 'Starting…' : 'Start Season'}
          </button>
          {!profile && (
            <p>
              Playing as guest. Create a player profile later to keep this season and your progress.
            </p>
          )}
        </form>
      )}
      <ConfirmExitModal
        open={replacePrompt}
        title="Replace saved run?"
        description="Starting this season replaces your saved run in this mode. Your other mode and player progress stay available."
        confirmLabel="Replace and Start"
        onConfirm={() => void start(true)}
        onCancel={() => setReplacePrompt(false)}
      />
    </section>
  )
}
