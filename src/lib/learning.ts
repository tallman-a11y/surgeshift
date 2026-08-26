import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Learning signals.
 *
 * The 2026-08-22 audit found all four genome tables at 0 rows: SurgeShift had
 * never recorded a single judgement an operator made. Every draft was written by
 * a model that knew nothing about the thousand drafts before it.
 *
 * Three moments carry signal, and all three were being thrown away:
 *   accept — posted the draft as written
 *   edit   — posted something different (the delta is the most valuable signal)
 *   reject — dismissed it, ideally with a reason
 *
 * These land in `shift_feedback`, which @allshift/core's genome distiller already
 * knows how to cluster into collective patterns. Failures are swallowed on
 * purpose: never block a post because bookkeeping failed.
 */

export type Signal = 'accept' | 'edit' | 'reject'

export type SignalInput = {
  userId: string
  /** The thread we were replying to — what the model was reacting to. */
  threadContext: string
  /** What the model produced. */
  draftedReply: string
  /** What the operator actually posted, when it differs. */
  postedReply?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
}

/** Trivial whitespace/punctuation differences are not edits worth learning from. */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function classify(drafted: string, posted?: string | null): Signal {
  if (!posted) return 'accept'
  return normalize(drafted) === normalize(posted) ? 'accept' : 'edit'
}

/**
 * `_caller` is accepted so call sites read naturally, but the write always uses the
 * service client: shift_feedback is a genome table whose only policy grants
 * service_role. Writing it with the caller's client is silently rejected by RLS —
 * which is exactly how this table stayed empty while dismissals appeared to work.
 */
export async function recordSignal(
  _caller: SupabaseClient,
  signal: Signal,
  input: SignalInput,
): Promise<void> {
  try {
    const admin = createServiceClient()
    const { error } = await admin.from('shift_feedback').insert({
      user_id: input.userId,
      signal,
      original_text: input.draftedReply,
      edited_text: signal === 'edit' ? (input.postedReply ?? null) : null,
      user_message: input.threadContext.slice(0, 2000),
      domain: 'surgeshift',
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
    })
    // Never block the operator's action on bookkeeping — but never hide it either.
    if (error) console.error('[learning] could not record signal:', error.message)
  } catch (e) {
    console.error('[learning] could not record signal:', String(e))
  }
}

/** Convenience: derive accept-vs-edit from the two texts and record it. */
export async function recordPostOutcome(
  supabase: SupabaseClient,
  input: SignalInput,
): Promise<Signal> {
  const signal = classify(input.draftedReply, input.postedReply)
  await recordSignal(supabase, signal, input)
  return signal
}
