/**
 * What happened to a reply after we posted it.
 *
 * The platforms report engagement for free — upvotes, likes, replies, removals —
 * and it is the only honest measure of whether a reply was welcome. A removed
 * comment is the loudest signal available: it means the community rejected it,
 * and repeating whatever produced it is how accounts get banned.
 */

export type Outcome = {
  score: number | null
  replyCount: number | null
  removed: boolean
  raw?: unknown
}

/**
 * A reply we cannot find is treated as removed only when the platform answered
 * cleanly. A transport failure returns null so a network blip is never recorded
 * as a deletion.
 */
export async function fetchYouTubeOutcome(commentId: string, apiKey: string): Promise<Outcome | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/comments?part=snippet&id=${encodeURIComponent(commentId)}&key=${apiKey}`,
  )
  if (!res.ok) return null

  const data = await res.json().catch(() => null) as {
    items?: Array<{ snippet?: { likeCount?: number; totalReplyCount?: number } }>
  } | null
  if (!data) return null

  const item = data.items?.[0]
  if (!item) return { score: null, replyCount: null, removed: true }

  return {
    score: item.snippet?.likeCount ?? 0,
    replyCount: item.snippet?.totalReplyCount ?? null,
    removed: false,
    raw: item.snippet,
  }
}

export async function fetchRedditOutcome(fullname: string, token: string): Promise<Outcome | null> {
  const id = fullname.startsWith('t1_') ? fullname : `t1_${fullname}`
  const res = await fetch(`https://oauth.reddit.com/api/info?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'SurgeShift/1.0' },
  })
  if (!res.ok) return null

  const data = await res.json().catch(() => null) as {
    data?: { children?: Array<{ data?: { score?: number; num_comments?: number; removed?: boolean; banned_by?: unknown; body?: string } }> }
  } | null
  if (!data) return null

  const child = data.data?.children?.[0]?.data
  if (!child) return { score: null, replyCount: null, removed: true }

  // Reddit does not delete removed comments, it replaces the body with a marker
  // and sets banned_by — a comment still "exists" while being invisible.
  const removed = child.removed === true
    || child.banned_by != null
    || child.body === '[removed]'
    || child.body === '[deleted]'

  return {
    score: child.score ?? null,
    replyCount: child.num_comments ?? null,
    removed,
    raw: { score: child.score, removed: child.removed, banned_by: child.banned_by },
  }
}

/**
 * How the outcome reads against what we predicted. Used to calibrate scoring:
 * a removal on a thread we scored 90 is the most informative failure there is.
 */
export function classifyOutcome(outcome: Outcome): 'removed' | 'ignored' | 'received' | 'landed' {
  if (outcome.removed) return 'removed'
  const score = outcome.score ?? 0
  if (score <= 0) return 'ignored'
  if (score < 5) return 'received'
  return 'landed'
}
