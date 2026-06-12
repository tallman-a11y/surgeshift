import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type Brand = {
  id: string
  name: string
  tagline: string
  description: string
  url: string
  voice_notes?: string
}

export type ScoredOpportunity = {
  score: number
  reason: string
  drafted_reply: string
}

export async function scoreAndDraft(
  brand: Brand,
  post: { title: string; body: string; platform: string; subreddit?: string }
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

TASK:
1. Score this post 0-100 for how relevant it is as a marketing opportunity for ${brand.name}.
   - 90-100: Person is actively looking for exactly what ${brand.name} offers
   - 70-89: Strong match — they need this kind of tool
   - 50-69: Moderate match — adjacent need, worth a reply
   - Below 50: Poor match, not worth engaging
2. Write a 2-3 sentence reason for the score.
3. If score >= 55, write a natural, human-sounding reply that:
   - Genuinely addresses their question or need first
   - Mentions ${brand.name} organically (not as an ad)
   - Includes the URL: ${brand.url}
   - Sounds like a knowledgeable community member, not a marketer
   - Is NOT generic — reference specifics from their post
   If score < 55, drafted_reply should be empty string.

Respond ONLY in this JSON format (no markdown, no code block):
{"score":85,"reason":"User is asking exactly for CWI exam prep resources — direct match.","drafted_reply":"For CWI Part B, the visual exam is what trips most people up..."}
`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  try {
    return JSON.parse(text) as ScoredOpportunity
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
