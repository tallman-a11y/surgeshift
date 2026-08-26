import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildTrackedReply, type OpportunityForTracking, type BrandForTracking } from '@/lib/tracked-reply'

export const dynamic = 'force-dynamic'

/**
 * Hand back a reply with its link carrying a ref code, so a hand-pasted reply is
 * as measurable as a one-click post. Called by the Copy button.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { opportunityId, replyText } = await req.json() as { opportunityId?: string; replyText?: string }
  if (!opportunityId) return NextResponse.json({ error: 'opportunityId required' }, { status: 400 })

  const { data: opp } = await supabase
    .from('opportunities')
    .select('id, brand_id, platform, subreddit, drafted_reply, tracked_code')
    .eq('id', opportunityId)
    .single()
  if (!opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, url')
    .eq('id', (opp as OpportunityForTracking).brand_id)
    .eq('user_id', user.id)
    .single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const source = replyText?.trim() ? replyText : (opp as OpportunityForTracking).drafted_reply
  const { text, code } = await buildTrackedReply(
    supabase,
    opp as OpportunityForTracking,
    brand as BrandForTracking,
    source,
  )

  return NextResponse.json({ text, code })
}
