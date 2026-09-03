import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The family's cross-product referral pipe.
 *
 * This is the protocol RealShift and LendShift already speak to each other over —
 * a signed HTTP POST to `/api/partner/referral` on the receiving product. It predates
 * `@allshift/core`'s ContextGraph and, unlike that interface, it is actually shipped
 * and carrying traffic. AgentShift speaks it so a handoff reaches a real inbox today
 * rather than only queueing on the bus.
 *
 * Auth, strongest first (mirrors RealShift's implementation exactly):
 *   1. `x-partner-signature: sha256=<hex>` — HMAC-SHA256(PARTNER_SECRET, rawBody)
 *   2. `x-partner-secret: <PARTNER_SECRET>`
 *
 * Both comparisons are constant-time. A referral carries a real person's name, email
 * and phone, so an unauthenticated write here would be a data-injection hole, and a
 * naive `===` on the shared secret would leak it a byte at a time under timing analysis.
 */

/** Constant-time string compare that tolerates length mismatch without throwing. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // timingSafeEqual throws on differing lengths, so the length check has to come
  // first. It leaks only the length, which the header format already reveals.
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function signBody(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

/** Verify an inbound partner request. Returns false for anything unproven. */
export function verifyPartner(
  headers: { get(name: string): string | null },
  rawBody: string,
  secret: string,
): boolean {
  if (!secret) return false

  const sig = headers.get('x-partner-signature')
  if (sig) {
    const provided = sig.replace(/^sha256=/i, '')
    return safeEqual(provided, signBody(secret, rawBody))
  }

  const shared = headers.get('x-partner-secret')
  if (shared) return safeEqual(shared, secret)

  return false
}

/** Where each sibling product receives referrals. Overridable per environment. */
export function partnerReferralUrl(product: string): string | null {
  const explicit = {
    realshift: process.env.REALSHIFT_REFERRAL_URL,
    lendshift: process.env.LENDSHIFT_REFERRAL_URL,
    surgeshift: process.env.SURGESHIFT_REFERRAL_URL,
  }[product]
  if (explicit) return explicit

  const defaults: Record<string, string> = {
    realshift: 'https://realshiftai.com/api/partner/referral',
    lendshift: 'https://lendshiftai.com/api/partner/referral',
  }
  return defaults[product] ?? null
}

export type OutboundReferral = {
  /** The person being referred. The field is named for the receiving side's schema. */
  borrower_name: string
  email?: string | null
  phone?: string | null
  city?: string | null
  state?: string | null
  property_address?: string | null
  loan_amount?: number | null
  loan_type?: string | null
  notes?: string | null
  /** Route to a specific person on the receiving side when known. */
  assigned_agent_email?: string | null
  assigned_lender_email?: string | null
  referring_agent?: string | null
}

export type ReferralResult =
  | { sent: true; product: string; response: unknown }
  | { sent: false; product: string; reason: string }

/**
 * Send a referral to a sibling product, signed.
 *
 * Never throws: a handoff that cannot be delivered has to come back as a reportable
 * refusal so the agent is told plainly, rather than an exception that reads to the
 * model as "it worked".
 */
export async function sendPartnerReferral(
  product: string,
  payload: OutboundReferral,
  opts: { timeoutMs?: number } = {},
): Promise<ReferralResult> {
  const secret = process.env.PARTNER_SECRET
  if (!secret) {
    return { sent: false, product, reason: 'PARTNER_SECRET is not configured in this environment.' }
  }

  const url = partnerReferralUrl(product)
  if (!url) {
    return { sent: false, product, reason: `No referral endpoint known for ${product}.` }
  }

  const rawBody = JSON.stringify({ ...payload, source_product: 'agentshift' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Prefer the signature: it proves the body was not altered in transit, where
        // the shared-secret header only proves the sender knows the secret.
        'x-partner-signature': `sha256=${signBody(secret, rawBody)}`,
        'x-partner-secret': secret,
      },
      body: rawBody,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        sent: false, product,
        reason: `${product} rejected the referral (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}.`,
      }
    }

    return { sent: true, product, response: await res.json().catch(() => null) }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      sent: false, product,
      reason: aborted ? `${product} did not respond in time.` : `Could not reach ${product}.`,
    }
  } finally {
    clearTimeout(timer)
  }
}
