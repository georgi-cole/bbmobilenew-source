/** Curated, offline-reproducible survey results. Keep dates and denominators explicit.
 * Rows are editorial paraphrases; values must be checked against the primary source.
 */
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
const bank = []
function add(category, year, population, url, rows, publisher = 'YouGov') {
  for (const row of rows.trim().split('\n')) {
    const [value, clause] = row.trim().split('|')
    const prompt = `What percentage of ${population} ${clause}?`
    const scope = population.includes('British')
      ? 'Britain'
      : population.includes('Hong Kong')
        ? 'Hong Kong'
        : population.includes('Singaporean')
          ? 'Singapore'
          : 'United States'
    bank.push({
      id: `party-${createHash('sha256').update(`${year}:${prompt}`).digest('hex').slice(0, 16)}`,
      prompt,
      answerPercent: Math.round(Number(value)),
      scope,
      regionOrCountry: population,
      category,
      referenceYear: year,
      sourceName: publisher,
      sourceUrl: url,
      questionType: 'survey',
      notes: `Published result: ${value}%; rounded to the nearest whole percentage point. Survey year: ${year}. Population: ${population}. Self-reported opinions or experiences, not an objective universal fact.`,
    })
  }
}
const us = 'American adults'
const article = (id) => `https://yougov.com/en-us/articles/${id}`
add(
  'Food feuds',
  2025,
  us,
  'https://ygo-assets-websites-editorial-emea.yougov.net/documents/Food_Debates_poll_results.pdf',
  `
18|called chili a soup
40|classified a hot dog as a sandwich
73|classified a hamburger as a sandwich
67|considered coleslaw a salad
9|said they loved ketchup on eggs
22|said they loved pineapple on pizza
28|preferred leftover pizza cold
33|said they hated ketchup on eggs
25|said they hated pineapple on pizza
`
)
add(
  'Food feuds',
  2025,
  us,
  article('53202-accounting-for-taste-12-food-fights-that-split-americans'),
  `
49|preferred sandwiches sliced diagonally
39|preferred brownies from the middle of the pan
45|preferred brownies from the edge of the pan
`
)
const apps = article('36300-dating-apps-poll-data')
add(
  'Dating drama',
  2021,
  'American dating-app users, past or present',
  apps,
  `
54|used the apps to find an exclusive partner
34|used the apps for something fun to do
26|used the apps to find casual sex
6|used the apps hoping to cheat on a partner
62|had started a committed relationship through an app
28|had started multiple committed relationships through apps
26|preferred meeting partners through apps over other ways
41|preferred meeting partners away from dating apps
`
)
const snoop = article('23920-snooping-partner-phone-poll-survey')
add('Dating drama', 2019, us, snoop, `19|had secretly gone through a partner's phone`)
add(
  'Dating drama',
  2019,
  "Americans who had snooped through a partner's phone",
  snoop,
  `
73|did not regret snooping
33|uncovered something they had already suspected
18|uncovered something they had not suspected
`
)
const relationships =
  'https://yougov.com/en-gb/articles/55367-the-yougov-big-survey-on-relationships'
add(
  'Dating drama',
  2026,
  'British adults',
  relationships,
  `
47|considered engaging with OnlyFans creators to be cheating
30|considered romantic or sexual AI chats to be cheating
9|said they had never been in a relationship
`
)
add(
  'Dating drama',
  2026,
  'single British adults',
  relationships,
  `
42|were single because they had not met the right person
29|were single because dating was stressful or difficult
`
)
const pets = article('51499-most-dog-and-cat-owners-say-their-pets-know-them-well')
add(
  'Pet parent energy',
  2025,
  'American dog owners',
  pets,
  `
10|had thrown a party for their dog
32|wanted a camera to check on their dog remotely
29|wanted GPS tracking for their dog
24|wanted to test their dog's DNA
23|wanted AI to translate their dog's sounds
59|said their dog had a personalised collar or tag
`
)
add(
  'Pet parent energy',
  2025,
  'American cat owners',
  pets,
  `
8|had thrown a party for their cat
30|wanted a camera to check on their cat remotely
20|wanted GPS tracking for their cat
21|wanted AI to translate their cat's sounds
`
)
const pet22 = article('42697-dogs-cats-pets-meaningful-role-lives-americans')
add(
  'Pet parent energy',
  2022,
  'American dog or cat parents',
  pet22,
  `
57|bought their pets holiday gifts
40|celebrated their pets' birthdays
25|sometimes dressed their pets up for events
`
)
add(
  'Pet parent energy',
  2022,
  'American pet owners',
  pet22,
  `40|felt anxious when away from their pets during the day`
)
add(
  'Main character confidence',
  2021,
  us,
  'https://docs.cdn.yougov.com/07vgk5e81j/YouGov%20-%20Human%20vs%20animal%20fight.pdf',
  `
72|thought they could beat a rat unarmed
69|thought they could beat a house cat unarmed
49|thought they could beat a medium-sized dog unarmed
23|thought they could beat a large dog unarmed
14|thought they could beat a kangaroo unarmed
30|thought they could beat an eagle unarmed
6|thought they could beat a grizzly bear unarmed
12|thought they could beat a wolf unarmed
8|thought they could beat a lion unarmed
8|thought they could beat a gorilla unarmed
`
)
const confidence = article(
  '55094-men-are-more-likely-than-women-to-say-they-could-survive-in-the-wilderness-escape-from-a-sinking-car-and-navigate-using-the-stars'
)
add(
  'Main character confidence',
  2026,
  us,
  confidence,
  `
38|thought they could do a random stranger's job for a day
33|thought they could survive a week alone in the wilderness
29|thought they could escape an underwater sinking car
53|found accepting compliments difficult
`
)
add(
  'Main character confidence',
  2026,
  'American men',
  confidence,
  `
23|thought they could land a passenger plane with air-traffic-control help
12|thought they could beat a chimpanzee unarmed
`
)
add(
  'Main character confidence',
  2026,
  'American women',
  confidence,
  `
13|thought they could land a passenger plane with air-traffic-control help
4|thought they could beat a chimpanzee unarmed
`
)
add(
  'Spooky business',
  2025,
  us,
  'https://news.gallup.com/poll/692738/paranormal-phenomena-met-skepticism.aspx',
  `
48|believed in psychic or spiritual healing
39|believed in ghosts
29|believed in telepathy
27|believed people could communicate with the dead
26|believed in clairvoyance
25|believed in astrology
24|believed in reincarnation
24|believed in witches
`,
  'Gallup'
)
add(
  'Spooky business',
  2021,
  us,
  'https://docs.cdn.yougov.com/nu2kolhn4q/toplines_Halloween_2021_20211008.pdf',
  `
43|believed demons existed
9|believed werewolves existed
8|believed vampires existed
20|reported a personal encounter with a ghost
11|reported a personal encounter with a demon
4|reported a personal encounter with a werewolf
3|reported a personal encounter with a vampire
19|reported a personal encounter with a psychic
`
)
const zombies = article('25548-zombie-apocalypse-plan')
add('Zombie plans', 2019, us, zombies, `14|already had a zombie-apocalypse plan`)
add(
  'Zombie plans',
  2019,
  'Americans with a zombie-apocalypse plan',
  zombies,
  `
26|included stockpiling weapons in their plan
21|planned to hide in a secure location
16|mentioned gathering supplies such as food
12|refused to reveal their secret plan
8|planned to relocate
6|planned to meet family or friends
3|included running in their plan
3|planned to work with other survivors
2|planned to help the zombies or become one
`
)
add(
  'Zombie plans',
  2013,
  us,
  article('6368-zombie-apocalypse'),
  `
40|would fight back in a zombie apocalypse
43|thought vampires would defeat zombies in a war
18|thought zombies would defeat vampires in a war
30|named reality-TV stars as the closest thing to zombies
9|picked their ex as their first meal if zombified
5|picked their boss as their first meal if zombified
12|would board up their home in a zombie apocalypse
9|would hide in a shelter during a zombie apocalypse
19|blamed a failed science experiment for a hypothetical zombie outbreak
17|blamed a parasite for a hypothetical zombie outbreak
`
)
const toilet = article('45245-toilet-talk-polling-americans-potty-preferences')
add(
  'Bathroom confessions',
  2023,
  us,
  toilet,
  `
44|had bought something solely to use a business's bathroom
56|had talked on the phone while using the toilet
18|had dropped a phone in the toilet
70|had peed in the shower
73|had peed outdoors
41|had pooped outdoors
63|had clogged their own toilet
29|had clogged someone else's toilet
27|had clogged a public toilet
`
)
add(
  'Bathroom confessions',
  2023,
  'Americans in a serious relationship',
  toilet,
  `
34|had pooped in front of their partner
65|had peed in front of their partner
`
)
const hygiene = article('9825-united-states-bad-hygiene')
add(
  'Bathroom confessions',
  2014,
  us,
  hygiene,
  `
38|admitted not always washing their hands after using their home toilet
3|never washed their hands after using their home toilet
24|admitted not always washing their hands after using public toilets
20|had peed in a bath
66|showered or bathed at least once a day
`
)
add(
  'Bathroom confessions',
  2014,
  'American men',
  hygiene,
  `
46|admitted picking their nose at least yearly
41|admitted passing gas around other people at least yearly
35|admitted spitting in the street at least yearly
`
)
add(
  'Bathroom confessions',
  2014,
  'American women',
  hygiene,
  `
43|admitted muttering to themselves at least yearly
42|admitted talking to someone while watching a film at least yearly
`
)
add(
  'Digital habits',
  2020,
  us,
  article('27615-hand-washing-soap-poll-survey'),
  `
14|always used their phone on the toilet
18|used their phone on the toilet most times
22|never used their phone on the toilet
58|always washed with soap after using their home toilet
`
)
add(
  'Dream logic',
  2022,
  us,
  article('44813-what-do-americans-dream-about-yougov-poll'),
  `
67|remembered dreaming about being chased
62|remembered dreaming about former relationships
57|remembered dreaming about sexual experiences
23|remembered dreaming about being naked in public
27|remembered dreaming about their teeth falling out
38|said a dream had correctly predicted something later in life
30|had dreamed of understanding an unfamiliar subject deeply
26|had documented their dreams
23|had made a life decision influenced by a dream
22|had died in one of their dreams
`
)
add(
  'Cringe club',
  2022,
  us,
  article('44123-how-tolerant-are-americans-awkward-situations'),
  `
26|considered themselves more awkward than other people
41|considered themselves less awkward than other people
15|liked or loved being present for awkward situations
15|hated being present for awkward situations
29|liked small talk with people they did not know well
50|sometimes replayed embarrassing moments in their mind
10|never replayed embarrassing moments in their mind
10|often felt second-hand embarrassment
33|tried to make awkward situations less awkward
`
)
add(
  'Reality-TV chaos',
  2016,
  us,
  article('16547-america-both-loves-and-hates-reality-tv'),
  `
65|were interested in appearing in at least one reality-TV genre
71|thought there were too many reality-TV shows
1|thought there were too few reality-TV shows
56|thought reality TV harmed society
58|thought reality dating shows were scripted
31|thought cooking reality shows were scripted
26|thought hidden-camera shows were scripted
`
)
const reality = article('496-26-would-want-be-reality-show')
add(
  'Reality-TV chaos',
  2011,
  us,
  reality,
  `
26|would have joined a reality show if offered
26|said knowing reality TV was scripted would spoil their enjoyment
`
)
add(
  'Reality-TV chaos',
  2011,
  'Americans who wanted to join reality TV',
  reality,
  `
80|would sacrifice a week's holiday to appear on a show
34|would quit their job to appear on a show
`
)
add(
  'Digital habits',
  2022,
  'American TV viewers',
  article('42726-american-tv-preferences-yougov-poll'),
  `
42|binge-watched at least half the times they watched TV
49|preferred an entire series released at once
30|preferred weekly episode releases
11|had watched TV at faster-than-normal playback speed
38|felt overwhelmed by the choice of what to watch
23|were bothered a lot by spoilers
28|were not bothered at all by spoilers
77|did not know some platforms let them change playback speed
46|preferred hour-long TV episodes
`
)
add(
  'Gift drama',
  2024,
  us,
  article('51192-holiday-etiquette-how-americans-handle-gifts-gatherings-and-greetings'),
  `
72|thought crashing an uninvited holiday gathering was unacceptable
59|thought bringing an uninvited holiday guest was unacceptable
40|thought arriving late to a holiday gathering was acceptable
60|thought getting drunk at a holiday event was inappropriate
91|approved of giving cash as a holiday gift
58|approved of asking for cash as a holiday gift
61|approved of regifting an item
32|approved of leaving a price tag on a gift
47|approved of a joke gift instead of a serious present
40|approved of giving a pet as a gift
`
)
add(
  'Gift drama',
  2017,
  'Americans who received a holiday gift they disliked',
  article('17378-unwanted-holiday-gifts'),
  `
42|passed the unwanted gift to somebody else
40|returned the unwanted gift for store credit
40|stored the unwanted gift away
30|threw the unwanted gift in the rubbish
`
)
add(
  'Gift drama',
  2020,
  'British adults',
  'https://business.yougov.com/content/33440-it-acceptable-re-gift-presents',
  `
57|thought regifting was acceptable
40|admitted regifting a present
60|would not be upset if their gift was regifted
32|would be upset if their gift was regifted
`
)
add(
  'Office confessions',
  2025,
  'American workers',
  'https://www.ihire.com/about/press/ihire-survey-exposes-extent-of-7-controversial-job-search-workplace-behaviors',
  `
21.6|had quit a job without giving notice
16.5|had quit a new job within two weeks
16.2|had stretched the truth in a job interview
14|had joined a work video call in underwear or pyjamas
10.9|had ghosted an employer or skipped an interview
9.4|had secretly held a second job
`,
  'iHire / Qualtrics'
)
const daily = (category, year, slug, rows) =>
  add(category, year, us, `https://yougov.com/en-us/daily-results/${slug}`, rows)
daily(
  'Bathroom confessions',
  2021,
  '20210125-0d523-3',
  `56|faced towards the water while showering\n34|faced away from the water while showering`
)
daily('Cringe club', 2018, '20180521-a34b4-2', `44|admitted having guilty pleasures`)
daily(
  'Would you rather',
  2023,
  '20230313-b0556-2',
  `50|preferred a poorly paid job they loved to a well-paid job they hated`
)
daily(
  'Would you rather',
  2022,
  '20220228-b839f-2',
  `36|preferred being happy but unintelligent to being smart but sad`
)
daily(
  'Would you rather',
  2020,
  '20200605-30ac6-1',
  `73|preferred being seen as nice to being seen as a winner`
)
daily('Would you rather', 2018, '20180302-7ab93-2', `38|chose a perfect body over a perfect face`)
daily(
  'Would you rather',
  2023,
  '20230504-f0e51-1',
  `42|preferred weekly tests without homework to daily homework without tests`
)
daily(
  'Would you rather',
  2024,
  '20240322-7ab78-3',
  `49|preferred a price rise to a product shrinking at the same price`
)
daily('Gift drama', 2018, '20181218-e4ab2-2', `48|had regifted an item`)
daily(
  'Reality-TV chaos',
  2019,
  '20190408-ce6b1-3',
  `11|were very interested in appearing on a reality competition show`
)
daily(
  'Reality-TV chaos',
  2017,
  '20170320-6be70-1',
  `18|watched reality TV for the drama\n13|watched reality TV because it was mindless\n11|used reality TV as background noise`
)

const cheating = article('43605-how-many-americans-have-cheated-their-partner-poll')
add(
  'Dating drama',
  2022,
  us,
  cheating,
  `
83|considered suggestive online messages to someone else to be cheating
80|considered lying about time with another person to be cheating
73|considered an intense emotional attachment to someone else to be cheating
`
)
add(
  'Dating drama',
  2022,
  'Americans ever in a monogamous relationship',
  cheating,
  `
33|admitted having cheated emotionally or physically
54|said a partner had cheated on them
`
)
add(
  'Dating drama',
  2022,
  'Americans who had cheated on a partner',
  cheating,
  `
57|said at least one cheated-on partner found out
71|had not wanted their partner to discover their cheating
67|said their cheating did not lead to being dumped
43|had broken up with someone after cheating on them
59|cheated with only one other person in their most recent instance
`
)
add(
  'Dating drama',
  2025,
  us,
  article(
    '52212-half-americans-say-been-cheated-on-one-third-say-been-the-cheater-relationships-poll'
  ),
  `
88|had been in love
83|had been told they were loved by a romantic interest
77|had broken up with someone
74|had been dumped
19|had been in a love triangle
42|had been in an on-again, off-again relationship
38|had got back together with an ex
9|had been in an open or polyamorous relationship
11|had sexual contact outside their main relationship with their partner's consent
25|had sexual contact outside their relationship without their partner's consent
`
)
add(
  'Wedding chaos',
  2023,
  us,
  article('47928-surveying-americans-on-wedding-etiquette'),
  `
80|thought ignoring a wedding invitation was inappropriate
47|thought declining a wedding invitation without a reason was appropriate
59|thought wearing white as a wedding guest was inappropriate
77|thought outdressing the marrying couple was inappropriate
79|thought dressing casually against a formal wedding dress code was inappropriate
74|thought getting drunk as a wedding guest was inappropriate
74|thought an unapproved wedding speech was inappropriate
72|thought proposing at someone else's wedding was inappropriate
`
)
const weddings =
  'https://yougov.com/en-gb/articles/55446-the-yougov-big-survey-on-weddings-how-should-guest-behave-at-a-wedding'
add(
  'Wedding chaos',
  2026,
  'British adults',
  weddings,
  `
83|disapproved of a guest jokingly objecting to the marriage
75|disapproved of proposing at someone else's wedding
73|disapproved of guests getting noticeably drunk
48|approved of wearing a black dress to a wedding
`
)
add(
  'Wedding chaos',
  2026,
  'British women',
  weddings,
  `78|disapproved of a female wedding guest wearing white`
)
add(
  'Wedding chaos',
  2026,
  'British men',
  weddings,
  `51|disapproved of a female wedding guest wearing white`
)
const dates = article('23452-worst-first-date-phones-food-online-profiles-poll')
add(
  'Dating drama',
  2019,
  'American men',
  dates,
  `
69|ranked phone use among the worst first-date behaviours
52|ranked misleading dating-profile photos among the worst dating mistakes
25|ranked loud chewing among the worst first-date behaviours
21|ranked dominating the conversation among the worst first-date behaviours
`
)
add(
  'Dating drama',
  2019,
  'American women',
  dates,
  `
70|ranked phone use among the worst first-date behaviours
43|ranked misleading dating-profile photos among the worst dating mistakes
31|ranked loud chewing among the worst first-date behaviours
30|ranked dominating the conversation among the worst first-date behaviours
`
)
add(
  'Dating drama',
  2019,
  us,
  dates,
  `
33|would reject an unwanted second date by text or message
13|would ghost an unwanted second date
`
)
const phones = article(
  '53735-for-many-americans-their-smartphone-is-the-last-thing-they-see-at-night-and-the-first-thing-they-see-in-the-morning'
)
add(
  'Digital habits',
  2025,
  us,
  phones,
  `
64|checked their phone at least once or twice while with a friend
54|checked their phone at least once or twice during a meal with others
28|checked their phone at least once or twice during a date
79|thought checking a phone during a date was unacceptable
76|thought checking a phone during a work meeting was unacceptable
49|thought checking a phone while with a friend was unacceptable
40|checked their phone more often than they wanted
20|left their phone on the bed when going to sleep
53|left their phone directly beside the bed when sleeping
`
)
add(
  'Digital habits',
  2025,
  'Americans under 30',
  phones,
  `38|slept with their phone on the bed beside them`
)
const cleaning =
  'https://yougov.com/articles/50054-how-often-do-people-around-the-world-clean-everyday-items'
add(
  'Secret slob energy',
  2024,
  'British adults',
  cleaning,
  `10|said they never cleaned their mobile phone`
)
add(
  'Secret slob energy',
  2024,
  'Hong Kong online adults',
  cleaning,
  `
10|said they never cleaned their mobile phone
12|said they never cleaned their earphones
`
)
add(
  'Secret slob energy',
  2024,
  'Singaporean adults',
  cleaning,
  `
12|said they never cleaned their television
12|said they never cleaned their freezer
11|said they never cleaned their shower unit
9|said they never cleaned their refrigerator
6|said they never cleaned their toilet
`
)
add(
  'Secret slob energy',
  2024,
  us,
  cleaning,
  `
9|said they never cleaned their laptop
10|said they never cleaned their dishwasher
`
)
const sleep =
  'https://www.dreams.co.uk/sleep-matters-club/wp-content/uploads/Dreams-2026-Sleep-Survey-A4-Booklet-02.03.26.pdf'
add(
  'Pet parent energy',
  2026,
  'British survey respondents',
  sleep,
  `
13|would rather share a bed with their pet than their partner
31|allowed their pets in their bed
19|liked sharing a bed with their pet and partner equally
17|wanted neither a pet nor a partner in their bed
`,
  'Dreams UK Sleep Survey'
)
add(
  'Pet parent energy',
  2026,
  'British respondents who shared a bed with pets',
  sleep,
  `
30|said the pet got into bed regardless of the rules
22|said they simply could not refuse their pet
`,
  'Dreams UK Sleep Survey'
)
daily(
  'Pet parent energy',
  2026,
  '20260724-6cd60-4',
  `20|typically slept with exactly one pet in their bed\n7|typically slept with exactly two pets in their bed`
)
daily('Spooky business', 2026, '20260612-7b605-3', `21|said ghosts definitely existed`)
daily(
  'Gift drama',
  2025,
  '20251226-1356d-3',
  `10|thought people saying no gifts really wanted none and would dislike getting one`
)
daily(
  'Would you rather',
  2023,
  '20230713-49bb1-1',
  `32|chose success only after death over modest success while alive`
)
daily(
  'Would you rather',
  2025,
  '20250107-d1e97-2',
  `44|preferred holidays where most people spoke their own language`
)
add(
  'Digital habits',
  2023,
  'American TV rewatchers',
  'https://docs.cdn.yougov.com/c29v1hecrg/crosstabs_Rewatching%20TV%20Shows.pdf',
  `
59|enjoyed rewatching comedy
42|enjoyed rewatching drama
38|enjoyed rewatching action shows
30|enjoyed rewatching science fiction
24|enjoyed rewatching fantasy
34|enjoyed rewatching crime shows
28|enjoyed rewatching documentaries
21|enjoyed rewatching reality TV
`
)
add(
  'Food feuds',
  2024,
  us,
  'https://d3nkl3psvxxpe9.cloudfront.net/documents/crosstabs_Restaurant_Etiquette.pdf',
  `
23|approved of flirting with restaurant staff
51|approved of leaving no tip after bad service
75|approved of photographing their restaurant food
93|approved of requesting a leftovers container
44|approved of requesting multiple changes to a menu item
43|approved of tasting wine before buying a bottle
11|approved of snapping their fingers to summon a waiter
37|approved of restaurants banning phones at the table
`
)
add(
  'Dream logic',
  2015,
  us,
  article('12482-sleep-and-dreams'),
  `
15|never woke up poorly rested during a typical week
38|woke up poorly rested at least four days a week
6|said they usually slept nine hours or more
38|said they usually slept six hours or less
`
)
add(
  'Gift drama',
  2020,
  'British women',
  'https://business.yougov.com/content/33440-it-acceptable-re-gift-presents',
  `
52|admitted regifting a present
64|thought regifting was acceptable
`
)
add(
  'Gift drama',
  2020,
  'British men',
  'https://business.yougov.com/content/33440-it-acceptable-re-gift-presents',
  `27|admitted regifting a present`
)
add(
  'Spooky business',
  2023,
  us,
  'https://www.ipsos.com/en-us/many-americans-believe-supernatural-ufos',
  `
28|had awakened sensing a strange presence in the room
25|had seen or believed themselves in the presence of a ghost
`,
  'Ipsos'
)

if (bank.length < 300) throw new Error('At least 300 curated questions are required')
if (
  new Set(bank.map((q) => q.id)).size !== bank.length ||
  new Set(bank.map((q) => q.prompt)).size !== bank.length
)
  throw new Error('Duplicate question')
if (
  !bank.every(
    (q) =>
      Number.isInteger(q.answerPercent) &&
      q.answerPercent >= 0 &&
      q.answerPercent <= 100 &&
      q.sourceUrl.startsWith('https://')
  )
)
  throw new Error('Invalid survey row')
await writeFile('src/data/percentagePanicQuestions.json', JSON.stringify(bank, null, 2) + '\n')
console.info(
  `Wrote ${bank.length} curated survey questions across ${new Set(bank.map((q) => q.category)).size} categories.`
)
