import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  LearningStore, FeedbackEntry, OutcomeRecord, UserPreferences,
} from '@allshift/core'

export const AGENTSHIFT_DOMAIN = 'agentshift'

/**
 * Feedback, outcomes and derived preferences, on the family's shared shape.
 *
 * Signals here are the same rows SurgeShift and LendShift write, differing only by
 * `domain` — which is what lets the nightly distillation cluster across products and
 * still keep per-domain patterns separate.
 */
export class SupabaseLearningStore implements LearningStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async recordFeedback(entry: FeedbackEntry): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('shift_feedback')
      .insert({
        user_id: entry.userId,
        message_id: entry.messageId ?? null,
        signal: entry.signal,
        original_text: entry.originalText,
        edited_text: entry.editedText ?? null,
        user_message: entry.userMessage ?? null,
        domain: entry.domain ?? AGENTSHIFT_DOMAIN,
        metadata: entry.metadata ?? null,
      })
      .select('id')
      .single()

    if (error) return null
    return (data as { id: string }).id
  }

  async recordOutcome(record: OutcomeRecord): Promise<void> {
    await this.supabase.from('shift_learning_outcomes').insert({
      user_id: record.userId,
      prediction_type: record.predictionType,
      prediction_id: record.predictionId,
      predicted_value: record.predictedValue,
      actual_value: record.actualValue ?? null,
      resolved_at: record.resolvedAt ?? null,
      domain: record.domain ?? AGENTSHIFT_DOMAIN,
    })
  }

  async getPreferences(userId: string, domain?: string): Promise<UserPreferences | null> {
    const { data } = await this.supabase
      .from('shift_feedback')
      .select('signal, edited_text')
      .eq('user_id', userId)
      .eq('domain', domain ?? AGENTSHIFT_DOMAIN)
      .order('created_at', { ascending: false })
      .limit(50)

    const rows = (data as Array<{ signal: string; edited_text: string | null }>) ?? []
    if (rows.length === 0) return null

    return derivePreferences(rows, domain ?? AGENTSHIFT_DOMAIN)
  }
}

/**
 * Turn recent signals into a response style.
 *
 * An agent who keeps editing what Shift writes is telling you it is too long, not
 * that it is wrong — so heavy editing means go concise. High acceptance means the
 * detail is landing and can be trusted to keep coming.
 *
 * Pure and exported so the thresholds can be tested rather than guessed at.
 */
export function derivePreferences(
  rows: Array<{ signal: string; edited_text: string | null }>,
  domain: string,
): UserPreferences | null {
  const total = rows.length
  if (total === 0) return null

  const accepted = rows.filter(r => r.signal === 'accept').length
  const edited = rows.filter(r => r.signal === 'edit').length
  const rejected = rows.filter(r => r.signal === 'reject').length

  const acceptanceRate = accepted / total
  const responseStyle: UserPreferences['responseStyle'] =
    edited / total > 0.4 ? 'concise'
    : acceptanceRate > 0.7 ? 'detailed'
    : 'standard'

  // A high rejection rate is worth saying out loud in the prompt: it means the
  // recommendations themselves are off, not merely the wording.
  const avoidNotes = rejected / total > 0.3
    ? ['This agent rejects a lot of what Shift proposes. Ask what they actually want before recommending.']
    : []

  return {
    acceptanceRate,
    responseStyle,
    topAcceptedDomains: [domain],
    avoidNotes,
    customInstructions: '',
  }
}
