import { TOTAL_PAIRS } from '../../features/houseOfCards/houseOfCardsSlice';
import { mulberry32 } from '../../store/rng';

export interface HouseOfCardsBoardCard {
  index: number;
  symbol: string;
  portraitPlayerId?: string;
  portraitName?: string;
  portraitAvatar?: string;
  portraitBadge?: string;
  isFlipped: boolean;
  isMatched: boolean;
  isMismatch: boolean;
}

/** Base symbol pool used to build the Deck of Cards board. */
export const HOUSE_OF_CARDS_SYMBOLS = ['🌙', '⚡', '🎭', '🔮', '🃏', '♠️', '♥️', '♦️', '🌟', '💎', '👑', '🔥'];

export interface HouseOfCardsPortraitPlayer {
  id: string;
  name: string;
  avatar?: string;
}

export type HouseOfCardsRoundToolId = 'peek' | 'shield' | 'bonus-bet';

export function resolveHouseOfCardsRoundScore(params: {
  pairCount: number;
  matchedPairs?: number;
  mistakes: number;
  scoringMistakes?: number;
  timeMs: number;
  bestStreak: number;
  toolBonus?: number;
  brightPairBonus?: number;
}): number {
  const { pairCount, mistakes, timeMs, bestStreak } = params;
  const matchedPairs = Math.min(pairCount, Math.max(0, params.matchedPairs ?? pairCount));
  const scoringMistakes = params.scoringMistakes ?? mistakes;
  return Math.max(1, matchedPairs * 1_000 - scoringMistakes * 90 - Math.floor(timeMs / 1_000)
    + bestStreak * 15 + (params.toolBonus ?? 0) + (params.brightPairBonus ?? 0));
}

export function chooseHouseOfCardsBrightPairSymbol(
  sessionSeed: number,
  round: number,
  board: HouseOfCardsBoardCard[],
): string {
  const symbols = [...new Set(board.map((card) => card.symbol))]
  const rng = mulberry32((sessionSeed ^ Math.imul(round, 0x27d4eb2d) ^ 0x6270a91) >>> 0)
  return symbols[Math.floor(rng() * symbols.length)] ?? ''
}

/** Draw a board with exactly two copies of every portrait identity. If the
 * roster is smaller than the requested pair count, labelled variants keep the
 * board size and make every match identity unambiguous. */
export function buildPortraitPairBoard(
  seed: number,
  pairCount: number,
  players: HouseOfCardsPortraitPlayer[],
  priorityIds: string[] = [],
): HouseOfCardsBoardCard[] {
  const roster = [...new Map(players.filter((player) => player.id).map((player) => [player.id, player])).values()];
  if (roster.length === 0 || pairCount < 1) return buildHouseOfCardsBoard(seed, Math.max(1, pairCount));
  const byId = new Map(roster.map((player) => [player.id, player]));
  const ordered = [
    ...priorityIds.map((id) => byId.get(id)).filter((player): player is HouseOfCardsPortraitPlayer => !!player),
    ...roster.filter((player) => !priorityIds.includes(player.id)),
  ];
  const unique = [...new Map(ordered.map((player) => [player.id, player])).values()];
  const identities = Array.from({ length: pairCount }, (_unused, index) => {
    const player = unique[index % unique.length]!;
    const variant = Math.floor(index / unique.length);
    const badge = variant > 0 ? `Variant ${String.fromCharCode(65 + variant)}` : undefined;
    return {
      id: `${player.id}${variant > 0 ? `:variant-${variant}` : ''}`,
      player,
      badge,
    };
  });
  const rng = mulberry32((seed ^ 0xdeadbeef) >>> 0);
  const cards = [...identities, ...identities].map((identity) => identity);
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex]!, cards[index]!];
  }
  return cards.map(({ id, player, badge }, index) => ({
    index,
    symbol: id,
    portraitPlayerId: player.id,
    portraitName: player.name,
    portraitAvatar: player.avatar,
    portraitBadge: badge,
    isFlipped: false,
    isMatched: false,
    isMismatch: false,
  }));
}

/** Duration of streak-triggered Peek reveal (ms). */
export const PEEK_DURATION_MS = 1000;

/** Peek is auto-triggered after this many consecutive correct pairs. */
export const PEEK_STREAK_TRIGGER = 2;

export function chooseHouseOfCardsFinalWinner(
  finalists: [string, string],
  finalPoints: Record<string, number>,
  preliminaryScores: Record<string, number>,
): string {
  const [first, second] = finalists;
  const firstPoints = finalPoints[first] ?? 0;
  const secondPoints = finalPoints[second] ?? 0;
  if (firstPoints !== secondPoints) return firstPoints > secondPoints ? first : second;
  return (preliminaryScores[first] ?? 0) >= (preliminaryScores[second] ?? 0) ? first : second;
}

export function chooseHouseOfCardsAiPair(params: {
  board: HouseOfCardsBoardCard[];
  rememberedIndexes: ReadonlySet<number>;
  seed: number;
  skill: number;
}): [number, number] | null {
  const { board, rememberedIndexes, seed, skill } = params;
  const available = board.filter((card) => !card.isMatched);
  if (available.length < 2) return null;

  const rng = mulberry32(seed >>> 0);
  const normalizedSkill = Math.min(1, Math.max(0, skill / 100));

  // Final-round AI should resemble a capable human, not a perfect lookup table.
  // A revealed card can be stored in memory but temporarily inaccessible, and
  // even an accessible matching pair is not recalled with certainty.
  const memoryAccessChance = 0.40 + normalizedSkill * 0.22;
  const recallChance = 0.20 + normalizedSkill * 0.25;
  const accessibleRememberedIndexes = new Set(
    [...rememberedIndexes].filter(() => rng() < memoryAccessChance),
  );
  const rememberedAvailable = available.filter((card) => accessibleRememberedIndexes.has(card.index));
  const rememberedPairs = rememberedAvailable.flatMap((first, firstIndex) =>
    rememberedAvailable
      .slice(firstIndex + 1)
      .filter((second) => second.symbol === first.symbol)
      .map((second) => [first, second] as const),
  );

  if (rememberedPairs.length > 0 && rng() < recallChance) {
    const pair = rememberedPairs[Math.floor(rng() * rememberedPairs.length)];
    return pair ? [pair[0].index, pair[1].index] : null;
  }

  // Prefer a card the AI has not reliably recalled this turn. Its symbol
  // becomes known only after it is flipped, so the second choice still relies
  // on fallible memory or ordinary chance.
  const unseen = available.filter((card) => !accessibleRememberedIndexes.has(card.index));
  const firstPool = unseen.length > 0 ? unseen : available;
  const first = firstPool[Math.floor(rng() * firstPool.length)];
  if (!first) return null;

  const rememberedMatch = available.find((card) =>
    card.index !== first.index
    && accessibleRememberedIndexes.has(card.index)
    && card.symbol === first.symbol,
  );
  if (rememberedMatch && rng() < recallChance) {
    return [first.index, rememberedMatch.index];
  }

  const secondPool = available.filter((card) => card.index !== first.index);
  const second = secondPool[Math.floor(rng() * secondPool.length)];
  return second ? [first.index, second.index] : null;
}

export function buildHouseOfCardsBoard(seed: number, pairCount: number = TOTAL_PAIRS): HouseOfCardsBoardCard[] {
  if (HOUSE_OF_CARDS_SYMBOLS.length < pairCount) {
    throw new Error(
      `HouseOfCardsComp: HOUSE_OF_CARDS_SYMBOLS has ${HOUSE_OF_CARDS_SYMBOLS.length} symbols, but ${pairCount} pairs were requested.`,
    );
  }

  const rng = mulberry32(seed ^ 0xdeadbeef);
  const baseSymbols = HOUSE_OF_CARDS_SYMBOLS.slice(0, pairCount);
  const symbols = [...baseSymbols, ...baseSymbols];

  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
  }

  return symbols.map((symbol, index) => ({
    index,
    symbol,
    isFlipped: false,
    isMatched: false,
    isMismatch: false,
  }));
}

/** Use one portrait pair per contestant, keeping the finale legible in small fields. */
export function buildHouseOfCardsPortraitBoard(
  seed: number,
  players: HouseOfCardsPortraitPlayer[],
): HouseOfCardsBoardCard[] {
  return buildPortraitPairBoard(seed, Math.min(HOUSE_OF_CARDS_SYMBOLS.length, players.length), players);
}
