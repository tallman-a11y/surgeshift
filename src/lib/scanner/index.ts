import { scanReddit, type RedditPost } from './reddit'
import { scanYouTube, type YouTubeResult } from './youtube'
import { scanTwitter, type TwitterResult } from './twitter'
import { scoreAndDraft, type Brand } from '../anthropic'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '../supabase/server'

export type RawPost = {
  id: string
  title: string
  body: string
  url: string
  author: string
  platform: string
  subreddit?: string
  publishedAt?: string
}

function redditToRaw(p: RedditPost): RawPost {
  return { id: p.id, title: p.title, body: p.body, url: p.url, author: p.author, platform: 'reddit', subreddit: p.subreddit, publishedAt: p.publishedAt ?? undefined }
}
function youtubeToRaw(p: YouTubeResult): RawPost {
  return { id: p.id, title: p.title, body: p.body, url: p.url, author: p.author, platform: 'youtube', publishedAt: p.publishedAt }
}
function twitterToRaw(p: TwitterResult): RawPost {
  return { id: p.id, title: p.title, body: p.body, url: p.url, author: p.author, platform: 'twitter' }
}

// Each scanner only consumes the head of the list (Reddit: 6 keywords + 4 subreddits,
// YouTube: 8 keywords, Twitter: 4), so without rotation a brand with 60 keywords was
// never searched past its first 8. Rotate by day so the nightly cron walks the whole
// list over time; repeat scans on the same day stay deterministic (de-dupe by thread_id).
function interleave<T>(...lists: T[][]): T[] {
  const out: T[] = []
  const longest = Math.max(0, ...lists.map(l => l.length))
  for (let i = 0; i < longest; i++) for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}

export function rotateForToday<T>(list: T[], stride = 5): T[] {
  if (list.length === 0) return list
  const day = Math.floor(Date.now() / 86_400_000)
  const offset = (day * stride) % list.length
  return [...list.slice(offset), ...list.slice(0, offset)]
}

export type ScanResult = {
  brand_id: string
  platform: string
  new_count: number
  total_scanned: number
  platforms: { reddit: number; youtube: number; twitter: number }
}

export async function runScan(
  brand: Brand & { keywords: string[]; subreddits: string[] },
  userId: string,
  client?: SupabaseClient,
  opts: { maxToScore?: number; maxAgeDays?: number } = {},
): Promise<ScanResult[]> {
  // Dashboard scans use the caller's session (RLS); the cron passes the service client.
  const supabase = client ?? await createClient()
  const keywords = rotateForToday(brand.keywords, 5)
  const subreddits = rotateForToday(brand.subreddits, 3)
  const results: ScanResult[] = []

  // Gather existing thread IDs to avoid re-processing
  const { data: existing } = await supabase
    .from('opportunities')
    .select('thread_id')
    .eq('brand_id', brand.id)
  const existingIds = new Set((existing ?? []).map(r => r.thread_id as string))

  // Collect all posts from all platforms. Recency windows live in each scanner:
  // stale threads are dropped BEFORE scoring so we never spend a Haiku call — or a
  // slot in the queue — on a thread nobody will read.
  const [redditPosts, youtubePosts, twitterPosts] = await Promise.all([
    scanReddit(keywords, subreddits, { maxAgeDays: opts.maxAgeDays }),
    scanYouTube(keywords, { commentMaxAgeDays: opts.maxAgeDays }),
    scanTwitter(keywords),
  ])

  // Interleave platforms before the scoring cap below; concatenating meant Reddit alone
  // filled the cap whenever it returned 25+ posts and YouTube was never scored.
  const allPosts: RawPost[] = interleave(
    redditPosts.map(redditToRaw),
    youtubePosts.map(youtubeToRaw),
    twitterPosts.map(twitterToRaw),
  )
    .filter(p => !existingIds.has(p.id))
    .filter(p => (p.title + p.body).trim().length > 30)

  let newCount = 0

  // Cap posts scored per scan to stay within the function timeout (60s manual, 300s cron)
  const postsToScore = allPosts.slice(0, opts.maxToScore ?? 25)

  // Score all posts in parallel
  const scored = await Promise.all(
    postsToScore.map(post =>
      scoreAndDraft(brand, post).catch(() => null)
    )
  )

  // Save opportunities with score >= 30
  await Promise.all(
    postsToScore.map(async (post, i) => {
      const result = scored[i]
      if (!result || result.score < 30) return
      try {
        await supabase.from('opportunities').insert({
          brand_id: brand.id,
          platform: post.platform,
          thread_url: post.url,
          thread_id: post.id,
          title: post.title,
          body: post.body.slice(0, 2000),
          author: post.author,
          subreddit: post.subreddit ?? null,
          score: result.score,
          score_reason: result.reason,
          drafted_reply: result.drafted_reply,
          status: 'pending',
          // The REAL publish date, not when we found it. NULL when the platform
          // (or Brave) would not tell us. See migration 003.
          source_published_at: post.publishedAt ?? null,
        })
        newCount++
      } catch { /* skip individual insert failures */ }
    })
  )

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
    platforms: {
      reddit: redditPosts.length,
      youtube: youtubePosts.length,
      twitter: twitterPosts.length,
    },
  })

  return results
}
