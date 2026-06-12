export type YouTubeResult = {
  id: string
  title: string
  body: string
  url: string
  author: string
  platform: 'youtube'
}

export async function scanYouTube(keywords: string[]): Promise<YouTubeResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return []

  const results: YouTubeResult[] = []
  const seen = new Set<string>()

  for (const keyword of keywords.slice(0, 5)) {
    try {
      // Search for relevant videos
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=date&maxResults=10&key=${apiKey}`
      )
      if (!searchRes.ok) continue

      type YouTubeSearchItem = {
        id: { videoId: string }
        snippet: { title: string; description: string; channelTitle: string }
      }
      type YouTubeSearchResponse = { items?: YouTubeSearchItem[] }
      const data = await searchRes.json() as YouTubeSearchResponse
      const items = data.items ?? []

      for (const item of items) {
        const videoId = item.id?.videoId
        if (!videoId || seen.has(videoId)) continue
        seen.add(videoId)

        // Get comments for the video
        const commentsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=relevance&key=${apiKey}`
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
          // Only include question-style comments
          if (!text.includes('?') && !text.toLowerCase().includes('recommend') && !text.toLowerCase().includes('looking for')) continue
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
