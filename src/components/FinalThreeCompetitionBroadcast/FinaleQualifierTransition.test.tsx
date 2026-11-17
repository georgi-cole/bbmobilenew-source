import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import FinaleQualifierTransition from './FinaleQualifierTransition'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
} from '../../services/presentation/presentationOwnership'
afterEach(async () => {
  cleanup()
  await Promise.resolve()
  vi.useRealTimers()
})
it('finishes the rotating Eye ident exactly once before delivering the accepted result', async () => {
  vi.useFakeTimers()
  const done = vi.fn()
  render(
    <StrictMode>
      <FinaleQualifierTransition onComplete={done} />
    </StrictMode>
  )
  act(() => vi.advanceTimersByTime(1200))
  let release = () => {}
  act(() => {
    release = acquirePresentationOwnership(createPresentationOwnerToken(), 'test-foreground', 200)
  })
  act(() => vi.advanceTimersByTime(6000))
  expect(done).not.toHaveBeenCalled()
  await act(async () => {
    release()
    await Promise.resolve()
  })
  act(() => vi.advanceTimersByTime(1800))
  expect(done).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(5000))
  expect(done).toHaveBeenCalledTimes(1)
})
