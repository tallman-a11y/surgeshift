/**
 * Feedback — the input side of the Genome.
 *
 * Every accept, edit and reject the agent gives is a training signal, and the edit
 * is the most valuable of the three: the difference between what Shift wrote and
 * what the agent actually sent is the only direct evidence of how this agent thinks.
 *
 * Signals land in `shift_feedback` on the family's shared shape, get semantic vectors
 * attached, and are clustered by the nightly distillation into collective patterns
 * every Shift product can read. Without this route AgentShift would consume the
 * family's intelligence without ever contributing to it.
 */

import { NextRequest } from 'next/server'
import type { FeedbackSignal } from '@allshift/core'
import { createClient } from '@/lib/supabase/server'
import { buildLayers } from '@/lib/shift-brain'
import { AGENTSHIFT_DOMAIN } from '@/lib/shift/learning-store'

export const runtime = 'nodejs'

const layers = buildLayers()
const VALID: FeedbackSignal[] = ['accept', 'edit', 'reject']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json() as {
    signal?: string
    originalText?: string
    editedText?: string
    userMessage?: string
    messageId?: string
    metadata?: Record<string, unknown>
  }

  const signal = body.signal as FeedbackSignal
  if (!VALID.includes(signal)) {
    return Response.json({ error: 'signal must be accept, edit or reject' }, { status: 400 })
  }
  if (!body.originalText) {
    return Response.json({ error: 'originalText is required' }, { status: 400 })
  }

  if (!layers.learning) {
    // Say so rather than returning a cheerful 200 for a signal that went nowhere.
    return Response.json({ recorded: false, reason: 'learning store not configured' }, { status: 503 })
  }

  const feedbackId = await layers.learning.recordFeedback({
    userId: user.id,
    signal,
    originalText: body.originalText,
    editedText: body.editedText,
    userMessage: body.userMessage,
    messageId: body.messageId,
    domain: AGENTSHIFT_DOMAIN,
    metadata: body.metadata,
  })

  if (!feedbackId) {
    return Response.json({ recorded: false, reason: 'write failed' }, { status: 500 })
  }

  // Attach the vectors that let the distillation job cluster this signal. Best
  // effort: an embedding failure costs the signal its place in the corpus, not the
  // signal itself, and the agent should not wait on it either way.
  if (layers.embedding.enabled()) {
    void (async () => {
      try {
        const [responseEmbedding, queryEmbedding] = await Promise.all([
          layers.embedding.embedOne(body.originalText!, 'document'),
          layers.embedding.embedOne(body.userMessage ?? body.originalText!, 'query'),
        ])
        if (responseEmbedding && queryEmbedding) {
          await layers.genome.recordSignalEmbeddings(feedbackId, responseEmbedding, queryEmbedding)
        }
      } catch { /* the row stands without vectors */ }
    })()
  }

  return Response.json({ recorded: true, feedbackId })
}
