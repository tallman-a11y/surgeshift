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

  const [redditPosts, youtubePosts, twitterPosts] = await Promise.allSettled([
    scanReddit(b.keywords, b.subreddits),
    scanYouTube(b.keywords),
    scanTwitter(b.keywords),
  ])

  return NextResponse.json({
    reddit: {
      count: redditPosts.status === 'fulfilled' ? redditPosts.value.length : 0,
      error: redditPosts.status === 'rejected' ? String(redditPosts.reason) : null,
      sample: redditPosts.status === 'fulfilled' ? redditPosts.value.slice(0, 3).map(p => ({ title: p.title, subreddit: p.subreddit })) : [],
    },
    youtube: {
      count: youtubePosts.status === 'fulfilled' ? youtubePosts.value.length : 0,
      error: youtubePosts.status === 'rejected' ? String(youtubePosts.reason) : null,
    },
    twitter: {
      count: twitterPosts.status === 'fulfilled' ? twitterPosts.value.length : 0,
      error: twitterPosts.status === 'rejected' ? String(twitterPosts.reason) : null,
    },
  })
}
