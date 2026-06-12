export type TwitterResult = {
  id: string
  title: string
  body: string
  url: string
  author: string
  platform: 'twitter'
}

export async function scanTwitter(keywords: string[]): Promise<TwitterResult[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  if (!bearerToken) return []

  const results: TwitterResult[] = []
  const seen = new Set<string>()

  for (const keyword of keywords.slice(0, 4)) {
    try {
      const query = encodeURIComponent(`"${keyword}" -is:retweet lang:en`)
      const res = await fetch(
        `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=20&tweet.fields=text,author_id,created_at&expansions=author_id&user.fields=username`,
        { headers: { Authorization: `Bearer ${bearerToken}` } }
      )
      if (!res.ok) continue

      type TwitterTweet = { id: string; text: string; author_id: string }
      type TwitterUser = { id: string; username: string }
      type TwitterResponse = {
        data?: TwitterTweet[]
        includes?: { users?: TwitterUser[] }
      }
      const data = await res.json() as TwitterResponse
      const tweets = data.data ?? []
      const users = data.includes?.users ?? []
      const userMap = new Map(users.map(u => [u.id, u.username]))

      for (const tweet of tweets) {
        if (seen.has(tweet.id)) continue
        seen.add(tweet.id)

        const username = userMap.get(tweet.author_id) ?? 'unknown'
        results.push({
          id: tweet.id,
          title: `Tweet by @${username}`,
          body: tweet.text,
          url: `https://x.com/${username}/status/${tweet.id}`,
          author: username,
          platform: 'twitter',
        })
      }
    } catch { /* skip */ }
  }

  return results
}
