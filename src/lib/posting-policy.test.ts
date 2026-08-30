import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluatePosting, type PolicyBrand, type PolicyOpportunity } from './posting-policy'

/**
 * A chainable stand-in for the query builder. Every method returns the chain;
 * the chain resolves differently depending on which table was asked for and
 * whether a count was requested, which is all evaluatePosting relies on.
 */
function stubClient(opts: {
  policy?: { stance?: string; cooldown_days?: number } | null
  recentInSub?: Array<{ posted_at: string }>
  postedToday?: number
}): SupabaseClient {
  const client = {
    from(table: string) {
      let wantsCount = false
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: (_cols?: unknown, o?: { count?: string; head?: boolean }) => {
          if (o?.count) wantsCount = true
          return chain
        },
        eq: self,
        gte: self,
        order: self,
        limit: () => Promise.resolve({ data: opts.recentInSub ?? [] }),
        maybeSingle: () => Promise.resolve({ data: opts.policy ?? null }),
        then: (resolve: (v: unknown) => unknown) =>
          resolve(
            wantsCount && table === 'opportunities'
              ? { count: opts.postedToday ?? 0 }
              : { data: [] },
          ),
      })
      return chain
    },
  }
  return client as unknown as SupabaseClient
}

const brand: PolicyBrand = {
  id: 'b1',
  user_id: 'u1',
  subreddits: ['Landlord', 'realestateinvesting'],
  max_posts_per_day: 3,
  subreddit_cooldown_days: 7,
}

const fresh = new Date(Date.now() - 5 * 86_400_000).toISOString()

function opp(over: Partial<PolicyOpportunity> = {}): PolicyOpportunity {
  return { id: 'o1', platform: 'reddit', subreddit: 'Landlord', source_published_at: fresh, ...over }
}

describe('evaluatePosting', () => {
  it('allows a fresh thread in a chosen subreddit', async () => {
    const v = await evaluatePosting(stubClient({ policy: { stance: 'allowed' } }), brand, opp())
    expect(v.decision).toBe('allow')
    expect(v.reasons).toEqual([])
  })

  it('blocks an archived Reddit thread', async () => {
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString()
    const v = await evaluatePosting(
      stubClient({ policy: { stance: 'allowed' } }), brand, opp({ source_published_at: old }),
    )
    expect(v.decision).toBe('block')
    expect(v.reasons.map(r => r.code)).toContain('thread_archived')
  })

  it('does not apply the archive rule to YouTube', async () => {
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString()
    const v = await evaluatePosting(
      stubClient({}), brand,
      opp({ platform: 'youtube', subreddit: null, source_published_at: old }),
    )
    expect(v.decision).toBe('allow')
  })

  it('blocks a subreddit the operator marked off limits', async () => {
    const v = await evaluatePosting(stubClient({ policy: { stance: 'banned' } }), brand, opp())
    expect(v.decision).toBe('block')
    expect(v.reasons[0].message).toContain('off limits')
  })

  it('cautions on a subreddit the scanner drifted into', async () => {
    // r/legaladvice and r/tenant reached the queue this way — never chosen, and
    // actively hostile to a landlord product.
    const v = await evaluatePosting(
      stubClient({ policy: { stance: 'unknown' } }), brand, opp({ subreddit: 'legaladvice' }),
    )
    expect(v.decision).toBe('caution')
    expect(v.reasons.map(r => r.code)).toContain('subreddit_off_list')
  })

  it('does not cry wolf about a chosen subreddit with no policy row', async () => {
    const v = await evaluatePosting(stubClient({ policy: null }), brand, opp())
    expect(v.decision).toBe('allow')
  })

  it('is case-insensitive about the brand list', async () => {
    const v = await evaluatePosting(
      stubClient({ policy: null }), brand, opp({ subreddit: 'LANDLORD' }),
    )
    expect(v.decision).toBe('allow')
  })

  it('blocks a repeat post inside the cooldown', async () => {
    const v = await evaluatePosting(
      stubClient({
        policy: { stance: 'allowed', cooldown_days: 7 },
        recentInSub: [{ posted_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }],
      }),
      brand, opp(),
    )
    expect(v.decision).toBe('block')
    const reason = v.reasons.find(r => r.code === 'subreddit_cooldown')
    expect(reason?.message).toContain('2 days ago')
  })

  it('blocks once the daily cap is reached', async () => {
    const v = await evaluatePosting(
      stubClient({ policy: { stance: 'allowed' }, postedToday: 3 }), brand, opp(),
    )
    expect(v.decision).toBe('block')
    expect(v.reasons.map(r => r.code)).toContain('daily_cap')
  })

  it('allows right up to the cap', async () => {
    const v = await evaluatePosting(
      stubClient({ policy: { stance: 'allowed' }, postedToday: 2 }), brand, opp(),
    )
    expect(v.decision).toBe('allow')
  })

  it('reports every reason, not just the first', async () => {
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString()
    const v = await evaluatePosting(
      stubClient({ policy: { stance: 'banned' }, postedToday: 9 }),
      brand, opp({ source_published_at: old }),
    )
    expect(v.decision).toBe('block')
    expect(v.reasons.map(r => r.code).sort())
      .toEqual(['daily_cap', 'subreddit_banned', 'thread_archived'])
  })

  it('a block outranks a caution', async () => {
    const v = await evaluatePosting(
      stubClient({ policy: { stance: 'unknown' }, postedToday: 5 }),
      brand, opp({ subreddit: 'webdev' }),
    )
    expect(v.decision).toBe('block')
    expect(v.reasons.map(r => r.severity)).toContain('caution')
  })
})
