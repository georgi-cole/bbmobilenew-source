import type { MajorityRulesQuestionTemplate } from './majorityRulesQuestions'

export interface MajorityRulesVipRevealFact {
  text: string
  sourceLabel: string
  sourceUrl: string
}

const facts = {
  awkwardText: {
    text: 'In a 2022 YouGov poll, 35% rated accidentally sending gossip to the person being discussed a 10/10 for awkwardness. The group chat never forgets.',
    sourceLabel: 'YouGov · 2022',
    sourceUrl:
      'https://yougov.com/en-us/articles/44123-how-tolerant-are-americans-awkward-situations',
  },
  awkwardReplay: {
    text: 'Half of Americans said they sometimes replay an embarrassing moment. The brain’s least helpful autoplay feature.',
    sourceLabel: 'YouGov · 2022',
    sourceUrl:
      'https://yougov.com/en-us/articles/44123-how-tolerant-are-americans-awkward-situations',
  },
  phoneBathroom: {
    text: 'A 2022 YouGov poll found 56% of Americans had talked on the phone while using the bathroom. Bluetooth: a bold choice.',
    sourceLabel: 'YouGov · 2023 report',
    sourceUrl:
      'https://yougov.com/en-us/articles/45245-toilet-talk-polling-americans-potty-preferences',
  },
  phoneDrop: {
    text: 'The same YouGov poll found 18% had dropped a phone in the toilet. The group chat is probably still about it.',
    sourceLabel: 'YouGov · 2023 report',
    sourceUrl:
      'https://yougov.com/en-us/articles/45245-toilet-talk-polling-americans-potty-preferences',
  },
  bathroomPurchase: {
    text: 'YouGov found 44% had bought something from a business solely to use its bathroom. That purchase was really a cover charge.',
    sourceLabel: 'YouGov · 2023 report',
    sourceUrl:
      'https://yougov.com/en-us/articles/45245-toilet-talk-polling-americans-potty-preferences',
  },
  showerPee: {
    text: 'In that same poll, 70% of Americans said they had peed in the shower. The plumbing department declines to comment.',
    sourceLabel: 'YouGov · 2023 report',
    sourceUrl:
      'https://yougov.com/en-us/articles/45245-toilet-talk-polling-americans-potty-preferences',
  },
  petParty: {
    text: 'Only 10% of American dog owners and 8% of cat owners said they had thrown their pet a party. The other 90% still bought a hat.',
    sourceLabel: 'YouGov · 2025',
    sourceUrl:
      'https://yougov.com/en-us/articles/51499-most-dog-and-cat-owners-say-their-pets-know-them-well',
  },
  petTranslator: {
    text: '23% of dog owners and 21% of cat owners were interested in AI that translates pet sounds. “Feed me” remains untranslated.',
    sourceLabel: 'YouGov · 2025',
    sourceUrl:
      'https://yougov.com/en-us/articles/51499-most-dog-and-cat-owners-say-their-pets-know-them-well',
  },
  realityTv: {
    text: 'A 2016 YouGov poll found 65% of Americans were interested in appearing in at least one reality-TV genre. Suddenly everyone has a confessional.',
    sourceLabel: 'YouGov · 2016',
    sourceUrl: 'https://yougov.com/en-us/articles/16547-america-both-loves-and-hates-reality-tv',
  },
  realityTvFatigue: {
    text: 'The same poll found 71% thought there were too many reality shows, while just 1% thought there were too few. The 1% are casting directors.',
    sourceLabel: 'YouGov · 2016',
    sourceUrl: 'https://yougov.com/en-us/articles/16547-america-both-loves-and-hates-reality-tv',
  },
  zombiePlan: {
    text: '14% of Americans said they already had a zombie-apocalypse plan. Somewhere, a very prepared group chat just got quieter.',
    sourceLabel: 'YouGov · 2019',
    sourceUrl: 'https://yougov.com/en-us/articles/25548-zombie-apocalypse-plan',
  },
  zombieSecret: {
    text: 'Among Americans with a zombie plan, 12% refused to reveal it. Finally, a secret that is reasonable to keep.',
    sourceLabel: 'YouGov · 2019',
    sourceUrl: 'https://yougov.com/en-us/articles/25548-zombie-apocalypse-plan',
  },
  weddingProposal: {
    text: '72% of Americans said proposing to your own partner during someone else’s wedding was inappropriate. The couple has the microphone.',
    sourceLabel: 'YouGov · 2023',
    sourceUrl: 'https://yougov.com/en-us/articles/47928-surveying-americans-on-wedding-etiquette',
  },
  hotDog: {
    text: 'A 2025 YouGov poll found 40% of American adults classified a hot dog as a sandwich. The bun has retained legal counsel.',
    sourceLabel: 'YouGov · 2025',
    sourceUrl:
      'https://ygo-assets-websites-editorial-emea.yougov.net/documents/Food_Debates_poll_results.pdf',
  },
  chili: {
    text: 'In that same food poll, 18% of American adults called chili a soup. The remaining 82% are avoiding the comment section.',
    sourceLabel: 'YouGov · 2025',
    sourceUrl:
      'https://ygo-assets-websites-editorial-emea.yougov.net/documents/Food_Debates_poll_results.pdf',
  },
  pineapplePizza: {
    text: '22% of American adults said they love pineapple on pizza. A whole lot more have thoughts about it.',
    sourceLabel: 'YouGov · 2025',
    sourceUrl:
      'https://ygo-assets-websites-editorial-emea.yougov.net/documents/Food_Debates_poll_results.pdf',
  },
  datingApp: {
    text: 'Among Americans who had used dating apps, 49% said they used them to find an exclusive partner and 39% for something fun to do. Both can be true.',
    sourceLabel: 'YouGov · 2019',
    sourceUrl: 'https://yougov.com/en-us/articles/22429-dating-apps-websites-cheating-romance-sex',
  },
} as const satisfies Record<string, MajorityRulesVipRevealFact>

type FactId = keyof typeof facts

interface VipQuestion extends MajorityRulesQuestionTemplate {
  factId: FactId
  baseBiases?: [number, number, number]
}

const biasPatterns: Array<[number, number, number]> = [
  [0.62, 0.5, 0.38],
  [0.42, 0.64, 0.46],
  [0.48, 0.4, 0.66],
  [0.58, 0.44, 0.56],
  [0.4, 0.65, 0.5],
  [0.55, 0.46, 0.63],
]

const prompts: VipQuestion[] = [
  {
    id: 'vip001',
    prompt: 'The house group chat has gone silent. Which message breaks the peace?',
    options: ['“We need to talk.”', 'A screenshot with no caption', '“K.”'],
    factId: 'awkwardText',
  },
  {
    id: 'vip002',
    prompt: 'Someone says “I have receipts.” What is the room expecting?',
    options: ['A blurry screenshot', 'A voice note from 2021', 'A full presentation deck'],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip003',
    prompt: 'What is the most suspicious “quick question” to receive at midnight?',
    options: ['“Are you awake?”', '“Be honest with me.”', '“Can I call you?”'],
    factId: 'datingApp',
  },
  {
    id: 'vip004',
    prompt: 'A first date says “I’m very low-maintenance.” What comes next?',
    options: ['A 12-step itinerary', 'A story about their ex', 'A bill-splitting negotiation'],
    factId: 'datingApp',
  },
  {
    id: 'vip005',
    prompt: 'Which dating-app bio gets the fastest group-chat review?',
    options: ['“Fluent in sarcasm”', '“Ask me anything”', 'A fish photo with no explanation'],
    factId: 'datingApp',
  },
  {
    id: 'vip006',
    prompt: 'What is the most believable reason someone vanishes from a date?',
    options: [
      '“My friend needs me”',
      '“I have an early start”',
      'They genuinely went to the bathroom',
    ],
    factId: 'phoneBathroom',
  },
  {
    id: 'vip007',
    prompt: 'The last slice of pizza is left. What wins the negotiation?',
    options: ['“I’m saving it for someone”', 'A dramatic coin toss', 'Quietly cutting it in half'],
    factId: 'pineapplePizza',
  },
  {
    id: 'vip008',
    prompt: 'A housemate says “I can cook.” What is the first clue?',
    options: [
      'They own one good pan',
      'They ask where the oven is',
      'They start a 40-minute playlist',
    ],
    factId: 'hotDog',
  },
  {
    id: 'vip009',
    prompt: 'What starts the fiercest dinner-table debate?',
    options: [
      'Is a hot dog a sandwich?',
      'Does cereal count as soup?',
      'Pineapple belongs on pizza',
    ],
    factId: 'hotDog',
  },
  {
    id: 'vip010',
    prompt: 'The fridge contains an unlabelled container. What is it?',
    options: ['Yesterday’s ambitious meal prep', 'A science project', 'Someone else’s problem'],
    factId: 'chili',
  },
  {
    id: 'vip011',
    prompt: 'A pet gets its own verified account. What happens first?',
    options: ['Sponsored treats', 'A public apology', 'A suspiciously human breakup post'],
    factId: 'petParty',
  },
  {
    id: 'vip012',
    prompt: 'Which pet luxury would the group actually pay for?',
    options: ['A birthday party', 'A live-streaming camera', 'An AI translator for dramatic meows'],
    factId: 'petTranslator',
  },
  {
    id: 'vip013',
    prompt: 'The house adopts a group mascot. Which one gets the vote?',
    options: [
      'A tiny dog with huge confidence',
      'A cat that dislikes everyone',
      'A pigeon with a side hustle',
    ],
    factId: 'petParty',
  },
  {
    id: 'vip014',
    prompt: 'You find a phone in the bathroom. What is the first thought?',
    options: ['It is probably fine', 'That screen has seen things', 'The rice is in the pantry'],
    factId: 'phoneDrop',
  },
  {
    id: 'vip015',
    prompt: 'Which excuse for leaving a party sounds most convincing?',
    options: ['“I need some air”', '“My phone is at 2%”', '“I have to check on the shower”'],
    factId: 'showerPee',
  },
  {
    id: 'vip016',
    prompt: 'What is the most chaotic bathroom announcement at a party?',
    options: [
      '“Who took my phone?”',
      '“The lock is broken”',
      '“Does anyone have a spare charger?”',
    ],
    factId: 'phoneBathroom',
  },
  {
    id: 'vip017',
    prompt: 'A producer hands the house a confessional mic. Who uses it first?',
    options: [
      'The quiet observer',
      'The person with a prepared speech',
      'The one who says “I’m not here for drama”',
    ],
    factId: 'realityTv',
  },
  {
    id: 'vip018',
    prompt: 'What reality-show twist would make the house panic fastest?',
    options: [
      'The audience can hear the group chat',
      'Everyone’s ex arrives',
      'The cameras show the kitchen mess',
    ],
    factId: 'realityTvFatigue',
  },
  {
    id: 'vip019',
    prompt: 'What gets someone cast on a reality show?',
    options: [
      'A memorable catchphrase',
      'A chaotic dating history',
      'A very strong opinion about snacks',
    ],
    factId: 'realityTv',
  },
  {
    id: 'vip020',
    prompt: 'The zombie apocalypse begins during brunch. What does the group do?',
    options: [
      'Protect the snacks',
      'Make a plan in the group chat',
      'Wait to see if it is a prank',
    ],
    factId: 'zombiePlan',
  },
  {
    id: 'vip021',
    prompt: 'Who is most likely to have a secret apocalypse plan already?',
    options: [
      'The camping enthusiast',
      'The spreadsheet person',
      'The one who “doesn’t believe in drama”',
    ],
    factId: 'zombieSecret',
  },
  {
    id: 'vip022',
    prompt: 'A zombie asks for directions. What answer gets the most votes?',
    options: [
      'Point toward the neighbours',
      'Offer a snack and negotiate',
      'Run first, ask questions later',
    ],
    factId: 'zombiePlan',
  },
  {
    id: 'vip023',
    prompt: 'At a wedding, what earns the fastest collective side-eye?',
    options: ['An unscheduled speech', 'A surprise proposal', 'A guest wearing white'],
    factId: 'weddingProposal',
  },
  {
    id: 'vip024',
    prompt: 'What is the most likely reason a wedding guest hits the dance floor?',
    options: ['A song from school', 'A dare from the table', 'They saw someone else dancing badly'],
    factId: 'weddingProposal',
  },
  {
    id: 'vip025',
    prompt: 'The house has to give one brutally honest toast. What gets mentioned?',
    options: ['The unread messages', 'The mysterious fridge food', 'The “five-minute” lateness'],
    factId: 'awkwardText',
  },
  {
    id: 'vip026',
    prompt: 'Which phrase signals that a work meeting is about to get longer?',
    options: ['“Quick sync”', '“One last thing”', '“Let’s take this offline”'],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip027',
    prompt: 'A coworker quits with no notice. What is the team’s first reaction?',
    options: ['“Good for them.”', '“Wait, who has the passwords?”', 'Updating their own résumé'],
    factId: 'datingApp',
  },
  {
    id: 'vip028',
    prompt: 'What is the most believable “camera off” explanation?',
    options: ['Bad Wi-Fi', 'A pet has taken over the chair', 'They are wearing formal slippers'],
    factId: 'petTranslator',
  },
  {
    id: 'vip029',
    prompt: 'What should never be sent to the house chat by mistake?',
    options: [
      'A screenshot of the house chat',
      'A voice note about one housemate',
      'A calendar invite titled “intervention”',
    ],
    factId: 'awkwardText',
  },
  {
    id: 'vip030',
    prompt: 'Which tiny social mistake gets replayed in someone’s head for a week?',
    options: [
      'Waving at the wrong person',
      'Calling someone the wrong name',
      'Saying “you too” to “happy birthday”',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip031',
    prompt: 'Someone says “I’m not judging.” What are they doing?',
    options: ['Judging quietly', 'Waiting for more details', 'Already drafting a voice note'],
    factId: 'awkwardText',
  },
  {
    id: 'vip032',
    prompt: 'What is the most suspiciously confident statement?',
    options: ['“I never get jealous”', '“I’m great with directions”', '“I can fix the Wi-Fi”'],
    factId: 'zombiePlan',
  },
  {
    id: 'vip033',
    prompt: 'What confession would make a dinner party instantly more interesting?',
    options: [
      'A secret celebrity crush',
      'A terrible first-date story',
      'A wild but true travel mishap',
    ],
    factId: 'datingApp',
  },
  {
    id: 'vip034',
    prompt: 'A housemate says “I’ll be ready in five.” What does that mean?',
    options: ['Five actual minutes', 'They have not started', 'They are already in the taxi'],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip035',
    prompt: 'The house must choose one scandal-proof group rule. Which survives?',
    options: ['No screenshots', 'No surprise plus-ones', 'No serious talks before coffee'],
    factId: 'weddingProposal',
  },
  {
    id: 'vip036',
    prompt: 'Which “I’m just being honest” moment is hardest to forgive?',
    options: [
      'A rating nobody asked for',
      'A recap of your old mistake',
      'A truth delivered in the group chat',
    ],
    factId: 'awkwardText',
  },
  {
    id: 'vip037',
    prompt: 'A housemate claims they have never had an awkward moment. The room thinks…',
    options: [
      'That is the awkward moment',
      'They have excellent editing',
      'They forgot the group chat exists',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip038',
    prompt: 'What is the most likely reason a pet gets its own party?',
    options: ['It is the birthday', 'The humans wanted cake', 'The pet runs the household'],
    factId: 'petParty',
  },
  {
    id: 'vip039',
    prompt: 'Which food opinion is most likely to split the house?',
    options: ['Chili is soup', 'Pineapple on pizza is perfect', 'Leftover pizza is better cold'],
    factId: 'chili',
  },
  {
    id: 'vip040',
    prompt: 'What is the house’s most likely comfort-watch choice?',
    options: ['A dating show', 'A cooking competition', 'A documentary about a bizarre crime'],
    factId: 'realityTvFatigue',
  },
  {
    id: 'vip041',
    prompt: 'Someone says they are “just here to observe.” What happens next?',
    options: ['They narrate every alliance', 'They win the house over', 'They become the plot'],
    factId: 'realityTv',
  },
  {
    id: 'vip042',
    prompt: 'What would a dating-app profile say if the group chat wrote it?',
    options: [
      '“Has snacks, asks questions”',
      '“Emotionally available after 9”',
      '“No more situationships, allegedly”',
    ],
    factId: 'datingApp',
  },
  {
    id: 'vip043',
    prompt: 'Which wedding speech opening makes everyone grip their glass?',
    options: [
      '“I wasn’t going to say this…”',
      '“For those who don’t know me…”',
      '“This story starts in 2014…”',
    ],
    factId: 'weddingProposal',
  },
  {
    id: 'vip044',
    prompt: 'Who would survive longest in a group-chat argument?',
    options: [
      'The one who sends a paragraph',
      'The one who reacts with a thumbs-up',
      'The one who leaves and returns tomorrow',
    ],
    factId: 'awkwardText',
  },
  {
    id: 'vip045',
    prompt: 'Which household chore is most likely to start a diplomatic incident?',
    options: [
      'Leaving one dish “to soak”',
      'Replacing the empty roll',
      'Moving someone’s labelled leftovers',
    ],
    factId: 'phoneBathroom',
  },
  {
    id: 'vip046',
    prompt: 'What is the most likely reason someone buys a snack they do not want?',
    options: [
      'They needed a bathroom',
      'They were avoiding eye contact',
      'It was on sale and looked lonely',
    ],
    factId: 'bathroomPurchase',
  },
  {
    id: 'vip047',
    prompt: 'What would a pet’s first AI-translated sentence probably be?',
    options: ['“More snacks.”', '“The humans are weird.”', '“I was promised a party.”'],
    factId: 'petTranslator',
  },
  {
    id: 'vip048',
    prompt: 'Which reality-TV confession would be hardest to keep secret?',
    options: ['“I like the drama”', '“I came for the prize”', '“I have watched every season”'],
    factId: 'realityTvFatigue',
  },
]

export interface MajorityRulesVipQuestion extends MajorityRulesQuestionTemplate {
  revealFact: MajorityRulesVipRevealFact
  baseBiases: [number, number, number]
}

export const MAJORITY_RULES_VIP_QUESTIONS: MajorityRulesVipQuestion[] = prompts.map(
  (question, index) => ({
    ...question,
    revealFact: facts[question.factId],
    baseBiases: question.baseBiases ?? biasPatterns[index % biasPatterns.length]!,
  })
)
