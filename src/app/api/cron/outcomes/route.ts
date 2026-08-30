import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getValidToken, type PlatformConnection } from '@/lib/platform-tokens'
import { fetchRedditOutcome, fetchYouTubeOutcome, classifyOutcome, type Outcome } from '@/lib/reply-outcomes'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Follow up on replies we posted.
 *
 * Records a trajectory in reply_outcomes, keeps the latest state on the
 * opportunity for the queue to display, and writes a prediction-vs-actual row to
 * shift_learning_outcomes — the score we assigned before posting against what
 * the community actually did with it. That pairing is what makes the scoring
 * calibratable rather than merely confident.
 *
 * Replies are followed for 30 days; engagement past that is noise.
 */

const FOLLOW_DAYS = 30
const MAX_PER_RUN = 60

type Row = {
  id: string
  brand_id: string
  platform: string
  score: number
  posted_at: string
  posted_comment_id: string
  brands: { user_id: string } | null
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const since = new Date(Date.now() - FOLLOW_DAYS * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('opportunities')
    .select('id, brand_id, platform, score, posted_at, posted_comment_id, brands!inner(user_id)')
    .eq('status', 'posted')
    .not('posted_comment_id', 'is', null)
    .gte('posted_at', since)
    .order('reply_checked_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) return NextResponse.json({ checked: 0, reason: 'no posted replies to follow up' })

  // One token per user per platform, not per reply.
  const tokenCache = new Map<string, string | null>()
  async function tokenFor(userId: string, platform: string): Promise<string | null> {
    const key = `${userId}:${platform}`
    if (tokenCache.has(key)) return tokenCache.get(key) ?? null
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .maybeSingle()
    let token: string | null = null
    if (conn) {
      try { token = await getValidToken(supabase, conn as PlatformConnection) } catch { token = null }
    }
    tokenCache.set(key, token)
    return token
  }

  const results: Array<Record<string, unknown>> = []

  for (const row of rows) {
    let outcome: Outcome | null = null

    if (row.platform === 'youtube') {
      // Reading public engagement needs only the API key, not the OAuth grant.
      const key = process.env.YOUTUBE_API_KEY
      if (key) outcome = await fetchYouTubeOutcome(row.posted_comment_id, key)
    } else if (row.platform === 'reddit') {
      const userId = row.brands?.user_id
      const token = userId ? await tokenFor(userId, 'reddit') : null
      if (token) outcome = await fetchRedditOutcome(row.posted_comment_id, token)
    }

    // null means we could not reach the platform — record nothing rather than
    // writing a false zero that would poison the calibration data.
    if (!outcome) { results.push({ id: row.id, skipped: 'no reading available' }); continue }

    const verdict = classifyOutcome(outcome)

    await supabase.from('reply_outcomes').insert({
      opportunity_id: row.id,
      score: outcome.score,
      reply_count: outcome.replyCount,
      removed: outcome.removed,
      raw: outcome.raw ?? null,
    })

    await supabase.from('opportunities').update({
      reply_score: outcome.score,
      reply_count: outcome.replyCount,
      reply_removed: outcome.removed,
      reply_checked_at: new Date().toISOString(),
    }).eq('id', row.id)

    // Predicted vs actual. `predicted_value` is the score we assigned before
    // posting; `actual_value` is what the community did with the reply.
    if (row.brands?.user_id) {
      await supabase.from('shift_learning_outcomes').insert({
        user_id: row.brands.user_id,
        prediction_type: 'opportunity_score',
        prediction_id: row.id,
        predicted_value: { score: row.score },
        actual_value: { verdict, score: outcome.score, replies: outcome.replyCount, removed: outcome.removed },
        resolved_at: new Date().toISOString(),
        domain: 'surgeshift',
      })
    }

    results.push({ id: row.id, platform: row.platform, predicted: row.score, verdict, score: outcome.score, removed: outcome.removed })
  }

  const removed = results.filter(r => r.removed === true).length
  return NextResponse.json({ checked: results.length, removed, results })
}
