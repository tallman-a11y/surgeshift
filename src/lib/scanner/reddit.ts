// Reddit scanner via Brave Search API (site:reddit.com)
// Reddit blocks all direct server-side RSS/JSON access; Brave Search is free up to 2000/month

export type RedditPost = {
  id: string
  title: string
  body: string
  url: string
  subreddit: string
  author: string
  created_utc: number
  score: number
}

function extractSubreddit(url: string): string {
  return url.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? 'reddit'
}

function urlToId(url: string): string {
  const m = url.match(/comments\/([a-z0-9]+)/)
  return m ? m[1] : Buffer.from(url).toString('base64').slice(0, 16)
}

export async function scanReddit(keywords: string[], subreddits: string[]): Promise<RedditPost[]> {
  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) {
    console.warn('[reddit] BRAVE_API_KEY not set — skipping Reddit scan')
    return []
  }

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
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&freshness=pm`
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

      type BraveResult = { url: string; title: string; description: string }
      type BraveResponse = { web?: { results?: BraveResult[] } }
      const data = await res.json() as BraveResponse

      for (const item of data.web?.results ?? []) {
        if (!item.url.includes('reddit.com/r/')) continue
        if (!item.url.includes('/comments/')) continue

        const id = urlToId(item.url)
        if (seen.has(id)) continue
        seen.add(id)

        results.push({
          id,
          title: item.title.replace(/ : r\/\w+$/, '').replace(/ - Reddit$/, '').trim(),
          body: item.description ?? '',
          url: item.url,
          subreddit: extractSubreddit(item.url),
          author: '',
          created_utc: Math.floor(Date.now() / 1000),
          score: 0,
        })
      }

      await new Promise(r => setTimeout(r, 200))
    } catch (e) {
      console.error(`[reddit] Error for query "${query}":`, e)
    }
  }

  return results
}
