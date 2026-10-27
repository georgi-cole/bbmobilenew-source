import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  appearanceFromAssetUrl,
  getAppearanceAsset,
  getAppearanceLook,
} from '../../appearance/catalog'
import { joinPublicAssetPath } from '../../utils/avatar'
import { useAppSelector } from '../../store/hooks'
import { isGuestSaveReminderEvent } from '../../store/guestSaveReminder'
import { selectCurrentProfile, selectIsGuest } from '../../store/profilesSlice'
import { imageIdToDataUrl } from '../../utils/imageDb'
import './Profile.css'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'

export default function Profile() {
  const navigate = useNavigate()
  const location = useLocation()
  const profile = useAppSelector(selectCurrentProfile)
  const isGuest = useAppSelector(selectIsGuest)

  const week = useAppSelector((s) => s.game.week)
  const phase = useAppSelector((s) => s.game.phase)
  const guestSaveInviteActive = useAppSelector(
    (s) =>
      s.profiles.isGuest &&
      s.game.week === 1 &&
      s.game.phase === 'loh_comp_announcement' &&
      s.game.tvFeed.some(
        (event) => isGuestSaveReminderEvent(event) && event.meta?.broadcastConsumed !== true
      )
  )
  const isGameActive = useAppSelector((s) => s.game.status === 'active')
  const userPlayer = useAppSelector((s) => s.game.players.find((p) => p.isUser) ?? null)
  const gameInProgress =
    isGameActive || week > 1 || (phase !== 'season_start' && phase !== 'week_start')
  const returnTo = (location.state as { from?: string } | null)?.from === '/' ? '/' : '/game'
  const goBack = () => navigate(returnTo, { replace: true })

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (profile?.photoId) {
        const url = await imageIdToDataUrl(profile.photoId)
        if (!cancelled) setPhotoUrl(url ?? null)
      } else if (!cancelled) {
        setPhotoUrl(null)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [profile?.photoId])

  if (isGuest) {
    return (
      <div className="placeholder-screen profile-screen">
        <div className="profile-screen__guest-banner">
          <p style={{ margin: '0 0 6px' }}>
            You are playing as <strong>Guest</strong>
          </p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            Stats, season archives, and Eyeoleans are not saved in guest mode.
          </p>
          <p style={{ margin: '8px 0 0' }}>
            <button
              type="button"
              className={`profile-screen__guest-link${guestSaveInviteActive ? ' profile-screen__guest-link--save-spotlight' : ''}`}
              onClick={() =>
                navigate('/profile-picker', { state: { from: returnTo, openCreate: true } })
              }
            >
              Create Profile
            </button>
          </p>
        </div>
        <button
          type="button"
          className="profile-screen__switch-btn game-button game-button--secondary"
          onClick={() => navigate('/profile-picker', { state: { from: returnTo } })}
        >
          Select Profile
        </button>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="placeholder-screen profile-screen">
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', marginBottom: 20 }}>
          No profile selected.
        </p>
        <button
          type="button"
          className="profile-screen__switch-btn game-button game-button--secondary"
          onClick={() => navigate('/profile-picker', { state: { from: returnTo } })}
          style={{ marginBottom: 12 }}
        >
          Select or Create a Profile
        </button>
      </div>
    )
  }

  const bio = profile.bio
  const profileFacts = [
    { label: 'Age', value: bio?.age == null ? '' : String(bio.age) },
    { label: 'Hometown', value: bio?.location ?? '' },
    { label: 'Profession', value: bio?.profession ?? '' },
    { label: 'Zodiac', value: bio?.zodiac ?? '' },
  ].filter((fact) => Boolean(fact.value))
  const hasAboutContent = Boolean(
    bio?.story || profileFacts.length > 0 || bio?.funFact || bio?.motto
  )
  const heroName = gameInProgress && userPlayer ? userPlayer.name : profile.name
  const currentSelection = userPlayer?.appearance ?? appearanceFromAssetUrl(userPlayer?.avatar)
  const heroSelection =
    gameInProgress && userPlayer ? currentSelection : profile.appearanceSelection
  const heroAsset = getAppearanceAsset(heroSelection, 'casual')
  const heroFigure = heroAsset ? joinPublicAssetPath(heroAsset) : null
  const heroLook =
    heroSelection?.kind === 'catalog'
      ? getAppearanceLook(heroSelection.lookId, heroSelection.revision)
      : null
  const heroCharacterStyle = {
    '--profile-foot-x': `${heroLook?.footCenterXPercent ?? 0}%`,
    '--profile-foot-y': `${heroLook?.footBottomPercent ?? 0}%`,
    '--profile-visible-ratio':
      1 - ((heroLook?.headTopPercent ?? 0) + (heroLook?.footBottomPercent ?? 0)) / 100,
  } as CSSProperties
  const hasNextSeasonChange =
    gameInProgress &&
    userPlayer &&
    JSON.stringify(currentSelection ?? { kind: 'legacy' }) !==
      JSON.stringify(profile.appearanceSelection ?? { kind: 'legacy' })

  return (
    <div className="placeholder-screen profile-screen profile-screen--overview">
      <div className="profile-screen__scene">
        <div className="profile-screen__title-row">
          <h1 className="profile-screen__page-title">My profile</h1>
          <GameBackButton className="profile-screen__back-btn" onClick={goBack} />
        </div>
        <div
          className="profile-screen__hero"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(18, 13, 25, 0.2) 0%, rgba(18, 13, 25, 0.1) 50%, rgba(18, 13, 25, 0.02) 82%), linear-gradient(0deg, rgba(13, 10, 18, 0.32), transparent 24%), url("${joinPublicAssetPath('assets/dressing-room/profile-scene.webp')}")`,
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
          }}
        >
          <div className="profile-screen__hero-copy">
            <p className="profile-screen__name">{heroName}</p>
            <p className="profile-screen__hero-meta">Your story. Your style.</p>
            {hasAboutContent && (
              <section className="profile-screen__hero-about" aria-label="About you">
                <p className="profile-screen__hero-about-title">About you</p>
                {bio?.story && <p className="profile-screen__hero-story">{bio.story}</p>}
                {profileFacts.length > 0 && (
                  <div className="profile-screen__hero-facts">
                    {profileFacts.map((fact) => (
                      <div className="profile-screen__hero-fact" key={fact.label}>
                        <span>{fact.label}</span>
                        <strong>{fact.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {(bio?.funFact || bio?.motto) && (
                  <div className="profile-screen__hero-notes">
                    {bio?.funFact && (
                      <p>
                        <span>Fun fact</span>
                        <strong>{bio.funFact}</strong>
                      </p>
                    )}
                    {bio?.motto && (
                      <p>
                        <span>Motto</span>
                        <strong>“{bio.motto}”</strong>
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
          {heroFigure ? (
            <div className="profile-screen__character" style={heroCharacterStyle}>
              <img
                className="profile-screen__character-figure"
                src={heroFigure}
                alt={`${heroName}'s selected look`}
              />
              <img
                className="profile-screen__character-platform"
                src={joinPublicAssetPath('assets/dressing-room/profile-podium.png')}
                alt=""
                aria-hidden="true"
              />
            </div>
          ) : photoUrl ? (
            <img className="profile-screen__hero-photo" src={photoUrl} alt={profile.name} />
          ) : (
            <span className="profile-screen__hero-avatar" aria-label={profile.name}>
              {profile.avatar}
            </span>
          )}
        </div>

        {hasNextSeasonChange && (
          <p className="profile-screen__next-look">
            Your new look is selected for the next season.
          </p>
        )}

        <div className="profile-screen__quick-actions" aria-label="Profile actions">
          <button
            type="button"
            className="profile-screen__quick-action"
            onClick={() => navigate('/profile/dressing-room', { state: { from: returnTo } })}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 8.4a2.5 2.5 0 1 0-2.5-2.5M12 8.4v2.1l-9.5 6.9c-1 .7-.5 2.2.7 2.2h17.6c1.2 0 1.7-1.5.7-2.2L12 10.5" />
            </svg>
            <span>Changing room</span>
          </button>
          <button
            type="button"
            className="profile-screen__quick-action"
            onClick={() => navigate('/profile-picker', { state: { from: '/profile' } })}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.5 19c.6-2.6 2.4-4 5.5-4 2.9 0 4.8 1.4 5.4 4M16.1 5.6a3.2 3.2 0 0 1 0 6.2M16.5 15c2.1.4 3.4 1.7 4 4" />
            </svg>
            <span>Manage profiles</span>
          </button>
        </div>
      </div>
    </div>
  )
}
