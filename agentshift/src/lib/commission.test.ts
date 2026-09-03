import { describe, it, expect } from 'vitest'
import {
  calculateCommission, grossCommission, runYear, forecastPipeline,
  EMPTY_YTD, STAGE_PROBABILITY, type CommissionPlan, type PipelineDeal,
} from './commission'

const plan: CommissionPlan = {
  splitToAgent: 0.70,
  annualCap: 18_000,
  royaltyRate: 0.06,
  royaltyCap: 3_000,
  transactionFee: 295,
  eoFee: 60,
}

const deal = { salePrice: 500_000, sideRate: 0.025 } // $12,500 gross

describe('grossCommission', () => {
  it('takes the side rate off the sale price', () => {
    expect(grossCommission(deal)).toBe(12_500)
  })
  it('doubles for dual agency', () => {
    expect(grossCommission({ ...deal, dualAgency: true })).toBe(25_000)
  })
  it('prefers a flat commission over the rate', () => {
    expect(grossCommission({ ...deal, flatCommission: 6_000 })).toBe(6_000)
  })
})

describe('calculateCommission', () => {
  it('applies referral, royalty, split and fees in that order', () => {
    const b = calculateCommission({ ...deal, referralRate: 0.25 }, plan)
    expect(b.grossCommission).toBe(12_500)
    expect(b.referralFee).toBe(3_125)              // 25% off the top
    expect(b.royaltyFee).toBe(562.50)              // 6% of what's left
    expect(b.splittable).toBe(8_812.50)
    expect(b.companyDollar).toBe(2_643.75)         // 30% of splittable
    expect(b.transactionFees).toBe(355)
    expect(b.agentNet).toBe(8_812.50 - 2_643.75 - 355)
  })

  it('takes the referral before the royalty, not after', () => {
    const withReferral = calculateCommission({ ...deal, referralRate: 0.25 }, plan)
    // 6% of the post-referral 9,375 is 562.50; 6% of the full 12,500 would be 750.
    expect(withReferral.royaltyFee).toBe(562.50)
  })

  it('measures the cap in company dollar, not gross commission', () => {
    const b = calculateCommission(deal, plan)
    expect(b.companyDollar).toBe(3_525) // 30% of 11,750
    expect(b.ytd.companyDollarPaid).toBe(3_525)
    expect(b.capRemaining).toBe(18_000 - 3_525)
  })

  it('lets a single deal straddle the cap', () => {
    const nearlyCapped = { ...EMPTY_YTD, companyDollarPaid: 17_000 }
    const b = calculateCommission(deal, plan, nearlyCapped)
    expect(b.companyDollar).toBe(1_000)      // only the room that was left
    expect(b.cappedOnThisDeal).toBe(true)
    expect(b.capRemaining).toBe(0)
  })

  it('pays one hundred percent once capped, minus the flat fees', () => {
    const capped = { ...EMPTY_YTD, companyDollarPaid: 18_000, royaltyPaid: 3_000 }
    const b = calculateCommission(deal, plan, capped)
    expect(b.companyDollar).toBe(0)
    expect(b.royaltyFee).toBe(0)
    expect(b.agentNet).toBe(12_500 - 355)
  })

  it('honours the royalty cap independently of the split cap', () => {
    const b = calculateCommission(deal, plan, { ...EMPTY_YTD, royaltyPaid: 2_800 })
    expect(b.royaltyFee).toBe(200)
    expect(b.ytd.royaltyPaid).toBe(3_000)
  })

  it('applies the team split only to what reaches the agent', () => {
    const solo = calculateCommission(deal, plan)
    const onTeam = calculateCommission(deal, { ...plan, teamSplitToAgent: 0.6 })
    expect(onTeam.teamFee).toBeCloseTo((solo.agentNet) * 0.4, 2)
    expect(onTeam.agentNet).toBeCloseTo(solo.agentNet * 0.6, 2)
  })

  it('does not charge a team split on a negative balance', () => {
    const tiny = calculateCommission({ salePrice: 1_000, sideRate: 0.01 }, { ...plan, teamSplitToAgent: 0.6 })
    expect(tiny.agentNet).toBeLessThan(0)
    expect(tiny.teamFee).toBe(0)
  })

  it('runs without a cap at all', () => {
    const b = calculateCommission(deal, { splitToAgent: 0.8 })
    expect(b.companyDollar).toBe(2_500)
    expect(b.cappedOnThisDeal).toBe(false)
    expect(b.capRemaining).toBe(0)
  })

  it('counts two sides for a dual-agency deal', () => {
    const b = calculateCommission({ ...deal, dualAgency: true }, plan)
    expect(b.ytd.closedSides).toBe(2)
  })
})

describe('runYear', () => {
  it('carries the cap forward so later deals pay less', () => {
    const deals = Array.from({ length: 8 }, () => deal)
    const { breakdowns, ytd } = runYear(deals, plan)
    expect(ytd.companyDollarPaid).toBe(18_000)
    expect(breakdowns.at(-1)!.agentNet).toBeGreaterThan(breakdowns[0].agentNet)
    expect(breakdowns.filter(b => b.cappedOnThisDeal)).toHaveLength(1)
  })

  it('never charges more company dollar than the cap across a whole year', () => {
    const { ytd } = runYear(Array.from({ length: 30 }, () => deal), plan)
    expect(ytd.companyDollarPaid).toBe(18_000)
    expect(ytd.royaltyPaid).toBe(3_000)
    expect(ytd.closedSides).toBe(30)
  })

  it('is empty-safe', () => {
    expect(runYear([], plan).ytd).toEqual(EMPTY_YTD)
  })
})

describe('forecastPipeline', () => {
  const pipeline: PipelineDeal[] = [
    { id: '1', label: '12 Oak — under contract', stage: 'under_contract', salePrice: 600_000, sideRate: 0.025, expectedCloseDate: '2026-10-15' },
    { id: '2', label: '88 Pine — clear to close', stage: 'clear_to_close', salePrice: 450_000, sideRate: 0.025, expectedCloseDate: '2026-09-20' },
    { id: '3', label: 'Reyes buyers', stage: 'active_buyer', salePrice: 700_000, sideRate: 0.025, expectedCloseDate: '2026-11-30' },
    { id: '4', label: 'Cold lead', stage: 'lead', salePrice: 500_000, sideRate: 0.025, expectedCloseDate: '2026-12-15' },
  ]

  it('weights every deal by its stage probability', () => {
    const f = forecastPipeline(pipeline, plan)
    const lead = f.deals.find(d => d.id === '4')!
    expect(lead.probability).toBe(STAGE_PROBABILITY.lead)
    expect(lead.weightedAgentNet).toBeCloseTo(lead.expectedAgentNet * 0.08, 2)
  })

  it('puts expected between committed and best case', () => {
    const f = forecastPipeline(pipeline, plan)
    expect(f.committed).toBeLessThan(f.expected)
    expect(f.expected).toBeLessThan(f.bestCase)
  })

  it('counts only post-contingency deals as committed', () => {
    const f = forecastPipeline(pipeline, plan)
    const clearToClose = f.deals.find(d => d.id === '2')!
    expect(f.committed).toBeCloseTo(clearToClose.weightedAgentNet, 2)
  })

  it('honours a probability override', () => {
    const f = forecastPipeline(
      [{ ...pipeline[3], probabilityOverride: 0.9 }], plan,
    )
    expect(f.deals[0].probability).toBe(0.9)
  })

  it('buckets by expected close month in order', () => {
    const f = forecastPipeline(pipeline, plan)
    expect(f.byMonth.map(m => m.month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12'])
    expect(f.byMonth[0].committed).toBeGreaterThan(0)
    expect(f.byMonth.at(-1)!.committed).toBe(0)
  })

  it('runs deals in close-date order regardless of input order', () => {
    const shuffled = [pipeline[3], pipeline[1], pipeline[2], pipeline[0]]
    expect(forecastPipeline(shuffled, plan).deals.map(d => d.id))
      .toEqual(['2', '1', '3', '4'])
  })

  it('advances the cap by expected value, not full value', () => {
    // A pipeline of pure long-shots should barely move an agent toward capping,
    // so the last deal still pays a full split rather than showing up as capped.
    const longShots: PipelineDeal[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i), label: `lead ${i}`, stage: 'lead' as const,
      salePrice: 600_000, sideRate: 0.025, expectedCloseDate: `2026-1${i}-01`.slice(0, 10),
    }))
    const f = forecastPipeline(longShots, plan)
    const nets = f.deals.map(d => d.expectedAgentNet)
    expect(new Set(nets).size).toBe(1)
  })

  it('is empty-safe', () => {
    const f = forecastPipeline([], plan)
    expect(f.expected).toBe(0)
    expect(f.byMonth).toEqual([])
  })
})
