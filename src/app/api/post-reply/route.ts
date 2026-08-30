import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidToken, TokenRefreshError, type PlatformConnection } from '@/lib/platform-tokens'
import { buildTrackedReply, type BrandForTracking, type OpportunityForTracking } from '@/lib/tracked-reply'
import { recordPostOutcome } from '@/lib/learning'
import { evaluatePosting, type PolicyBrand } from '@/lib/posting-policy'

type Opportunity = {
  id: string
  brand_id: string
  platform: string
  thread_url: string
  title: string | null
  body: string | null
  subreddit: string | null
  source_published_at: string | null
  drafted_reply: string
  tracked_code: string | null
}

function extractRedditPostId(url: string): string | null {
  return url.match(/reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i)?.[1] ?? null
}

function extractYouTubeIds(url: string): { videoId: string | null; commentId: string | null } {
  const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? null
  const commentId = url.match(/[?&]lc=([^&]+)/)?.[1] ?? null
  return { videoId, commentId }
}

/** Identifies the comment we created, so its outcome can be followed up later. */
type PostResult = { ok: boolean; error?: string; commentId?: string; permalink?: string }

async function postToReddit(token: string, postId: string, text: string): Promise<PostResult> {
  const res = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SurgeShift/1.0',
    },
    body: new URLSearchParams({ thing_id: `t3_${postId}`, text, api_type: 'json' }),
  })
  type RedditThing = { data?: { name?: string; id?: string; permalink?: string } }
  type RedditCommentResponse = { json?: { errors?: string[][]; data?: { things?: RedditThing[] } } }
  const data = await res.json() as RedditCommentResponse
  const errors = data.json?.errors ?? []
  if (!res.ok || errors.length > 0) return { ok: false, error: errors[0]?.join(' ') ?? `HTTP ${res.status}` }

  const thing = data.json?.data?.things?.[0]?.data
  return {
    ok: true,
    // `name` is the fullname (t1_abc123) the info endpoint wants.
    commentId: thing?.name ?? (thing?.id ? `t1_${thing.id}` : undefined),
    permalink: thing?.permalink ? `https://www.reddit.com${thing.permalink}` : undefined,
  }
}

async function postToYouTube(token: string, videoId: string, commentId: string | null, text: string): Promise<PostResult> {
  // Reply to an existing comment, or post a new top-level comment on the video
  if (commentId) {
    const res = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text } }),
    })
    if (!res.ok) { const e = await res.json() as { error?: { message?: string } }; return { ok: false, error: e.error?.message } }
    const created = await res.json() as { id?: string }
    return {
      ok: true,
      commentId: created.id,
      permalink: created.id ? `https://www.youtube.com/watch?v=${videoId}&lc=${created.id}` : undefined,
    }
  } else {
    const res = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } }),
    })
    if (!res.ok) { const e = await res.json() as { error?: { message?: string } }; return { ok: false, error: e.error?.message } }
    const created = await res.json() as { id?: string; snippet?: { topLevelComment?: { id?: string } } }
    // For a thread the comment we care about is the top-level comment inside it.
    const id = created.snippet?.topLevelComment?.id ?? created.id
    return {
      ok: true,
      commentId: id,
      permalink: id ? `https://www.youtube.com/watch?v=${videoId}&lc=${id}` : undefined,
    }
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
    .select('id, brand_id, platform, thread_url, title, body, subreddit, source_published_at, drafted_reply, tracked_code')
    .eq('id', opportunityId)
    .single()

  if (!opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
  const opportunity = opp as Opportunity

  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, url, user_id, subreddits, max_posts_per_day, subreddit_cooldown_days')
    .eq('id', opportunity.brand_id)
    .single()

  // The governor runs before anything is sent. A Reddit ban is permanent, so the
  // server refuses rather than trusting the client to have hidden the button.
  if (brand) {
    const verdict = await evaluatePosting(supabase, brand as PolicyBrand, {
      id: opportunity.id,
      platform: opportunity.platform,
      subreddit: opportunity.subreddit,
      source_published_at: opportunity.source_published_at,
    })
    if (verdict.decision === 'block') {
      return NextResponse.json({
        error: verdict.reasons.filter(r => r.severity === 'block').map(r => r.message).join(' '),
        policy: verdict,
      }, { status: 409 })
    }
  }

  // Tag the link so this reply is attributable, reusing the code if Copy already
  // minted one — otherwise the same thread would report under two identities.

  let outgoingText = replyText
  if (brand) {
    const tracked = await buildTrackedReply(
      supabase,
      opportunity as OpportunityForTracking,
      brand as BrandForTracking,
      replyText,
    )
    outgoingText = tracked.text
  }

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
  let result: PostResult

  if (opportunity.platform === 'reddit') {
    const postId = extractRedditPostId(opportunity.thread_url)
    if (!postId) return NextResponse.json({ error: 'Could not extract Reddit post ID from URL' }, { status: 400 })
    result = await postToReddit(token, postId, outgoingText)
  } else if (opportunity.platform === 'youtube') {
    const { videoId, commentId } = extractYouTubeIds(opportunity.thread_url)
    if (!videoId) return NextResponse.json({ error: 'Could not extract YouTube video ID from URL' }, { status: 400 })
    result = await postToYouTube(token, videoId, commentId, outgoingText)
  } else {
    return NextResponse.json({ error: `Auto-posting not supported for ${opportunity.platform}` }, { status: 400 })
  }

  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Platform API error' }, { status: 502 })

  // Mark as posted, keeping the exact text that went out — the delta between it
  // and drafted_reply is the training signal.
  await supabase.from('opportunities').update({
    status: 'posted',
    posted_at: new Date().toISOString(),
    posted_reply_text: outgoingText,
    // Remember which comment is ours, or its outcome can never be followed up.
    posted_comment_id: result.commentId ?? null,
    posted_permalink: result.permalink ?? null,
  }).eq('id', opportunityId)

  const signal = await recordPostOutcome(supabase, {
    userId: user.id,
    threadContext: `${opportunity.title ?? ''}\n\n${opportunity.body ?? ''}`.trim(),
    draftedReply: opportunity.drafted_reply,
    postedReply: replyText,
    metadata: {
      opportunity_id: opportunity.id,
      platform: opportunity.platform,
      subreddit: opportunity.subreddit,
      tracked_code: opportunity.tracked_code,
    },
  })

  return NextResponse.json({ ok: true, signal })
}
