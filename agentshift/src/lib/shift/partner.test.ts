import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  safeEqual, signBody, verifyPartner, partnerReferralUrl, sendPartnerReferral,
} from './partner'

const SECRET = 'sh_partner_secret_value'
const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
})

const saved = { ...process.env }
afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals() })

describe('safeEqual', () => {
  it('matches identical strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
  })
  it('rejects different strings of equal length', () => {
    expect(safeEqual('abc', 'abd')).toBe(false)
  })
  it('rejects mismatched lengths without throwing', () => {
    // timingSafeEqual throws on differing lengths; the guard must come first.
    expect(() => safeEqual('a', 'abcdef')).not.toThrow()
    expect(safeEqual('a', 'abcdef')).toBe(false)
  })
  it('handles empty strings', () => {
    expect(safeEqual('', '')).toBe(true)
    expect(safeEqual('', 'x')).toBe(false)
  })
})

describe('verifyPartner — HMAC mode', () => {
  const body = JSON.stringify({ borrower_name: 'Dana Reyes', email: 'dana@example.com' })

  it('accepts a correct signature', () => {
    const sig = `sha256=${signBody(SECRET, body)}`
    expect(verifyPartner(headers({ 'x-partner-signature': sig }), body, SECRET)).toBe(true)
  })

  it('accepts a signature without the sha256= prefix', () => {
    const sig = signBody(SECRET, body)
    expect(verifyPartner(headers({ 'x-partner-signature': sig }), body, SECRET)).toBe(true)
  })

  it('rejects a signature over a different body', () => {
    const sig = `sha256=${signBody(SECRET, body)}`
    const tampered = JSON.stringify({ borrower_name: 'Someone Else' })
    expect(verifyPartner(headers({ 'x-partner-signature': sig }), tampered, SECRET)).toBe(false)
  })

  it('rejects a signature made with the wrong secret', () => {
    const sig = `sha256=${signBody('wrong-secret', body)}`
    expect(verifyPartner(headers({ 'x-partner-signature': sig }), body, SECRET)).toBe(false)
  })

  it('rejects a truncated signature without throwing', () => {
    const sig = `sha256=${signBody(SECRET, body).slice(0, 10)}`
    expect(() => verifyPartner(headers({ 'x-partner-signature': sig }), body, SECRET)).not.toThrow()
    expect(verifyPartner(headers({ 'x-partner-signature': sig }), body, SECRET)).toBe(false)
  })

  it('is byte-exact: whitespace changes invalidate it', () => {
    const sig = `sha256=${signBody(SECRET, body)}`
    expect(verifyPartner(headers({ 'x-partner-signature': sig }), body + ' ', SECRET)).toBe(false)
  })

  it('prefers the signature when both headers are present, and rejects a bad one', () => {
    // A valid shared secret must not rescue a forged signature.
    const forged = `sha256=${signBody('wrong', body)}`
    const h = headers({ 'x-partner-signature': forged, 'x-partner-secret': SECRET })
    expect(verifyPartner(h, body, SECRET)).toBe(false)
  })
})

describe('verifyPartner — shared secret mode', () => {
  it('accepts the exact secret', () => {
    expect(verifyPartner(headers({ 'x-partner-secret': SECRET }), 'body', SECRET)).toBe(true)
  })
  it('rejects a wrong secret', () => {
    expect(verifyPartner(headers({ 'x-partner-secret': 'nope' }), 'body', SECRET)).toBe(false)
  })
  it('rejects a prefix of the secret', () => {
    expect(verifyPartner(headers({ 'x-partner-secret': SECRET.slice(0, 8) }), 'body', SECRET)).toBe(false)
  })
})

describe('verifyPartner — refusals', () => {
  it('rejects a request with no auth header at all', () => {
    expect(verifyPartner(headers({}), 'body', SECRET)).toBe(false)
  })
  it('rejects when no secret is configured, even with headers present', () => {
    expect(verifyPartner(headers({ 'x-partner-secret': '' }), 'body', '')).toBe(false)
    expect(verifyPartner(headers({ 'x-partner-signature': 'sha256=x' }), 'body', '')).toBe(false)
  })
})

describe('partnerReferralUrl', () => {
  it('knows the family defaults', () => {
    delete process.env.LENDSHIFT_REFERRAL_URL
    delete process.env.REALSHIFT_REFERRAL_URL
    expect(partnerReferralUrl('lendshift')).toMatch(/lendshift.*\/api\/partner\/referral/)
    expect(partnerReferralUrl('realshift')).toMatch(/realshift.*\/api\/partner\/referral/)
  })
  it('lets the environment override a default', () => {
    process.env.LENDSHIFT_REFERRAL_URL = 'http://localhost:3001/api/partner/referral'
    expect(partnerReferralUrl('lendshift')).toBe('http://localhost:3001/api/partner/referral')
  })
  it('returns null for a product with no endpoint', () => {
    delete process.env.SURGESHIFT_REFERRAL_URL
    expect(partnerReferralUrl('surgeshift')).toBeNull()
    expect(partnerReferralUrl('nonesuch')).toBeNull()
  })
})

describe('sendPartnerReferral', () => {
  const payload = { borrower_name: 'Dana Reyes', email: 'dana@example.com' }

  it('refuses rather than throwing when no secret is configured', async () => {
    delete process.env.PARTNER_SECRET
    const r = await sendPartnerReferral('lendshift', payload)
    expect(r.sent).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/PARTNER_SECRET/)
  })

  it('refuses for a product with no endpoint', async () => {
    process.env.PARTNER_SECRET = SECRET
    delete process.env.SURGESHIFT_REFERRAL_URL
    const r = await sendPartnerReferral('surgeshift', payload)
    expect(r.sent).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/No referral endpoint/)
  })

  it('signs the exact body it sends and stamps the source product', async () => {
    process.env.PARTNER_SECRET = SECRET
    process.env.LENDSHIFT_REFERRAL_URL = 'https://lend.test/api/partner/referral'

    let seen: { url: string; init: RequestInit } | null = null
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen = { url, init }
      return { ok: true, json: async () => ({ ok: true, lead_id: 'L1' }) } as Response
    })

    const r = await sendPartnerReferral('lendshift', payload)

    expect(r.sent).toBe(true)
    expect(seen!.url).toBe('https://lend.test/api/partner/referral')

    const body = seen!.init.body as string
    expect(JSON.parse(body).source_product).toBe('agentshift')

    // The signature must verify against the bytes actually transmitted.
    const sig = (seen!.init.headers as Record<string, string>)['x-partner-signature']
    expect(sig).toBe(`sha256=${signBody(SECRET, body)}`)
  })

  it('reports the status when the far side rejects it', async () => {
    process.env.PARTNER_SECRET = SECRET
    process.env.LENDSHIFT_REFERRAL_URL = 'https://lend.test/api/partner/referral'
    vi.stubGlobal('fetch', async () => ({
      ok: false, status: 401, text: async () => 'Unauthorized',
    } as Response))

    const r = await sendPartnerReferral('lendshift', payload)
    expect(r.sent).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/HTTP 401/)
  })

  it('reports a network failure instead of throwing', async () => {
    process.env.PARTNER_SECRET = SECRET
    process.env.LENDSHIFT_REFERRAL_URL = 'https://lend.test/api/partner/referral'
    vi.stubGlobal('fetch', async () => { throw new Error('ECONNREFUSED') })

    const r = await sendPartnerReferral('lendshift', payload)
    expect(r.sent).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/Could not reach/)
  })
})

describe('round trip against the family protocol', () => {
  it('a body signed by the sender verifies on the receiver', async () => {
    process.env.PARTNER_SECRET = SECRET
    process.env.REALSHIFT_REFERRAL_URL = 'https://real.test/api/partner/referral'

    let transmitted: { body: string; sig: string } | null = null
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      transmitted = {
        body: init.body as string,
        sig: (init.headers as Record<string, string>)['x-partner-signature'],
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response
    })

    await sendPartnerReferral('realshift', { borrower_name: 'Dana Reyes', email: 'd@e.com' })

    // Exactly what RealShift's route does on receipt.
    expect(verifyPartner(
      headers({ 'x-partner-signature': transmitted!.sig }),
      transmitted!.body,
      SECRET,
    )).toBe(true)
  })
})
