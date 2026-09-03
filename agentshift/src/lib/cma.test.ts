import { describe, it, expect } from 'vitest'
import { runCma, adjustComp, median, stdev, GROSS_ADJ_UNUSABLE, type Comp, type Property, type MarketContext } from './cma'

const NOW = new Date('2026-09-03T00:00:00Z')

const subject: Property = {
  address: '412 Alder Ln',
  beds: 4, baths: 2.5, sqft: 2400, lotSqft: 8000,
  yearBuilt: 2005, garageStalls: 2, condition: 3, pool: false, view: false,
}

const market: MarketContext = { annualAppreciation: 0.048, medianDom: 24, listToSaleRatio: 0.985 }

function comp(over: Partial<Comp> = {}): Comp {
  return {
    address: 'comp', beds: 4, baths: 2.5, sqft: 2400, lotSqft: 8000,
    yearBuilt: 2005, garageStalls: 2, condition: 3, pool: false, view: false,
    soldPrice: 600_000, soldDate: '2026-06-01', distanceMiles: 0.4, ...over,
  }
}

describe('adjustComp', () => {
  it('adjusts the comp toward the subject, never the other way round', () => {
    // Subject has one more bedroom, so the comp is adjusted UP.
    const a = adjustComp(subject, comp({ beds: 3 }), market, 250, NOW)
    const bedLine = a.lines.find(l => l.feature === 'Bedrooms')!
    expect(bedLine.amount).toBeGreaterThan(0)
    expect(a.adjustedValue).toBeGreaterThan(600_000)
  })

  it('adjusts down when the comp is superior', () => {
    const a = adjustComp(subject, comp({ sqft: 3000 }), market, 250, NOW)
    const sqftLine = a.lines.find(l => l.feature === 'Living area')!
    expect(sqftLine.amount).toBeLessThan(0)
  })

  it('values extra square footage below full price per square foot', () => {
    const ppsf = 250
    const a = adjustComp(subject, comp({ sqft: 2000 }), market, ppsf, NOW)
    const sqftLine = a.lines.find(l => l.feature === 'Living area')!
    // 400 sqft at full ppsf would be $100k; contributory value is materially less.
    expect(sqftLine.amount).toBeGreaterThan(0)
    expect(sqftLine.amount).toBeLessThan(400 * ppsf)
    expect(sqftLine.amount).toBeCloseTo(400 * ppsf * 0.55, -2)
  })

  it('moves an older sale forward at the market rate', () => {
    const twelveMonths = adjustComp(subject, comp({ soldDate: '2025-09-03' }), market, 250, NOW)
    const line = twelveMonths.lines.find(l => l.feature === 'Market conditions')!
    // ~4.8% of 600k over a year.
    expect(line.amount).toBeGreaterThan(24_000)
    expect(line.amount).toBeLessThan(32_000)
  })

  it('adjusts down in a declining market', () => {
    const falling: MarketContext = { ...market, annualAppreciation: -0.06 }
    const a = adjustComp(subject, comp({ soldDate: '2026-03-03' }), falling, 250, NOW)
    const line = a.lines.find(l => l.feature === 'Market conditions')!
    expect(line.amount).toBeLessThan(0)
  })

  it('excludes the time adjustment from gross comparability', () => {
    // An identical house sold 8 months ago is not a dissimilar house.
    const a = adjustComp(subject, comp({ soldDate: '2026-01-03' }), market, 250, NOW)
    expect(a.grossAdjustment).toBe(0)
    expect(a.grossAdjustmentPct).toBe(0)
    expect(a.warning).toBeUndefined()
  })

  it('splits full and half baths at different rates', () => {
    const a = adjustComp(subject, comp({ baths: 2.0 }), market, 250, NOW)   // subject has the extra half
    const b = adjustComp(subject, comp({ baths: 1.5 }), market, 250, NOW)   // ...and an extra full
    const halfLine = a.lines.find(l => l.feature === 'Half baths')!
    const fullLine = b.lines.find(l => l.feature === 'Full baths')!
    expect(halfLine.amount).toBeGreaterThan(0)
    expect(fullLine.amount).toBeGreaterThan(halfLine.amount)
  })

  it('flags a comp that needed too much adjusting', () => {
    const wildlyDifferent = comp({ sqft: 1200, beds: 2, baths: 1, condition: 5, pool: true, yearBuilt: 1960 })
    const a = adjustComp(subject, wildlyDifferent, market, 250, NOW)
    expect(a.grossAdjustmentPct).toBeGreaterThan(GROSS_ADJ_UNUSABLE)
    expect(a.warning).toMatch(/too dissimilar/)
  })

  it('weights a close, recent, similar comp above a distant stale one', () => {
    const good = adjustComp(subject, comp({ soldDate: '2026-08-01', distanceMiles: 0.2 }), market, 250, NOW)
    const bad = adjustComp(subject, comp({ soldDate: '2025-10-01', distanceMiles: 2.8, sqft: 1900 }), market, 250, NOW)
    expect(good.weight).toBeGreaterThan(bad.weight)
  })

  it('produces no lines for a truly identical, same-day comp', () => {
    const a = adjustComp(subject, comp({ ...subject, soldDate: '2026-09-03' }) as Comp, market, 250, NOW)
    expect(a.lines).toHaveLength(0)
    expect(a.adjustedValue).toBe(600_000)
    expect(a.netAdjustment).toBe(0)
  })
})

describe('runCma', () => {
  const comps: Comp[] = [
    comp({ address: 'A', soldPrice: 592_000, soldDate: '2026-07-15', sqft: 2350, daysOnMarket: 18 }),
    comp({ address: 'B', soldPrice: 615_000, soldDate: '2026-06-02', sqft: 2500, daysOnMarket: 26 }),
    comp({ address: 'C', soldPrice: 578_000, soldDate: '2026-05-20', sqft: 2280, beds: 3, daysOnMarket: 33 }),
    comp({ address: 'D', soldPrice: 604_000, soldDate: '2026-08-01', sqft: 2420, daysOnMarket: 12 }),
  ]

  it('lands the indicated value in the neighbourhood of the comps', () => {
    const r = runCma(subject, comps, market, NOW)
    expect(r.indicatedValue).toBeGreaterThan(580_000)
    expect(r.indicatedValue).toBeLessThan(660_000)
    expect(r.low).toBeLessThan(r.indicatedValue)
    expect(r.high).toBeGreaterThan(r.indicatedValue)
  })

  it('prices above the indicated value when the market pays under list', () => {
    const r = runCma(subject, comps, market, NOW)
    expect(r.suggestedList).toBeGreaterThan(r.indicatedValue)
  })

  it('does not inflate list price when homes sell at list', () => {
    const r = runCma(subject, comps, { ...market, listToSaleRatio: 1 }, NOW)
    expect(r.suggestedList).toBeLessThanOrEqual(r.indicatedValue * 1.01)
  })

  it('excludes stale sales and says why', () => {
    const r = runCma(subject, [...comps, comp({ address: 'OLD', soldDate: '2023-01-01' })], market, NOW)
    const excluded = r.excluded.find(e => e.comp.address === 'OLD')
    expect(excluded).toBeDefined()
    expect(excluded!.reason).toMatch(/outside the 12-month window/)
    expect(r.comps.map(c => c.comp.address)).not.toContain('OLD')
  })

  it('excludes a comp with no usable sold date', () => {
    const r = runCma(subject, [...comps, comp({ address: 'BAD', soldDate: 'not-a-date' })], market, NOW)
    expect(r.excluded.some(e => e.comp.address === 'BAD')).toBe(true)
  })

  it('drops a non-comparable comp out of the reconciliation', () => {
    const junk = comp({ address: 'JUNK', sqft: 900, beds: 1, baths: 1, yearBuilt: 1955, condition: 1, soldPrice: 250_000 })
    const r = runCma(subject, [...comps, junk], market, NOW)
    expect(r.excluded.some(e => e.comp.address === 'JUNK')).toBe(true)
    // And it must not have dragged the value down with it.
    expect(r.indicatedValue).toBeGreaterThan(560_000)
  })

  it('reports low confidence on thin, scattered support', () => {
    const scattered = [
      comp({ address: 'X', soldPrice: 480_000, sqft: 1900, beds: 3, soldDate: '2026-01-10' }),
      comp({ address: 'Y', soldPrice: 720_000, sqft: 2900, condition: 5, soldDate: '2026-02-14' }),
    ]
    const thin = runCma(subject, scattered, market, NOW)
    const solid = runCma(subject, comps, market, NOW)
    expect(thin.confidence).toBeLessThan(solid.confidence)
    expect(thin.confidenceReasons.join(' ')).toMatch(/thin support|disagree/)
  })

  it('degrades gracefully with no usable comps', () => {
    const r = runCma(subject, [], market, NOW)
    expect(r.indicatedValue).toBe(0)
    expect(r.confidence).toBe(0)
    expect(r.confidenceReasons[0]).toMatch(/No usable comparable/)
  })

  it('estimates days on market from the comps when they have it', () => {
    const r = runCma(subject, comps, market, NOW)
    expect(r.estimatedDom).toBe(22) // median of 18, 26, 33, 12
  })

  it('falls back to the market median days on market', () => {
    const noDom = comps.map(c => ({ ...c, daysOnMarket: undefined }))
    const r = runCma(subject, noDom, market, NOW)
    expect(r.estimatedDom).toBe(24)
  })

  it('computes price per square foot off the subject, not the comps', () => {
    const r = runCma(subject, comps, market, NOW)
    expect(r.pricePerSqft).toBe(Math.round(r.indicatedValue / subject.sqft))
  })
})

describe('statistics helpers', () => {
  it('takes the median of an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('takes the median of an odd-length list', () => {
    expect(median([5, 1, 3])).toBe(3)
  })
  it('returns zero for an empty list rather than NaN', () => {
    expect(median([])).toBe(0)
    expect(stdev([])).toBe(0)
    expect(stdev([7])).toBe(0)
  })
  it('does not mutate its input', () => {
    const xs = [3, 1, 2]
    median(xs)
    expect(xs).toEqual([3, 1, 2])
  })
})
