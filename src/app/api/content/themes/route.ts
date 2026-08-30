import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildThemes, type ThemeInput } from '@/lib/content-themes'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * Rebuild the content roadmap for a brand from the questions the scanner found.
 *
 * Rebuilt on demand rather than on a schedule: it costs an embedding pass plus a
 * naming call per cluster, and the demand picture does not meaningfully change
 * hour to hour.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { brandId } = await req.json() as { brandId?: string }
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const { data: brand } = await supabase
    .from('brands').select('id').eq('id', brandId).eq('user_id', user.id).maybeSingle()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  // Dismissed questions still count: someone asked, even if this particular
  // thread was not worth replying to. Demand is demand.
  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, title, body, score, subreddit, platform')
    .eq('brand_id', brandId)
    .gte('score', 30)
    .order('found_at', { ascending: false })
    .limit(400)

  const items = (opps ?? []) as ThemeInput[]
  const { themes, skipped } = await buildThemes(items)

  if (skipped) return NextResponse.json({ themes: [], skipped, considered: items.length })

  // Replace this brand's themes wholesale — a theme that no longer clusters has
  // stopped being a theme, and leaving it would show demand that isn't there.
  const admin = createServiceClient()
  await admin.from('content_themes').delete().eq('brand_id', brandId)

  const rows = themes.map(t => ({
    brand_id: brandId,
    user_id: user.id,
    label: t.label,
    summary: t.summary,
    question_count: t.questionCount,
    example_questions: t.exampleQuestions,
    opportunity_ids: t.opportunityIds,
    avg_score: t.avgScore,
  }))

  const { data: inserted, error } = await admin.from('content_themes').insert(rows).select('id, label, question_count')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ themes: inserted, considered: items.length })
}
