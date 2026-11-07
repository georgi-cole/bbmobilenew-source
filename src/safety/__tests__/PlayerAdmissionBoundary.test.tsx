import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerAdmissionBoundary from '../PlayerAdmissionBoundary'
import PlayerSafetyScreen from '../PlayerSafetyScreen'
import { canUseOptionalFeature, declarePlayerAge } from '../playerSafety'
import { installSafetyFixture } from './safetyFixture'

vi.mock('../LocalProfileRemoval', () => ({ default: () => null }))
const mounted = vi.fn()
function SensitiveRoute() {
  useEffect(() => {
    mounted()
  }, [])
  return <p>Protected game route</p>
}
function enterAge(age: string) {
  fireEvent.change(screen.getByLabelText('Your age'), { target: { value: age } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('admission before route and controller mounting', () => {
  beforeEach(() => {
    installSafetyFixture()
    vi.stubEnv('VITE_GAME_MINIMUM_AGE', '13')
    mounted.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  it('offers no parental-permission override below the release minimum age', () => {
    vi.stubEnv('VITE_GAME_MINIMUM_AGE', '18')
    render(
      <PlayerAdmissionBoundary>
        <SensitiveRoute />
      </PlayerAdmissionBoundary>
    )
    enterAge('17')
    expect(
      screen.getByRole('heading', { name: 'This version is for ages 18+' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(mounted).not.toHaveBeenCalled()
  })

  it('never mounts a deep-linked route for an under-13 player and offers no checkbox bypass', async () => {
    render(
      <PlayerAdmissionBoundary>
        <SensitiveRoute />
      </PlayerAdmissionBoundary>
    )
    expect(mounted).not.toHaveBeenCalled()
    enterAge('11')
    expect(screen.getByRole('heading', { name: 'For parents and guardians' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fireEvent.click(screen.getByRole('button', { name: /Check parent verification/ }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Play remains locked/)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mounted).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('keeps teen play locked on refusal and allows only local play after household permission', () => {
    render(
      <PlayerAdmissionBoundary>
        <SensitiveRoute />
      </PlayerAdmissionBoundary>
    )
    enterAge('15')
    expect(screen.getByRole('button', { name: 'Allow local play' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Do not allow' }))
    expect(mounted).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Allow local play' }))
    expect(mounted).toHaveBeenCalledOnce()
    expect(canUseOptionalFeature('onlineServices')).toBe(false)
  })

  it('allows adults with optional features off and unmounts the route when a younger age is supplied', () => {
    render(
      <PlayerAdmissionBoundary>
        <SensitiveRoute />
      </PlayerAdmissionBoundary>
    )
    enterAge('28')
    expect(mounted).toHaveBeenCalledOnce()
    expect(canUseOptionalFeature('location')).toBe(false)
    act(() => {
      declarePlayerAge(12)
    })
    expect(screen.queryByText('Protected game route')).toBeNull()
    expect(screen.getByRole('heading', { name: 'For parents and guardians' })).toBeInTheDocument()
  })

  it('offers adults independent, reversible optional choices', () => {
    installSafetyFixture(28)
    render(<PlayerSafetyScreen settings />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Weather from my location/ }))
    expect(canUseOptionalFeature('location')).toBe(true)
    expect(canUseOptionalFeature('analytics')).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: /Weather from my location/ }))
    expect(canUseOptionalFeature('location')).toBe(false)
  })
})
