/**
 * Lead scoring and speed-to-lead triage.
 *
 * Two separate questions get conflated constantly: *how good is this lead* and *how
 * fast do I have to move on it*. A referral from a past client with a 9-month timeline
 * is an excellent lead with no urgency. A portal inquiry that came in 90 seconds ago is
 * an average lead with enormous urgency, because contact rates collapse with delay —
 * the response window is measured in minutes, not hours, and the first agent to reach
 * a portal lead usually wins it.
 *
 * So the two are scored separately and the queue is ordered by urgency, not quality.
 */

import { clamp, round } from './money'

export type LeadSource =
  | 'referral' | 'past_client' | 'sphere' | 'open_house' | 'sign_call'
  | 'portal' | 'website' | 'social' | 'paid_ad' | 'farm_mailer'
  | 'expired' | 'fsbo' | 'unknown'

export type LeadIntent = {
  source: LeadSource
  /** How soon they say they want to transact, in months. */
  timelineMonths?: number
  preApproved?: boolean
  /** Talking to a lender but not yet approved. */
  lenderIntroduced?: boolean
  hasAgent?: boolean
  /** Signed buyer representation agreement — post-settlement, this is the real commitment signal. */
  buyerAgreementSigned?: boolean
  /** Listing-side: do they have a home that must sell first. */
  hasHomeToSell?: boolean
  propertyViews?: number
  savedSearches?: number
  /** Inbound replies from the lead. Two-way conversation beats any demographic signal. */
  inboundReplies?: number
  /** Specific addresses they asked about by name. */
  specificPropertiesAsked?: number
  budgetKnown?: boolean
  /** Their budget against local median — wildly unrealistic budgets are a real signal. */
  budgetVsMedian?: number
  /** ISO timestamp the lead first came in. */
  createdAt: string
  /** ISO timestamp of the last contact attempt, if any. */
  lastContactedAt?: string
  /** Attempts made so far. */
  contactAttempts?: number
}

export type LeadScore = {
  score: number // 0-100 — quality
  grade: 'A' | 'B' | 'C' | 'D'
  urgency: number // 0-100 — how fast to act
  /** Minutes since the lead arrived. */
  ageMinutes: number
  /** Plain-English drivers, best first. */
  reasons: string[]
  /** The single next action. */
  nextAction: string
  /** Estimated chance of contact right now, given the delay so far. */
  contactProbability: number
}

/** Source quality, from what actually closes rather than what generates volume. */
const SOURCE_WEIGHT: Record<LeadSource, number> = {
  past_client: 24, referral: 22, sphere: 18, sign_call: 12, open_house: 11,
  website: 8, portal: 7, expired: 6, fsbo: 5, social: 4, paid_ad: 4,
  farm_mailer: 3, unknown: 0,
}

/**
 * Contact probability decays sharply with delay. These are the widely-replicated
 * inbound-lead response curves, not a linear fall-off — the difference between one
 * minute and thirty is most of the outcome.
 */
export function contactProbability(ageMinutes: number): number {
  if (ageMinutes <= 1) return 0.90
  if (ageMinutes <= 5) return 0.78
  if (ageMinutes <= 10) return 0.62
  if (ageMinutes <= 30) return 0.40
  if (ageMinutes <= 60) return 0.28
  if (ageMinutes <= 60 * 4) return 0.17
  if (ageMinutes <= 60 * 24) return 0.10
  if (ageMinutes <= 60 * 24 * 3) return 0.05
  return 0.02
}

export function scoreLead(lead: LeadIntent, now: Date = new Date()): LeadScore {
  const reasons: string[] = []
  let score = 30

  const sw = SOURCE_WEIGHT[lead.source] ?? 0
  score += sw
  if (sw >= 18) reasons.push(`${labelSource(lead.source)} — the highest-converting source you have`)
  else if (sw >= 8) reasons.push(`${labelSource(lead.source)} lead`)
  else if (sw > 0) reasons.push(`${labelSource(lead.source)} — expect a long nurture`)

  if (lead.timelineMonths != null) {
    if (lead.timelineMonths <= 1) { score += 20; reasons.push('Wants to transact within 30 days') }
    else if (lead.timelineMonths <= 3) { score += 14; reasons.push(`${lead.timelineMonths}-month timeline`) }
    else if (lead.timelineMonths <= 6) { score += 6; reasons.push(`${lead.timelineMonths}-month timeline`) }
    else { score -= 6; reasons.push(`${lead.timelineMonths}-month timeline — nurture, do not chase`) }
  }

  if (lead.buyerAgreementSigned) { score += 16; reasons.push('Buyer representation agreement signed — committed to you') }
  if (lead.preApproved) { score += 15; reasons.push('Pre-approved — can write an offer today') }
  else if (lead.lenderIntroduced) { score += 6; reasons.push('With a lender, not yet approved') }
  else { score -= 8; reasons.push('No lender yet — the first real blocker') }

  if (lead.hasAgent && !lead.buyerAgreementSigned) {
    score -= 22
    reasons.push('Already working with another agent')
  }

  if (lead.hasHomeToSell) { score += 4; reasons.push('Has a home to sell — two sides in one relationship') }

  if ((lead.inboundReplies ?? 0) >= 2) { score += 12; reasons.push(`${lead.inboundReplies} replies — a real two-way conversation`) }
  else if ((lead.inboundReplies ?? 0) === 1) { score += 5; reasons.push('Replied once') }

  if ((lead.specificPropertiesAsked ?? 0) > 0) {
    score += 9
    reasons.push(`Asked about ${lead.specificPropertiesAsked} specific propert${lead.specificPropertiesAsked === 1 ? 'y' : 'ies'} by address`)
  }
  if ((lead.propertyViews ?? 0) >= 20) { score += 7; reasons.push(`${lead.propertyViews} property views — actively shopping`) }
  else if ((lead.propertyViews ?? 0) >= 5) { score += 3 }
  if ((lead.savedSearches ?? 0) > 0) { score += 3 }

  if (lead.budgetKnown) { score += 4 }
  if (lead.budgetVsMedian != null && lead.budgetVsMedian < 0.6) {
    score -= 10
    reasons.push('Budget well under the local median — expect a long search or no purchase')
  }

  const ageMinutes = Math.max(0, (now.getTime() - new Date(lead.createdAt).getTime()) / 60_000)
  const p = contactProbability(ageMinutes)

  // Urgency: an unworked new lead is the most urgent thing on the board, and decays
  // toward zero once it has been worked or has gone cold.
  const attempts = lead.contactAttempts ?? 0
  let urgency: number
  if (attempts === 0) {
    urgency = clamp(100 - (ageMinutes / 60) * 12, 20, 100)
  } else if (!lead.lastContactedAt) {
    urgency = 40
  } else {
    const sinceContactHours = (now.getTime() - new Date(lead.lastContactedAt).getTime()) / 3_600_000
    urgency = clamp(sinceContactHours * 1.4, 5, 70)
  }
  // A great lead deserves to jump the queue even when it is not brand new.
  urgency = clamp(urgency + (score - 50) * 0.25, 0, 100)

  const finalScore = Math.round(clamp(score, 0, 100))
  const grade: LeadScore['grade'] =
    finalScore >= 78 ? 'A' : finalScore >= 60 ? 'B' : finalScore >= 42 ? 'C' : 'D'

  return {
    score: finalScore,
    grade,
    urgency: Math.round(urgency),
    ageMinutes: Math.round(ageMinutes),
    reasons,
    nextAction: nextAction(lead, finalScore, ageMinutes, attempts),
    contactProbability: round(p, 2),
  }
}

function nextAction(lead: LeadIntent, score: number, ageMinutes: number, attempts: number): string {
  if (attempts === 0 && ageMinutes < 10) {
    return 'Call now. Contact rates fall off a cliff after the first few minutes.'
  }
  if (attempts === 0) {
    return `Call now — it has been ${formatAge(ageMinutes)} and nobody has tried yet.`
  }
  if (lead.hasAgent && !lead.buyerAgreementSigned) {
    return 'Already has an agent. Add to long-term nurture rather than working the lead.'
  }
  if (!lead.preApproved && !lead.lenderIntroduced && score >= 55) {
    return 'Introduce a lender. Pre-approval is the blocker between here and a showing.'
  }
  if (lead.preApproved && !lead.buyerAgreementSigned) {
    return 'Get the buyer representation agreement signed — they cannot tour a home without it.'
  }
  if (score >= 70) return 'High intent. Book a showing or a listing appointment this week.'
  if (score >= 45) return 'Put on a weekly cadence with new listings matching their search.'
  return 'Long-term nurture. Monthly market update, no direct chase.'
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} minutes`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} hours`
  return `${Math.round(minutes / (60 * 24))} days`
}

export function labelSource(s: LeadSource): string {
  return ({
    referral: 'Referral', past_client: 'Past client', sphere: 'Sphere', open_house: 'Open house',
    sign_call: 'Sign call', portal: 'Portal', website: 'Website', social: 'Social',
    paid_ad: 'Paid ad', farm_mailer: 'Farm mailer', expired: 'Expired listing', fsbo: 'FSBO',
    unknown: 'Unknown source',
  } as Record<LeadSource, string>)[s]
}

/** Order the day's leads by what actually needs doing first. */
export function triageQueue(
  leads: (LeadIntent & { id: string; name: string })[],
  now: Date = new Date(),
): (LeadScore & { id: string; name: string })[] {
  return leads
    .map(l => ({ ...scoreLead(l, now), id: l.id, name: l.name }))
    .sort((a, b) => b.urgency - a.urgency || b.score - a.score)
}
