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

const REDDIT_UA = 'SurgeShift/1.0 (contact@allshiftai.com)'

function parseAtomFeed(xml: string, fallbackSubreddit = ''): RedditPost[] {
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? []

  return entries.map(entry => {
    const title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '')
      .replace(/<!\[CDATA\[|\]\]>/g, '').trim()

    const url = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? ''

    const author = (entry.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '').trim()

    const updated = (entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] ?? '').trim()
    const created_utc = updated ? Math.floor(new Date(updated).getTime() / 1000) : 0

    const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? ''
    const body = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 1000)

    const idRaw = (entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? '').trim()
    const id = idRaw.split('_').pop() ?? idRaw

    const subreddit = url.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? fallbackSubreddit

    return { id, title, body, url, subreddit, author, created_utc, score: 0 }
  }).filter(p => p.id && p.title && p.url)
}

async function fetchRSS(query: string, subreddit?: string, limit = 25): Promise<RedditPost[]> {
  const base = subreddit
    ? `https://www.reddit.com/r/${subreddit}/search.rss`
    : 'https://www.reddit.com/search.rss'

  const params = new URLSearchParams({
    q: query,
    sort: 'new',
    t: 'week',
    limit: String(limit),
    restrict_sr: subreddit ? 'true' : 'false',
  })

  const res = await fetch(`${base}?${params}`, {
    headers: { 'User-Agent': REDDIT_UA },
  })

  if (!res.ok) return []
  const xml = await res.text()
  return parseAtomFeed(xml, subreddit)
}

export async function scanReddit(keywords: string[], subreddits: string[]): Promise<RedditPost[]> {
  const results: RedditPost[] = []
  const seen = new Set<string>()

  const tasks: Promise<RedditPost[]>[] = []

  for (const keyword of keywords.slice(0, 8)) {
    tasks.push(fetchRSS(keyword))
    for (const sub of subreddits.slice(0, 6)) {
      tasks.push(fetchRSS(keyword, sub, 15))
    }
  }

  // Batch in groups of 5 with 1s delay to be respectful
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
