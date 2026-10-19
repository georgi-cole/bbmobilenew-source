import type { Houseguest } from '../types/houseguest'

/** Static profile data for story-cast guests that are intentionally outside the default roster. */
type CompleteBellaProfile = Houseguest &
  Required<
    Pick<
      Houseguest,
      'sexuality' | 'education' | 'familyStatus' | 'kids' | 'pets' | 'zodiacSign' | 'religion'
    >
  > & { id: 'bella' }

export const BELLA_PROFILE: CompleteBellaProfile = {
  id: 'bella',
  name: 'Bella',
  fullName: 'Bella',
  avatar: 'assets/skins/Bella_avatar.webp',
  age: 68,
  sex: 'Female',
  location: 'Monte Carlo, Monaco',
  sexuality: 'Straight',
  education: 'Master of Finance',
  profession: 'Private Investor',
  familyStatus: 'Widowed',
  kids: 'Two adult children',
  pets: 'None',
  zodiacSign: 'Taurus',
  religion: 'Catholic',
  motto: 'Charm opens doors; loyalty keeps them open.',
  funFact: 'Remembers the names of every person who has ever served her at a favorite restaurant.',
  allies: [],
  enemies: [],
  story:
    'Bella has spent enough years in rooms where everyone wanted something to know the difference between charm and loyalty. A private investor from Monte Carlo, she keeps a careful list of the people who have earned her trust. If she wins, she will fund financial independence programs for women rebuilding their lives.',
}
