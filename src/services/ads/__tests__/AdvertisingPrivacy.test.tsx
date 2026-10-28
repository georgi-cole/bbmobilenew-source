import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdvertisingPrivacy from '../AdvertisingPrivacy'
import { canUseOptionalFeature } from '../../../safety/playerSafety'

const privacy = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('../admobBridge', () => ({
  hasAdMobPrivacyOptions: () => true,
  openAdMobPrivacyOptions: privacy.open,
}))
describe('advertising privacy controls', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    privacy.open.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it('requires an adult declaration and explicit opt-in, and keeps Google choices accessible after opt-out', () => {
    render(<AdvertisingPrivacy />)
    expect(canUseOptionalFeature('ads')).toBe(false)
    fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '28' } })
    fireEvent.click(screen.getByText('Continue'))
    const toggle = screen.getByRole('checkbox')
    expect(canUseOptionalFeature('ads')).toBe(false)
    fireEvent.click(toggle)
    expect(canUseOptionalFeature('ads')).toBe(true)
    fireEvent.click(toggle)
    expect(canUseOptionalFeature('ads')).toBe(false)
    fireEvent.click(screen.getByText('Advertising privacy choices'))
    expect(privacy.open).toHaveBeenCalledOnce()
  })

  it('does not enable advertising or Google requests for a minor', () => {
    render(<AdvertisingPrivacy />)
    fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Continue'))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('Advertising privacy choices')).toBeNull()
    expect(canUseOptionalFeature('ads')).toBe(false)
    expect(privacy.open).not.toHaveBeenCalled()
  })
})
