import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FORMATS: Record<string, string> = {
  blog_post: 'A complete article of 900–1400 words in markdown. Open by stating the answer, then earn it. Use real subheadings a reader would scan for.',
  faq: 'A FAQ page in markdown: each question as a heading, answered in 2–4 sentences, ordered from most to least commonly asked.',
  guide: 'A step-by-step guide in markdown. Number the steps. Say what goes wrong at each one.',
}

/**
 * Write the piece that answers a whole theme.
 *
 * Different from the per-opportunity generator: that one replies to a person,
 * this one answers the question a dozen people asked. It is given the real
 * questions verbatim, because the way people phrase a problem is the thing worth
 * matching — both for the reader and for search.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { themeId, contentType = 'blog_post' } = await req.json() as { themeId?: string; contentType?: string }
  if (!themeId) return NextResponse.json({ error: 'themeId required' }, { status: 400 })

  const { data: theme } = await supabase
    .from('content_themes')
    .select('id, brand_id, label, summary, example_questions, question_count')
    .eq('id', themeId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!theme) return NextResponse.json({ error: 'Theme not found' }, { status: 404 })

  type ThemeRow = { id: string; brand_id: string; label: string; summary: string | null; example_questions: string[] | null; question_count: number }
  const t = theme as ThemeRow

  const { data: brand } = await supabase
    .from('brands')
    .select('name, tagline, description, url, voice_notes')
    .eq('id', t.brand_id)
    .single()
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  type BrandRow = { name: string; tagline: string | null; description: string; url: string; voice_notes: string | null }
  const b = brand as BrandRow
  const questions = (t.example_questions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are writing for ${b.name}.

Brand: ${b.name} — ${b.tagline ?? ''}
${b.description}
Link: ${b.url}
Voice: ${b.voice_notes ?? 'Plain-spoken and specific. Answer first, sell second.'}

TOPIC: ${t.label}
${t.summary ? `What readers want: ${t.summary}` : ''}

${t.question_count} different people asked a version of this. Their actual words:
${questions}

Write: ${FORMATS[contentType] ?? FORMATS.blog_post}

Rules:
- Answer the question properly. Someone who reads this and never buys anything should still leave better off.
- Use their vocabulary, not the industry's — match how the questions above are phrased.
- Mention ${b.name} once, where it genuinely solves part of the problem, and link to ${b.url}. Not in the opening.
- No hype words, no emoji, no "in today's fast-paced world" opening.
- Give real numbers, thresholds and rules of thumb wherever the subject allows.

Return ONLY the markdown, starting with a "# " title.`,
    }],
  })

  const body = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  if (!body) return NextResponse.json({ error: 'The model returned nothing — try again.' }, { status: 502 })

  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? t.label

  const { data: piece, error } = await supabase
    .from('content_pieces')
    .insert({
      brand_id: t.brand_id,
      user_id: user.id,
      content_type: contentType,
      title,
      body,
      topic: t.label,
      theme_id: t.id,
      status: 'draft',
    })
    .select('id, title')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('content_themes')
    .update({ content_piece_id: (piece as { id: string }).id, updated_at: new Date().toISOString() })
    .eq('id', t.id)

  return NextResponse.json({ piece })
}
