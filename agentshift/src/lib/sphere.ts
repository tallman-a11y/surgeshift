/**
 * Sphere-of-influence intelligence — who to call today, and what to say.
 *
 * Most of an established agent's business comes from people they already know, and the
 * reason it leaks is not laziness but arithmetic: nobody can hold four hundred
 * relationships and their decay curves in their head. A CRM stores those contacts; it
 * does not tell you that the Hendersons hit their eleven-year mark last week and that
 * eleven years is roughly when people in their bracket move.
 *
 * This module ranks the sphere by *why now*, not alphabetically, and every score comes
 * with the specific reason so the call has an opening line.
 */

import { clamp } from './money'

export type RelationshipTier = 'advocate' | 'strong' | 'warm' | 'cool' | 'dormant'

export type SphereContact = {
  id: string
  name: string
  tier: RelationshipTier
  /** ISO date of the last meaningful two-way contact. */
  lastTouchedAt?: string
  /** ISO date they closed on their home with you, if they did. */
  homeAnniversary?: string
  birthday?: string // yyyy-mm-dd or --mm-dd
  /** Closed referrals they have sent you. */
  referralsSent?: number
  /** Deals you have closed with this person. */
  transactionsClosed?: number
  /** Their home's estimated value, for an equity nudge. */
  estimatedHomeValue?: number
  /** What they owe, for the same. */
  estimatedMortgageBalance?: number
  /** Life events recorded on the contact — the strongest move predictors there are. */
  lifeEvents?: LifeEvent[]
  /** They asked not to be contacted for marketing. */
  optedOut?: boolean
  /** Do they own the home they live in. */
  homeowner?: boolean
}

export type LifeEvent = {
  kind: 'new_job' | 'marriage' | 'new_child' | 'divorce' | 'retirement' | 'relocation' | 'inheritance' | 'empty_nest'
  date: string
  note?: string
}

/** Median US owner tenure sits around a dozen years; the move window opens before it. */
const TENURE_PEAK_YEARS = 12
const TENURE_WINDOW_OPENS = 7

const TIER_CADENCE_DAYS: Record<RelationshipTier, number> = {
  advocate: 45,
  strong: 60,
  warm: 90,
  cool: 180,
  dormant: 365,
}

const LIFE_EVENT_SIGNAL: Record<LifeEvent['kind'], { weight: number; why: string }> = {
  relocation:  { weight: 30, why: 'Relocating — an immediate move' },
  new_job:     { weight: 20, why: 'New job — commute and budget both just changed' },
  new_child:   { weight: 18, why: 'New child — the space question arrives on its own' },
  marriage:    { weight: 16, why: 'Married — two households usually become one' },
  divorce:     { weight: 22, why: 'Divorce — handle gently, but the house is part of it' },
  retirement:  { weight: 18, why: 'Retired — downsizing and relocation both come into play' },
  empty_nest:  { weight: 16, why: 'Empty nest — the house is bigger than the household now' },
  inheritance: { weight: 14, why: 'Inherited property — they will need to sell or hold' },
}

export type TouchReason = { why: string; weight: number }

export type SphereSignal = {
  contact: SphereContact
  score: number // 0-100 — how much this person deserves a call today
  reasons: TouchReason[]
  /** Days since the last meaningful contact. */
  daysSinceTouch: number | null
  /** True when they are past the cadence their tier deserves. */
  overdue: boolean
  /** Estimated equity, when both figures are known. */
  equity?: number
  /** The specific opening the agent should lead with. */
  opener: string
  /** A concrete date to hang the outreach on, when there is one. */
  occasion?: { label: string; date: string }
}

function daysSince(date: string | undefined, now: Date): number | null {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000)
}

/** Days until the next occurrence of a month/day, ignoring the year. */
function daysUntilAnnual(date: string | undefined, now: Date): number | null {
  if (!date) return null
  const m = date.match(/(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = Number(m[1]) - 1
  const day = Number(m[2])
  const thisYear = new Date(Date.UTC(now.getUTCFullYear(), month, day))
  const target = thisYear.getTime() >= startOfDay(now)
    ? thisYear
    : new Date(Date.UTC(now.getUTCFullYear() + 1, month, day))
  return Math.round((target.getTime() - startOfDay(now)) / 86_400_000)
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function scoreSphereContact(c: SphereContact, now: Date = new Date()): SphereSignal {
  const reasons: TouchReason[] = []
  const add = (why: string, weight: number) => { if (weight > 0) reasons.push({ why, weight }) }

  let occasion: SphereSignal['occasion']
  let score = 0

  // 1. Cadence. The base case: this person is simply overdue.
  const daysSinceTouch = daysSince(c.lastTouchedAt, now)
  const cadence = TIER_CADENCE_DAYS[c.tier]
  const overdue = daysSinceTouch == null || daysSinceTouch > cadence
  if (daysSinceTouch == null) {
    add('Never contacted', 22)
    score += 22
  } else if (daysSinceTouch > cadence) {
    // Overdue-ness saturates: 400 days and 800 days are both just "too long".
    const over = clamp((daysSinceTouch - cadence) / cadence, 0, 2)
    const w = Math.round(10 + over * 12)
    add(`${daysSinceTouch} days since last contact — ${cadence} is the cadence for a ${c.tier} relationship`, w)
    score += w
  }

  // 2. Relationship strength. Advocates who send business are worth protecting.
  const tierWeight = { advocate: 18, strong: 12, warm: 7, cool: 3, dormant: 0 }[c.tier]
  score += tierWeight
  if (c.tier === 'advocate') add('Advocate — has actively sent you business', tierWeight)

  if ((c.referralsSent ?? 0) > 0) {
    const w = Math.min(14, (c.referralsSent ?? 0) * 5)
    add(`Sent you ${c.referralsSent} referral${c.referralsSent === 1 ? '' : 's'}`, w)
    score += w
  }
  if ((c.transactionsClosed ?? 0) > 1) {
    add(`${c.transactionsClosed} deals together — a repeat client`, 8)
    score += 8
  }

  // 3. Tenure. The single best structural predictor of a move.
  const tenureDays = daysSince(c.homeAnniversary, now)
  if (tenureDays != null && c.homeowner !== false) {
    const years = tenureDays / 365.25
    if (years >= TENURE_WINDOW_OPENS) {
      const closeness = 1 - Math.abs(years - TENURE_PEAK_YEARS) / TENURE_PEAK_YEARS
      const w = Math.round(clamp(closeness, 0, 1) * 22)
      add(`${Math.floor(years)} years in the home — inside the window when people in this bracket move`, w)
      score += w
    }
  }

  // 4. Life events, decayed over a year. A new job two years ago is history.
  for (const e of c.lifeEvents ?? []) {
    const age = daysSince(e.date, now)
    if (age == null || age < 0 || age > 365) continue
    const signal = LIFE_EVENT_SIGNAL[e.kind]
    if (!signal) continue
    const decay = 1 - age / 365
    const w = Math.round(signal.weight * decay)
    add(`${signal.why}${e.note ? ` — ${e.note}` : ''}`, w)
    score += w
  }

  // 5. Equity. A large gap between value and balance is a real conversation.
  let equity: number | undefined
  if (c.estimatedHomeValue != null && c.estimatedMortgageBalance != null) {
    equity = c.estimatedHomeValue - c.estimatedMortgageBalance
    const ratio = c.estimatedHomeValue > 0 ? equity / c.estimatedHomeValue : 0
    if (ratio >= 0.45) {
      const w = Math.round(clamp((ratio - 0.45) * 30, 0, 12))
      add(`Roughly ${Math.round(ratio * 100)}% equity — enough to move without stretching`, w)
      score += w
    }
  }

  // 6. Occasions. Not a reason to call on their own, but a reason to call *today*.
  const untilAnniversary = daysUntilAnnual(c.homeAnniversary, now)
  if (untilAnniversary != null && untilAnniversary <= 14) {
    const years = tenureDays != null ? Math.round(tenureDays / 365.25) + (untilAnniversary > 0 ? 1 : 0) : null
    occasion = {
      label: years ? `${years}-year home anniversary` : 'Home anniversary',
      date: c.homeAnniversary!,
    }
    add(`Home anniversary in ${untilAnniversary} day${untilAnniversary === 1 ? '' : 's'}`, 10)
    score += 10
  }
  const untilBirthday = daysUntilAnnual(c.birthday, now)
  if (untilBirthday != null && untilBirthday <= 7) {
    occasion ??= { label: 'Birthday', date: c.birthday! }
    add(`Birthday in ${untilBirthday} day${untilBirthday === 1 ? '' : 's'}`, 6)
    score += 6
  }

  if (c.optedOut) {
    // Never surface an opted-out contact for marketing outreach, whatever else is true.
    return {
      contact: c,
      score: 0,
      reasons: [{ why: 'Opted out of marketing contact', weight: 0 }],
      daysSinceTouch,
      overdue: false,
      equity,
      opener: 'Opted out — do not contact for marketing.',
    }
  }

  reasons.sort((a, b) => b.weight - a.weight)

  return {
    contact: c,
    score: Math.round(clamp(score, 0, 100)),
    reasons,
    daysSinceTouch,
    overdue,
    equity,
    opener: buildOpener(c, reasons, occasion),
    occasion,
  }
}

function buildOpener(
  c: SphereContact,
  reasons: TouchReason[],
  occasion?: SphereSignal['occasion'],
): string {
  const first = c.name.split(' ')[0]
  if (occasion?.label.includes('anniversary')) {
    return `Wish ${first} a happy ${occasion.label.toLowerCase()} and send what their home is worth now versus what they paid.`
  }
  if (occasion?.label === 'Birthday') {
    return `Birthday call for ${first}. No business talk — just the call.`
  }
  const top = reasons[0]?.why ?? ''
  if (top.startsWith('Relocating')) return `${first} is relocating. Offer to run the referral to an agent in the new market and keep the relationship.`
  if (top.startsWith('New child')) return `${first} has a new baby. Congratulations first; the space conversation will come up on its own.`
  if (top.startsWith('Retired')) return `${first} retired. Ask what the plan is for the house — downsizing conversations start here.`
  if (top.startsWith('Empty nest')) return `${first}'s kids have moved out. Worth asking whether the house still fits.`
  if (top.includes('years in the home')) {
    return `${first} is deep into the window when people move. Lead with a fresh valuation, not a "just checking in".`
  }
  if (top.includes('equity')) return `${first} is sitting on real equity. Show them what it buys in today's market.`
  if (top.startsWith('Sent you')) return `${first} has sent you business. Call to say thank you specifically, not to ask for more.`
  if (top.startsWith('Never contacted')) return `${first} has never been contacted. Introduce yourself properly before anything else.`
  return `${first} is overdue. Send something genuinely useful about their street, not a generic market update.`
}

/**
 * The daily call list. Returns the sphere in the order it should actually be worked,
 * excluding anyone with no reason to be called.
 */
export function dailySphereCalls(
  contacts: SphereContact[],
  limit = 10,
  now: Date = new Date(),
): SphereSignal[] {
  return contacts
    .map(c => scoreSphereContact(c, now))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
