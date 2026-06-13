import { scanReddit, type RedditPost } from './reddit'
import { scanYouTube, type YouTubeResult } from './youtube'
import { scanTwitter, type TwitterResult } from './twitter'
import { scoreAndDraft, type Brand } from '../anthropic'
import { createClient } from '../supabase/server'

export type RawPost = {
  id: string
  title: string
  body: string
  url: string
  author: string
  platform: string
  subreddit?: string
}

function redditToRaw(p: RedditPost): RawPost {
  return { id: p.id, title: p.title, body: p.body, url: p.url, author: p.author, platform: 'reddit', subreddit: p.subreddit }
}
function youtubeToRaw(p: YouTubeResult): RawPost {
  return { id: p.id, title: p.title, body: p.body, url: p.url, author: p.author, platform: 'youtube' }
}
function twitterToRaw(p: TwitterResult): RawPost {
  return { id: p.id, title: p.title, body: p.body, url: p.url, author: p.author, platform: 'twitter' }
}

export type ScanResult = {
  brand_id: string
  platform: string
  new_count: number
  total_scanned: number
}

export async function runScan(brand: Brand & { keywords: string[]; subreddits: string[] }, userId: string): Promise<ScanResult[]> {
  const supabase = await createClient()
  const results: ScanResult[] = []

  // Gather existing thread IDs to avoid re-processing
  const { data: existing } = await supabase
    .from('opportunities')
    .select('thread_id')
    .eq('brand_id', brand.id)
  const existingIds = new Set((existing ?? []).map(r => r.thread_id as string))

  // Collect all posts from all platforms
  const [redditPosts, youtubePosts, twitterPosts] = await Promise.all([
    scanReddit(brand.keywords, brand.subreddits),
    scanYouTube(brand.keywords),
    scanTwitter(brand.keywords),
  ])

  const allPosts: RawPost[] = [
    ...redditPosts.map(redditToRaw),
    ...youtubePosts.map(youtubeToRaw),
    ...twitterPosts.map(twitterToRaw),
  ]
    .filter(p => !existingIds.has(p.id))
    // Drop posts with no meaningful text — image-only posts etc.
    .filter(p => (p.title + p.body).trim().length > 30)

  let newCount = 0

  // Score each post and save opportunities with score >= 30
  for (const post of allPosts) {
    try {
      const scored = await scoreAndDraft(brand, post)
      if (scored.score < 30) continue

      await supabase.from('opportunities').insert({
        brand_id: brand.id,
        platform: post.platform,
        thread_url: post.url,
        thread_id: post.id,
        title: post.title,
        body: post.body.slice(0, 2000),
        author: post.author,
        subreddit: post.subreddit ?? null,
        score: scored.score,
        score_reason: scored.reason,
        drafted_reply: scored.drafted_reply,
        status: 'pending',
      })
      newCount++
    } catch { /* skip individual failures */ }
  }

  // Log the scan run
  await supabase.from('scan_runs').insert({
    user_id: userId,
    brand_id: brand.id,
    platform: 'all',
    opportunities_found: newCount,
  })

  results.push({
    brand_id: brand.id,
    platform: 'all',
    new_count: newCount,
    total_scanned: allPosts.length,
  })

  return results
}
