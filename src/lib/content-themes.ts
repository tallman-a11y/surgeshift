import Anthropic from '@anthropic-ai/sdk'
import { VoyageEmbeddingProvider, greedyCluster } from '@allshift/core'

/**
 * Find the themes buyers keep asking about.
 *
 * Every opportunity is a question a real person typed, already scored for
 * relevance. Answering them one at a time is linear — one thread, one reader.
 * Grouping them shows which questions come up *repeatedly*, and a piece that
 * answers a whole cluster keeps working long after the thread is cold.
 *
 * Clusters are semantic, not keyword-matched: "how do I estimate ARV" and
 * "what's this place worth after repairs" are the same demand expressed twice,
 * and no keyword tool would group them.
 */

export type ThemeInput = {
  id: string
  title: string
  body: string | null
  score: number
  subreddit: string | null
  platform: string
}

export type Theme = {
  label: string
  summary: string
  opportunityIds: string[]
  exampleQuestions: string[]
  questionCount: number
  avgScore: number
}

// 0.82 is the tuning @allshift/core documents for 1024-dim Voyage vectors. Lower
// values merge unrelated subjects; higher ones split one question into three.
const CLUSTER_THRESHOLD = 0.82

// A pair is a coincidence. Three people asking the same thing is a topic.
const MIN_CLUSTER_SIZE = 3

export async function buildThemes(
  items: ThemeInput[],
  opts: { voyageKey?: string; anthropicKey?: string; maxThemes?: number } = {},
): Promise<{ themes: Theme[]; skipped?: string }> {
  if (items.length < MIN_CLUSTER_SIZE) {
    return { themes: [], skipped: 'not enough questions to find a pattern yet' }
  }

  const embedder = new VoyageEmbeddingProvider(opts.voyageKey ?? process.env.VOYAGE_API_KEY)
  if (!embedder.enabled()) return { themes: [], skipped: 'VOYAGE_API_KEY is not set' }

  // The title carries the question; a lead paragraph of body disambiguates it.
  const texts = items.map(i => `${i.title}\n${(i.body ?? '').slice(0, 300)}`.trim())
  const embeddings = await embedder.embedBatch(texts, 'document')
  if (!embeddings) return { themes: [], skipped: 'embedding failed' }

  const withEmbeddings = items.map((item, i) => ({ ...item, embedding: embeddings[i] ?? null }))
  const clusters = greedyCluster(withEmbeddings, CLUSTER_THRESHOLD)
    .filter(c => c.length >= MIN_CLUSTER_SIZE)
    .sort((a, b) => b.length - a.length)
    .slice(0, opts.maxThemes ?? 12)

  if (clusters.length === 0) {
    return { themes: [], skipped: 'no question came up often enough to be a theme' }
  }

  const anthropic = new Anthropic({ apiKey: opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY })

  const named = await Promise.all(clusters.map(async indices => {
    const members = indices.map(i => items[i])
    const examples = members.slice(0, 6).map(m => m.title)
    const avgScore = members.reduce((s, m) => s + m.score, 0) / members.length

    let label = examples[0]?.slice(0, 60) ?? 'Untitled theme'
    let summary = ''

    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        messages: [{
          role: 'user',
          content: `These are ${members.length} questions real people asked online, grouped because they are semantically similar:

${examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Name the underlying question these share, as a content topic.

Respond ONLY as JSON, no markdown:
{"label":"<a specific topic title, 4-9 words, the way a person would search for it — not a category name>","summary":"<one sentence: what these people actually want to know, and what a good answer must cover>"}`,
        }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
      const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) as
        { label?: string; summary?: string }
      if (parsed.label) label = parsed.label
      if (parsed.summary) summary = parsed.summary
    } catch {
      // Naming is a nicety. A theme with a weak label is still a real demand
      // signal, so keep it rather than dropping the cluster.
    }

    return {
      label,
      summary,
      opportunityIds: members.map(m => m.id),
      exampleQuestions: examples,
      questionCount: members.length,
      avgScore: Math.round(avgScore * 10) / 10,
    }
  }))

  return { themes: named }
}
