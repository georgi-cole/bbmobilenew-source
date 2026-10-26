import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import AppearanceCarousel from '../../appearance/AppearanceCarousel'
import { warmSelectedAppearance } from '../../appearance/preloadAppearance'
import { SELECTABLE_LOOKS } from '../../appearance/catalog'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { selectCurrentProfile, updateProfile } from '../../store/profilesSlice'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import './DressingRoom.css'

export default function DressingRoom() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const profile = useAppSelector(selectCurrentProfile)
  const profileIdAtOpen = useRef(profile?.id)
  const [selectedId, setSelectedId] = useState(
    profile?.appearanceSelection?.kind === 'catalog'
      ? profile.appearanceSelection.lookId
      : (SELECTABLE_LOOKS[0]?.id ?? '')
  )
  const returnTo = (location.state as { from?: string } | null)?.from === '/' ? '/' : '/game'

  useEffect(() => {
    if (!profile || profile.id !== profileIdAtOpen.current) {
      navigate('/profile-picker', { replace: true, state: { from: returnTo } })
    }
  }, [navigate, profile, returnTo])

  if (!profile) return null

  function confirmSelection() {
    if (!profile || profile.id !== profileIdAtOpen.current) return
    const look = SELECTABLE_LOOKS.find((candidate) => candidate.id === selectedId)
    if (!look) return
    const selection = { kind: 'catalog' as const, lookId: look.id, revision: look.revision }
    dispatch(updateProfile({ appearanceSelection: selection }))
    void warmSelectedAppearance(selection)
    navigate('/profile', { replace: true, state: { from: returnTo } })
  }

  return (
    <main className="dressing-room placeholder-screen">
      <div className="dressing-room__topbar">
        <GameBackButton
          onClick={() => navigate('/profile', { state: { from: returnTo } })}
          label="Back to profile"
        />
        <span>Changing room</span>
      </div>
      <h1>Choose your look</h1>
      <p className="dressing-room__subtitle">Your name. Your story. Your style.</p>
      <AppearanceCarousel
        selectedId={selectedId}
        onSelect={setSelectedId}
        onConfirm={confirmSelection}
        confirmLabel="Use this look"
      />
      <p className="dressing-room__season-note">Changes will take effect on new season start</p>
    </main>
  )
}
