// Reddit scanner via Brave Search API (site:reddit.com)
// Reddit blocks all direct server-side RSS/JSON access; Brave Search is free up to 2000/month

export type RedditPost = {
  id: string
  title: string
  body: string
  url: string
  subreddit: string
  author: string
  publishedAt: string | null
  score: number
}

// Reddit archives posts in most subs at 6 months — replies are rejected outright.
// Anything near that is also socially dead ("necroposting"), so the default window
// is far tighter. Callers can widen it, but nothing past the archive line is useful.
export const REDDIT_MAX_AGE_DAYS = 120

function extractSubreddit(url: string): string {
  return url.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? 'reddit'
}

function urlToId(url: string): string {
  const m = url.match(/comments\/([a-z0-9]+)/)
  return m ? m[1] : Buffer.from(url).toString('base64').slice(0, 16)
}

function ageInDays(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return (Date.now() - t) / 86_400_000
}

export type RedditScanStats = {
  seen: number
  keptFresh: number
  droppedStale: number
  droppedUnknownAge: number
}

export async function scanReddit(
  keywords: string[],
  subreddits: string[],
  opts: { maxAgeDays?: number; freshness?: string; stats?: RedditScanStats } = {},
): Promise<RedditPost[]> {
  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) {
    console.warn('[reddit] BRAVE_API_KEY not set — skipping Reddit scan')
    return []
  }

  const maxAgeDays = opts.maxAgeDays ?? REDDIT_MAX_AGE_DAYS
  // Brave's freshness filter: pd=day, pw=week, pm=month, py=year. Without it Brave
  // returns whatever ranks best all-time, which is how 2016 threads reached the queue.
  const freshness = opts.freshness ?? 'pm'
  const stats = opts.stats ?? { seen: 0, keptFresh: 0, droppedStale: 0, droppedUnknownAge: 0 }

  const results: RedditPost[] = []
  const seen = new Set<string>()

  // Build queries: keyword searches scoped to reddit.com
  const queries: string[] = []
  for (const kw of keywords.slice(0, 6)) {
    queries.push(`site:reddit.com ${kw}`)
  }
  for (const sub of subreddits.slice(0, 4)) {
    queries.push(`site:reddit.com/r/${sub} ${keywords[0] ?? ''}`)
  }

  for (const query of queries.slice(0, 10)) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&freshness=${encodeURIComponent(freshness)}`
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      })

      if (!res.ok) {
        console.warn(`[reddit] Brave Search error ${res.status} for query "${query}"`)
        continue
      }

      type BraveResult = { url: string; title: string; description: string; page_age?: string; age?: string }
      type BraveResponse = { web?: { results?: BraveResult[] } }
      const data = await res.json() as BraveResponse

      for (const item of data.web?.results ?? []) {
        if (!item.url.includes('reddit.com/r/')) continue
        if (!item.url.includes('/comments/')) continue

        const id = urlToId(item.url)
        if (seen.has(id)) continue
        seen.add(id)
        stats.seen++

        // Brave reports page_age as an ISO date when it knows one.
        const publishedAt = item.page_age ?? null
        const age = ageInDays(publishedAt)

        if (age === null) {
          // Unknown age. The freshness filter above already scoped the query, so
          // keep it rather than silently discarding a possibly-good lead.
          stats.droppedUnknownAge++
        } else if (age > maxAgeDays) {
          stats.droppedStale++
          continue
        } else {
          stats.keptFresh++
        }

        results.push({
          id,
          title: item.title.replace(/ : r\/\w+$/, '').replace(/ - Reddit$/, '').trim(),
          body: item.description ?? '',
          url: item.url,
          subreddit: extractSubreddit(item.url),
          author: '',
          publishedAt,
          score: 0,
        })
      }

      await new Promise(r => setTimeout(r, 200))
    } catch (e) {
      console.error(`[reddit] Error for query "${query}":`, e)
    }
  }

  console.warn(`[reddit] ${stats.seen} seen · ${stats.keptFresh} fresh · ${stats.droppedStale} dropped as stale (>${maxAgeDays}d) · ${stats.droppedUnknownAge} unknown age`)
  return results
}
