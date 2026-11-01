const closingPunctuation = /^[\p{P}\p{S}]+$/u
const openingPunctuation = /^[\(\[\{“‘«"']+$/u
const sentenceEnding = /[.!?。！？]+[”’"'»\)\]\}]*$/u
const thoughtSeparator = /(?:^|\s)[·•|]$/u
const clauseEnding = /[,;:，；：–—][”’"'»\)\]\}]*$/u
const abbreviation = /^(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|no)\.$/iu
const initial = /^(?:\p{L}\.)+$/u
const phraseStart =
  /^(?:and|but|because|so|yet|while|although|though|whether|when|if|to|for|with|without|beside|before|after|since|until|that|и|но|защото|когато|ако|за|с|без|преди|след)$/iu
const unfinishedEnding =
  /^(?:a|an|the|my|your|our|their|this|that|these|those|to|of|in|on|at|by|with|from|and|or|but|more|less|than|as|very|too|quite|rather|not|no|и|но|на|в|с|за|от|до)$/iu
const unspacedScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u

function opensPunctuation(part, text) {
  if (/^[\p{Sc}#№@]+$/u.test(part.text)) return true
  if (!openingPunctuation.test(part.text)) return false
  if (part.text !== '"' && part.text !== "'") return true
  const prefix = Array.from(text.slice(0, part.start))
  const quoteCount = prefix.filter((character, index) => {
    if (character !== part.text) return false
    // Apostrophes inside a word are not an opening or closing quotation mark.
    return !(
      /[\p{L}\p{N}]/u.test(prefix[index - 1] || '') && /[\p{L}\p{N}]/u.test(prefix[index + 1] || '')
    )
  }).length
  return quoteCount % 2 === 0
}

function captionUnits(text) {
  const units = []
  const segmenter =
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'word' })
      : null
  for (const match of text.matchAll(/\S+/gu)) {
    const parts =
      segmenter && unspacedScript.test(match[0])
        ? Array.from(segmenter.segment(match[0]), ({ segment, index }) => ({
            text: segment,
            start: match.index + index,
            end: match.index + index + segment.length,
          }))
        : [{ text: match[0], start: match.index, end: match.index + match[0].length }]
    for (const part of parts) {
      const previous = units.at(-1)
      const opens = opensPunctuation(part, text)
      // Punctuation, closing quotes and standalone dashes belong to a nearby
      // word. An opening quote/bracket stays with the word that follows it.
      if (
        previous &&
        ((closingPunctuation.test(part.text) && !opens) ||
          previous.needsFollowing ||
          /(?:^|\s)[–—-]$/u.test(previous.text))
      ) {
        previous.end = part.end
        previous.text = text.slice(previous.start, previous.end)
        previous.needsFollowing = opens
      } else {
        part.needsFollowing = opens
        units.push(part)
      }
    }
  }
  return units
}

function endsThought(unit) {
  // Season comparisons use labeled beats separated by middle dots, not full
  // stops. Keep each beat together and retain its separator on the same page.
  if (thoughtSeparator.test(unit.text)) return true
  const word = unit.text.replace(/^[“‘«"'\(\[\{]+|[”’"'»\)\]\}]+$/gu, '')
  return sentenceEnding.test(unit.text) && !abbreviation.test(word) && !initial.test(word)
}

function wordsIn(units) {
  return units.reduce(
    (total, unit) =>
      total + (unit.text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length,
    0
  )
}

function breakCost(units, end) {
  if (end === units.length) return 0
  const previous = units[end - 1]
  const next = units[end]
  const lastWord = previous.text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
  const nextWord = next.text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
  if (endsThought(previous)) return 0
  if (clauseEnding.test(previous.text)) return 1
  const dangling = unfinishedEnding.test(lastWord) ? 24 : 0
  return dangling + (phraseStart.test(nextWord) ? 2 : 8)
}

function balanceSentence(text, units, fits) {
  const count = units.length
  const span = (start, end) => text.slice(units[start].start, units[end - 1].end)
  if (fits(span(0, count))) return [span(0, count)]

  // Layout fitting is monotonic for successively appended words. Binary search
  // limits DOM measurements; the balancing pass below uses only cached bounds.
  const bounds = units.map((_, start) => {
    let low = start + 1
    let high = count
    if (!fits(span(start, low))) return low
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (fits(span(start, middle))) low = middle
      else high = middle - 1
    }
    return low
  })
  const pagesNeeded = Array(count + 1).fill(Infinity)
  pagesNeeded[count] = 0
  for (let start = count - 1; start >= 0; start -= 1) {
    for (let end = start + 1; end <= bounds[start]; end += 1) {
      pagesNeeded[start] = Math.min(pagesNeeded[start], 1 + pagesNeeded[end])
    }
  }
  const idealLength = span(0, count).length / pagesNeeded[0]
  const costs = Array(count + 1).fill(Infinity)
  const breaks = Array(count).fill(count)
  costs[count] = 0
  for (let start = count - 1; start >= 0; start -= 1) {
    for (let end = start + 1; end <= bounds[start]; end += 1) {
      if (pagesNeeded[start] !== pagesNeeded[end] + 1) continue
      const page = span(start, end)
      const wordCount = wordsIn(units.slice(start, end))
      const orphan = wordCount <= 1 ? 1000 : wordCount === 2 ? 80 : 0
      const balance = 12 * ((page.length - idealLength) / idealLength) ** 2
      const cost = costs[end] + orphan + balance + breakCost(units, end)
      if (cost < costs[start]) {
        costs[start] = cost
        breaks[start] = end
      }
    }
  }
  const result = []
  for (let start = 0; start < count; start = breaks[start]) {
    result.push(span(start, breaks[start]))
  }
  return result
}

/**
 * Paginate captions by complete thoughts, then balanced clauses. `fits` must
 * measure the actual monitor style and available height. Words are never cut:
 * an oversized indivisible word is returned whole for the caller's adaptive
 * sizing. Whitespace is normalized; all words and punctuation are preserved.
 */
export function paginateCeremonyCaption(value, fits) {
  const text = String(value || '')
    .trim()
    .replace(/\s+/gu, ' ')
  if (!text || fits(text)) return [text]
  const units = captionUnits(text)
  if (!units.length) return [text]
  const sentences = []
  let sentence = []
  for (const unit of units) {
    sentence.push(unit)
    if (endsThought(unit)) {
      sentences.push(sentence)
      sentence = []
    }
  }
  if (sentence.length) sentences.push(sentence)

  // A short appeal such as "Please." should not become an orphan screen.
  // Join it to its neighboring thought before choosing phrase boundaries.
  for (let index = 0; index < sentences.length && sentences.length > 1; index += 1) {
    if (wordsIn(sentences[index]) >= 3) continue
    if (index === 0) {
      sentences.splice(0, 2, [...sentences[0], ...sentences[1]])
      index = -1
    } else {
      sentences[index - 1].push(...sentences[index])
      sentences.splice(index, 1)
      index -= 1
    }
  }
  const pages = []
  let pending = []
  const flush = () => {
    if (!pending.length) return
    pages.push(text.slice(pending[0].start, pending.at(-1).end))
    pending = []
  }
  for (const thought of sentences) {
    const thoughtText = text.slice(thought[0].start, thought.at(-1).end)
    if (!fits(thoughtText)) {
      flush()
      pages.push(...balanceSentence(text, thought, fits))
    } else if (!pending.length || fits(text.slice(pending[0].start, thought.at(-1).end))) {
      pending.push(...thought)
    } else {
      flush()
      pending.push(...thought)
    }
  }
  flush()
  return pages.length ? pages : [text]
}
