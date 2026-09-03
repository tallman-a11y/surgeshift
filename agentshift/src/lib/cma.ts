/**
 * Comparative Market Analysis — the appraisal-style adjustment grid that Cloud CMA
 * and RPR draw by hand, done properly and reproducibly.
 *
 * The point of a CMA is not "average the comps". It is: take each sold comp, adjust
 * its sale price for every way it differs from the subject, then weight the adjusted
 * values by how little adjusting each one needed. A comp that needed a 40% gross
 * adjustment is telling you it isn't comparable — appraisal practice treats anything
 * over ~25% gross as weak support, and we surface that instead of hiding it in a mean.
 *
 * Every dollar rate scales off the market's price per square foot so the same grid
 * works in a $180k market and a $2.4M one.
 */

import { clamp, round, roundToListPrice } from './money'

export type Condition = 1 | 2 | 3 | 4 | 5 // 1 = needs full reno, 3 = average, 5 = fully updated

export type Property = {
  address: string
  beds: number
  baths: number // 2.5 means two full + one half
  sqft: number
  lotSqft?: number
  yearBuilt?: number
  garageStalls?: number
  condition?: Condition
  pool?: boolean
  view?: boolean
  /** Miles from the subject. Zero for the subject itself. */
  distanceMiles?: number
}

export type Comp = Property & {
  soldPrice: number
  /** ISO date the sale closed. */
  soldDate: string
  /** Optional: what it originally listed for, used for the list-to-sale ratio. */
  listPrice?: number
  daysOnMarket?: number
}

export type MarketContext = {
  /** Annual appreciation as a decimal, e.g. 0.043 for 4.3%/yr. Can be negative. */
  annualAppreciation: number
  /** Median days on market for the subject's segment. */
  medianDom?: number
  /** Typical sale-price-to-list-price ratio, e.g. 0.987. */
  listToSaleRatio?: number
}

export type AdjustmentLine = {
  feature: string
  subjectValue: string
  compValue: string
  amount: number // positive = comp adjusted UP toward the subject
}

export type AdjustedComp = {
  comp: Comp
  lines: AdjustmentLine[]
  /** Sale price moved forward to today at the market's appreciation rate. */
  timeAdjustedPrice: number
  adjustedValue: number
  netAdjustment: number
  /** Sum of the absolute value of every adjustment — the real comparability signal. */
  grossAdjustment: number
  netAdjustmentPct: number
  grossAdjustmentPct: number
  /** 0–1. How much this comp counts toward the indicated value. */
  weight: number
  /** Set when the comp is too dissimilar to support a value. */
  warning?: string
}

export type CmaResult = {
  subject: Property
  comps: AdjustedComp[]
  /** The weighted reconciliation of the adjusted comps. */
  indicatedValue: number
  /** Defensible bracket, driven by the spread between the adjusted comps. */
  low: number
  high: number
  /** What to actually put in the MLS. */
  suggestedList: number
  pricePerSqft: number
  confidence: number // 0-100
  confidenceReasons: string[]
  estimatedDom: number
  /** Comps excluded from the reconciliation, with the reason why. */
  excluded: { comp: Comp; reason: string }[]
}

/**
 * Contributory value of extra living area is well below the market's average price
 * per square foot — the first 1,200 sqft of a house carries the kitchen, the baths
 * and the roof. Appraisers commonly use 40–70% of ppsf; we sit in the middle.
 */
const SQFT_ADJ_RATIO = 0.55
/** Land contributes, per square foot, a small fraction of improved ppsf. */
const LOT_ADJ_RATIO = 0.045
/** Each step on the 1–5 condition scale, as a share of value. */
const CONDITION_STEP = 0.04
/** Effective-age depreciation per year of difference. */
const AGE_PER_YEAR = 0.003
const AGE_CAP = 0.15
const BEDROOM_RATIO = 0.022
const FULL_BATH_RATIO = 0.028
const HALF_BATH_RATIO = 0.014
const GARAGE_RATIO = 0.018
const POOL_RATIO = 0.035
const VIEW_RATIO = 0.06

/** Appraisal rule of thumb: past this much gross adjustment the comp isn't comparable. */
export const GROSS_ADJ_WEAK = 0.25
export const GROSS_ADJ_UNUSABLE = 0.40
/** Sales older than this are excluded outright — the market has moved on. */
export const MAX_COMP_AGE_DAYS = 365

function monthsBetween(from: string, to: Date): number {
  const d = new Date(from)
  if (Number.isNaN(d.getTime())) return 0
  return (to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

function daysBetween(from: string, to: Date): number {
  const d = new Date(from)
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY
  return (to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
}

function fullAndHalfBaths(baths: number): { full: number; half: number } {
  const full = Math.floor(baths)
  const half = Math.round((baths - full) * 2)
  return { full, half }
}

function line(
  feature: string,
  subjectValue: string,
  compValue: string,
  amount: number,
): AdjustmentLine | null {
  const rounded = Math.round(amount / 100) * 100
  if (rounded === 0) return null
  return { feature, subjectValue, compValue, amount: rounded }
}

/**
 * Build the adjustment grid for one comp.
 *
 * Sign convention, which trips everyone up: an adjustment is applied to the COMP to
 * make it look like the subject. If the subject has an extra bedroom, the comp is
 * adjusted UP — because that comp, with the subject's bedroom, would have sold for
 * more. Never adjust the subject.
 */
export function adjustComp(
  subject: Property,
  comp: Comp,
  market: MarketContext,
  ppsf: number,
  now: Date = new Date(),
): AdjustedComp {
  // 1. Time. Move the sale forward to today's market before anything else, so every
  //    percentage rate below is applied against a current-dollar price.
  const months = monthsBetween(comp.soldDate, now)
  const monthlyRate = market.annualAppreciation / 12
  const timeAdjustment = comp.soldPrice * monthlyRate * Math.max(0, months)
  const timeAdjustedPrice = comp.soldPrice + timeAdjustment

  const base = timeAdjustedPrice
  const lines: AdjustmentLine[] = []
  const push = (l: AdjustmentLine | null) => { if (l) lines.push(l) }

  push(line(
    'Market conditions',
    now.toISOString().slice(0, 10),
    comp.soldDate.slice(0, 10),
    timeAdjustment,
  ))

  // 2. Living area, at contributory rate rather than full ppsf.
  push(line(
    'Living area',
    `${subject.sqft.toLocaleString()} sqft`,
    `${comp.sqft.toLocaleString()} sqft`,
    (subject.sqft - comp.sqft) * ppsf * SQFT_ADJ_RATIO,
  ))

  // 3. Lot.
  if (subject.lotSqft != null && comp.lotSqft != null) {
    push(line(
      'Lot size',
      `${subject.lotSqft.toLocaleString()} sqft`,
      `${comp.lotSqft.toLocaleString()} sqft`,
      (subject.lotSqft - comp.lotSqft) * ppsf * LOT_ADJ_RATIO,
    ))
  }

  // 4. Bedrooms. Only the count above/below matters; the square footage it occupies
  //    is already handled by the living-area line, so this rate is deliberately small.
  push(line(
    'Bedrooms',
    String(subject.beds),
    String(comp.beds),
    (subject.beds - comp.beds) * base * BEDROOM_RATIO,
  ))

  // 5. Baths, split so a half bath is not paid for as a full one.
  const sb = fullAndHalfBaths(subject.baths)
  const cb = fullAndHalfBaths(comp.baths)
  push(line(
    'Full baths',
    String(sb.full),
    String(cb.full),
    (sb.full - cb.full) * base * FULL_BATH_RATIO,
  ))
  push(line(
    'Half baths',
    String(sb.half),
    String(cb.half),
    (sb.half - cb.half) * base * HALF_BATH_RATIO,
  ))

  // 6. Garage.
  if (subject.garageStalls != null && comp.garageStalls != null) {
    push(line(
      'Garage',
      `${subject.garageStalls} car`,
      `${comp.garageStalls} car`,
      (subject.garageStalls - comp.garageStalls) * base * GARAGE_RATIO,
    ))
  }

  // 7. Effective age.
  if (subject.yearBuilt && comp.yearBuilt) {
    const yearDiff = subject.yearBuilt - comp.yearBuilt
    const rate = clamp(yearDiff * AGE_PER_YEAR, -AGE_CAP, AGE_CAP)
    push(line('Age / year built', String(subject.yearBuilt), String(comp.yearBuilt), base * rate))
  }

  // 8. Condition.
  if (subject.condition && comp.condition) {
    push(line(
      'Condition',
      conditionLabel(subject.condition),
      conditionLabel(comp.condition),
      (subject.condition - comp.condition) * base * CONDITION_STEP,
    ))
  }

  // 9. Amenities.
  if (subject.pool !== undefined && comp.pool !== undefined && subject.pool !== comp.pool) {
    push(line('Pool', subject.pool ? 'Yes' : 'No', comp.pool ? 'Yes' : 'No',
      (subject.pool ? 1 : -1) * base * POOL_RATIO))
  }
  if (subject.view !== undefined && comp.view !== undefined && subject.view !== comp.view) {
    push(line('View', subject.view ? 'Yes' : 'No', comp.view ? 'Yes' : 'No',
      (subject.view ? 1 : -1) * base * VIEW_RATIO))
  }

  // Reconcile. Note the gross figure excludes the time adjustment: a six-month-old
  // sale in a fast market is not a dissimilar house, and counting it as gross
  // adjustment would penalise perfectly good comps for the calendar.
  const featureLines = lines.filter(l => l.feature !== 'Market conditions')
  const netAdjustment = lines.reduce((s, l) => s + l.amount, 0)
  const grossAdjustment = featureLines.reduce((s, l) => s + Math.abs(l.amount), 0)
  const adjustedValue = comp.soldPrice + netAdjustment

  const netAdjustmentPct = grossAdjustment === 0 && netAdjustment === 0
    ? 0
    : (adjustedValue - comp.soldPrice) / comp.soldPrice
  const grossAdjustmentPct = grossAdjustment / base

  let warning: string | undefined
  if (grossAdjustmentPct >= GROSS_ADJ_UNUSABLE) {
    warning = `${Math.round(grossAdjustmentPct * 100)}% gross adjustment — too dissimilar to support value`
  } else if (grossAdjustmentPct >= GROSS_ADJ_WEAK) {
    warning = `${Math.round(grossAdjustmentPct * 100)}% gross adjustment — weak support, use as a bracket only`
  }

  // Weight: comps that needed little adjusting, sold recently, and sit close by.
  const similarity = 1 - clamp(grossAdjustmentPct / GROSS_ADJ_UNUSABLE, 0, 0.95)
  const days = daysBetween(comp.soldDate, now)
  const recency = clamp(1 - days / MAX_COMP_AGE_DAYS, 0.15, 1)
  const proximity = comp.distanceMiles == null ? 0.85 : clamp(1 - comp.distanceMiles / 3, 0.2, 1)
  const weight = similarity * recency * proximity

  return {
    comp,
    lines,
    timeAdjustedPrice: Math.round(timeAdjustedPrice),
    adjustedValue: Math.round(adjustedValue),
    netAdjustment: Math.round(netAdjustment),
    grossAdjustment: Math.round(grossAdjustment),
    netAdjustmentPct,
    grossAdjustmentPct,
    weight,
    warning,
  }
}

export function conditionLabel(c: Condition): string {
  return (['', 'Needs full reno', 'Dated', 'Average', 'Updated', 'Fully renovated'] as const)[c]
}

/**
 * Run a full CMA. Returns the indicated value, a defensible range, a confidence score
 * with the reasons behind it, and every comp that was thrown out and why — because the
 * excluded comps are the first thing a seller asks about.
 */
export function runCma(
  subject: Property,
  rawComps: Comp[],
  market: MarketContext,
  now: Date = new Date(),
): CmaResult {
  const excluded: { comp: Comp; reason: string }[] = []

  const fresh = rawComps.filter(c => {
    const days = daysBetween(c.soldDate, now)
    if (!Number.isFinite(days)) {
      excluded.push({ comp: c, reason: 'No valid sold date' })
      return false
    }
    if (days > MAX_COMP_AGE_DAYS) {
      excluded.push({ comp: c, reason: `Sold ${Math.round(days / 30)} months ago — outside the 12-month window` })
      return false
    }
    if (days < 0) {
      excluded.push({ comp: c, reason: 'Sold date is in the future' })
      return false
    }
    if (!(c.sqft > 0) || !(c.soldPrice > 0)) {
      excluded.push({ comp: c, reason: 'Missing square footage or sold price' })
      return false
    }
    return true
  })

  if (fresh.length === 0) {
    return {
      subject,
      comps: [],
      indicatedValue: 0,
      low: 0,
      high: 0,
      suggestedList: 0,
      pricePerSqft: 0,
      confidence: 0,
      confidenceReasons: ['No usable comparable sales in the last 12 months'],
      estimatedDom: market.medianDom ?? 0,
      excluded,
    }
  }

  // The market's price per square foot, from the comps themselves. Median rather than
  // mean so one 6,000 sqft outlier can't drag every adjustment rate with it.
  const ppsf = median(fresh.map(c => c.soldPrice / c.sqft))

  const adjusted = fresh
    .map(c => adjustComp(subject, c, market, ppsf, now))
    .sort((a, b) => b.weight - a.weight)

  const usable = adjusted.filter(a => {
    if (a.grossAdjustmentPct >= GROSS_ADJ_UNUSABLE) {
      excluded.push({
        comp: a.comp,
        reason: `${Math.round(a.grossAdjustmentPct * 100)}% gross adjustment — not comparable`,
      })
      return false
    }
    return true
  })

  const pool = usable.length > 0 ? usable : adjusted
  const totalWeight = pool.reduce((s, a) => s + a.weight, 0)
  const indicatedRaw = totalWeight > 0
    ? pool.reduce((s, a) => s + a.adjustedValue * a.weight, 0) / totalWeight
    : mean(pool.map(a => a.adjustedValue))

  const indicatedValue = Math.round(indicatedRaw / 500) * 500

  // The range comes from where the adjusted comps actually landed, not a flat ±5%.
  const values = pool.map(a => a.adjustedValue).sort((a, b) => a - b)
  const spread = values.length > 1 ? (values.at(-1)! - values[0]) / indicatedValue : 0.06
  const halfBand = clamp(spread / 2, 0.02, 0.09)
  const low = Math.round((indicatedValue * (1 - halfBand)) / 500) * 500
  const high = Math.round((indicatedValue * (1 + halfBand)) / 500) * 500

  // List price: price to the ratio the market is actually paying. If homes sell at
  // 98.7% of list, listing AT the indicated value leaves money on the table.
  const ratio = market.listToSaleRatio && market.listToSaleRatio > 0 ? market.listToSaleRatio : 1
  const suggestedList = roundToListPrice(indicatedValue / ratio)

  const { confidence, reasons } = scoreConfidence(pool, values, indicatedValue, market)

  return {
    subject,
    comps: adjusted,
    indicatedValue,
    low,
    high,
    suggestedList,
    pricePerSqft: round(indicatedValue / subject.sqft, 0),
    confidence,
    confidenceReasons: reasons,
    estimatedDom: estimateDom(pool, market),
    excluded,
  }
}

function scoreConfidence(
  pool: AdjustedComp[],
  values: number[],
  indicated: number,
  market: MarketContext,
): { confidence: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 50

  if (pool.length >= 5) { score += 18; reasons.push(`${pool.length} supporting comps`) }
  else if (pool.length >= 3) { score += 10; reasons.push(`${pool.length} supporting comps`) }
  else { score -= 15; reasons.push(`Only ${pool.length} usable comp${pool.length === 1 ? '' : 's'} — thin support`) }

  const tight = pool.filter(a => a.grossAdjustmentPct < 0.10).length
  if (tight >= 3) { score += 15; reasons.push(`${tight} comps needed under 10% adjustment`) }
  else if (tight >= 1) { score += 6; reasons.push(`${tight} tightly comparable sale${tight === 1 ? '' : 's'}`) }
  else { score -= 8; reasons.push('No closely comparable sale — every comp needed real adjustment') }

  const cv = values.length > 1 && indicated > 0 ? stdev(values) / indicated : 0
  if (cv < 0.04) { score += 14; reasons.push('Adjusted values cluster tightly') }
  else if (cv < 0.08) { score += 5; reasons.push('Adjusted values are reasonably consistent') }
  else { score -= 10; reasons.push(`Adjusted values disagree by ±${Math.round(cv * 100)}% — wide bracket`) }

  if (market.annualAppreciation != null && Math.abs(market.annualAppreciation) > 0.12) {
    score -= 8
    reasons.push('Market moving fast — time adjustments carry more of the answer than usual')
  }

  return { confidence: Math.round(clamp(score, 5, 97)), reasons }
}

function estimateDom(pool: AdjustedComp[], market: MarketContext): number {
  const withDom = pool.map(a => a.comp.daysOnMarket).filter((d): d is number => d != null && d >= 0)
  if (withDom.length > 0) return Math.round(median(withDom))
  return market.medianDom ?? 30
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}
