#!/usr/bin/env node
/**
 * Build a source-verified, worldwide 300-question bank from the World Bank WDI API.
 * Usage: node scripts/generate-percentage-panic-bank.mjs
 *
 * This is an authoring step, never a runtime network request. On API errors the
 * existing checked-in bank remains untouched. Do not publish an unverified bank.
 */
import { writeFile } from 'node:fs/promises'

const COUNTRY_CODES = [
  'WLD',
  'EAS',
  'ECS',
  'LCN',
  'MEA',
  'NAC',
  'SAS',
  'SSF',
  'BRA',
  'ARG',
  'CHL',
  'COL',
  'MEX',
  'PER',
  'IND',
  'CHN',
  'JPN',
  'IDN',
  'PHL',
  'THA',
  'VNM',
  'KOR',
  'NPL',
  'DEU',
  'FRA',
  'ESP',
  'ITA',
  'POL',
  'BGR',
  'SWE',
  'GBR',
  'NGA',
  'ZAF',
  'KEN',
  'EGY',
  'GHA',
  'MAR',
  'ETH',
  'AUS',
  'NZL',
  'FJI',
  'CAN',
  'USA',
]
const REGIONS = {
  WLD: 'Global',
  EAS: 'East Asia & Pacific',
  ECS: 'Europe & Central Asia',
  LCN: 'Latin America & Caribbean',
  MEA: 'Middle East & North Africa',
  NAC: 'North America',
  SAS: 'South Asia',
  SSF: 'Sub-Saharan Africa',
}
const INDICATORS = [
  ['SP.URB.TOTL.IN.ZS', 'lived in urban areas', 'People & places'],
  ['SP.RUR.TOTL.ZS', 'lived in rural areas', 'People & places'],
  ['SP.POP.0014.TO.ZS', 'were aged 0–14', 'People & places'],
  ['SP.POP.65UP.TO.ZS', 'were aged 65 or older', 'People & places'],
  ['SP.POP.TOTL.FE.ZS', 'were female', 'People & places'],
  ['AG.LND.FRST.ZS', 'of its land area was covered by forests', 'Nature'],
  ['AG.LND.AGRI.ZS', 'of its land was agricultural land', 'Nature'],
  ['AG.LND.ARBL.ZS', 'of its land was arable land', 'Nature'],
  ['EG.ELC.ACCS.ZS', 'had access to electricity', 'Daily life'],
  ['IT.NET.USER.ZS', 'used the internet', 'Technology'],
  ['EG.FEC.RNEW.ZS', 'of final energy consumption came from renewable sources', 'Environment'],
  ['EG.ELC.RNEW.ZS', 'of electricity output came from renewables', 'Environment'],
  ['SH.H2O.BASW.ZS', 'had at least basic drinking-water services', 'Daily life'],
  ['SH.STA.BASS.ZS', 'had at least basic sanitation services', 'Daily life'],
  ['SH.STA.SMSS.ZS', 'used safely managed sanitation services', 'Daily life'],
  ['SH.IMM.MEAS', 'of children aged 12–23 months were immunized against measles', 'Health'],
  ['SH.IMM.IDPT', 'of children aged 12–23 months received DPT immunization', 'Health'],
  ['SH.STA.BRTC.ZS', 'of births were attended by skilled health staff', 'Health'],
  ['SN.ITK.DEFC.ZS', 'of people were undernourished', 'Food & health'],
  ['SL.UEM.TOTL.ZS', 'of the total labor force was unemployed', 'Work & money'],
  ['SL.UEM.1524.ZS', 'of the youth labor force was unemployed', 'Work & money'],
  ['SL.TLF.CACT.FE.ZS', 'of women aged 15+ participated in the labor force', 'Work & money'],
  ['SE.ADT.LITR.ZS', 'of adults aged 15+ were literate', 'Education'],
  ['SE.PRM.CMPT.ZS', 'was the primary completion rate', 'Education'],
  ['SG.GEN.PARL.ZS', 'of parliamentary seats were held by women', 'Society'],
  ['ER.LND.PTLD.ZS', 'of its land was protected terrestrial area', 'Nature'],
  ['ER.MRN.PTMR.ZS', 'of its marine area was protected', 'Nature'],
  ['NV.AGR.TOTL.ZS', 'of GDP came from agriculture, forestry and fishing', 'Work & money'],
  ['NV.IND.TOTL.ZS', 'of GDP came from industry', 'Work & money'],
  ['NV.SRV.TOTL.ZS', 'of GDP came from services', 'Work & money'],
  ['NE.EXP.GNFS.ZS', 'of GDP was the value of exports', 'Work & money'],
  ['NE.IMP.GNFS.ZS', 'of GDP was the value of imports', 'Work & money'],
  ['SH.XPD.CHEX.GD.ZS', 'of GDP was spent on health', 'Health'],
  ['SE.XPD.TOTL.GD.ZS', 'of GDP was spent on education', 'Education'],
  ['GB.XPD.RSDV.GD.ZS', 'of GDP was spent on research and development', 'Science'],
  ['SP.DYN.CONU.ZS', 'of married women aged 15–49 used contraception', 'Health'],
  ['SH.STA.MALN.ZS', 'of children under 5 were underweight', 'Health'],
  ['SH.STA.OWGH.ZS', 'of children under 5 were overweight', 'Health'],
]
const regionLabels = new Set(Object.keys(REGIONS))
const continentOf = (code) =>
  ({
    BRA: 'South America',
    ARG: 'South America',
    CHL: 'South America',
    COL: 'South America',
    MEX: 'North America',
    PER: 'South America',
    IND: 'Asia',
    CHN: 'Asia',
    JPN: 'Asia',
    IDN: 'Asia',
    PHL: 'Asia',
    THA: 'Asia',
    VNM: 'Asia',
    KOR: 'Asia',
    NPL: 'Asia',
    DEU: 'Europe',
    FRA: 'Europe',
    ESP: 'Europe',
    ITA: 'Europe',
    POL: 'Europe',
    BGR: 'Europe',
    SWE: 'Europe',
    GBR: 'Europe',
    NGA: 'Africa',
    ZAF: 'Africa',
    KEN: 'Africa',
    EGY: 'Africa',
    GHA: 'Africa',
    MAR: 'Africa',
    ETH: 'Africa',
    AUS: 'Oceania',
    NZL: 'Oceania',
    FJI: 'Oceania',
    CAN: 'North America',
    USA: 'North America',
  })[code] ?? 'International'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function getJson(url) {
  for (let tries = 0; tries < 4; tries++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20000)
      let response
      try {
        response = await fetch(url, { signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const data = await response.json()
      if (!Array.isArray(data) || !Array.isArray(data[1])) throw new Error('Invalid API response')
      return data[1]
    } catch (error) {
      if (tries === 3) throw new Error('World Bank API failed: ' + url + '\n' + error)
      await sleep(500 * (tries + 1))
    }
  }
}

const byKey = new Map()
for (const [indicator, phrase, category] of INDICATORS) {
  const url =
    'https://api.worldbank.org/v2/country/' +
    COUNTRY_CODES.join(';') +
    '/indicator/' +
    indicator +
    '?format=json&date=2020:2025&per_page=5000'
  const records = await getJson(url)
  const yearsByCode = new Map()
  for (const record of records) {
    const code = record.countryiso3code || record.country?.id
    const year = Number(record.date)
    const value = record.value
    if (
      !COUNTRY_CODES.includes(code) ||
      !Number.isInteger(year) ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    )
      continue
    const previous = yearsByCode.get(code)
    if (!previous || year > Number(previous.date)) yearsByCode.set(code, record)
  }
  const eligible = [...yearsByCode.entries()].map(([code, record]) => {
    const year = Number(record.date)
    const location = record.country.value
    const scope = regionLabels.has(code) ? REGIONS[code] : continentOf(code)
    const part = [
      'SP.URB.TOTL.IN.ZS',
      'SP.RUR.TOTL.ZS',
      'SP.POP.0014.TO.ZS',
      'SP.POP.65UP.TO.ZS',
      'SP.POP.TOTL.FE.ZS',
      'EG.ELC.ACCS.ZS',
      'IT.NET.USER.ZS',
      'SH.H2O.BASW.ZS',
      'SH.STA.BASS.ZS',
      'SH.STA.SMSS.ZS',
    ].includes(indicator)
    const place = location === 'World' ? 'worldwide' : 'in ' + location
    const prefix =
      'In ' + year + ', ' + place + ', what percentage ' + (part ? 'of the population ' : '')
    return {
      id:
        'wb-' +
        indicator.toLowerCase().replaceAll('.', '-') +
        '-' +
        code.toLowerCase() +
        '-' +
        year,
      prompt: prefix + phrase + '?',
      answerPercent: Math.round(record.value),
      scope,
      regionOrCountry: location,
      category,
      referenceYear: year,
      sourceName: 'World Bank – World Development Indicators',
      sourceUrl:
        'https://api.worldbank.org/v2/country/' + code + '/indicator/' + indicator + '?format=json',
      notes:
        'World Bank reported value: ' +
        record.value.toFixed(3) +
        '%. Answer rounded to nearest whole percentage point.',
      indicatorCode: indicator,
    }
  })
  // Rotate geographic picks per indicator; prefer worldwide/regional datasets,
  // then fill from individual countries on different continents.
  const index = INDICATORS.findIndex((item) => item[0] === indicator)
  const global = eligible.filter((x) => x.scope === 'Global')
  const regional = eligible.filter(
    (x) => regionLabels.has(x.id.split('-').at(-2)?.toUpperCase()) && x.scope !== 'Global'
  )
  const countries = eligible.filter((x) => !regionLabels.has(x.id.split('-').at(-2)?.toUpperCase()))
  const shift = (index * 7) % Math.max(1, countries.length)
  const rotatedCountries = [...countries.slice(shift), ...countries.slice(0, shift)]
  // Preserve worldwide and continental coverage before sampling individual countries.
  for (const item of [...global, ...regional, ...rotatedCountries].slice(0, 14)) {
    byKey.set(item.id, item)
  }
  console.info(indicator + ': ' + eligible.length + ' available observations')
}

const rows = [...byKey.values()]
const out = []
const used = new Set()
const perIndicator = new Map()
const perLocation = new Map()
let iteration = 0
while (out.length < 300 && iteration++ < rows.length + 1) {
  const next = rows
    .filter((q) => !used.has(q.id))
    .sort(
      (a, b) =>
        (perIndicator.get(a.indicatorCode) || 0) - (perIndicator.get(b.indicatorCode) || 0) ||
        (perLocation.get(a.regionOrCountry) || 0) - (perLocation.get(b.regionOrCountry) || 0) ||
        a.id.localeCompare(b.id)
    )[0]
  if (!next) break
  used.add(next.id)
  perIndicator.set(next.indicatorCode, 1 + (perIndicator.get(next.indicatorCode) || 0))
  perLocation.set(next.regionOrCountry, 1 + (perLocation.get(next.regionOrCountry) || 0))
  out.push(next)
}
if (out.length !== 300) {
  throw new Error('Bank generation yielded ' + out.length + ' valid questions; 300 required.')
}
if (
  new Set(out.map((q) => q.id)).size !== out.length ||
  !out.every(
    (q) =>
      q.sourceUrl.startsWith('https://api.worldbank.org/') &&
      Number.isInteger(q.answerPercent) &&
      q.answerPercent >= 0 &&
      q.answerPercent <= 100
  )
) {
  throw new Error('Source/answer validation failed')
}
await writeFile('src/data/percentagePanicQuestions.json', JSON.stringify(out, null, 2) + '\n')
console.info('Wrote 300 verified internationally distributed percentage questions.')
