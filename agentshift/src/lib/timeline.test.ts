import { describe, it, expect } from 'vitest'
import {
  buildTimeline, addBusinessDays, addCalendarDays, isBusinessDay,
  federalHolidays, daysBetween, upcomingAcross, DEFAULT_TIMELINE,
} from './timeline'

describe('federal holidays', () => {
  it('computes the floating Monday holidays', () => {
    const h = federalHolidays(2026)
    expect(h.has('2026-01-19')).toBe(true) // MLK — 3rd Monday of January
    expect(h.has('2026-05-25')).toBe(true) // Memorial — last Monday of May
    expect(h.has('2026-09-07')).toBe(true) // Labor — 1st Monday of September
    expect(h.has('2026-11-26')).toBe(true) // Thanksgiving — 4th Thursday of November
  })

  it('observes a Saturday holiday on the Friday before', () => {
    // 4 July 2026 falls on a Saturday, observed Friday the 3rd.
    const h = federalHolidays(2026)
    expect(h.has('2026-07-03')).toBe(true)
    expect(h.has('2026-07-04')).toBe(false)
  })

  it('observes a Sunday holiday on the Monday after', () => {
    // Christmas 2022 fell on a Sunday, observed Monday the 26th.
    const h = federalHolidays(2022)
    expect(h.has('2022-12-26')).toBe(true)
  })

  it('handles a year where New Year falls on a weekend', () => {
    // 1 Jan 2028 is a Saturday, observed Friday 31 Dec 2027.
    expect(federalHolidays(2028).has('2027-12-31')).toBe(true)
  })
})

describe('isBusinessDay', () => {
  it('rejects weekends', () => {
    expect(isBusinessDay('2026-09-05')).toBe(false) // Saturday
    expect(isBusinessDay('2026-09-06')).toBe(false) // Sunday
  })
  it('rejects observed federal holidays', () => {
    expect(isBusinessDay('2026-09-07')).toBe(false) // Labor Day
  })
  it('accepts an ordinary weekday', () => {
    expect(isBusinessDay('2026-09-03')).toBe(true) // Thursday
  })
})

describe('addBusinessDays', () => {
  it('skips the weekend', () => {
    // Tue 15 Sep + 3 business days: Wed, Thu, Fri.
    expect(addBusinessDays('2026-09-15', 3)).toBe('2026-09-18')
    // Thu 17 Sep + 3 lands the following Tuesday, having stepped over the weekend.
    expect(addBusinessDays('2026-09-17', 3)).toBe('2026-09-22')
  })

  it('skips a holiday as well as the weekend', () => {
    // Fri 4 Sep + 1 business day skips Sat, Sun and Labor Day Monday.
    expect(addBusinessDays('2026-09-04', 1)).toBe('2026-09-08')
  })

  it('returns the start date for zero days', () => {
    expect(addBusinessDays('2026-09-05', 0)).toBe('2026-09-05')
  })

  it('counts backwards', () => {
    expect(addBusinessDays('2026-09-08', -1)).toBe('2026-09-04')
  })

  it('differs from calendar days across a weekend', () => {
    expect(addCalendarDays('2026-09-17', 3)).toBe('2026-09-20')  // a Sunday
    expect(addBusinessDays('2026-09-17', 3)).toBe('2026-09-22')
  })

  it('steps over a holiday that falls mid-count', () => {
    // Thu 3 Sep + 3: Fri 4, then Labor Day Monday is skipped, Tue 8, Wed 9.
    expect(addBusinessDays('2026-09-03', 3)).toBe('2026-09-09')
  })

  it('crosses a year boundary', () => {
    // Wed 30 Dec 2026 + 3 business days: Thu 31, (Fri 1 Jan is a holiday), Mon 4, Tue 5.
    expect(addBusinessDays('2026-12-30', 3)).toBe('2027-01-05')
  })
})

describe('buildTimeline', () => {
  const input = { contractDate: '2026-09-01', closingDate: '2026-10-15', today: '2026-09-12' }

  it('derives every default milestone', () => {
    const t = buildTimeline(input)
    expect(t.milestones).toHaveLength(DEFAULT_TIMELINE.length)
    expect(t.milestones.map(m => m.kind)).toContain('inspection_period')
  })

  it('returns milestones in date order', () => {
    const dates = buildTimeline(input).milestones.map(m => m.date)
    expect(dates).toEqual([...dates].sort())
  })

  it('anchors forward milestones to the contract date', () => {
    const t = buildTimeline(input)
    const inspection = t.milestones.find(m => m.kind === 'inspection_period')!
    expect(inspection.date).toBe('2026-09-11') // 10 calendar days from 1 Sep
  })

  it('anchors backward milestones to the closing date', () => {
    const t = buildTimeline(input)
    const walkthrough = t.milestones.find(m => m.kind === 'final_walkthrough')!
    expect(walkthrough.date).toBe('2026-10-14')
  })

  it('counts the Closing Disclosure in business days as the rule requires', () => {
    const t = buildTimeline(input)
    const cd = t.milestones.find(m => m.kind === 'closing_disclosure')!
    // 15 Oct 2026 is a Thursday. Counting back: Wed 14, Tue 13, then Monday the
    // 12th is Columbus Day and does not count — so the CD is due Friday the 9th.
    // This is exactly the case that makes hand-counted CD dates go wrong.
    expect(cd.date).toBe('2026-10-09')
    expect(cd.basis).toBe('business')
  })

  it('marks a passed, incomplete milestone overdue', () => {
    const t = buildTimeline(input)
    const overdueKinds = t.overdue.map(m => m.kind)
    expect(overdueKinds).toContain('inspection_period')
    expect(overdueKinds).toContain('earnest_money')
  })

  it('does not mark a completed milestone overdue', () => {
    const t = buildTimeline({ ...input, completed: { earnest_money: '2026-09-03' } })
    expect(t.overdue.map(m => m.kind)).not.toContain('earnest_money')
    const em = t.milestones.find(m => m.kind === 'earnest_money')!
    expect(em.status).toBe('done')
    expect(em.completedDate).toBe('2026-09-03')
  })

  it('marks today’s milestone due_today rather than overdue', () => {
    const t = buildTimeline({ ...input, today: '2026-09-11' })
    expect(t.milestones.find(m => m.kind === 'inspection_period')!.status).toBe('due_today')
  })

  it('surfaces the next thing needing attention', () => {
    const t = buildTimeline({ ...input, today: '2026-09-11' })
    expect(t.next!.kind).toBe('inspection_period')
  })

  it('honours a per-transaction override', () => {
    const t = buildTimeline({ ...input, overrides: { inspection_period: { offset: 7 } } })
    expect(t.milestones.find(m => m.kind === 'inspection_period')!.date).toBe('2026-09-08')
  })

  it('changes the date when the basis is overridden', () => {
    // 5 business days from Tue 1 Sep clears the weekend and Labor Day to reach
    // Wed 9 Sep; the same count in calendar days stops on Sunday the 6th.
    const business = buildTimeline(input).milestones.find(m => m.kind === 'loan_application')!
    const calendar = buildTimeline({ ...input, overrides: { loan_application: { basis: 'calendar' } } })
      .milestones.find(m => m.kind === 'loan_application')!
    expect(business.date).toBe('2026-09-09')
    expect(calendar.date).toBe('2026-09-06')
  })

  it('reports progress as the share of milestones done', () => {
    const t = buildTimeline({ ...input, completed: { earnest_money: '2026-09-03', loan_application: '2026-09-05' } })
    expect(t.progress).toBeCloseTo(2 / DEFAULT_TIMELINE.length, 5)
  })

  it('flags a deadline that lands after closing', () => {
    // A 21-day appraisal deadline cannot fit into a 14-day escrow.
    const t = buildTimeline({ contractDate: '2026-09-01', closingDate: '2026-09-15', today: '2026-09-02' })
    expect(t.conflicts.length).toBeGreaterThan(0)
    expect(t.conflicts.join(' ')).toMatch(/Appraisal deadline/)
  })

  it('flags a closing before the contract date', () => {
    const t = buildTimeline({ contractDate: '2026-10-01', closingDate: '2026-09-01', today: '2026-09-02' })
    expect(t.conflicts).toContain('Closing date is before the contract date.')
  })

  it('has no conflicts on a normal escrow', () => {
    expect(buildTimeline(input).conflicts).toEqual([])
  })

  it('counts days to close', () => {
    expect(buildTimeline(input).daysToClose).toBe(33)
    expect(daysBetween('2026-09-12', '2026-10-15')).toBe(33)
  })
})

describe('upcomingAcross', () => {
  const a = buildTimeline({ contractDate: '2026-09-01', closingDate: '2026-10-15', today: '2026-09-12' })
  const b = buildTimeline({ contractDate: '2026-09-08', closingDate: '2026-10-30', today: '2026-09-12' })

  it('merges deadlines across transactions, soonest first', () => {
    const out = upcomingAcross([
      { transactionId: 't1', label: '12 Oak', timeline: a },
      { transactionId: 't2', label: '88 Pine', timeline: b },
    ], 7)
    const away = out.map(x => x.milestone.daysAway)
    expect(away).toEqual([...away].sort((x, y) => x - y))
    expect(new Set(out.map(x => x.transactionId)).size).toBe(2)
  })

  it('puts critical items first when two land on the same day', () => {
    const out = upcomingAcross([{ transactionId: 't1', label: '12 Oak', timeline: a }], 30)
    for (let i = 1; i < out.length; i++) {
      if (out[i].milestone.daysAway === out[i - 1].milestone.daysAway) {
        expect(Number(out[i - 1].milestone.critical)).toBeGreaterThanOrEqual(Number(out[i].milestone.critical))
      }
    }
  })

  it('excludes completed milestones', () => {
    const done = buildTimeline({
      contractDate: '2026-09-01', closingDate: '2026-10-15', today: '2026-09-12',
      completed: Object.fromEntries(DEFAULT_TIMELINE.map(s => [s.kind, '2026-09-01'])),
    })
    expect(upcomingAcross([{ transactionId: 't', label: 'x', timeline: done }], 60)).toEqual([])
  })

  it('respects the window', () => {
    const wide = upcomingAcross([{ transactionId: 't1', label: '12 Oak', timeline: a }], 60)
    const narrow = upcomingAcross([{ transactionId: 't1', label: '12 Oak', timeline: a }], 3)
    expect(narrow.length).toBeLessThan(wide.length)
  })
})
