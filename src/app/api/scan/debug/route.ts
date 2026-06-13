import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanReddit } from '@/lib/scanner/reddit'
import { scanYouTube } from '@/lib/scanner/youtube'
import { scanTwitter } from '@/lib/scanner/twitter'
import { scoreAndDraft } from '@/lib/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { brandId } = await req.json() as { brandId?: string }
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const { data: brand } = await supabase.from('brands').select('*').eq('id', brandId).eq('user_id', user.id).single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  type BrandRow = { keywords: string[]; subreddits: string[] }
  const b = brand as BrandRow

  const envCheck = {
    BRAVE_API_KEY: !!process.env.BRAVE_API_KEY,
    YOUTUBE_API_KEY: !!process.env.YOUTUBE_API_KEY,
    TWITTER_BEARER_TOKEN: !!process.env.TWITTER_BEARER_TOKEN,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
    GOOGLE_CSE_ID: !!process.env.GOOGLE_CSE_ID,
  }

  // Direct Brave Search probe — bypasses the scanner to show raw API response
  let braveProbe: { query: string; status: number; resultCount: number; postCount: number; error: string | null; sample: string[] } | null = null
  try {
    const apiKey = process.env.BRAVE_API_KEY
    if (apiKey) {
      const query = `site:reddit.com ${b.keywords[0] ?? 'welding'}`
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
        { headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey } }
      )
      type BraveItem = { url: string; title: string }
      type BraveResp = { web?: { results?: BraveItem[] }; type?: string; message?: string }
      const data = await res.json() as BraveResp
      const items = data.web?.results ?? []
      const posts = items.filter((i: BraveItem) => i.url.includes('/comments/'))
      braveProbe = {
        query,
        status: res.status,
        resultCount: items.length,
        postCount: posts.length,
        error: data.type === 'ErrorResponse' ? (data.message ?? 'API error') : null,
        sample: posts.slice(0, 3).map((i: BraveItem) => i.url),
      }
    } else {
      braveProbe = { query: '', status: 0, resultCount: 0, postCount: 0, error: 'BRAVE_API_KEY not set', sample: [] }
    }
  } catch (e) {
    braveProbe = { query: '', status: 0, resultCount: 0, postCount: 0, error: String(e), sample: [] }
  }

  // Check how many existing opportunities are already stored (may explain why new ones are filtered)
  const { count: existingCount } = await supabase
    .from('opportunities')
    .select('*', { count: 'exact', head: true })
    .eq('brand_id', brandId)

  const [redditPosts, youtubePosts, twitterPosts] = await Promise.allSettled([
    scanReddit(b.keywords, b.subreddits),
    scanYouTube(b.keywords),
    scanTwitter(b.keywords),
  ])

  // Test score: run the first Reddit post through Claude to see raw score output
  type ScoreTest = { post: string; score: number; reason: string; error: string | null }
  let scoreTest: ScoreTest | null = null
  if (redditPosts.status === 'fulfilled' && redditPosts.value.length > 0) {
    const testPost = redditPosts.value[0]
    try {
      const result = await scoreAndDraft(brand as Parameters<typeof scoreAndDraft>[0], {
        title: testPost.title,
        body: testPost.body,
        platform: 'reddit',
        subreddit: testPost.subreddit,
      })
      scoreTest = { post: testPost.title.slice(0, 80), score: result.score, reason: result.reason, error: null }
    } catch (e) {
      scoreTest = { post: testPost.title.slice(0, 80), score: -1, reason: '', error: String(e) }
    }
  }

  return NextResponse.json({
    env: envCheck,
    braveProbe,
    existingOpportunities: existingCount,
    keywords: b.keywords.slice(0, 5),
    subreddits: b.subreddits.slice(0, 4),
    scoreTest,
    reddit: {
      count: redditPosts.status === 'fulfilled' ? redditPosts.value.length : 0,
      error: redditPosts.status === 'rejected' ? String(redditPosts.reason) : null,
      sample: redditPosts.status === 'fulfilled' ? redditPosts.value.slice(0, 5).map(p => ({
        title: p.title.slice(0, 60),
        url: p.url.slice(0, 80),
      })) : [],
    },
    youtube: {
      count: youtubePosts.status === 'fulfilled' ? youtubePosts.value.length : 0,
      error: youtubePosts.status === 'rejected' ? String(youtubePosts.reason) : null,
      sample: youtubePosts.status === 'fulfilled' ? youtubePosts.value.slice(0, 3).map(p => ({
        title: p.title.slice(0, 60),
      })) : [],
    },
    twitter: {
      count: twitterPosts.status === 'fulfilled' ? twitterPosts.value.length : 0,
      error: twitterPosts.status === 'rejected' ? String(twitterPosts.reason) : null,
    },
  })
}
