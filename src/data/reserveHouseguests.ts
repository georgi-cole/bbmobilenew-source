import type { Houseguest } from '../types/houseguest'

/**
 * Contestants who can enter through the standard reserve-entrant path.
 * They stay outside the ordinary season-start cast pool. Lia, Ali, and Bella
 * keep their separate story-driven casting rules.
 */
export const RESERVE_WILDCARD_IDS = ['pax', 'noa', 'rey'] as const
export type ReserveWildcardId = (typeof RESERVE_WILDCARD_IDS)[number]

const DEFAULT_COMPETITION_PROFILE = {
  overall: 50,
  physical: 50,
  mental: 50,
  precision: 50,
  nerve: 50,
  consistency: 50,
  clutch: 50,
  chokeRisk: 50,
  luck: 50,
}

/** Full canonical gameplay profiles for the first eligible reserve entrants. */
export const RESERVE_HOUSEGUESTS: Houseguest[] = [
  {
    id: 'pax',
    name: 'Pax',
    fullName: 'Pax Rivera',
    avatar: 'assets/skins/Pax_avatar.webp',
    age: 29,
    sex: 'Non-binary',
    location: 'Austin, USA',
    sexuality: 'Queer',
    education: 'Bachelor of Social Work',
    profession: 'Community Mediator',
    familyStatus: 'Single',
    kids: 'None',
    pets: 'Dog named Miso',
    zodiacSign: 'Libra',
    religion: 'Agnostic',
    motto: 'Listen long enough to find the real question.',
    funFact:
      'Can remember the exact wording of an argument long after everyone else has cooled down.',
    allies: [],
    enemies: [],
    competitionProfile: { ...DEFAULT_COMPETITION_PROFILE },
    story:
      'Pax Rivera helps people hear each other when a room gets loud. In Austin, they work as a community mediator, listening for the real question beneath an argument and remembering exactly how a conversation unfolded. That patience has made Pax a trusted guide for other people, but it has also helped them avoid one painful conversation with their father for six years. The Big Eye will put Pax in the middle of shifting alliances, old scores, and people who may not want to listen. They hope to build a free mediation center for young people and families who cannot afford professional support, while learning when it is time to speak for themselves.',
  },
  {
    id: 'noa',
    name: 'Noa',
    fullName: 'Noa Ben-Ari',
    avatar: 'assets/skins/Noa_avatar.webp',
    age: 31,
    sex: 'Female',
    location: 'Haifa, Israel',
    sexuality: 'Straight',
    education: 'Bachelor of Environmental Science',
    profession: 'Rooftop Farmer',
    familyStatus: 'Partnered',
    kids: 'None',
    pets: 'Two rescue cats',
    zodiacSign: 'Cancer',
    religion: 'Jewish',
    motto: 'Give overlooked things room to grow.',
    funFact: 'Can tell whether a tomato needs water by its leaves before touching the soil.',
    allies: [],
    enemies: [],
    competitionProfile: { ...DEFAULT_COMPETITION_PROFILE },
    story:
      'Noa Ben-Ari turns forgotten rooftops in Haifa into gardens. She knows that overlooked places can grow into something extraordinary, and she can tell whether a tomato needs water just by reading its leaves. Noa is generous with her patience, though she quietly names difficult plants after people who once underestimated her. In the Hub, she will have to decide when to nurture a bond and when to let it go. If she wins, Noa wants to build food gardens above public schools and train local families to run them as neighborhood cooperatives.',
  },
  {
    id: 'rey',
    name: 'Rey',
    fullName: 'Rey Santos',
    avatar: 'assets/skins/Rey_avatar.webp',
    age: 36,
    sex: 'Male',
    location: 'Manila, Philippines',
    sexuality: 'Straight',
    education: 'Master of Food Studies',
    profession: 'Culinary Historian',
    familyStatus: 'Single',
    kids: 'None',
    pets: 'None',
    zodiacSign: 'Pisces',
    religion: 'Catholic',
    motto: 'A recipe is a memory you can share.',
    funFact: 'Can recreate a dish from a single bite and a few questions about its history.',
    allies: [],
    enemies: [],
    competitionProfile: { ...DEFAULT_COMPETITION_PROFILE },
    story:
      'Rey Santos preserves family recipes and the memories carried inside them. A culinary historian in Manila, he can often recreate a dish from a single bite and a few questions about its past. Rey enters every competition with a handwritten recipe from his grandmother in his wallet, a reminder of the people and traditions that shaped him. Now he is ready to write a story that belongs entirely to him. If he wins the season, he will create a public archive and teaching kitchen where elders can preserve recipes before they disappear.',
  },
]

export function isReserveWildcardId(value: string): value is ReserveWildcardId {
  return (RESERVE_WILDCARD_IDS as readonly string[]).includes(value)
}
