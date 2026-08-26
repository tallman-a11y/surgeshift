import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type Brand = {
  id: string
  name: string
  tagline: string
  description: string
  url: string
  voice_notes?: string
  disclosure_line?: string
}

export type ScoredOpportunity = {
  score: number
  reason: string
  drafted_reply: string
}

function ageLine(publishedAt?: string): string {
  if (!publishedAt) return 'Age: unknown'
  const t = Date.parse(publishedAt)
  if (Number.isNaN(t)) return 'Age: unknown'
  const days = Math.round((Date.now() - t) / 86_400_000)
  if (days <= 7) return `Age: ${days} days old — active conversation, a reply will be seen`
  if (days <= 30) return `Age: ${days} days old — still live`
  if (days <= 90) return `Age: ${days} days old — cooling off, fewer people are still reading`
  return `Age: ${days} days old — likely dead; on Reddit it may be archived and reject replies entirely`
}

export async function scoreAndDraft(
  brand: Brand,
  post: { title: string; body: string; platform: string; subreddit?: string; publishedAt?: string }
): Promise<ScoredOpportunity> {
  const prompt = `You are a marketing intelligence engine for ${brand.name}.

BRAND:
Name: ${brand.name}
Tagline: ${brand.tagline}
Description: ${brand.description}
URL: ${brand.url}
${brand.voice_notes ? `Voice/Tone: ${brand.voice_notes}` : ''}

POST (from ${post.platform}${post.subreddit ? ` / r/${post.subreddit}` : ''}):
Title: ${post.title}
Body: ${post.body}
${ageLine(post.publishedAt)}

TASK:
1. Score this post 0-100 for how relevant it is as a marketing opportunity for ${brand.name}.
   The score decides what a busy operator reads FIRST, so spread it out — a score
   that is 80 for everything is useless. Judge on three things together:
   (a) INTENT — are they actively asking for what ${brand.name} does, or just adjacent?
   (b) REACH — will a reply still be seen? Use the Age line above. A perfect match on a
       year-old thread is worth less than a decent match posted this week.
   (c) FIT — can ${brand.name} genuinely answer, or would the mention be a stretch?
   - 85-100: Directly asking for what ${brand.name} does, RIGHT NOW (days old). Reply today.
   - 70-84: Strong match and still live (weeks old), or a perfect match cooling off.
   - 50-69: Real topical overlap; a mention would be welcome but is not urgent.
   - 30-49: Tangential, or a good match on a thread old enough that few will see it.
   - Below 30: No real connection, or so old that replying is pointless. Skip.
   Reserve 90+ for the handful you would stake the day on.
2. Write a 2-3 sentence reason for the score.
3. If score >= 35, write a natural, human-sounding reply that:
   - Genuinely addresses their question or need first
   - Mentions ${brand.name} organically (not as an ad)
   - Includes the URL: ${brand.url}
   - Sounds like a knowledgeable community member, not a marketer
   - Is NOT generic — reference specifics from their post
   - ONLY mention the specific ${brand.name} feature(s) that solve their actual problem. Never bring up unrelated modules. Match the feature to their situation using the Description and Voice/Tone notes; never list features they did not ask about, and never bring up pricing unless they asked about cost.
${brand.disclosure_line ? `   - End every reply with this exact disclosure line on its own line: "${brand.disclosure_line}"` : ''}
   If score < 35, drafted_reply should be empty string.

Respond ONLY in this JSON format (no markdown, no code block):
{"score":85,"reason":"User is directly asking for something ${brand.name} provides — direct match.","drafted_reply":"Here is what I would check first in your situation..."}
`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  // Strip markdown code fences if present, then extract the JSON object
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : stripped) as ScoredOpportunity
  } catch {
    return { score: 0, reason: 'Parse error', drafted_reply: '' }
  }
}

export async function batchScoreAndDraft(
  brand: Brand,
  posts: { title: string; body: string; platform: string; subreddit?: string }[]
): Promise<ScoredOpportunity[]> {
  return Promise.all(posts.map(p => scoreAndDraft(brand, p)))
}
