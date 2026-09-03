import { describe, it, expect } from 'vitest'
import { scoreSphereContact, dailySphereCalls, type SphereContact } from './sphere'

const NOW = new Date('2026-09-03T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10)

function contact(over: Partial<SphereContact> = {}): SphereContact {
  return { id: '1', name: 'Marta Hendersen', tier: 'warm', lastTouchedAt: daysAgo(30), ...over }
}

describe('scoreSphereContact', () => {
  it('scores a recently touched, unremarkable contact near zero', () => {
    const s = scoreSphereContact(contact({ tier: 'cool', lastTouchedAt: daysAgo(5) }), NOW)
    expect(s.score).toBeLessThan(10)
    expect(s.overdue).toBe(false)
  })

  it('raises an overdue contact and says by how much', () => {
    const s = scoreSphereContact(contact({ tier: 'strong', lastTouchedAt: daysAgo(200) }), NOW)
    expect(s.overdue).toBe(true)
    expect(s.reasons[0].why).toMatch(/200 days since last contact/)
  })

  it('holds an advocate to a tighter cadence than a cool contact', () => {
    const advocate = scoreSphereContact(contact({ tier: 'advocate', lastTouchedAt: daysAgo(70) }), NOW)
    const cool = scoreSphereContact(contact({ tier: 'cool', lastTouchedAt: daysAgo(70) }), NOW)
    expect(advocate.overdue).toBe(true)
    expect(cool.overdue).toBe(false)
    expect(advocate.score).toBeGreaterThan(cool.score)
  })

  it('surfaces a never-contacted person', () => {
    const s = scoreSphereContact(contact({ lastTouchedAt: undefined }), NOW)
    expect(s.daysSinceTouch).toBeNull()
    expect(s.overdue).toBe(true)
    expect(s.opener).toMatch(/never been contacted/)
  })

  it('saturates overdue-ness so 800 days is not eight times 100 days', () => {
    const a = scoreSphereContact(contact({ tier: 'warm', lastTouchedAt: daysAgo(400) }), NOW)
    const b = scoreSphereContact(contact({ tier: 'warm', lastTouchedAt: daysAgo(1200) }), NOW)
    expect(b.score - a.score).toBeLessThanOrEqual(2)
  })

  it('peaks the tenure signal around the typical move window', () => {
    const early = scoreSphereContact(contact({ homeAnniversary: daysAgo(365 * 2) }), NOW)
    const peak = scoreSphereContact(contact({ homeAnniversary: daysAgo(Math.round(365.25 * 12)) }), NOW)
    expect(peak.score).toBeGreaterThan(early.score)
    expect(peak.reasons.some(r => r.why.includes('years in the home'))).toBe(true)
    expect(early.reasons.some(r => r.why.includes('years in the home'))).toBe(false)
  })

  it('ignores tenure for someone who does not own', () => {
    const s = scoreSphereContact(contact({ homeAnniversary: daysAgo(365 * 12), homeowner: false }), NOW)
    expect(s.reasons.some(r => r.why.includes('years in the home'))).toBe(false)
  })

  it('weights a relocation above a new job', () => {
    const moving = scoreSphereContact(contact({ lifeEvents: [{ kind: 'relocation', date: daysAgo(10) }] }), NOW)
    const job = scoreSphereContact(contact({ lifeEvents: [{ kind: 'new_job', date: daysAgo(10) }] }), NOW)
    expect(moving.score).toBeGreaterThan(job.score)
  })

  it('decays a life event over the year and drops it after', () => {
    const recent = scoreSphereContact(contact({ lifeEvents: [{ kind: 'new_child', date: daysAgo(10) }] }), NOW)
    const older = scoreSphereContact(contact({ lifeEvents: [{ kind: 'new_child', date: daysAgo(300) }] }), NOW)
    const ancient = scoreSphereContact(contact({ lifeEvents: [{ kind: 'new_child', date: daysAgo(500) }] }), NOW)
    expect(recent.score).toBeGreaterThan(older.score)
    expect(ancient.reasons.some(r => r.why.includes('New child'))).toBe(false)
  })

  it('ignores an event dated in the future', () => {
    const future = new Date(NOW.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)
    const s = scoreSphereContact(contact({ lifeEvents: [{ kind: 'relocation', date: future }] }), NOW)
    expect(s.reasons.some(r => r.why.includes('Relocating'))).toBe(false)
  })

  it('computes equity and rewards a large cushion', () => {
    const s = scoreSphereContact(contact({ estimatedHomeValue: 700_000, estimatedMortgageBalance: 210_000 }), NOW)
    expect(s.equity).toBe(490_000)
    expect(s.reasons.some(r => r.why.includes('equity'))).toBe(true)
  })

  it('does not reward thin equity', () => {
    const s = scoreSphereContact(contact({ estimatedHomeValue: 700_000, estimatedMortgageBalance: 640_000 }), NOW)
    expect(s.equity).toBe(60_000)
    expect(s.reasons.some(r => r.why.includes('equity'))).toBe(false)
  })

  it('picks up an imminent home anniversary as an occasion', () => {
    const soon = new Date(NOW.getTime() + 5 * 86_400_000).toISOString().slice(0, 10)
    const anniversary = `2016-${soon.slice(5)}`
    const s = scoreSphereContact(contact({ homeAnniversary: anniversary }), NOW)
    expect(s.occasion?.label).toMatch(/home anniversary/)
    expect(s.opener).toMatch(/what their home is worth now versus what they paid/)
  })

  it('lets a birthday drive the opener when there is no anniversary', () => {
    const soon = new Date(NOW.getTime() + 3 * 86_400_000).toISOString().slice(0, 10)
    const s = scoreSphereContact(contact({ birthday: `1979-${soon.slice(5)}` }), NOW)
    expect(s.occasion?.label).toBe('Birthday')
    expect(s.opener).toMatch(/No business talk/)
  })

  it('handles a birthday with no year', () => {
    const soon = new Date(NOW.getTime() + 2 * 86_400_000).toISOString().slice(0, 10)
    const s = scoreSphereContact(contact({ birthday: `--${soon.slice(5)}` }), NOW)
    expect(s.occasion?.label).toBe('Birthday')
  })

  it('rolls an annual date to next year once it has passed', () => {
    // 1 January is long past on 3 September, so it must not read as imminent.
    const s = scoreSphereContact(contact({ birthday: '1979-01-01' }), NOW)
    expect(s.occasion).toBeUndefined()
  })

  it('credits referrals sent and repeat business', () => {
    const plain = scoreSphereContact(contact({ tier: 'strong' }), NOW)
    const advocate = scoreSphereContact(contact({ tier: 'strong', referralsSent: 3, transactionsClosed: 2 }), NOW)
    expect(advocate.score).toBeGreaterThan(plain.score)
    expect(advocate.opener).toMatch(/thank you specifically/)
  })

  it('zeroes an opted-out contact whatever else is true about them', () => {
    const s = scoreSphereContact(contact({
      optedOut: true, tier: 'advocate', lastTouchedAt: daysAgo(900),
      referralsSent: 5, lifeEvents: [{ kind: 'relocation', date: daysAgo(1) }],
    }), NOW)
    expect(s.score).toBe(0)
    expect(s.opener).toMatch(/do not contact/i)
  })

  it('orders reasons strongest first', () => {
    const s = scoreSphereContact(contact({
      tier: 'advocate', lastTouchedAt: daysAgo(400),
      lifeEvents: [{ kind: 'relocation', date: daysAgo(3) }],
      referralsSent: 2,
    }), NOW)
    const weights = s.reasons.map(r => r.weight)
    expect(weights).toEqual([...weights].sort((a, b) => b - a))
  })

  it('never exceeds 100', () => {
    const s = scoreSphereContact(contact({
      tier: 'advocate', lastTouchedAt: undefined, referralsSent: 9, transactionsClosed: 4,
      homeAnniversary: daysAgo(Math.round(365.25 * 12)),
      estimatedHomeValue: 900_000, estimatedMortgageBalance: 100_000,
      lifeEvents: [{ kind: 'relocation', date: daysAgo(1) }, { kind: 'retirement', date: daysAgo(2) }],
    }), NOW)
    expect(s.score).toBeLessThanOrEqual(100)
  })
})

describe('dailySphereCalls', () => {
  const people: SphereContact[] = [
    contact({ id: 'a', name: 'Quiet Cool', tier: 'cool', lastTouchedAt: daysAgo(3) }),
    contact({ id: 'b', name: 'Moving Soon', tier: 'strong', lastTouchedAt: daysAgo(120), lifeEvents: [{ kind: 'relocation', date: daysAgo(4) }] }),
    contact({ id: 'c', name: 'Long Tenure', tier: 'warm', lastTouchedAt: daysAgo(100), homeAnniversary: daysAgo(365 * 12) }),
    contact({ id: 'd', name: 'Opted Out', tier: 'advocate', optedOut: true, lastTouchedAt: daysAgo(900) }),
  ]

  it('ranks the strongest reason first', () => {
    expect(dailySphereCalls(people, 10, NOW)[0].contact.id).toBe('b')
  })

  it('never lists an opted-out contact', () => {
    expect(dailySphereCalls(people, 10, NOW).map(s => s.contact.id)).not.toContain('d')
  })

  it('respects the limit', () => {
    expect(dailySphereCalls(people, 2, NOW)).toHaveLength(2)
  })

  it('gives every call a specific opener', () => {
    for (const s of dailySphereCalls(people, 10, NOW)) {
      expect(s.opener.length).toBeGreaterThan(20)
      expect(s.opener).toContain(s.contact.name.split(' ')[0])
    }
  })

  it('is empty-safe', () => {
    expect(dailySphereCalls([], 5, NOW)).toEqual([])
  })
})
