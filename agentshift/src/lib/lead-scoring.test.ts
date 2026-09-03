import { describe, it, expect } from 'vitest'
import { scoreLead, contactProbability, triageQueue, type LeadIntent } from './lead-scoring'

const NOW = new Date('2026-09-03T12:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

function lead(over: Partial<LeadIntent> = {}): LeadIntent {
  return { source: 'portal', createdAt: minutesAgo(2), ...over }
}

describe('contactProbability', () => {
  it('falls off sharply within the first half hour', () => {
    expect(contactProbability(1)).toBeGreaterThan(0.85)
    expect(contactProbability(30)).toBeLessThan(0.5)
    expect(contactProbability(30)).toBeGreaterThan(contactProbability(60))
  })
  it('decreases monotonically', () => {
    const ages = [0, 1, 5, 10, 30, 60, 240, 1440, 4320, 20000]
    const ps = ages.map(contactProbability)
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeLessThanOrEqual(ps[i - 1])
  })
})

describe('scoreLead — quality', () => {
  it('rates a pre-approved referral with a short timeline an A', () => {
    const s = scoreLead(lead({ source: 'referral', preApproved: true, timelineMonths: 1, inboundReplies: 2 }), NOW)
    expect(s.grade).toBe('A')
    expect(s.score).toBeGreaterThan(78)
  })

  it('rates a cold paid-ad lead with a long horizon a D', () => {
    const s = scoreLead(lead({ source: 'paid_ad', timelineMonths: 18 }), NOW)
    expect(s.grade).toBe('D')
  })

  it('penalises a lead already working with another agent', () => {
    const free = scoreLead(lead({ source: 'referral', preApproved: true }), NOW)
    const taken = scoreLead(lead({ source: 'referral', preApproved: true, hasAgent: true }), NOW)
    expect(taken.score).toBeLessThan(free.score - 15)
    expect(taken.reasons).toContain('Already working with another agent')
  })

  it('does not penalise having an agent when that agent is you', () => {
    const taken = scoreLead(lead({ source: 'referral', hasAgent: true, buyerAgreementSigned: true }), NOW)
    expect(taken.reasons).not.toContain('Already working with another agent')
  })

  it('treats a signed buyer agreement as the strongest commitment signal', () => {
    const without = scoreLead(lead({ source: 'website' }), NOW)
    const with_ = scoreLead(lead({ source: 'website', buyerAgreementSigned: true }), NOW)
    expect(with_.score - without.score).toBeGreaterThanOrEqual(16)
  })

  it('rewards pre-approval over a mere lender introduction', () => {
    const none = scoreLead(lead(), NOW)
    const intro = scoreLead(lead({ lenderIntroduced: true }), NOW)
    const approved = scoreLead(lead({ preApproved: true }), NOW)
    expect(none.score).toBeLessThan(intro.score)
    expect(intro.score).toBeLessThan(approved.score)
  })

  it('rewards two-way conversation above passive browsing', () => {
    const browsing = scoreLead(lead({ propertyViews: 25 }), NOW)
    const talking = scoreLead(lead({ inboundReplies: 2 }), NOW)
    expect(talking.score).toBeGreaterThan(browsing.score)
  })

  it('penalises a budget well below the local median', () => {
    const ok = scoreLead(lead({ budgetKnown: true, budgetVsMedian: 1.1 }), NOW)
    const low = scoreLead(lead({ budgetKnown: true, budgetVsMedian: 0.4 }), NOW)
    expect(low.score).toBeLessThan(ok.score)
    expect(low.reasons.join(' ')).toMatch(/under the local median/)
  })

  it('clamps into 0-100', () => {
    const best = scoreLead(lead({
      source: 'past_client', timelineMonths: 1, preApproved: true, buyerAgreementSigned: true,
      inboundReplies: 5, specificPropertiesAsked: 4, propertyViews: 60, savedSearches: 3,
      budgetKnown: true, hasHomeToSell: true,
    }), NOW)
    const worst = scoreLead(lead({
      source: 'unknown', timelineMonths: 36, hasAgent: true, budgetKnown: true, budgetVsMedian: 0.2,
    }), NOW)
    expect(best.score).toBeLessThanOrEqual(100)
    expect(worst.score).toBeGreaterThanOrEqual(0)
  })
})

describe('scoreLead — urgency', () => {
  it('makes a brand new unworked lead maximally urgent', () => {
    expect(scoreLead(lead({ createdAt: minutesAgo(1) }), NOW).urgency).toBeGreaterThan(90)
  })

  it('decays urgency for an unworked lead as it ages', () => {
    const fresh = scoreLead(lead({ createdAt: minutesAgo(1) }), NOW)
    const old = scoreLead(lead({ createdAt: minutesAgo(60 * 6) }), NOW)
    expect(old.urgency).toBeLessThan(fresh.urgency)
  })

  it('drops urgency sharply once the lead has been worked', () => {
    const unworked = scoreLead(lead({ createdAt: minutesAgo(120) }), NOW)
    const worked = scoreLead(lead({
      createdAt: minutesAgo(120), contactAttempts: 1, lastContactedAt: minutesAgo(30),
    }), NOW)
    expect(worked.urgency).toBeLessThan(unworked.urgency)
  })

  it('lifts urgency back up as time passes since the last contact', () => {
    const justCalled = scoreLead(lead({ contactAttempts: 1, lastContactedAt: minutesAgo(30) }), NOW)
    const stale = scoreLead(lead({ contactAttempts: 1, lastContactedAt: minutesAgo(60 * 40) }), NOW)
    expect(stale.urgency).toBeGreaterThan(justCalled.urgency)
  })

  it('lets a great lead outrank an average one of the same age', () => {
    const great = scoreLead(lead({ source: 'referral', preApproved: true, timelineMonths: 1, contactAttempts: 1, lastContactedAt: minutesAgo(600) }), NOW)
    const average = scoreLead(lead({ source: 'paid_ad', timelineMonths: 12, contactAttempts: 1, lastContactedAt: minutesAgo(600) }), NOW)
    expect(great.urgency).toBeGreaterThan(average.urgency)
  })
})

describe('scoreLead — next action', () => {
  it('says call now on a fresh untouched lead', () => {
    expect(scoreLead(lead({ createdAt: minutesAgo(2) }), NOW).nextAction).toMatch(/Call now/)
  })

  it('names the delay when nobody has tried in hours', () => {
    const s = scoreLead(lead({ createdAt: minutesAgo(60 * 5) }), NOW)
    expect(s.nextAction).toMatch(/5 hours/)
  })

  it('sends a strong lead to a lender when there is no financing', () => {
    const s = scoreLead(lead({
      source: 'referral', timelineMonths: 2, inboundReplies: 2,
      contactAttempts: 2, lastContactedAt: minutesAgo(60),
    }), NOW)
    expect(s.nextAction).toMatch(/lender/i)
  })

  it('pushes for the buyer agreement once they are pre-approved', () => {
    const s = scoreLead(lead({
      source: 'referral', preApproved: true, contactAttempts: 2, lastContactedAt: minutesAgo(60),
    }), NOW)
    expect(s.nextAction).toMatch(/buyer representation agreement/)
  })

  it('routes a lead with another agent to nurture, not to a chase', () => {
    const s = scoreLead(lead({ hasAgent: true, contactAttempts: 1, lastContactedAt: minutesAgo(60) }), NOW)
    expect(s.nextAction).toMatch(/nurture/)
  })
})

describe('triageQueue', () => {
  it('orders by urgency, not by quality', () => {
    const q = triageQueue([
      { id: 'a', name: 'Old but excellent', ...lead({ source: 'referral', preApproved: true, timelineMonths: 1, contactAttempts: 3, lastContactedAt: minutesAgo(60) }) },
      { id: 'b', name: 'Brand new average', ...lead({ source: 'portal', createdAt: minutesAgo(1) }) },
    ], NOW)
    expect(q[0].id).toBe('b')
    expect(q[0].score).toBeLessThan(q[1].score)
  })

  it('is empty-safe', () => {
    expect(triageQueue([], NOW)).toEqual([])
  })

  it('carries the identity through', () => {
    const q = triageQueue([{ id: 'x', name: 'Dana', ...lead() }], NOW)
    expect(q[0]).toMatchObject({ id: 'x', name: 'Dana' })
  })
})
