export type YouTubeResult = {
  id: string
  title: string
  body: string
  url: string
  author: string
  platform: 'youtube'
  publishedAt?: string
}

// A comment from four years ago is not a conversation you can join. Videos get a
// wider window than comments because an evergreen video keeps attracting new
// commenters — it is the COMMENT date that decides whether a reply is seen.
export const YOUTUBE_VIDEO_MAX_AGE_DAYS = 365
export const YOUTUBE_COMMENT_MAX_AGE_DAYS = 120

function isEnglish(text: string): boolean {
  if (!text || text.length === 0) return false
  const ascii = text.split('').filter(c => c.charCodeAt(0) < 128).length
  return ascii / text.length > 0.75
}

function ageInDays(iso?: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return (Date.now() - t) / 86_400_000
}

export type YouTubeScanStats = { comments: number; staleComments: number; videos: number }

export async function scanYouTube(
  keywords: string[],
  opts: { videoMaxAgeDays?: number; commentMaxAgeDays?: number; stats?: YouTubeScanStats } = {},
): Promise<YouTubeResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return []

  const videoMaxAge = opts.videoMaxAgeDays ?? YOUTUBE_VIDEO_MAX_AGE_DAYS
  const commentMaxAge = opts.commentMaxAgeDays ?? YOUTUBE_COMMENT_MAX_AGE_DAYS
  const stats = opts.stats ?? { comments: 0, staleComments: 0, videos: 0 }
  const publishedAfter = new Date(Date.now() - videoMaxAge * 86_400_000).toISOString()

  const results: YouTubeResult[] = []
  const seen = new Set<string>()

  for (const keyword of keywords.slice(0, 8)) {
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=relevance&publishedAfter=${encodeURIComponent(publishedAfter)}&maxResults=15&relevanceLanguage=en&key=${apiKey}`
      )
      if (!searchRes.ok) {
        console.warn(`[youtube] Search failed ${searchRes.status} for "${keyword}"`)
        continue
      }

      type YouTubeSearchItem = {
        id: { videoId: string }
        snippet: {
          title: string
          description: string
          channelTitle: string
          publishedAt: string
        }
      }
      type YouTubeSearchResponse = { items?: YouTubeSearchItem[] }
      const data = await searchRes.json() as YouTubeSearchResponse
      const items = (data.items ?? []).filter(i => isEnglish(i.snippet.title))

      for (const item of items) {
        const videoId = item.id?.videoId
        if (!videoId) continue

        // Add the VIDEO ITSELF as a lead — title + description is the post body
        if (!seen.has(`video_${videoId}`)) {
          seen.add(`video_${videoId}`)
          const desc = item.snippet.description ?? ''
          const body = desc.length > 30 ? desc : item.snippet.title
          if (isEnglish(body)) {
            stats.videos++
            results.push({
              id: `yt_video_${videoId}`,
              title: item.snippet.title,
              body: body.slice(0, 800),
              url: `https://www.youtube.com/watch?v=${videoId}`,
              author: item.snippet.channelTitle,
              platform: 'youtube',
              publishedAt: item.snippet.publishedAt,
            })
          }
        }

        // Also scan comments for question-style engagement
        try {
          const commentsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=time&key=${apiKey}`
          )
          if (!commentsRes.ok) continue

          type YouTubeComment = {
            id: string
            snippet: { topLevelComment: { snippet: { textDisplay: string; authorDisplayName: string; publishedAt: string } } }
          }
          type YouTubeCommentsResponse = { items?: YouTubeComment[] }
          const comments = await commentsRes.json() as YouTubeCommentsResponse

          for (const comment of comments.items ?? []) {
            const snip = comment.snippet.topLevelComment.snippet
            const text = snip.textDisplay
            if (!isEnglish(text)) continue
            if (text.length < 25) continue

            // Looser filter — any question or resource-seeking signal
            const lower = text.toLowerCase()
            const isQuestion = lower.includes('?')
            const isResourceSeeking = ['recommend', 'looking for', 'how do', 'where can', 'any app',
              'any resource', 'study', 'what should', 'how to', 'best way', 'anyone know',
              'can you', 'is there', 'help me', 'need help', 'suggestions'].some(kw => lower.includes(kw))

            if (!isQuestion && !isResourceSeeking) continue
            if (seen.has(comment.id)) continue
            seen.add(comment.id)

            const age = ageInDays(snip.publishedAt)
            if (age !== null && age > commentMaxAge) { stats.staleComments++; continue }
            stats.comments++

            results.push({
              id: comment.id,
              title: `Comment on: ${item.snippet.title}`,
              body: text.slice(0, 800),
              url: `https://www.youtube.com/watch?v=${videoId}&lc=${comment.id}`,
              author: snip.authorDisplayName,
              platform: 'youtube',
              publishedAt: snip.publishedAt,
            })
          }
        } catch { /* skip comment fetch errors */ }
      }
    } catch (e) {
      console.error(`[youtube] Error for keyword "${keyword}":`, e)
    }
  }

  console.warn(`[youtube] ${stats.videos} videos · ${stats.comments} fresh comments · ${stats.staleComments} dropped as stale (>${commentMaxAge}d)`)
  return results
}
