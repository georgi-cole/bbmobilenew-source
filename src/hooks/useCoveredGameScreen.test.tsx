import { renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useCoveredGameScreen } from './useCoveredGameScreen'

it('restores covered layers after the last portal unmounts and never hides inline card games', () => {
  const first = renderHook(() => useCoveredGameScreen())
  const second = renderHook(() => useCoveredGameScreen())
  expect(document.body.classList.contains('minigame-portal-active')).toBe(true)
  first.unmount()
  expect(document.body.classList.contains('minigame-portal-active')).toBe(true)
  second.unmount()
  expect(document.body.classList.contains('minigame-portal-active')).toBe(false)
  const cards = renderHook(() => useCoveredGameScreen(false))
  expect(document.body.classList.contains('minigame-portal-active')).toBe(false)
  expect(document.body.classList.contains('card-minigame-active')).toBe(true)
  cards.unmount()
  expect(document.body.classList.contains('card-minigame-active')).toBe(false)
})
