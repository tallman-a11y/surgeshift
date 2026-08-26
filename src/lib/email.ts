/**
 * Outbound email for SurgeShift.
 *
 * surgeshiftai.com is not a verified Resend domain, so mail sends from a verified
 * family domain while keeping "SurgeShift" as the display name — the same fallback
 * the rest of the Shift family uses. Verifying surgeshiftai.com in Resend is the
 * only thing needed to make the address match the name.
 */

const VERIFIED_FALLBACK = 'SurgeShift <surgeshift@realshiftapp.com>'

export type SendResult = { ok: true; id: string } | { ok: false; error: string }

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.SURGESHIFT_MAIL_FROM || VERIFIED_FALLBACK,
      to: [opts.to],
      reply_to: opts.replyTo ?? 't.allman@allshiftai.com',
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  })

  const body = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string }
  if (!res.ok || !body.id) {
    return { ok: false, error: body.message ?? body.name ?? `Resend HTTP ${res.status}` }
  }
  return { ok: true, id: body.id }
}
