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

let cachedToken: { token: string; expires: number } | null = null

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'User-Agent': REDDIT_UA,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) return null

  type TokenResponse = { access_token: string; expires_in: number }
  const data = await res.json() as TokenResponse
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.token
}

async function searchReddit(token: string, query: string, subreddit?: string, limit = 25): Promise<RedditPost[]> {
  const base = subreddit
    ? `https://oauth.reddit.com/r/${subreddit}/search`
    : 'https://oauth.reddit.com/search'

  const params = new URLSearchParams({
    q: query,
    sort: 'new',
    t: 'week',
    limit: String(limit),
    restrict_sr: subreddit ? 'true' : 'false',
  })

  const res = await fetch(`${base}?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': REDDIT_UA,
    },
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
  const token = await getAccessToken()
  if (!token) {
    console.warn('Reddit: no credentials configured — skipping')
    return []
  }

  const results: RedditPost[] = []
  const seen = new Set<string>()

  const tasks: Promise<RedditPost[]>[] = []

  for (const keyword of keywords.slice(0, 8)) {
    tasks.push(searchReddit(token, keyword))
    for (const sub of subreddits.slice(0, 6)) {
      tasks.push(searchReddit(token, keyword, sub, 15))
    }
  }

  // Batch in groups of 5 to respect Reddit rate limit (60 req/min OAuth)
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

  const weekAgo = Date.now() / 1000 - 7 * 86400
  return results
    .filter(p => p.created_utc > weekAgo)
    .sort((a, b) => b.created_utc - a.created_utc)
}
