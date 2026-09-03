/**
 * Cross-product referral pipe (inbound).
 *
 * A sibling Shift product hands a person to AgentShift — LendShift sending a borrower
 * who now needs an agent, RealShift sending a buyer off a deal. We materialise them as
 * a contact in the receiving agent's CRM, ready for lead triage.
 *
 * Wire-compatible with RealShift's `/api/partner/referral` so the family speaks one
 * protocol: same `PARTNER_SECRET`, same two auth modes, same field names. The body is
 * read raw once so it can be both HMAC-verified and parsed — verifying a re-serialised
 * body would fail on key order.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyPartner } from '@/lib/shift/partner'
import { hasLocalSupabase } from '@/lib/shift/family'

export const runtime = 'nodejs'

/** Resolve the agent this referral belongs to. */
async function findAgentId(
  supabase: ReturnType<typeof createServiceClient>,
  email: string | null,
): Promise<string | null> {
  if (!email) return null
  const { data } = await supabase
    .from('agents')
    .select('id')
    .ilike('email', email.trim())
    .limit(1)
    .maybeSingle()
  return data ? (data as { id: string }).id : null
}

export async function POST(req: Request) {
  const secret = process.env.PARTNER_SECRET
  if (!secret) {
    console.error('partner referral: PARTNER_SECRET not configured')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await req.text()
  if (!verifyPartner(req.headers, rawBody, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // `borrower_name` is the family's field name; accept the friendlier aliases too so a
  // sender does not have to know AgentShift calls them a buyer.
  const name = String(
    body.borrower_name ?? body.buyer_name ?? body.contact_name ?? '',
  ).trim()
  const email = body.email ? String(body.email).trim() : null
  const phone = body.phone ? String(body.phone).trim() : null

  if (!name || (!email && !phone)) {
    return NextResponse.json(
      { error: 'borrower_name and at least one of email/phone are required' },
      { status: 400 },
    )
  }

  if (!hasLocalSupabase()) {
    return NextResponse.json({ error: 'Referral inbox not configured' }, { status: 503 })
  }
  const supabase = createServiceClient()

  const sourceProduct = String(body.source_product ?? 'partner')
  const referringPerson = body.referring_lo ?? body.referring_agent
  const referredBy = referringPerson ? String(referringPerson) : null

  const assignedEmail = body.assigned_agent_email ? String(body.assigned_agent_email) : null
  const agentId =
    (await findAgentId(supabase, assignedEmail)) ??
    (await findAgentId(supabase, process.env.PARTNER_REFERRAL_OWNER_EMAIL ?? null))

  if (!agentId) {
    console.error('partner referral: no receiving agent found')
    return NextResponse.json({ error: 'No receiving agent configured' }, { status: 503 })
  }

  const city = body.city ? String(body.city) : null
  const state = body.state ? String(body.state) : null
  const budget = body.loan_amount != null ? Number(body.loan_amount) || null : null

  const notes = [
    `Referred in from ${sourceProduct}`,
    referredBy ? `by ${referredBy}` : null,
    body.property_address ? `Re: ${String(body.property_address)}` : null,
    budget ? `Budget ~$${budget.toLocaleString()}` : null,
    body.loan_type ? `Financing: ${String(body.loan_type)}` : null,
    body.notes ? String(body.notes) : null,
  ].filter(Boolean).join(' · ')

  // An inbound referral is a warm introduction, not a cold lead: the sibling product
  // already has a relationship. It lands pre-approved-aware and consented, because
  // the referring product captured consent before handing them over.
  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      agent_id: agentId,
      full_name: name,
      email,
      phone,
      role: 'lead',
      tier: 'warm',
      source: sourceProduct,
      tags: [sourceProduct, 'referral'],
      city,
      state,
      budget_max: budget,
      pre_approved: body.pre_approved === true || sourceProduct === 'lendshift',
      lender_introduced: sourceProduct === 'lendshift',
      timeline_months: body.timeline_months != null ? Number(body.timeline_months) || null : null,
      contact_consent: body.contact_consent === true,
      notes,
    })
    .select('id')
    .single()

  if (error || !contact) {
    console.error('partner referral insert error:', error)
    return NextResponse.json({ error: 'Failed to create referral' }, { status: 500 })
  }

  const contactId = (contact as { id: string }).id

  // Trail is best-effort — never fail a referral over its own audit line.
  try {
    await supabase.from('contact_events').insert({
      agent_id: agentId,
      contact_id: contactId,
      kind: 'note',
      direction: 'inbound',
      by_shift: true,
      subject: `Referral from ${sourceProduct}`,
      body: notes,
    })
  } catch (err) {
    console.error('partner referral trail failed:', err)
  }

  return NextResponse.json({ ok: true, contact_id: contactId })
}
