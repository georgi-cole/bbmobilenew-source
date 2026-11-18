/** Initial suspense delay before the first ballot is revealed. */
export const VOTE_REVEAL_INITIAL_DELAY_MS = 800
/** Hold the voter and their choice on stage before the next beat. */
export const VOTE_REVEAL_STAGGER_MS = 2450

export const BALLOT_BEAT_MS = { rules: 2400, lead: 850, recipient: 1000, flight: 610, counted: 440 }
export type BallotBeat = keyof typeof BALLOT_BEAT_MS
/** Let the viewer read the batch of remaining ballots before the champion slide. */
export const winnerHandoffDelayMs = (remainingBallots: number): number =>
  2500 + remainingBallots * 520
