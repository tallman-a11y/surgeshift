export type YouTubeResult = {
  id: string
  title: string
  body: string
  url: string
  author: string
  platform: 'youtube'
}

const ENGLISH_PATTERN = /^[\x00-\x7F\s.,!?'"()\-:;@#$%&*]+$/

function isEnglish(text: string): boolean {
  // Rough check — if >80% of chars are ASCII it's likely English
  const ascii = text.split('').filter(c => c.charCodeAt(0) < 128).length
  return ascii / text.length > 0.8
}

export async function scanYouTube(keywords: string[]): Promise<YouTubeResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return []

  const results: YouTubeResult[] = []
  const seen = new Set<string>()

  for (const keyword of keywords.slice(0, 5)) {
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=date&maxResults=10&relevanceLanguage=en&key=${apiKey}`
      )
      if (!searchRes.ok) continue

      type YouTubeSearchItem = {
        id: { videoId: string }
        snippet: { title: string; description: string; channelTitle: string; defaultAudioLanguage?: string; defaultLanguage?: string }
      }
      type YouTubeSearchResponse = { items?: YouTubeSearchItem[] }
      const data = await searchRes.json() as YouTubeSearchResponse
      const items = (data.items ?? []).filter(i => {
        const title = i.snippet.title
        return isEnglish(title)
      })

      for (const item of items) {
        const videoId = item.id?.videoId
        if (!videoId || seen.has(videoId)) continue
        seen.add(videoId)

        const commentsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=25&order=relevance&key=${apiKey}`
        )
        if (!commentsRes.ok) continue

        type YouTubeComment = {
          id: string
          snippet: { topLevelComment: { snippet: { textDisplay: string; authorDisplayName: string } } }
        }
        type YouTubeCommentsResponse = { items?: YouTubeComment[] }
        const comments = await commentsRes.json() as YouTubeCommentsResponse

        for (const comment of comments.items ?? []) {
          const text = comment.snippet.topLevelComment.snippet.textDisplay
          if (!isEnglish(text)) continue
          if (text.length < 30) continue
          // Only include question-style or recommendation-seeking comments
          const lower = text.toLowerCase()
          if (!lower.includes('?') && !lower.includes('recommend') && !lower.includes('looking for') && !lower.includes('how do') && !lower.includes('where can') && !lower.includes('any app') && !lower.includes('study') && !lower.includes('resource')) continue
          if (seen.has(comment.id)) continue
          seen.add(comment.id)

          results.push({
            id: comment.id,
            title: `Comment on: ${item.snippet.title}`,
            body: text.slice(0, 800),
            url: `https://www.youtube.com/watch?v=${videoId}&lc=${comment.id}`,
            author: comment.snippet.topLevelComment.snippet.authorDisplayName,
            platform: 'youtube',
          })
        }
      }
    } catch { /* skip on error */ }
  }

  return results
}
