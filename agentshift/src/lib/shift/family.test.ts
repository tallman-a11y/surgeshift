import { describe, it, expect, afterEach } from 'vitest'
import { HANDOFF_TYPES, FAMILY_PRODUCTS, familyBusIsShared, PRODUCT } from './family'

const saved = { ...process.env }
afterEach(() => { process.env = { ...saved } })

describe('family wiring', () => {
  it('identifies itself as agentshift', () => {
    expect(PRODUCT).toBe('agentshift')
  })

  it('never targets itself with a handoff', () => {
    for (const spec of Object.values(HANDOFF_TYPES)) {
      expect(spec.target).not.toBe(PRODUCT)
    }
  })

  it('only targets products the family knows about', () => {
    for (const spec of Object.values(HANDOFF_TYPES)) {
      expect(FAMILY_PRODUCTS).toContain(spec.target)
    }
  })

  it('describes every handoff in the receiving product’s terms', () => {
    for (const [kind, spec] of Object.entries(HANDOFF_TYPES)) {
      expect(spec.what.length, `${kind} needs a description`).toBeGreaterThan(20)
    }
  })

  it('routes financing to LendShift and marketing to SurgeShift', () => {
    expect(HANDOFF_TYPES.lender_referral.target).toBe('lendshift')
    expect(HANDOFF_TYPES.listing_live.target).toBe('surgeshift')
    expect(HANDOFF_TYPES.seller_lead.target).toBe('surgeshift')
  })
})

describe('familyBusIsShared', () => {
  it('is false when the shared project is not configured', () => {
    delete process.env.SHIFT_FAMILY_SUPABASE_URL
    delete process.env.SHIFT_FAMILY_SUPABASE_SERVICE_KEY
    expect(familyBusIsShared()).toBe(false)
  })

  it('needs both halves before it claims to be shared', () => {
    process.env.SHIFT_FAMILY_SUPABASE_URL = 'https://family.supabase.co'
    delete process.env.SHIFT_FAMILY_SUPABASE_SERVICE_KEY
    expect(familyBusIsShared()).toBe(false)

    process.env.SHIFT_FAMILY_SUPABASE_SERVICE_KEY = 'key'
    expect(familyBusIsShared()).toBe(true)
  })
})
