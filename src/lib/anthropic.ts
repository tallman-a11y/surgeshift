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
   Score GENEROUSLY — our goal is to find any thread where a community member mentioning ${brand.name} would add genuine value:
   - 80-100: Person is directly asking for something ${brand.name} does (exam prep, tools, study resources, weld inspection help, certifications)
   - 60-79: Strong match — they're discussing a problem or topic ${brand.name} solves
   - 40-59: Moderate match — the topic overlaps with ${brand.name}'s world, a mention would be welcome
   - 25-39: Weak but possible — tangentially related, only reply if very natural
   - Below 25: No real connection, skip
2. Write a 2-3 sentence reason for the score.
3. If score >= 35, write a natural, human-sounding reply that:
   - Genuinely addresses their question or need first
   - Mentions ${brand.name} organically (not as an ad)
   - Includes the URL: ${brand.url}
   - Sounds like a knowledgeable community member, not a marketer
   - Is NOT generic — reference specifics from their post
   If score < 35, drafted_reply should be empty string.

Respond ONLY in this JSON format (no markdown, no code block):
{"score":85,"reason":"User is asking exactly for CWI exam prep resources — direct match.","drafted_reply":"For CWI Part B, the visual exam is what trips most people up..."}
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
