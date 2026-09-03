/**
 * Contract-to-close critical dates.
 *
 * Missing a deadline is the most expensive routine mistake in the business: blow the
 * inspection window and the buyer loses their objection right; blow the financing
 * deadline and their earnest money is at risk. Contracts express these windows in
 * either calendar days or business days, and the two produce different dates — so both
 * are modelled, with federal holidays computed rather than hard-coded to one year.
 */

export type DayBasis = 'calendar' | 'business'

export type MilestoneKind =
  | 'earnest_money'
  | 'inspection_period'
  | 'inspection_objection'
  | 'inspection_resolution'
  | 'loan_application'
  | 'appraisal_ordered'
  | 'appraisal_deadline'
  | 'title_commitment'
  | 'title_objection'
  | 'hoa_documents'
  | 'insurance_binder'
  | 'loan_commitment'
  | 'contingency_removal'
  | 'final_walkthrough'
  | 'closing_disclosure'
  | 'closing'
  | 'possession'

export type MilestoneSpec = {
  kind: MilestoneKind
  label: string
  /** Days from the contract date. Negative counts back from closing instead. */
  offset: number
  basis: DayBasis
  /** Negative offsets are measured backward from the closing date. */
  from: 'contract' | 'closing'
  /** Missing this one puts the deal or the earnest money at risk. */
  critical: boolean
  who: 'buyer' | 'seller' | 'both' | 'lender' | 'title'
  detail: string
}

export type Milestone = MilestoneSpec & {
  date: string // ISO yyyy-mm-dd
  daysAway: number
  status: 'done' | 'overdue' | 'due_today' | 'upcoming'
  completedDate?: string
}

/**
 * The default residential purchase timeline. State contracts vary — this is the shape
 * most of them take, and each spec is overridable per transaction.
 */
export const DEFAULT_TIMELINE: MilestoneSpec[] = [
  { kind: 'earnest_money', label: 'Earnest money delivered', offset: 3, basis: 'business', from: 'contract',
    critical: true, who: 'buyer', detail: 'Buyer delivers the earnest money deposit to the escrow holder.' },
  { kind: 'loan_application', label: 'Loan application submitted', offset: 5, basis: 'business', from: 'contract',
    critical: true, who: 'buyer', detail: 'Buyer submits a complete loan application to the lender.' },
  { kind: 'inspection_period', label: 'Inspection period ends', offset: 10, basis: 'calendar', from: 'contract',
    critical: true, who: 'buyer', detail: 'Last day to complete inspections. The objection right expires with it.' },
  { kind: 'inspection_objection', label: 'Inspection objection due', offset: 12, basis: 'calendar', from: 'contract',
    critical: true, who: 'buyer', detail: 'Buyer must deliver any written objection or repair request.' },
  { kind: 'inspection_resolution', label: 'Inspection resolution deadline', offset: 17, basis: 'calendar', from: 'contract',
    critical: true, who: 'both', detail: 'Parties must agree on repairs or the contract terminates.' },
  { kind: 'title_commitment', label: 'Title commitment delivered', offset: 14, basis: 'calendar', from: 'contract',
    critical: false, who: 'title', detail: 'Title company delivers the commitment and exception documents.' },
  { kind: 'title_objection', label: 'Title objection deadline', offset: 19, basis: 'calendar', from: 'contract',
    critical: true, who: 'buyer', detail: 'Last day to object to anything in the title commitment.' },
  { kind: 'hoa_documents', label: 'HOA documents delivered', offset: 14, basis: 'calendar', from: 'contract',
    critical: false, who: 'seller', detail: 'Seller delivers the association documents and budget.' },
  { kind: 'appraisal_deadline', label: 'Appraisal deadline', offset: 21, basis: 'calendar', from: 'contract',
    critical: true, who: 'lender', detail: 'Appraisal complete and delivered. A low appraisal reopens price.' },
  { kind: 'insurance_binder', label: 'Insurance binder issued', offset: -14, basis: 'calendar', from: 'closing',
    critical: false, who: 'buyer', detail: 'Homeowner’s policy bound and sent to the lender.' },
  { kind: 'loan_commitment', label: 'Loan commitment / financing deadline', offset: -10, basis: 'calendar', from: 'closing',
    critical: true, who: 'lender', detail: 'Final underwriting approval. Past this the financing contingency is gone.' },
  { kind: 'contingency_removal', label: 'All contingencies removed', offset: -7, basis: 'calendar', from: 'closing',
    critical: true, who: 'buyer', detail: 'Earnest money generally goes hard once contingencies are removed.' },
  { kind: 'closing_disclosure', label: 'Closing Disclosure received', offset: -3, basis: 'business', from: 'closing',
    critical: true, who: 'lender', detail: 'Federal rule: the buyer must receive the CD at least three business days before closing.' },
  { kind: 'final_walkthrough', label: 'Final walkthrough', offset: -1, basis: 'calendar', from: 'closing',
    critical: false, who: 'buyer', detail: 'Verify condition and that agreed repairs were made.' },
  { kind: 'closing', label: 'Closing', offset: 0, basis: 'calendar', from: 'closing',
    critical: true, who: 'both', detail: 'Sign, fund, record.' },
]

// ── Date arithmetic ─────────────────────────────────────────────────────────────

function toUtc(date: string | Date): Date {
  if (date instanceof Date) return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addCalendarDays(date: string | Date, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return iso(d)
}

/** Nth given weekday of a month, e.g. the 3rd Monday of January. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1))
  const shift = (weekday - first.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, month, 1 + shift + (n - 1) * 7))
}

/** Last given weekday of a month, e.g. the last Monday of May. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0))
  const shift = (last.getUTCDay() - weekday + 7) % 7
  return new Date(Date.UTC(year, month + 1, 0 - shift))
}

/**
 * A federal holiday falling on a Saturday is observed the Friday before; on a Sunday,
 * the Monday after. Banks and title companies follow the observed day, so that is the
 * day a business-day count has to skip.
 */
function observed(d: Date): Date {
  const day = d.getUTCDay()
  if (day === 6) return new Date(d.getTime() - 86_400_000)
  if (day === 0) return new Date(d.getTime() + 86_400_000)
  return d
}

/** US federal holidays for a year, as observed. Cached — this is called in loops. */
const holidayCache = new Map<number, Set<string>>()

export function federalHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year)
  if (cached) return cached

  const days = [
    observed(new Date(Date.UTC(year, 0, 1))),      // New Year's Day
    nthWeekday(year, 0, 1, 3),                      // MLK Day — 3rd Monday of January
    nthWeekday(year, 1, 1, 3),                      // Presidents' Day — 3rd Monday of February
    lastWeekday(year, 4, 1),                        // Memorial Day — last Monday of May
    observed(new Date(Date.UTC(year, 5, 19))),      // Juneteenth
    observed(new Date(Date.UTC(year, 6, 4))),       // Independence Day
    nthWeekday(year, 8, 1, 1),                      // Labor Day — 1st Monday of September
    nthWeekday(year, 9, 1, 2),                      // Columbus Day — 2nd Monday of October
    observed(new Date(Date.UTC(year, 10, 11))),     // Veterans Day
    nthWeekday(year, 10, 4, 4),                     // Thanksgiving — 4th Thursday of November
    observed(new Date(Date.UTC(year, 11, 25))),     // Christmas Day
  ]

  const set = new Set(days.map(iso))
  holidayCache.set(year, set)
  return set
}

export function isBusinessDay(date: string | Date): boolean {
  const d = toUtc(date)
  const day = d.getUTCDay()
  if (day === 0 || day === 6) return false
  return !federalHolidays(d.getUTCFullYear()).has(iso(d))
}

/**
 * Add business days, skipping weekends and observed federal holidays. Day 0 is the
 * start date itself; counting begins on the next business day, which is how contracts
 * read ("within 3 business days of the effective date").
 */
export function addBusinessDays(date: string | Date, days: number): string {
  const d = toUtc(date)
  if (days === 0) return iso(d)
  const step = days > 0 ? 1 : -1
  let remaining = Math.abs(days)
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step)
    if (isBusinessDay(d)) remaining--
  }
  return iso(d)
}

export function addDays(date: string | Date, days: number, basis: DayBasis): string {
  return basis === 'business' ? addBusinessDays(date, days) : addCalendarDays(date, days)
}

export function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000)
}

// ── Timeline construction ───────────────────────────────────────────────────────

export type TimelineInput = {
  contractDate: string
  closingDate: string
  /** Milestone kinds already completed, with the date they were completed. */
  completed?: Partial<Record<MilestoneKind, string>>
  /** Per-transaction overrides — a 7-day inspection instead of 10, say. */
  overrides?: Partial<Record<MilestoneKind, Partial<Pick<MilestoneSpec, 'offset' | 'basis'>>>>
  specs?: MilestoneSpec[]
  today?: string
}

export type TimelineResult = {
  milestones: Milestone[]
  /** Anything critical that is overdue and not done. */
  overdue: Milestone[]
  /** The next thing that actually needs attention. */
  next?: Milestone
  daysToClose: number
  /** 0–1, by milestones completed. */
  progress: number
  /** Set when the deadlines cannot all fit before closing. */
  conflicts: string[]
}

export function buildTimeline(input: TimelineInput): TimelineResult {
  const specs = input.specs ?? DEFAULT_TIMELINE
  const today = input.today ?? iso(new Date())
  const completed = input.completed ?? {}

  const milestones: Milestone[] = specs.map(spec => {
    const o = input.overrides?.[spec.kind]
    const offset = o?.offset ?? spec.offset
    const basis = o?.basis ?? spec.basis
    const anchor = spec.from === 'closing' ? input.closingDate : input.contractDate
    const date = addDays(anchor, offset, basis)
    const completedDate = completed[spec.kind]
    const daysAway = daysBetween(today, date)

    const status: Milestone['status'] = completedDate
      ? 'done'
      : daysAway < 0 ? 'overdue'
      : daysAway === 0 ? 'due_today'
      : 'upcoming'

    return { ...spec, offset, basis, date, daysAway, status, completedDate }
  }).sort((a, b) => a.date.localeCompare(b.date))

  const overdue = milestones.filter(m => m.status === 'overdue')
  const next = milestones.find(m => m.status === 'due_today')
    ?? milestones.find(m => m.status === 'upcoming')

  const done = milestones.filter(m => m.status === 'done').length

  // A short escrow can push a deadline past the closing it is meant to precede.
  const conflicts: string[] = []
  for (const m of milestones) {
    if (m.kind === 'closing' || m.kind === 'possession') continue
    if (m.date > input.closingDate) {
      conflicts.push(`${m.label} lands ${m.date}, after the ${input.closingDate} closing. Shorten the window or move the closing.`)
    }
  }
  if (input.closingDate < input.contractDate) {
    conflicts.push('Closing date is before the contract date.')
  }

  return {
    milestones,
    overdue,
    next,
    daysToClose: daysBetween(today, input.closingDate),
    progress: milestones.length > 0 ? done / milestones.length : 0,
    conflicts,
  }
}

/** Everything due in the next N days, across every transaction — the daily call sheet. */
export function upcomingAcross(
  timelines: { transactionId: string; label: string; timeline: TimelineResult }[],
  withinDays = 7,
): { transactionId: string; label: string; milestone: Milestone }[] {
  const out: { transactionId: string; label: string; milestone: Milestone }[] = []
  for (const t of timelines) {
    for (const m of t.timeline.milestones) {
      if (m.status === 'done') continue
      if (m.daysAway <= withinDays) {
        out.push({ transactionId: t.transactionId, label: t.label, milestone: m })
      }
    }
  }
  return out.sort((a, b) => {
    if (a.milestone.daysAway !== b.milestone.daysAway) return a.milestone.daysAway - b.milestone.daysAway
    return Number(b.milestone.critical) - Number(a.milestone.critical)
  })
}
