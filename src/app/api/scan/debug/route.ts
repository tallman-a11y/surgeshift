import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanReddit } from '@/lib/scanner/reddit'
import { scanYouTube } from '@/lib/scanner/youtube'
import { scanTwitter } from '@/lib/scanner/twitter'

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

  // Check env vars
  const envCheck = {
    YOUTUBE_API_KEY: !!process.env.YOUTUBE_API_KEY,
    TWITTER_BEARER_TOKEN: !!process.env.TWITTER_BEARER_TOKEN,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  }

  // Quick Reddit RSS probe to see raw response
  let redditProbe: { url: string; status: number; contentType: string; bodyPreview: string } | null = null
  try {
    const keyword = b.keywords[0] ?? 'welding'
    const probeUrl = `https://www.reddit.com/search.rss?q=${encodeURIComponent(keyword)}&sort=new&t=week&limit=5`
    const probeRes = await fetch(probeUrl, {
      headers: { 'User-Agent': 'SurgeShift/1.0 (contact@allshiftai.com)' },
    })
    const body = await probeRes.text()
    redditProbe = {
      url: probeUrl,
      status: probeRes.status,
      contentType: probeRes.headers.get('content-type') ?? 'unknown',
      bodyPreview: body.slice(0, 500),
    }
  } catch (e) {
    redditProbe = { url: '', status: 0, contentType: 'error', bodyPreview: String(e) }
  }

  const [redditPosts, youtubePosts, twitterPosts] = await Promise.allSettled([
    scanReddit(b.keywords, b.subreddits),
    scanYouTube(b.keywords),
    scanTwitter(b.keywords),
  ])

  return NextResponse.json({
    env: envCheck,
    keywords: b.keywords.slice(0, 5),
    subreddits: b.subreddits.slice(0, 5),
    redditProbe,
    reddit: {
      count: redditPosts.status === 'fulfilled' ? redditPosts.value.length : 0,
      error: redditPosts.status === 'rejected' ? String(redditPosts.reason) : null,
      sample: redditPosts.status === 'fulfilled' ? redditPosts.value.slice(0, 5).map(p => ({
        title: p.title,
        subreddit: p.subreddit,
        body_len: p.body.length,
        created_utc: p.created_utc,
      })) : [],
    },
    youtube: {
      count: youtubePosts.status === 'fulfilled' ? youtubePosts.value.length : 0,
      error: youtubePosts.status === 'rejected' ? String(youtubePosts.reason) : null,
      sample: youtubePosts.status === 'fulfilled' ? youtubePosts.value.slice(0, 3).map(p => ({
        title: p.title,
        body_len: p.body.length,
      })) : [],
    },
    twitter: {
      count: twitterPosts.status === 'fulfilled' ? twitterPosts.value.length : 0,
      error: twitterPosts.status === 'rejected' ? String(twitterPosts.reason) : null,
      sample: twitterPosts.status === 'fulfilled' ? twitterPosts.value.slice(0, 3).map(p => ({
        body: p.body.slice(0, 100),
      })) : [],
    },
  })
}
