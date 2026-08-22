import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidToken, TokenRefreshError, type PlatformConnection } from '@/lib/platform-tokens'

type Opportunity = {
  id: string
  platform: string
  thread_url: string
  drafted_reply: string
}

function extractRedditPostId(url: string): string | null {
  return url.match(/reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i)?.[1] ?? null
}

function extractYouTubeIds(url: string): { videoId: string | null; commentId: string | null } {
  const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? null
  const commentId = url.match(/[?&]lc=([^&]+)/)?.[1] ?? null
  return { videoId, commentId }
}

async function postToReddit(token: string, postId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SurgeShift/1.0',
    },
    body: new URLSearchParams({ thing_id: `t3_${postId}`, text }),
  })
  type RedditCommentResponse = { json?: { errors?: string[][] } }
  const data = await res.json() as RedditCommentResponse
  const errors = data.json?.errors ?? []
  if (!res.ok || errors.length > 0) return { ok: false, error: errors[0]?.join(' ') ?? `HTTP ${res.status}` }
  return { ok: true }
}

async function postToYouTube(token: string, videoId: string, commentId: string | null, text: string): Promise<{ ok: boolean; error?: string }> {
  // Reply to an existing comment, or post a new top-level comment on the video
  if (commentId) {
    const res = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text } }),
    })
    if (!res.ok) { const e = await res.json() as { error?: { message?: string } }; return { ok: false, error: e.error?.message } }
    return { ok: true }
  } else {
    const res = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } }),
    })
    if (!res.ok) { const e = await res.json() as { error?: { message?: string } }; return { ok: false, error: e.error?.message } }
    return { ok: true }
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { opportunityId, replyText } = await req.json() as { opportunityId: string; replyText: string }
  if (!opportunityId || !replyText?.trim()) {
    return NextResponse.json({ error: 'Missing opportunityId or replyText' }, { status: 400 })
  }

  // Load the opportunity
  const { data: opp } = await supabase
    .from('opportunities')
    .select('id, platform, thread_url, drafted_reply')
    .eq('id', opportunityId)
    .single()

  if (!opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
  const opportunity = opp as Opportunity

  // Load platform connection
  const { data: conn } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('platform', opportunity.platform)
    .single()

  if (!conn) {
    return NextResponse.json({
      error: `Connect your ${opportunity.platform === 'reddit' ? 'Reddit' : 'YouTube'} account in Settings first.`
    }, { status: 400 })
  }

  // A dead refresh token used to fall through here as "Bearer undefined" and surface
  // as a cryptic 401 from the platform. Now it is a clear "reconnect" message.
  let token: string
  try {
    token = await getValidToken(supabase, conn as PlatformConnection)
  } catch (err) {
    const message = err instanceof TokenRefreshError ? err.message : 'Could not refresh the platform token.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
  let result: { ok: boolean; error?: string }

  if (opportunity.platform === 'reddit') {
    const postId = extractRedditPostId(opportunity.thread_url)
    if (!postId) return NextResponse.json({ error: 'Could not extract Reddit post ID from URL' }, { status: 400 })
    result = await postToReddit(token, postId, replyText)
  } else if (opportunity.platform === 'youtube') {
    const { videoId, commentId } = extractYouTubeIds(opportunity.thread_url)
    if (!videoId) return NextResponse.json({ error: 'Could not extract YouTube video ID from URL' }, { status: 400 })
    result = await postToYouTube(token, videoId, commentId, replyText)
  } else {
    return NextResponse.json({ error: `Auto-posting not supported for ${opportunity.platform}` }, { status: 400 })
  }

  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Platform API error' }, { status: 502 })

  // Mark as posted
  await supabase.from('opportunities').update({
    status: 'posted',
    posted_at: new Date().toISOString(),
  }).eq('id', opportunityId)

  return NextResponse.json({ ok: true })
}
