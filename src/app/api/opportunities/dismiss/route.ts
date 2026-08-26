import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordSignal } from '@/lib/learning'

export const dynamic = 'force-dynamic'

/**
 * Dismiss an opportunity AND keep the judgement.
 *
 * Dismissal used to be a bare `status = 'dismissed'` update, which threw away the
 * single most useful thing an operator produces: an explicit "not this". That is
 * now recorded as a reject signal so the genome learns what to stop surfacing.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { opportunityId, reason } = await req.json() as { opportunityId?: string; reason?: string }
  if (!opportunityId) return NextResponse.json({ error: 'opportunityId required' }, { status: 400 })

  const { data: opp } = await supabase
    .from('opportunities')
    .select('id, title, body, drafted_reply, platform, subreddit, score')
    .eq('id', opportunityId)
    .single()
  if (!opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

  const o = opp as {
    id: string; title: string | null; body: string | null
    drafted_reply: string | null; platform: string; subreddit: string | null; score: number
  }

  const { error } = await supabase
    .from('opportunities')
    .update({ status: 'dismissed', dismiss_reason: reason?.slice(0, 500) ?? null })
    .eq('id', opportunityId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordSignal(supabase, 'reject', {
    userId: user.id,
    threadContext: `${o.title ?? ''}\n\n${o.body ?? ''}`.trim(),
    draftedReply: o.drafted_reply ?? '',
    reason: reason ?? null,
    metadata: {
      opportunity_id: o.id,
      platform: o.platform,
      subreddit: o.subreddit,
      score: o.score,
    },
  })

  return NextResponse.json({ ok: true })
}
