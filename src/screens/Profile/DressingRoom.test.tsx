import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'react'
import profilesReducer, {
  createProfile,
  debugGrantEyeoleans,
  type ProfilesState,
} from '../../store/profilesSlice'
import DressingRoom from './DressingRoom'

const mockNavigate = vi.fn()
const mockDispatch = vi.fn()
let mockReducedMotion = false
let mockVipActive = false
let mockProfiles: ProfilesState
let mockLocationState: Record<string, unknown> = { from: '/' }

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}))
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ profiles: mockProfiles, vip: { isActive: mockVipActive } }),
}))
vi.mock('../../appearance/AppearanceCarousel', () => ({
  default: ({
    onConfirm,
    onSelect,
    figureRef,
    confirmLabel,
    accessText,
  }: {
    onConfirm: () => void
    onSelect: (id: string) => void
    figureRef?: Ref<HTMLImageElement>
    confirmLabel?: string
    accessText?: string
  }) => (
    <>
      <img ref={figureRef} alt="Selected figure" />
      <button type="button" onClick={() => onSelect('pc-006')}>
        Preview look 6
      </button>
      <span>{accessText}</span>
      <button type="button" onClick={onConfirm}>
        {confirmLabel ?? 'Choose this look'}
      </button>
    </>
  ),
}))
vi.mock('../../appearance/preloadAppearance', () => ({
  warmAppearanceRole: vi.fn(async () => null),
  warmSelectedAppearance: vi.fn(async () => []),
}))
vi.mock('../../components/ui/GameBackButton/GameBackButton', () => ({
  default: ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}))
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    useReducedMotion: () => mockReducedMotion,
    animate: (
      value: { set: (next: number) => void },
      next: number,
      options: { duration: number; onComplete?: () => void }
    ) => {
      const timer = window.setTimeout(() => {
        value.set(next)
        options.onComplete?.()
      }, options.duration * 1000)
      return { stop: () => window.clearTimeout(timer) }
    },
  }
})

describe('Changing room look lock-in', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockNavigate.mockReset()
    mockDispatch.mockReset()
    mockReducedMotion = false
    mockVipActive = false
    mockLocationState = { from: '/' }
    mockProfiles = profilesReducer(
      undefined,
      createProfile({ name: 'Larisa', avatar: '👤', bio: { age: '25' } })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves the chosen look, reveals its portrait, then returns to the profile', async () => {
    render(<DressingRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Use this look' }))

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'profiles/updateProfile',
        payload: { appearanceSelection: { kind: 'catalog', lookId: 'pc-001', revision: 1 } },
      })
    )
    const dialog = screen.getByRole('dialog', { name: 'Larisa' })
    expect(dialog).toHaveTextContent('Your next chapter')
    const portrait = dialog.querySelector('img.look-lock__portrait')!
    expect(portrait.getAttribute('src')).toContain('character%201/main.webp')

    expect(mockNavigate).not.toHaveBeenCalled()
    fireEvent.load(portrait)
    fireEvent.load(dialog.querySelector('img.look-lock__frame')!)
    await act(async () => {
      vi.advanceTimersByTime(2800)
    })

    expect(dialog).toHaveTextContent('Saved for your next season.')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/', fromLookReveal: true },
    })
  })

  it('returns a full device to account management instead of opening another creation draft', () => {
    while (mockProfiles.profiles.length < 3)
      mockProfiles = profilesReducer(mockProfiles, createProfile({ name: 'Existing', avatar: 'E' }))
    mockLocationState = { createProfile: true, fromPlayerAccount: true }
    render(<DressingRoom />)
    expect(mockNavigate).toHaveBeenCalledWith('/profile-picker', {
      replace: true,
      state: { from: '/profile/account', manageOnly: true },
    })
    expect(screen.queryByRole('button', { name: 'Choose this look' })).toBeNull()
  })

  it('allows the reveal to be skipped while its portrait is still loading', () => {
    render(<DressingRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Use this look' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip reveal' }))
    expect(screen.getByRole('status')).toHaveTextContent('Look locked in')
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/', fromLookReveal: true },
    })
  })

  it('anchors the camera to the painted figure rather than its letterboxed image element', () => {
    render(<DressingRoom />)
    const figure = screen.getByRole('img', { name: 'Selected figure' })
    Object.defineProperty(figure, 'naturalWidth', { value: 768 })
    Object.defineProperty(figure, 'naturalHeight', { value: 1152 })
    vi.spyOn(figure, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 100, 240, 400))
    fireEvent.click(screen.getByRole('button', { name: 'Use this look' }))
    const dialog = screen.getByRole('dialog', { name: 'Larisa' })
    expect(dialog.style.getPropertyValue('--look-source-x')).toBe('50px')
    expect(dialog.style.getPropertyValue('--look-source-y')).toBe('140px')
    expect(dialog.style.getPropertyValue('--look-source-width')).toBe('240px')
    expect(dialog.style.getPropertyValue('--look-source-height')).toBe('360px')
  })

  it('shows the saved confirmation immediately with reduced motion', () => {
    mockReducedMotion = true
    render(<DressingRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Use this look' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Skip reveal' })).not.toBeInTheDocument()
  })

  it('keeps the saved selection usable when the portrait fails to load', async () => {
    render(<DressingRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Use this look' }))
    const dialog = screen.getByRole('dialog', { name: 'Larisa' })
    fireEvent.error(dialog.querySelector('img.look-lock__portrait')!)
    fireEvent.load(dialog.querySelector('img.look-lock__frame')!)
    await act(async () => {
      vi.advanceTimersByTime(2800)
    })
    expect(dialog.querySelector('img.look-lock__portrait-fallback')).toHaveAttribute(
      'src',
      expect.stringContaining('casual.webp')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/', fromLookReveal: true },
    })
    expect(mockDispatch).toHaveBeenCalledTimes(1)
  })


  it('requires funds to unlock a paid look for standard profiles', () => {
    render(<DressingRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview look 6' }))
    expect(screen.getByText('VIP or 30,000 Eyeros')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unlock · 30,000 Eyeros' }))
    expect(screen.getByRole('status')).toHaveTextContent('30,000 more Eyeros')
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('confirms a permanent paid unlock before debiting the profile wallet once', () => {
    mockProfiles = profilesReducer(
      mockProfiles,
      debugGrantEyeoleans({ grantId: 'changing-room', amount: 55_000 })
    )
    mockDispatch.mockImplementation((action) => {
      mockProfiles = profilesReducer(mockProfiles, action)
      return action
    })
    const view = render(<DressingRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview look 6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unlock · 30,000 Eyeros' }))
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog', { name: 'Unlock selected look' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm · 30,000 Eyeros' }))
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'profiles/purchaseAppearanceLook',
        payload: { lookId: 'pc-006' },
      })
    )
    expect(mockProfiles.profiles[0].eyeoleans).toBe(25_000)
    view.rerender(<DressingRoom />)
    expect(screen.getByRole('button', { name: 'Use this look' })).toBeVisible()
    expect(screen.getByText('Permanently unlocked')).toBeVisible()
  })

  it('includes all premium looks in VIP without a wallet purchase', () => {
    mockVipActive = true
    render(<DressingRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview look 6' }))
    expect(screen.getByText('Included with VIP')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Use this look' }))
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'profiles/updateProfile' })
    )
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'profiles/purchaseAppearanceLook' })
    )
  })

  it('does not allow a paid look during free profile creation', () => {
    mockProfiles = profilesReducer(undefined, { type: 'test/reset' })
    mockLocationState = { from: '/', createProfile: true }
    render(<DressingRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview look 6' }))
    fireEvent.click(screen.getByRole('button', { name: 'VIP look' }))
    expect(screen.getByRole('status')).toHaveTextContent('five free looks')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('uses the Changing room as the first profile-creation step', () => {
    mockProfiles = profilesReducer(undefined, { type: 'test/reset' })
    mockLocationState = { from: '/', createProfile: true }
    render(<DressingRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose this look' }))
    expect(mockDispatch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Skip reveal' }))
    expect(screen.getByRole('status')).toHaveTextContent('Look chosen')
    expect(screen.getByRole('dialog', { name: 'Look 1' })).toHaveTextContent('Now make it yours.')

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(mockNavigate).toHaveBeenCalledWith('/profile-edit', {
      replace: true,
      state: {
        from: '/',
        createProfile: true,
        appearanceSelection: { kind: 'catalog', lookId: 'pc-001', revision: 1 },
        adoptGuestRun: false,
      },
    })
  })
})
