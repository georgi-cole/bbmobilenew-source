export type PulseChronicleFormat = 'classic' | 'voxPopuli' | 'cupidArrow'
export type PulseChronicleMood = 'day1' | 'day2' | 'recovery'

export interface PulseChronicleTheme {
  format: PulseChronicleFormat
  depressionShock?: PulseChronicleMood
}

const THEME_OPENINGS: Record<Exclude<PulseChronicleFormat, 'classic'>, readonly string[]> = {
  voxPopuli: [
    'In Vox Populi, the ballots stay secret while the audience waits to have its say.',
    'The Hub keeps its nominations quiet; the audience will get the final word at the vote.',
    'Names may be chosen behind closed doors, but the audience is watching the whole game.',
  ],
  cupidArrow: [
    "Cupid's Arrow changed the stakes: one player's danger can reach their partner too.",
    'Under Cupid’s Arrow, a private bond can turn a public decision into a shared risk.',
    'Two paths are tied by Cupid’s Arrow; every safe day gives them room to choose each other.',
  ],
}

const SHOCK_OPENINGS: Record<PulseChronicleMood, readonly string[]> = {
  day1: [
    'The Hub sounds quieter today; conversations start softly and leave long pauses behind.',
    'Rain dulls the usual Hub noise. Even easy conversations take a little more effort.',
    'The day begins under grey skies, with the Hub moving at a gentler pace.',
  ],
  day2: [
    'The storm lingers, and familiar routines seem to take more effort today.',
    'Grey light settles over the Hub. Small comforts matter more than big speeches.',
    'A heavier quiet has settled in; the Hub is finding its way through the second stormy day.',
  ],
  recovery: [
    'The rain eases, and small signs of warmth return around the Hub.',
    'The clouds begin to break. The Hub finds a little more room to breathe.',
    'Colour returns by degrees; a kind word or shared laugh travels further today.',
  ],
}

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return (hash >>> 0) % length
}

export function getPulseChronicleOpening(theme: PulseChronicleTheme, seed: string): string | null {
  const options = theme.depressionShock
    ? SHOCK_OPENINGS[theme.depressionShock]
    : theme.format === 'classic'
      ? null
      : THEME_OPENINGS[theme.format]
  return options ? (options[stableIndex(seed, options.length)] ?? null) : null
}

/**
 * Normalize only the archived Pulse prose vocabulary. Leave proper names,
 * alliance names and terminology in other game surfaces untouched.
 */
export function normalizePulseStoryTerminology(text: string): string {
  return text.replace(/\bhousemates?\b|\bhouseguests?\b/gi, (term) => {
    const replacement = `hubmate${term.toLowerCase().endsWith('s') ? 's' : ''}`
    if (term === term.toUpperCase()) return replacement.toUpperCase()
    if (term[0] === term[0]?.toUpperCase()) {
      return replacement[0]!.toUpperCase() + replacement.slice(1)
    }
    return replacement
  })
}
