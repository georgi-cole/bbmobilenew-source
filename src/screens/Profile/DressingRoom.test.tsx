import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'react'
import profilesReducer, { createProfile, type ProfilesState } from '../../store/profilesSlice'
import DressingRoom from './DressingRoom'

const mockNavigate = vi.fn()
const mockDispatch = vi.fn()
let mockReducedMotion = false
let mockProfiles: ProfilesState

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: { from: '/' } }),
}))
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ profiles: mockProfiles }),
}))
vi.mock('../../appearance/AppearanceCarousel', () => ({
  default: ({
    onConfirm,
    figureRef,
  }: {
    onConfirm: () => void
    figureRef?: Ref<HTMLImageElement>
  }) => (
    <>
      <img ref={figureRef} alt="Selected figure" />
      <button type="button" onClick={onConfirm}>
        Use this look
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
})
