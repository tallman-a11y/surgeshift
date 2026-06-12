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

const REDDIT_UA = 'SurgeShift/1.0 (marketing intelligence; contact@allshiftai.com)'

async function searchReddit(query: string, subreddit?: string, limit = 25): Promise<RedditPost[]> {
  const base = subreddit
    ? `https://www.reddit.com/r/${subreddit}/search.json`
    : 'https://www.reddit.com/search.json'

  const params = new URLSearchParams({
    q: query,
    sort: 'new',
    t: 'week',
    limit: String(limit),
    restrict_sr: subreddit ? 'true' : 'false',
  })

  const res = await fetch(`${base}?${params}`, {
    headers: { 'User-Agent': REDDIT_UA },
    next: { revalidate: 0 },
  })

  if (!res.ok) return []

  type RedditChild = {
    data: {
      id: string
      title: string
      selftext: string
      permalink: string
      subreddit: string
      author: string
      created_utc: number
      score: number
    }
  }
  type RedditResponse = { data?: { children?: RedditChild[] } }
  const data = await res.json() as RedditResponse
  const children = data?.data?.children ?? []

  return children
    .filter(c => c.data.selftext !== '[removed]' && c.data.selftext !== '[deleted]')
    .map(c => ({
      id: c.data.id,
      title: c.data.title,
      body: c.data.selftext?.slice(0, 1000) ?? '',
      url: `https://www.reddit.com${c.data.permalink}`,
      subreddit: c.data.subreddit,
      author: c.data.author,
      created_utc: c.data.created_utc,
      score: c.data.score,
    }))
}

export async function scanReddit(keywords: string[], subreddits: string[]): Promise<RedditPost[]> {
  const results: RedditPost[] = []
  const seen = new Set<string>()

  // Search each keyword in each subreddit + global
  const tasks: Promise<RedditPost[]>[] = []

  for (const keyword of keywords.slice(0, 8)) {
    tasks.push(searchReddit(keyword))
    for (const sub of subreddits.slice(0, 6)) {
      tasks.push(searchReddit(keyword, sub, 15))
    }
  }

  // Throttle: batch in groups of 5 to respect Reddit rate limit
  for (let i = 0; i < tasks.length; i += 5) {
    const batch = tasks.slice(i, i + 5)
    const batchResults = await Promise.allSettled(batch)
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        for (const post of r.value) {
          if (!seen.has(post.id)) {
            seen.add(post.id)
            results.push(post)
          }
        }
      }
    }
    if (i + 5 < tasks.length) await new Promise(r => setTimeout(r, 1000))
  }

  // Filter to posts from last 7 days and sort by recency
  const weekAgo = Date.now() / 1000 - 7 * 86400
  return results
    .filter(p => p.created_utc > weekAgo)
    .sort((a, b) => b.created_utc - a.created_utc)
}
