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
    prompt: 'Which small public mishap would haunt you longest?',
    options: [
      'Tripping in front of your crush',
      'Going out with a visible stain',
      'Realizing you wore mismatched socks',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip002',
    prompt: 'Which social slip-up is hardest to play cool after?',
    options: ['Waving at the wrong person', 'Forgetting someone’s name', 'A handshake-hug mix-up'],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip003',
    prompt: 'Which wrong-chat message would be hardest to recover from?',
    options: [
      'A screenshot of the conversation',
      'A voice note about the person reading it',
      '“I can’t wait to see you” to the wrong person',
    ],
    factId: 'awkwardText',
  },
  {
    id: 'vip004',
    prompt: 'Which text would make you reread it the most?',
    options: ['“Can we talk later?”', '“I need to tell you something”', '“Are you free tonight?”'],
    factId: 'awkwardText',
  },
  {
    id: 'vip005',
    prompt: 'What makes an apology feel most sincere?',
    options: [
      'Naming exactly what went wrong',
      'Making a real effort to fix it',
      'Giving you space, then checking in',
    ],
    factId: 'awkwardText',
  },
  {
    id: 'vip006',
    prompt: 'What makes a first date lose momentum fastest?',
    options: [
      'Only talking about themselves',
      'Checking their phone again and again',
      'Being rude to the staff',
    ],
    factId: 'datingApp',
  },
  {
    id: 'vip007',
    prompt: 'What is the strongest green flag on a first date?',
    options: [
      'They ask thoughtful questions',
      'They are kind to everyone',
      'They admit when they are nervous',
    ],
    factId: 'datingApp',
  },
  {
    id: 'vip008',
    prompt: 'Which dating profile feels most genuine?',
    options: [
      'A specific hobby they really enjoy',
      'An ordinary, unposed photo',
      'An honest answer about everyday life',
    ],
    factId: 'datingApp',
  },
  {
    id: 'vip009',
    prompt: 'Why would most people open a dating app?',
    options: [
      'To find a committed relationship',
      'To meet someone outside their usual circle',
      'For a fun date and see where it goes',
    ],
    factId: 'datingApp',
  },
  {
    id: 'vip010',
    prompt: 'Which first-date question gets a conversation going best?',
    options: [
      '“What do you love doing lately?”',
      '“Where would you travel next?”',
      '“What is your ideal day off?”',
    ],
    factId: 'datingApp',
  },
  {
    id: 'vip011',
    prompt: 'What follow-up after a first date feels best?',
    options: [
      '“I had a great time”',
      'A specific callback to your conversation',
      'A simple “home safe?”',
    ],
    factId: 'datingApp',
  },
  {
    id: 'vip012',
    prompt: 'Which part of a first date makes people most nervous?',
    options: ['Choosing where to go', 'The first few minutes', 'Knowing how to end the evening'],
    factId: 'datingApp',
  },
  {
    id: 'vip013',
    prompt: 'What makes someone a great friend over time?',
    options: [
      'They remember the little things',
      'They show up when they say they will',
      'They make it easy to be yourself',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip014',
    prompt: 'Someone says “quick question.” What do you expect next?',
    options: [
      'A favor that takes an hour',
      'A question with a long backstory',
      'A surprisingly serious conversation',
    ],
    factId: 'awkwardText',
  },
  {
    id: 'vip015',
    prompt: 'When a conversation goes quiet, what do most people do?',
    options: ['Ask a new question', 'Comment on something nearby', 'Check their phone'],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip016',
    prompt: 'What is the most awkward way to arrive at an event?',
    options: [
      'Everyone is already in a group photo',
      'A speech has just started',
      'You know nobody there yet',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip017',
    prompt: 'Which small social mistake do people replay longest?',
    options: [
      'Interrupting someone by accident',
      'Forgetting a name moments after hearing it',
      'Laughing when nobody else did',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip018',
    prompt: 'At someone else’s wedding, what crosses a line fastest?',
    options: [
      'Making a surprise proposal',
      'Wearing an outfit that looks bridal',
      'Taking over the microphone for a long speech',
    ],
    factId: 'weddingProposal',
  },
  {
    id: 'vip019',
    prompt: 'Which wedding moment do guests talk about longest?',
    options: ['A heartfelt speech', 'A surprise proposal', 'An unexpected dance-floor moment'],
    factId: 'weddingProposal',
  },
  {
    id: 'vip020',
    prompt: 'Where do people take phone calls they probably should skip?',
    options: ['In a bathroom', 'During a meal with friends', 'While walking through a quiet place'],
    factId: 'phoneBathroom',
  },
  {
    id: 'vip021',
    prompt: 'Which phone mishap would cause the biggest panic?',
    options: [
      'Dropping it in a toilet',
      'Losing it while travelling',
      'Sending a private message to the wrong person',
    ],
    factId: 'phoneDrop',
  },
  {
    id: 'vip022',
    prompt: 'Which awkward moment would people replay most later?',
    options: [
      'A joke that did not land',
      'Forgetting someone’s name',
      'A goodbye that felt too long',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip023',
    prompt: 'Which travel problem creates the most stress?',
    options: [
      'Missing a connection',
      'Realizing your phone is nearly dead',
      'Arriving on the wrong day',
    ],
    factId: 'phoneDrop',
  },
  {
    id: 'vip024',
    prompt: 'What makes the easiest travel companion?',
    options: [
      'Someone who plans ahead',
      'Someone who can adapt quickly',
      'Someone who always finds good food',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip025',
    prompt: 'Which first-date plan feels easiest to say yes to?',
    options: ['A walk somewhere interesting', 'Trying a local cafe', 'Going to a small event'],
    factId: 'datingApp',
  },
  {
    id: 'vip026',
    prompt: 'Which small travel mistake would bother you most?',
    options: ['Taking the wrong train', 'Booking the wrong date', 'Leaving your charger behind'],
    factId: 'phoneDrop',
  },
  {
    id: 'vip027',
    prompt: 'At a shared meal, which question is hardest to settle?',
    options: ['Where to eat', 'What to order for everyone', 'Is this soup or a stew?'],
    factId: 'chili',
  },
  {
    id: 'vip028',
    prompt: 'Which food debate is hardest to settle?',
    options: ['Is a hot dog a sandwich?', 'Is chili a soup?', 'Does pineapple belong on pizza?'],
    factId: 'hotDog',
  },
  {
    id: 'vip029',
    prompt: 'Which pizza opinion gets the strongest reaction?',
    options: ['Pineapple is essential', 'Cold pizza is better', 'Plain cheese is all you need'],
    factId: 'pineapplePizza',
  },
  {
    id: 'vip030',
    prompt: 'Which meal is hardest to choose when you are very hungry?',
    options: [
      'A familiar comfort meal',
      'Something new on the menu',
      'Whatever your friend ordered',
    ],
    factId: 'chili',
  },
  {
    id: 'vip031',
    prompt: 'The last slice is left. What do most people do?',
    options: ['Ask if anyone wants it', 'Cut it in half', 'Wait and hope someone else takes it'],
    factId: 'pineapplePizza',
  },
  {
    id: 'vip032',
    prompt: 'Which reality show would people most like to try?',
    options: ['A cooking competition', 'A travel or adventure series', 'A dating show'],
    factId: 'realityTv',
  },
  {
    id: 'vip033',
    prompt: 'What keeps people watching a reality show?',
    options: [
      'The cast’s personalities',
      'A competition with real stakes',
      'Unexpected friendships and fallouts',
    ],
    factId: 'realityTv',
  },
  {
    id: 'vip034',
    prompt: 'What makes viewers lose interest fastest?',
    options: [
      'The same argument every episode',
      'A season that drags on',
      'Too many similar shows',
    ],
    factId: 'realityTvFatigue',
  },
  {
    id: 'vip035',
    prompt: 'Which reality-show moment makes you switch off?',
    options: [
      'A cruel personal attack',
      'A scene that feels staged',
      'Another dramatic preview before the break',
    ],
    factId: 'realityTvFatigue',
  },
  {
    id: 'vip036',
    prompt: 'Which work phrase usually means the meeting will run late?',
    options: ['“One last thing”', '“Let’s do a quick sync”', '“Can everyone see my screen?”'],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip037',
    prompt: 'Which work-chat mistake would be hardest to explain?',
    options: [
      'Replying to everyone by accident',
      'Sending a message before fixing the typo',
      'Sharing a screenshot with the wrong people',
    ],
    factId: 'awkwardText',
  },
  {
    id: 'vip038',
    prompt: 'Which pet treat would owners celebrate with?',
    options: ['A special meal', 'A new toy', 'A birthday party with people'],
    factId: 'petParty',
  },
  {
    id: 'vip039',
    prompt: 'If pets could send one text, what would it say first?',
    options: ['“More food, please”', '“Open the door”', '“Stop moving my favorite spot”'],
    factId: 'petTranslator',
  },
  {
    id: 'vip040',
    prompt: 'Which pet behavior would you most want translated?',
    options: [
      'Staring at you from across the room',
      'Bringing you the same toy again',
      'Waking you before sunrise',
    ],
    factId: 'petTranslator',
  },
  {
    id: 'vip041',
    prompt: 'What would make you curious enough to try a reality show?',
    options: [
      'A chance to learn a new skill',
      'A once-in-a-lifetime trip',
      'Meeting people outside your circle',
    ],
    factId: 'realityTv',
  },
  {
    id: 'vip042',
    prompt: 'What would you most hope people forget after a party?',
    options: [
      'A joke that fell flat',
      'A story that went on too long',
      'Trying to leave three times before saying goodbye',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip043',
    prompt: 'Which wedding speech opening makes guests most nervous?',
    options: [
      '“I wasn’t going to say this…”',
      '“We have all heard stories about…”',
      '“I’ll keep this short”',
    ],
    factId: 'weddingProposal',
  },
  {
    id: 'vip044',
    prompt: 'What do people most often overthink after a social event?',
    options: ['Something they said', 'Someone they forgot to talk to', 'How long they stayed'],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip045',
    prompt: 'Which small everyday kindness is easiest to remember?',
    options: [
      'Someone remembers your name',
      'Someone checks that you got home safely',
      'Someone notices you could use a hand',
    ],
    factId: 'awkwardReplay',
  },
  {
    id: 'vip046',
    prompt: 'Which digital mistake would you undo?',
    options: [
      'Liking a very old photo by accident',
      'Sending a message before it was finished',
      'Starting a voice call instead of a text',
    ],
    factId: 'awkwardText',
  },
  {
    id: 'vip047',
    prompt: 'What would a pet most likely complain about first?',
    options: ['Dinner is late', 'The door is closed', 'You stopped petting them'],
    factId: 'petTranslator',
  },
  {
    id: 'vip048',
    prompt: 'Which food opinion would you defend most passionately?',
    options: ['Chili is a soup', 'Cold pizza is better', 'Pineapple belongs on pizza'],
    factId: 'chili',
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
