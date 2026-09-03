import { describe, it, expect } from 'vitest'
import {
  canShowProperty, auditCompensation, auditListing, auditOutreach,
  scanFairHousing, copyIsPublishable, buildReport,
  type BuyerEngagement,
} from './compliance'

function engagement(over: Partial<BuyerEngagement> = {}): BuyerEngagement {
  return {
    clientName: 'Dana Reyes',
    agreementSigned: true,
    agreementSignedDate: '2026-08-01',
    agreementExpiresDate: '2026-12-31',
    agreedCompensationRate: 0.025,
    ...over,
  }
}

describe('canShowProperty — the settlement gate', () => {
  const ctx = { showingDate: '2026-09-10', propertyAddress: '12 Oak St' }

  it('allows a showing with a signed, in-force, specific agreement', () => {
    const g = canShowProperty({ ...ctx, engagement: engagement() })
    expect(g.allowed).toBe(true)
    expect(g.reasons).toEqual([])
  })

  it('blocks a showing with no signed agreement', () => {
    const g = canShowProperty({ ...ctx, engagement: engagement({ agreementSigned: false }) })
    expect(g.allowed).toBe(false)
    expect(g.reasons[0]).toMatch(/No signed buyer representation agreement/)
    const check = g.checks.find(c => c.id === 'buyer_rep_signed')!
    expect(check.severity).toBe('blocking')
    expect(check.status).toBe('fail')
    expect(check.authority).toMatch(/17 Aug 2024/)
  })

  it('blocks when the agreement is dated after the tour', () => {
    const g = canShowProperty({
      ...ctx,
      engagement: engagement({ agreementSignedDate: '2026-09-15' }),
    })
    expect(g.allowed).toBe(false)
    expect(g.reasons).toContain('Agreement is dated after the showing')
  })

  it('blocks on an expired agreement', () => {
    const g = canShowProperty({
      ...ctx,
      engagement: engagement({ agreementExpiresDate: '2026-08-31' }),
    })
    expect(g.allowed).toBe(false)
    expect(g.reasons).toContain('Buyer agreement has expired')
  })

  it('blocks an open-ended compensation term', () => {
    const g = canShowProperty({
      ...ctx,
      engagement: engagement({ compensationIsOpenEnded: true }),
    })
    expect(g.allowed).toBe(false)
    expect(g.checks.find(c => c.id === 'buyer_rep_objective_comp')!.status).toBe('fail')
  })

  it('blocks a signed agreement with no compensation amount recorded', () => {
    const g = canShowProperty({
      ...ctx,
      engagement: engagement({ agreedCompensationRate: undefined }),
    })
    expect(g.allowed).toBe(false)
    expect(g.reasons).toContain('No compensation amount recorded')
  })

  it('accepts a flat fee as a specific amount', () => {
    const g = canShowProperty({
      ...ctx,
      engagement: engagement({ agreedCompensationRate: undefined, agreedCompensationFlat: 9_500 }),
    })
    expect(g.allowed).toBe(true)
  })

  it('reports every failure at once rather than stopping at the first', () => {
    const g = canShowProperty({
      ...ctx,
      engagement: engagement({ agreementExpiresDate: '2026-01-01', compensationIsOpenEnded: true }),
    })
    expect(g.reasons.length).toBeGreaterThanOrEqual(2)
  })
})

describe('auditCompensation — the ceiling', () => {
  it('passes when the deal pays no more than the agreement', () => {
    const checks = auditCompensation({
      engagement: engagement(), salePrice: 600_000, compensationToBuyerBroker: 15_000,
    })
    expect(checks.find(c => c.id === 'comp_ceiling')!.status).toBe('pass')
  })

  it('fails when the seller offers more than the agreement allows', () => {
    const checks = auditCompensation({
      engagement: engagement(), salePrice: 600_000, compensationToBuyerBroker: 18_000,
    })
    const ceiling = checks.find(c => c.id === 'comp_ceiling')!
    expect(ceiling.status).toBe('fail')
    expect(ceiling.detail).toMatch(/3,000 over/)
    expect(ceiling.remedy).toMatch(/credit the excess to the buyer/)
  })

  it('tolerates sub-dollar rounding rather than calling it a violation', () => {
    const checks = auditCompensation({
      engagement: engagement(), salePrice: 600_000, compensationToBuyerBroker: 15_000.4,
    })
    expect(checks.find(c => c.id === 'comp_ceiling')!.status).toBe('pass')
  })

  it('warns the buyer owes the shortfall when the seller covers less', () => {
    const checks = auditCompensation({
      engagement: engagement(), salePrice: 600_000, compensationToBuyerBroker: 9_000,
    })
    const shortfall = checks.find(c => c.id === 'comp_shortfall')!
    expect(shortfall.status).toBe('attention')
    expect(shortfall.detail).toMatch(/6,000 difference/)
  })

  it('flags that it cannot check anything without an agreed amount', () => {
    const checks = auditCompensation({
      engagement: engagement({ agreedCompensationRate: undefined }),
      salePrice: 600_000, compensationToBuyerBroker: 15_000,
    })
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('attention')
  })
})

describe('auditListing', () => {
  const clean = {
    address: '88 Pine Ave',
    listingAgreementSigned: true,
    compensationPublishedInMls: false,
    sellerAuthorizedConcessions: true,
    brokerageNameInAdvertising: true,
    fairHousingStatementPresent: true,
    sellerDisclosureDelivered: true,
    yearBuilt: 1999,
  }

  it('clears a fully compliant listing', () => {
    const r = auditListing(clean)
    expect(r.clear).toBe(true)
    expect(r.score).toBe(100)
    expect(r.summary).toMatch(/fully compliant/)
  })

  it('blocks compensation published in the MLS', () => {
    const r = auditListing({ ...clean, compensationPublishedInMls: true })
    expect(r.clear).toBe(false)
    expect(r.blocking.map(c => c.id)).toContain('mls_compensation')
  })

  it('blocks a listing with no signed listing agreement', () => {
    const r = auditListing({ ...clean, listingAgreementSigned: false })
    expect(r.blocking.map(c => c.id)).toContain('listing_agreement')
  })

  it('requires the lead paint disclosure on a pre-1978 home', () => {
    const r = auditListing({ ...clean, yearBuilt: 1962, leadPaintDisclosureDelivered: false })
    const check = r.checks.find(c => c.id === 'lead_paint')!
    expect(check.status).toBe('fail')
    expect(check.authority).toMatch(/Lead-Based Paint/)
  })

  it('does not raise lead paint on a post-1978 home', () => {
    expect(auditListing(clean).checks.some(c => c.id === 'lead_paint')).toBe(false)
  })

  it('flags square footage materially adrift of the tax record', () => {
    const r = auditListing({ ...clean, advertisedSqft: 2_800, taxRecordSqft: 2_400 })
    const check = r.checks.find(c => c.id === 'sqft_accuracy')!
    expect(check.status).toBe('attention')
    expect(check.detail).toMatch(/17% apart/)
  })

  it('accepts square footage within the tolerance', () => {
    const r = auditListing({ ...clean, advertisedSqft: 2_450, taxRecordSqft: 2_400 })
    expect(r.checks.find(c => c.id === 'sqft_accuracy')!.status).toBe('pass')
  })

  it('scores a blocking failure far below a warning', () => {
    const blocking = auditListing({ ...clean, compensationPublishedInMls: true })
    const warning = auditListing({ ...clean, fairHousingStatementPresent: false })
    expect(blocking.score).toBeLessThan(warning.score)
    expect(warning.clear).toBe(true)
  })
})

describe('scanFairHousing', () => {
  it('catches an explicit familial-status exclusion', () => {
    const f = scanFairHousing('Quiet building, no children please.')
    expect(f).toHaveLength(1)
    expect(f[0].category).toBe('Familial status')
    expect(f[0].severity).toBe('critical')
  })

  it('catches coded steering language', () => {
    const f = scanFairHousing('A safe neighborhood with good schools nearby.')
    const cats = f.map(x => x.category)
    expect(cats).toContain('Steering')
    expect(f.some(x => x.severity === 'critical')).toBe(true)
  })

  it('catches racial or ethnic descriptions of an area', () => {
    const f = scanFairHousing('Located in a lovely integrated neighborhood.')
    expect(f[0].category).toBe('Race / national origin')
    expect(f[0].severity).toBe('critical')
  })

  it('grades contested terms as warnings rather than violations', () => {
    const f = scanFairHousing('Walking distance to the park.')
    expect(f).toHaveLength(1)
    expect(f[0].severity).toBe('warning')
  })

  it('treats master bedroom as an informational terminology note', () => {
    const f = scanFairHousing('Spacious master bedroom upstairs.')
    expect(f[0].severity).toBe('info')
    expect(f[0].suggestion).toMatch(/primary/)
  })

  it('returns findings in the order they appear in the copy', () => {
    const f = scanFairHousing('Great schools. Then: no children. And a master bedroom.')
    expect(f.map(x => x.index)).toEqual([...f.map(x => x.index)].sort((a, b) => a - b))
  })

  it('finds every occurrence, not just the first', () => {
    const f = scanFairHousing('no children. Also no kids. Really, no children.')
    expect(f.length).toBeGreaterThanOrEqual(3)
  })

  it('is case-insensitive', () => {
    expect(scanFairHousing('NO CHILDREN')).toHaveLength(1)
  })

  it('passes clean copy', () => {
    expect(scanFairHousing('Four bedrooms, a fenced yard, and a two-car garage. 0.3 miles from Lincoln Park.')).toEqual([])
  })

  it('does not carry regex state between calls', () => {
    const copy = 'no children'
    expect(scanFairHousing(copy)).toHaveLength(1)
    expect(scanFairHousing(copy)).toHaveLength(1)
    expect(scanFairHousing(copy)).toHaveLength(1)
  })
})

describe('copyIsPublishable', () => {
  it('blocks copy with a critical finding', () => {
    const r = copyIsPublishable('Perfect for singles, in an exclusive neighborhood.')
    expect(r.ok).toBe(false)
    expect(r.findings.length).toBeGreaterThan(0)
  })

  it('publishes copy whose only findings are advisory', () => {
    const r = copyIsPublishable('Large master bedroom, walking distance to the trail.')
    expect(r.ok).toBe(true)
    expect(r.findings.length).toBe(2)
  })
})

describe('auditOutreach', () => {
  it('blocks a call to a registered number with no relationship', () => {
    const checks = auditOutreach({
      channel: 'call', contactName: 'Sam', onDoNotCallRegistry: true,
    })
    expect(checks.find(c => c.id === 'dnc')!.status).toBe('fail')
  })

  it('allows the call when there is an existing business relationship', () => {
    const checks = auditOutreach({
      channel: 'call', contactName: 'Sam',
      onDoNotCallRegistry: true, existingBusinessRelationship: true,
    })
    expect(checks.find(c => c.id === 'dnc')!.status).toBe('pass')
  })

  it('requires written consent before texting', () => {
    const checks = auditOutreach({ channel: 'sms', contactName: 'Sam' })
    expect(checks.find(c => c.id === 'tcpa_sms')!.status).toBe('attention')
  })

  it('does not raise the SMS consent check once consent is on file', () => {
    const checks = auditOutreach({ channel: 'sms', contactName: 'Sam', hasWrittenConsent: true })
    expect(checks.some(c => c.id === 'tcpa_sms')).toBe(false)
  })

  it('blocks calls outside permitted hours', () => {
    expect(auditOutreach({ channel: 'call', contactName: 'Sam', localHour: 7 })
      .some(c => c.id === 'calling_hours')).toBe(true)
    expect(auditOutreach({ channel: 'call', contactName: 'Sam', localHour: 21 })
      .some(c => c.id === 'calling_hours')).toBe(true)
    expect(auditOutreach({ channel: 'call', contactName: 'Sam', localHour: 10 })
      .some(c => c.id === 'calling_hours')).toBe(false)
  })

  it('routes email to CAN-SPAM and stops there', () => {
    const checks = auditOutreach({ channel: 'email', contactName: 'Sam', onDoNotCallRegistry: true })
    expect(checks).toHaveLength(1)
    expect(checks[0].detail).toMatch(/CAN-SPAM/)
  })
})

describe('buildReport', () => {
  it('is clear when only warnings are outstanding', () => {
    const r = buildReport([
      { id: 'a', rule: 'r', severity: 'warning', status: 'attention', detail: 'd' },
    ], 'the file')
    expect(r.clear).toBe(true)
    expect(r.summary).toMatch(/clear to proceed with 1 item/)
  })

  it('never scores below zero however much is broken', () => {
    const checks = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, rule: 'r', severity: 'blocking' as const, status: 'fail' as const, detail: 'd',
    }))
    expect(buildReport(checks, 'x').score).toBe(0)
  })
})
