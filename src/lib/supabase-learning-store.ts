import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LearningStore,
  FeedbackEntry,
  OutcomeRecord,
  UserPreferences,
} from "@allshift/core";

export class SupabaseLearningStore implements LearningStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async recordFeedback(entry: FeedbackEntry): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("shift_feedback")
      .insert({
        user_id: entry.userId,
        message_id: entry.messageId ?? null,
        signal: entry.signal,
        original_text: entry.originalText,
        edited_text: entry.editedText ?? null,
        user_message: entry.userMessage ?? null,
        domain: entry.domain ?? "surgeshift",
        metadata: entry.metadata ?? null,
      })
      .select("id")
      .single();

    if (error) return null;
    return (data as { id: string }).id;
  }

  async recordOutcome(record: OutcomeRecord): Promise<void> {
    await this.supabase.from("shift_learning_outcomes").insert({
      user_id: record.userId,
      prediction_type: record.predictionType,
      prediction_id: record.predictionId,
      predicted_value: record.predictedValue,
      actual_value: record.actualValue ?? null,
      resolved_at: record.resolvedAt ?? null,
      domain: record.domain ?? "surgeshift",
    });
  }

  async getPreferences(
    userId: string,
    domain?: string,
  ): Promise<UserPreferences | null> {
    let query = this.supabase
      .from("shift_feedback")
      .select("signal, edited_text")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (domain) query = query.eq("domain", domain);

    const { data } = await query;
    const rows =
      (data as Array<{ signal: string; edited_text: string | null }>) ?? [];

    const total = rows.length;
    if (total === 0) return null;

    const accepted = rows.filter((r) => r.signal === "accept").length;
    const edited = rows.filter((r) => r.signal === "edit").length;
    const acceptanceRate = accepted / total;
    const responseStyle: UserPreferences["responseStyle"] =
      edited / total > 0.4 ? "concise" : acceptanceRate > 0.7 ? "detailed" : "standard";

    return {
      acceptanceRate,
      responseStyle,
      topAcceptedDomains: domain ? [domain] : ["surgeshift"],
      avoidNotes: [],
      customInstructions: "",
    };
  }
}
