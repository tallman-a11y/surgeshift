import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { runScan } from '@/lib/scanner'
import {
  VoyageEmbeddingProvider,
  retrieveRelevantMemories,
  recordMemory,
  formatMemoriesForPrompt,
} from '@allshift/core'
import { SupabaseMemoryStore } from '@/lib/supabase-memory-store'
import { createServiceClient } from '@/lib/supabase/service'
import { surgeShiftPersona } from '@/lib/shift-brain'
import { recordSignal } from '@/lib/learning'

export const runtime = 'nodejs'
export const maxDuration = 60

const embedding = new VoyageEmbeddingProvider(process.env.VOYAGE_API_KEY)
const memoryStore = new SupabaseMemoryStore(createServiceClient())

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type BrandRow = {
  id: string
  name: string
  tagline: string | null
  description: string
  url: string
  keywords: string[]
  subreddits: string[]
  voice_notes?: string | null
  disclosure_line?: string | null
  active: boolean
}

type ClientMessage = {
  role: 'user' | 'assistant'
  content: string
}

const SHIFT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_brands',
    description: 'Get all brands the user manages with their current stats',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_opportunities',
    description: 'Get marketing opportunities for a specific brand. Returns thread title, platform, AI score, drafted reply, and URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_id: { type: 'string', description: 'Brand UUID' },
        status: { type: 'string', enum: ['pending', 'posted', 'dismissed'] },
        limit: { type: 'number', description: 'Max results, default 8' },
      },
      required: ['brand_id'],
    },
  },
  {
    name: 'run_scan',
    description: 'Scan Reddit, YouTube, and Twitter for new marketing opportunities for a brand. Takes 15–30 seconds.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_id: { type: 'string', description: 'Brand UUID to scan for' },
      },
      required: ['brand_id'],
    },
  },
  {
    name: 'post_reply',
    description: 'Post a reply to a specific opportunity on its platform (Reddit or YouTube). The user must have connected their account in Settings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        opportunity_id: { type: 'string', description: 'Opportunity UUID' },
        reply_text: { type: 'string', description: 'The exact text to post as a reply' },
      },
      required: ['opportunity_id', 'reply_text'],
    },
  },
  {
    name: 'create_brand',
    description: 'Create a new brand profile after gathering all necessary information through conversation. Shift suggests keywords and subreddits automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        tagline: { type: 'string' },
        description: { type: 'string', description: 'Detailed description of what the product does, who it\'s for, what problems it solves' },
        url: { type: 'string', description: 'Website URL (must include https://)' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'High-intent search keywords' },
        subreddits: { type: 'array', items: { type: 'string' }, description: 'Subreddits to monitor (without r/)' },
        voice_notes: { type: 'string', description: 'Tone and voice guidelines' },
        disclosure_line: { type: 'string', description: 'Disclosure appended to every reply' },
      },
      required: ['name', 'description', 'url', 'keywords'],
    },
  },
  {
    name: 'get_performance',
    description: 'Get performance metrics for a brand: opportunities found, replies posted, top platforms, scan history.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_id: { type: 'string' },
        days: { type: 'number', description: 'Days to look back, default 30' },
      },
      required: ['brand_id'],
    },
  },
  {
    name: 'generate_content',
    description: 'Generate a full piece of content (blog post, tweet thread, LinkedIn article, email sequence, or video script) based on a high-performing opportunity or topic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_id: { type: 'string' },
        content_type: {
          type: 'string',
          enum: ['blog_post', 'tweet_thread', 'linkedin_post', 'email_sequence', 'video_script'],
        },
        source_opportunity_id: { type: 'string', description: 'Optional: base content on this opportunity' },
        topic: { type: 'string', description: 'Topic or angle if no source opportunity' },
      },
      required: ['brand_id', 'content_type'],
    },
  },
  {
    name: 'dismiss_opportunity',
    description: 'Dismiss an opportunity that is not a good fit. Always pass a short reason — it trains the scoring.',
    input_schema: {
      type: 'object' as const,
      properties: {
        opportunity_id: { type: 'string' },
        reason: { type: 'string', description: 'Why this is not a fit, in a few words (e.g. "thread is dead", "sub bans self-promo", "already answered well")' },
      },
      required: ['opportunity_id'],
    },
  },
]

function getToolLabel(name: string): string {
  const labels: Record<string, string> = {
    get_brands: 'Loading your brands...',
    get_opportunities: 'Fetching opportunities...',
    run_scan: 'Scanning Reddit, YouTube, and Twitter...',
    post_reply: 'Posting reply...',
    create_brand: 'Creating brand profile...',
    get_performance: 'Analyzing performance...',
    generate_content: 'Generating content...',
    dismiss_opportunity: 'Dismissing...',
  }
  return labels[name] ?? 'Working...'
}

function buildSystemPrompt(brands: BrandRow[], pendingCounts: Record<string, number>): string {
  const brandContext = brands.length === 0
    ? 'The user has no brands yet. Your first priority is to help them create their first brand through conversation — ask what their product does, who it\'s for, and get the website URL. Then suggest keywords and subreddits automatically based on the description.'
    : brands.map(b => {
        const pending = pendingCounts[b.id] ?? 0
        return `- **${b.name}** (id: ${b.id}): ${(b.tagline || b.description).slice(0, 120)} | ${pending} pending opportunities | ${b.active ? 'active' : 'paused'}`
      }).join('\n')

  return `You are Shift, the intelligence core of SurgeShift — a next-generation marketing OS that finds high-intent conversations across the internet and turns them into real business growth.

You are not a passive assistant. You are a proactive marketing intelligence that discovers opportunities, drafts human-sounding replies, surfaces insights, and acts on behalf of the brands in your care. The user's only job is to make decisions. You handle everything else.

## User's brands
${brandContext}

## Core behavior
- **Always have a recommended next action.** Never leave the user without a clear path forward.
- **Lead with what matters most.** If there are pending opportunities, surface the best one immediately with context.
- **If the user seems unsure**, proactively surface the most important thing and explain why.
- **Plain language always.** Anyone — technical or not — should immediately understand what you're saying and why it matters.
- **Be direct and conversational.** Never corporate, never vague, never padded.
- **When you take an action** (scan, post, generate content), confirm clearly what happened and what the result means.
- **For new brands**: ask what the product does, who it's for, and what the URL is. Then YOU suggest the keywords and subreddits — don't ask the user to think of them. Once confirmed, create it.
- **For opportunities**: always state the platform, score (0–100), and what specifically makes it relevant — enough for the user to decide in 10 seconds.

## What you can do
- Find new marketing opportunities across Reddit, YouTube, and Twitter
- Post replies directly from SurgeShift (Reddit and YouTube, if accounts are connected)
- Generate blog posts, tweet threads, LinkedIn articles, email sequences, and video scripts
- Track performance and tell the user what's working and what isn't
- Create and manage brand profiles through conversation
- Walk users through social media account creation step by step

## Tone
Knowledgeable, direct, confident. You're the most advanced marketing intelligence in the world. Act like it — but speak like a trusted colleague, not a product.`
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
  brands: BrandRow[]
): Promise<string> {
  switch (toolName) {
    case 'get_brands': {
      if (brands.length === 0) return 'No brands configured yet.'
      const counts = await Promise.all(
        brands.map(async b => {
          const { count } = await supabase
            .from('opportunities')
            .select('id', { count: 'exact', head: true })
            .eq('brand_id', b.id)
            .eq('status', 'pending')
          return { id: b.id, count: count ?? 0 }
        })
      )
      const countMap = Object.fromEntries(counts.map(c => [c.id, c.count]))
      return JSON.stringify(
        brands.map(b => ({
          id: b.id,
          name: b.name,
          tagline: b.tagline,
          description: b.description.slice(0, 200),
          url: b.url,
          active: b.active,
          pending_opportunities: countMap[b.id] ?? 0,
        }))
      )
    }

    case 'get_opportunities': {
      const { brand_id, status = 'pending', limit = 8 } = toolInput as {
        brand_id: string
        status?: string
        limit?: number
      }
      const { data } = await supabase
        .from('opportunities')
        .select('id, platform, title, score, score_reason, drafted_reply, thread_url, subreddit, found_at')
        .eq('brand_id', brand_id)
        .eq('status', status)
        .order('score', { ascending: false })
        .limit(limit)
      if (!data || data.length === 0) return `No ${status} opportunities found.`
      return JSON.stringify(
        data.map(o => ({
          id: o.id,
          platform: o.platform,
          subreddit: o.subreddit,
          title: o.title?.slice(0, 120),
          score: o.score,
          reason: o.score_reason,
          reply_preview: o.drafted_reply?.slice(0, 300),
          url: o.thread_url,
          found: o.found_at,
        }))
      )
    }

    case 'run_scan': {
      const { brand_id } = toolInput as { brand_id: string }
      const brand = brands.find(b => b.id === brand_id)
      if (!brand) return 'Brand not found.'
      try {
        const results = await runScan(brand as Parameters<typeof runScan>[0], userId)
        const total = results.reduce((s, r) => s + r.new_count, 0)
        const scanned = results.reduce((s, r) => s + r.total_scanned, 0)
        return `Scan complete for ${brand.name}. Scanned ${scanned} posts. Found ${total} new ${total === 1 ? 'opportunity' : 'opportunities'}.`
      } catch (e) {
        return `Scan failed: ${e instanceof Error ? e.message : 'Unknown error'}`
      }
    }

    case 'post_reply': {
      const { opportunity_id, reply_text } = toolInput as { opportunity_id: string; reply_text: string }

      const { data: opp } = await supabase
        .from('opportunities')
        .select('id, platform, thread_url')
        .eq('id', opportunity_id)
        .single()
      if (!opp) return 'Opportunity not found.'

      const { data: conn } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', opp.platform)
        .single()
      if (!conn) return `No ${opp.platform} account connected. Tell the user to connect their account in Settings.`

      // Check token expiry and refresh if needed
      let token = conn.access_token as string
      const expired = conn.expires_at && new Date(conn.expires_at as string).getTime() < Date.now() + 60_000
      if (expired) {
        if (opp.platform === 'youtube') {
          const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: conn.refresh_token as string,
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            }),
          })
          const data = await res.json() as { access_token?: string }
          if (data.access_token) {
            token = data.access_token
            await supabase.from('platform_connections').update({
              access_token: token,
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
            }).eq('id', conn.id)
          }
        } else if (opp.platform === 'reddit') {
          const res = await fetch('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
              'User-Agent': 'SurgeShift/1.0',
            },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token as string }),
          })
          const data = await res.json() as { access_token?: string }
          if (data.access_token) {
            token = data.access_token
            await supabase.from('platform_connections').update({
              access_token: token,
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
            }).eq('id', conn.id)
          }
        }
      }

      let postOk = false
      let postError = ''

      if (opp.platform === 'reddit') {
        const postId = (opp.thread_url as string).match(/reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i)?.[1]
        if (!postId) return 'Could not extract Reddit post ID.'
        const res = await fetch('https://oauth.reddit.com/api/comment', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SurgeShift/1.0',
          },
          body: new URLSearchParams({ thing_id: `t3_${postId}`, text: reply_text }),
        })
        const data = await res.json() as { json?: { errors?: string[][] } }
        const errors = data.json?.errors ?? []
        postOk = res.ok && errors.length === 0
        postError = errors[0]?.join(' ') ?? `HTTP ${res.status}`
      } else if (opp.platform === 'youtube') {
        const videoId = (opp.thread_url as string).match(/[?&]v=([^&]+)/)?.[1]
        const commentId = (opp.thread_url as string).match(/[?&]lc=([^&]+)/)?.[1]
        if (!videoId) return 'Could not extract YouTube video ID.'
        const endpoint = commentId
          ? 'https://www.googleapis.com/youtube/v3/comments?part=snippet'
          : 'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet'
        const body = commentId
          ? { snippet: { parentId: commentId, textOriginal: reply_text } }
          : { snippet: { videoId, topLevelComment: { snippet: { textOriginal: reply_text } } } }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        postOk = res.ok
        if (!res.ok) {
          const e = await res.json() as { error?: { message?: string } }
          postError = e.error?.message ?? `HTTP ${res.status}`
        }
      }

      if (postOk) {
        await supabase.from('opportunities').update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', opportunity_id)
        return 'Reply posted successfully and marked as posted.'
      }
      return `Failed to post: ${postError}`
    }

    case 'create_brand': {
      const input = toolInput as {
        name: string
        tagline?: string
        description: string
        url: string
        keywords: string[]
        subreddits?: string[]
        voice_notes?: string
        disclosure_line?: string
      }
      const { error } = await supabase.from('brands').insert({
        user_id: userId,
        name: input.name,
        tagline: input.tagline ?? null,
        description: input.description,
        url: input.url,
        keywords: input.keywords,
        subreddits: input.subreddits ?? [],
        voice_notes: input.voice_notes ?? null,
        disclosure_line: input.disclosure_line ?? null,
        active: true,
      })
      if (error) return `Failed to create brand: ${error.message}`
      return `Brand "${input.name}" created successfully with ${input.keywords.length} keywords and ${(input.subreddits ?? []).length} subreddits. Ready to scan.`
    }

    case 'get_performance': {
      const { brand_id, days = 30 } = toolInput as { brand_id: string; days?: number }
      const since = new Date(Date.now() - days * 86_400_000).toISOString()
      const brand = brands.find(b => b.id === brand_id)

      const [{ count: totalOpps }, { count: posted }, { data: scans }] = await Promise.all([
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('brand_id', brand_id).gte('found_at', since),
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('brand_id', brand_id).eq('status', 'posted').gte('posted_at', since),
        supabase.from('scan_runs').select('ran_at, opportunities_found').eq('brand_id', brand_id).gte('ran_at', since).order('ran_at', { ascending: false }).limit(10),
      ])

      const { data: byPlatform } = await supabase
        .from('opportunities')
        .select('platform')
        .eq('brand_id', brand_id)
        .gte('found_at', since)

      const platformCounts: Record<string, number> = {}
      for (const o of byPlatform ?? []) {
        platformCounts[o.platform] = (platformCounts[o.platform] ?? 0) + 1
      }

      return JSON.stringify({
        brand: brand?.name,
        period_days: days,
        opportunities_found: totalOpps ?? 0,
        replies_posted: posted ?? 0,
        scan_count: scans?.length ?? 0,
        last_scan: scans?.[0]?.ran_at ?? null,
        by_platform: platformCounts,
      })
    }

    case 'generate_content': {
      const { brand_id, content_type, source_opportunity_id, topic } = toolInput as {
        brand_id: string
        content_type: string
        source_opportunity_id?: string
        topic?: string
      }
      const brand = brands.find(b => b.id === brand_id)
      if (!brand) return 'Brand not found.'

      let sourceContext = ''
      if (source_opportunity_id) {
        const { data: opp } = await supabase
          .from('opportunities')
          .select('title, body, drafted_reply, platform')
          .eq('id', source_opportunity_id)
          .single()
        if (opp) {
          sourceContext = `\nBased on this high-performing opportunity on ${opp.platform}:\nTitle: ${opp.title}\nBody: ${opp.body?.slice(0, 500)}\nSuccessful reply: ${opp.drafted_reply?.slice(0, 500)}`
        }
      }

      const contentInstructions: Record<string, string> = {
        blog_post: 'Write a complete, well-structured blog post (600–900 words) in markdown format. Include a compelling headline, 3–5 sections with subheadings, and a clear CTA pointing to the link at the end.',
        tweet_thread: 'Write a 6–10 tweet thread. Number each tweet. Each tweet max 280 chars. Hook in tweet 1. Build a narrative. CTA with the link in the final tweet.',
        linkedin_post: 'Write a LinkedIn post (200–300 words). Start with a hook. Tell a story or share an insight. Mention the product naturally. End with a question to drive comments.',
        email_sequence: 'Write a 3-email nurture sequence. Email 1: value/education. Email 2: problem/solution. Email 3: social proof + CTA. Include subject lines. Markdown format.',
        video_script: 'Write a 60–90 second video script. Hook (0–5s). Problem (5–20s). Solution with product (20–50s). Proof/benefit (50–70s). CTA (70–90s). Include visual notes in brackets.',
      }

      const instruction = contentInstructions[content_type] ?? 'Write content for this brand.'

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `You are writing marketing content for ${brand.name}.

Brand: ${brand.name}
Description: ${brand.description}
Link (the call to action in every piece — send readers here to see it for themselves): ${brand.url}
Voice: ${brand.voice_notes ?? 'Professional, knowledgeable, direct. Community member tone, not marketer.'}
${sourceContext}
${topic ? `\nTopic/angle: ${topic}` : ''}

Task: ${instruction}`,
        }],
      })

      const generated = msg.content[0].type === 'text' ? msg.content[0].text : ''

      // Persist it. This used to render into a side panel and vanish on refresh —
      // an entire module that produced nothing durable.
      const firstHeading = generated.match(/^#{1,3}\s+(.+)$/m)?.[1]
        ?? generated.split('\n').find(l => l.trim().length > 0)?.slice(0, 120)
      await supabase.from('content_pieces').insert({
        brand_id: brand.id,
        user_id: userId,
        content_type,
        title: firstHeading?.replace(/^#+\s*/, '').trim() ?? null,
        body: generated,
        topic: topic ?? null,
        source_opportunity_id: source_opportunity_id ?? null,
        status: 'draft',
      })

      return `GENERATED_${content_type.toUpperCase()}\n\n${generated}`
    }

    case 'dismiss_opportunity': {
      const { opportunity_id, reason } = toolInput as { opportunity_id: string; reason?: string }
      const { data: doomed } = await supabase
        .from('opportunities')
        .select('id, title, body, drafted_reply, platform, subreddit, score')
        .eq('id', opportunity_id)
        .single()

      await supabase
        .from('opportunities')
        .update({ status: 'dismissed', dismiss_reason: reason?.slice(0, 500) ?? null })
        .eq('id', opportunity_id)

      // Keep the judgement — a rejection is the clearest signal an operator gives.
      if (doomed) {
        const d = doomed as {
          id: string; title: string | null; body: string | null
          drafted_reply: string | null; platform: string; subreddit: string | null; score: number
        }
        await recordSignal(supabase, 'reject', {
          userId,
          threadContext: `${d.title ?? ''}\n\n${d.body ?? ''}`.trim(),
          draftedReply: d.drafted_reply ?? '',
          reason: reason ?? null,
          metadata: { opportunity_id: d.id, platform: d.platform, subreddit: d.subreddit, score: d.score },
        })
      }
      return 'Opportunity dismissed.'
    }

    default:
      return `Unknown tool: ${toolName}`
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json() as { messages: ClientMessage[] }

  // Load brands + pending counts
  const { data: brands } = await supabase
    .from('brands')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const brandList = (brands ?? []) as BrandRow[]

  const pendingCounts: Record<string, number> = {}
  if (brandList.length > 0) {
    await Promise.all(
      brandList.map(async b => {
        const { count } = await supabase
          .from('opportunities')
          .select('id', { count: 'exact', head: true })
          .eq('brand_id', b.id)
          .eq('status', 'pending')
        pendingCounts[b.id] = count ?? 0
      })
    )
  }

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const memories = await retrieveRelevantMemories(memoryStore, embedding, {
    userId: user.id,
    query: lastUserMessage || 'marketing overview',
    limit: 10,
    threshold: 0.25,
  })
  const memoryBlock = formatMemoriesForPrompt(memories, surgeShiftPersona.domain)
  const systemPrompt = buildSystemPrompt(brandList, pendingCounts) + (memoryBlock ? `\n\n${memoryBlock}` : '')

  // Convert client messages to Anthropic format
  const claudeMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Agentic loop — Claude may use multiple tools before final response
        let iteration = 0
        const MAX_ITER = 6

        while (iteration < MAX_ITER) {
          iteration++

          const apiStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages: claudeMessages,
            tools: SHIFT_TOOLS,
          })

          for await (const event of apiStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta' &&
              event.delta.text
            ) {
              send({ type: 'text', delta: event.delta.text })
            }
          }

          const finalMsg = await apiStream.finalMessage()

          if (finalMsg.stop_reason !== 'tool_use') break

          // Execute all tool calls
          const toolUseBlocks = finalMsg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          )

          claudeMessages.push({ role: 'assistant', content: finalMsg.content })

          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const toolUse of toolUseBlocks) {
            send({ type: 'tool_start', name: toolUse.name, label: getToolLabel(toolUse.name) })

            const result = await executeTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              supabase,
              user.id,
              brandList
            )

            send({ type: 'tool_done', name: toolUse.name })

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result,
            })
          }

          claudeMessages.push({ role: 'user', content: toolResults })
        }

        // Collect final assistant text from the last turn for memory
        const lastTurn = claudeMessages.at(-1)
        if (lastTurn && lastUserMessage) {
          const assistantText = Array.isArray(lastTurn.content)
            ? (lastTurn.content as Array<{ type: string; text?: string }>)
                .filter(b => b.type === 'text').map(b => b.text ?? '').join('')
            : (typeof lastTurn.content === 'string' ? lastTurn.content : '')
          if (assistantText) {
            void recordMemory(memoryStore, embedding, {
              userId: user.id,
              content: `User: ${lastUserMessage.slice(0, 300)}\nShift: ${assistantText.slice(0, 500)}`,
              type: 'context',
              source: 'conversation',
              confidence: 0.6,
              salience: 0.4,
            })
          }
        }

        send({ type: 'done' })
        controller.close()
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
