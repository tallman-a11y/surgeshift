import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { evaluatePosting, type PolicyBrand, type PolicyVerdict } from '@/lib/posting-policy'

export const dynamic = 'force-dynamic'

/**
 * Batch-evaluate the posting governor for the opportunities currently on screen,
 * so the operator sees why something is risky before clicking rather than after
 * the server refuses it.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json() as { ids?: string[] }
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ verdicts: {} })

  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, brand_id, platform, subreddit, source_published_at')
    .in('id', ids.slice(0, 100))

  if (!opps?.length) return NextResponse.json({ verdicts: {} })

  type Row = { id: string; brand_id: string; platform: string; subreddit: string | null; source_published_at: string | null }
  const rows = opps as Row[]

  const { data: brands } = await supabase
    .from('brands')
    .select('id, user_id, subreddits, max_posts_per_day, subreddit_cooldown_days')
    .eq('user_id', user.id)
    .in('id', [...new Set(rows.map(r => r.brand_id))])

  const byId = new Map((brands as PolicyBrand[] ?? []).map(b => [b.id, b]))

  const verdicts: Record<string, PolicyVerdict> = {}
  await Promise.all(rows.map(async row => {
    const brand = byId.get(row.brand_id)
    if (!brand) return
    verdicts[row.id] = await evaluatePosting(supabase, brand, row)
  }))

  return NextResponse.json({ verdicts })
}
