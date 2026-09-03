import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MemoryStore,
  MemoryEntry,
  RecordMemoryOpts,
  RecordResult,
  RetrieveOpts,
} from "@allshift/core";

export class SupabaseMemoryStore implements MemoryStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async record(opts: RecordMemoryOpts, embedding: number[] | null): Promise<RecordResult> {
    const {
      userId,
      content,
      type = "general",
      source = "conversation",
      confidence = 0.7,
      salience = 0.5,
      dedupeThreshold = 0.9,
    } = opts;

    if (embedding) {
      const { data: similar } = await this.supabase.rpc("find_similar_memory", {
        query_embedding: embedding,
        match_user_id: userId,
        similarity_threshold: dedupeThreshold,
      });
      const hit = (similar as Array<{ id: string }>)?.[0];
      if (hit) {
        await this.supabase.rpc("reinforce_memory", { memory_id: hit.id });
        return { id: hit.id, reinforced: true };
      }
    }

    const { data, error } = await this.supabase
      .from("shift_memory")
      .insert({ user_id: userId, content, type, source, confidence, salience, embedding })
      .select("id")
      .single();

    if (error) return { id: null, reinforced: false };
    return { id: (data as { id: string }).id, reinforced: false };
  }

  async retrieve(opts: RetrieveOpts, queryEmbedding: number[] | null): Promise<MemoryEntry[]> {
    const { userId, limit = 12, threshold = 0.25 } = opts;

    if (queryEmbedding) {
      const { data } = await this.supabase.rpc("match_memories", {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        similarity_threshold: threshold,
      });
      return ((data as Array<Record<string, unknown>>) ?? []).map((m) => ({
        id: m.id as string,
        type: m.type as string,
        content: m.content as string,
        confidence: m.confidence as number,
        salience: m.salience as number,
        created_at: m.created_at as string,
        similarity: m.similarity as number,
      }));
    }

    const { data } = await this.supabase
      .from("shift_memory")
      .select("id, type, content, confidence, salience, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("last_seen_at", { ascending: false })
      .limit(limit);

    return ((data as Array<Record<string, unknown>>) ?? []).map((m) => ({
      id: m.id as string,
      type: m.type as string,
      content: m.content as string,
      confidence: m.confidence as number,
      salience: m.salience as number,
      created_at: m.created_at as string,
    }));
  }
}
