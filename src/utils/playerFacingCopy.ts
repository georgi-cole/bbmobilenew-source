function preserveCase(match: string, replacement: string): string {
  if (match === match.toUpperCase()) return replacement.toUpperCase()
  if (match[0] === match[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/** Normalize legacy format vocabulary at display time without changing save data. */
export function normalizePlayerFacingCopy(text: string): string {
  return text
    .replace(/\b(?:the\s+)?Big Brother(?:'s)? house\b/gi, (match) => preserveCase(match, 'the Hub'))
    .replace(/\b(?:the\s+)?Big Eye(?:'s)? house\b/gi, (match) => preserveCase(match, 'the Hub'))
    .replace(/\bThe Big Brother\b/gi, (match) => preserveCase(match, 'The Big Eye'))
    .replace(/\bBig Brother\b/gi, (match) => preserveCase(match, 'Big Eye'))
    .replace(/\b(?:housemates?|houseguests?)\b/gi, (match) =>
      preserveCase(match, match.toLowerCase().endsWith('s') ? 'hubmates' : 'hubmate')
    )
    .replace(/\b(?:the\s+)?whole house\b/gi, (match) => preserveCase(match, 'everyone in the Hub'))
    .replace(/\b(?:the|this) house\b/gi, (match) => preserveCase(match, 'the Hub'))
    .replace(/\bhouse-(wide)\b/gi, (match) => preserveCase(match, 'Hub-wide'))
    .replace(
      /\bhouse (feed|vote|meeting|gossip|intel|dynamics|story|stories|life|read|talk|noise|material|footage|bond|bonds|map|order|signal)\b/gi,
      (match, context: string) => preserveCase(match, `Hub ${context}`)
    )
    .replace(/\bself[- ]evicted\b/gi, (match) => preserveCase(match, 'left the Hub'))
    .replace(/\bself[- ]evicting\b/gi, (match) => preserveCase(match, 'leaving the Hub'))
    .replace(/\bself[- ]evict\b/gi, (match) => preserveCase(match, 'leave the Hub'))
    .replace(/\bself[- ]eviction(s)?\b/gi, (match, plural: string | undefined) =>
      preserveCase(match, plural ? 'voluntary exits' : 'voluntary exit')
    )
    .replace(/\bbackdoor\s+(target|nominee|plan)\b/gi, (match, noun: string) => {
      const replacement =
        noun.toLowerCase() === 'plan' ? 'replacement strategy' : `replacement ${noun}`
      return preserveCase(match, replacement)
    })
    .replace(/\bbackdoor\b/gi, 'replacement strategy')
    .replace(/\bevicted\b/gi, (match) => preserveCase(match, 'eliminated'))
    .replace(/\beviction(s)?\b/gi, (match, plural: string | undefined) =>
      preserveCase(match, plural ? 'eliminations' : 'elimination')
    )
    .replace(/\bevicting\b/gi, (match) => preserveCase(match, 'eliminating'))
    .replace(/\bevicts\b/gi, (match) => preserveCase(match, 'eliminates'))
    .replace(/\bevict\b/gi, (match) => preserveCase(match, 'eliminate'))
    .replace(/\bPower of Veto\b/gi, (match) => preserveCase(match, 'Power of Safety'))
    .replace(/\bVeto\b/gi, (match) => preserveCase(match, 'safety'))
    .replace(/\bjurors\b/gi, (match) => preserveCase(match, 'Tribunal members'))
    .replace(/\bjuror\b/gi, (match) => preserveCase(match, 'Tribunal member'))
    .replace(/\bjury\b(?!\s+of public opinion)/gi, (match) => preserveCase(match, 'Tribunal'))
}
