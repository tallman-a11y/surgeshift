// Reddit scanner via Google Custom Search (site:reddit.com)
// Replaces RSS approach which Reddit now blocks on server IPs

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
  // Use the post slug from the URL as a stable ID
  const m = url.match(/comments\/([a-z0-9]+)/)
  return m ? m[1] : Buffer.from(url).toString('base64').slice(0, 16)
}

export async function scanReddit(keywords: string[], subreddits: string[]): Promise<RedditPost[]> {
  const apiKey = process.env.GOOGLE_API_KEY
  const cseId = process.env.GOOGLE_CSE_ID

  if (!apiKey || !cseId) {
    console.warn('[reddit] GOOGLE_API_KEY or GOOGLE_CSE_ID not set — skipping Reddit scan')
    return []
  }

  const results: RedditPost[] = []
  const seen = new Set<string>()

  // Build query list: keywords alone + keyword+subreddit combos
  const queries: string[] = []
  for (const kw of keywords.slice(0, 6)) {
    queries.push(kw)
  }
  // Also targeted subreddit searches
  for (const sub of subreddits.slice(0, 4)) {
    const topKw = keywords[0]
    if (topKw) queries.push(`site:reddit.com/r/${sub} ${topKw}`)
  }

  for (const query of queries.slice(0, 10)) {
    try {
      const q = query.startsWith('site:') ? query : `site:reddit.com/r/ ${query}`
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(q)}&num=10&dateRestrict=w1`
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[reddit] Google CSE error ${res.status} for query "${query}"`)
        continue
      }

      type CSEItem = {
        title: string
        link: string
        snippet: string
      }
      type CSEResponse = { items?: CSEItem[] }
      const data = await res.json() as CSEResponse

      for (const item of data.items ?? []) {
        if (!item.link.includes('reddit.com/r/')) continue
        // Skip subreddit listing pages, only keep post links
        if (!item.link.includes('/comments/')) continue

        const id = urlToId(item.link)
        if (seen.has(id)) continue
        seen.add(id)

        results.push({
          id,
          title: item.title.replace(/ : r\/\w+$/, '').replace(/ - Reddit$/, '').trim(),
          body: item.snippet ?? '',
          url: item.link,
          subreddit: extractSubreddit(item.link),
          author: '',
          created_utc: Math.floor(Date.now() / 1000),
          score: 0,
        })
      }

      // Stay under Google's rate limits
      await new Promise(r => setTimeout(r, 200))
    } catch (e) {
      console.error(`[reddit] Error for query "${query}":`, e)
    }
  }

  return results
}
