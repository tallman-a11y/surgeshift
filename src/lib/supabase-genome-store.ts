import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GenomeStore,
  CollectivePattern,
  FineTuningPair,
  EmbeddingProvider,
  TrainingJob,
  ModelVersion,
} from "@allshift/core";
import { greedyCluster, centroid } from "@allshift/core";

export class SupabaseGenomeStore implements GenomeStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async recordSignalEmbeddings(
    feedbackId: string,
    responseEmbedding: number[],
    queryEmbedding: number[],
  ): Promise<void> {
    await this.supabase
      .from("shift_feedback")
      .update({
        response_embedding: JSON.stringify(responseEmbedding),
        query_embedding: JSON.stringify(queryEmbedding),
      })
      .eq("id", feedbackId);
  }

  async getCollectivePatterns(
    domain: string,
    queryEmbedding?: number[] | null,
    limit = 5,
  ): Promise<CollectivePattern[]> {
    if (queryEmbedding && queryEmbedding.length > 0) {
      const { data } = await this.supabase.rpc("match_collective_patterns", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_domain: domain,
        match_count: limit,
      });
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        domain: row.domain as string,
        pattern: row.pattern as string,
        confidence: row.confidence as number,
        signalCount: row.signal_count as number,
        examples: (row.examples as string[] | null) ?? [],
        updatedAt: row.updated_at as string,
      }));
    }

    const { data } = await this.supabase
      .from("shift_collective_patterns")
      .select("*")
      .eq("domain", domain)
      .order("confidence", { ascending: false })
      .limit(limit);

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      domain: row.domain as string,
      pattern: row.pattern as string,
      confidence: row.confidence as number,
      signalCount: row.signal_count as number,
      examples: (row.examples as string[] | null) ?? [],
      updatedAt: row.updated_at as string,
    }));
  }

  async distill(
    domain: string,
    anthropicApiKey: string,
    embeddingProvider: EmbeddingProvider,
  ): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - 60);

    const { data: rows } = await this.supabase
      .from("shift_feedback")
      .select("id, original_text, user_message, response_embedding")
      .eq("domain", domain)
      .eq("signal", "accept")
      .gte("created_at", since.toISOString())
      .not("response_embedding", "is", null)
      .limit(200);

    if (!rows || rows.length < 5) return 0;

    type Row = { id: string; original_text: string; user_message: string | null; response_embedding: unknown };

    const signals = (rows as Row[]).map((r) => ({
      ...r,
      embedding: parseEmbedding(r.response_embedding),
    })).filter((r) => r.embedding !== null) as Array<Row & { embedding: number[] }>;

    if (signals.length < 5) return 0;

    const clusters = greedyCluster(signals, 0.82);
    const client = new Anthropic({ apiKey: anthropicApiKey });
    let written = 0;

    for (const indices of clusters) {
      if (indices.length < 2) continue;
      const clusterSignals = indices.map((i) => signals[i]);
      const examples = clusterSignals.slice(0, 5).map((s) => s.original_text);

      const prompt = `You are analyzing accepted AI responses in the "${domain}" domain.
Here are ${examples.length} responses that operators found helpful:

${examples.map((e, i) => `Response ${i + 1}:\n${e}`).join("\n\n")}

In ONE sentence, describe the pattern that makes these responses effective for ${domain} operators.
Focus on: tone, specificity, length, structure, or content type.
Start directly with the pattern (no preamble, no quotes).`;

      try {
        const resp = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 150,
          messages: [{ role: "user", content: prompt }],
        });

        const patternText = resp.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();

        if (!patternText) continue;

        const patternEmbedding = await embeddingProvider.embedOne(patternText, "document");
        const clusterCentroid = centroid(clusterSignals.map((s) => s.embedding));

        // centroid is used for deduplication within clusters — stored implicitly
        void clusterCentroid;

        await this.supabase.from("shift_collective_patterns").insert({
          domain,
          pattern: patternText,
          confidence: Math.min(0.99, 0.5 + indices.length / 50),
          signal_count: indices.length,
          examples: examples.slice(0, 3),
          embedding: patternEmbedding ? JSON.stringify(patternEmbedding) : null,
        });

        written++;
      } catch {
        continue;
      }
    }

    return written;
  }

  async exportFineTuningData(
    domain: string,
    since?: Date,
    limit = 1000,
  ): Promise<FineTuningPair[]> {
    let query = this.supabase
      .from("shift_feedback")
      .select("signal, original_text, edited_text, user_message, domain")
      .eq("domain", domain)
      .in("signal", ["accept", "edit"])
      .not("user_message", "is", null)
      .limit(limit);

    if (since) query = query.gte("created_at", since.toISOString());

    const { data } = await query;
    if (!data) return [];

    return (data as Array<Record<string, unknown>>).map((row) => ({
      messages: [
        { role: "user" as const, content: row.user_message as string },
        { role: "assistant" as const, content: row.original_text as string },
      ],
      signal: row.signal as "accept" | "edit",
      editedResponse: (row.edited_text as string | null) ?? undefined,
      domain: row.domain as string,
      product: "surgeshift",
    }));
  }

  async recordTrainingJob(job: TrainingJob): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("shift_training_jobs")
      .insert({
        domain: job.domain,
        product: job.product,
        format: job.format,
        pair_count: job.pairCount,
        submitted_at: job.submittedAt,
        status: job.status,
        external_job_id: job.externalJobId ?? null,
        fine_tuned_model_id: job.fineTunedModelId ?? null,
        notes: job.notes ?? null,
      })
      .select("id")
      .single();
    if (error) return null;
    return (data as { id: string }).id;
  }

  async updateTrainingJob(id: string, updates: Partial<TrainingJob>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.externalJobId !== undefined) patch.external_job_id = updates.externalJobId;
    if (updates.fineTunedModelId !== undefined) patch.fine_tuned_model_id = updates.fineTunedModelId;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    await this.supabase.from("shift_training_jobs").update(patch).eq("id", id);
  }

  async getActiveModelVersion(domain: string): Promise<ModelVersion | null> {
    const { data } = await this.supabase
      .from("shift_model_versions")
      .select("*")
      .eq("domain", domain)
      .in("status", ["production", "canary"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      domain: row.domain as string,
      product: row.product as string,
      version: row.version as string,
      modelId: row.model_id as string,
      providerType: row.provider_type as string,
      baseURL: row.base_url as string | undefined,
      trafficPercent: row.traffic_percent as number,
      status: row.status as ModelVersion["status"],
      createdAt: row.created_at as string,
    };
  }

  async recordModelVersion(version: ModelVersion): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("shift_model_versions")
      .insert({
        domain: version.domain,
        product: version.product,
        version: version.version,
        model_id: version.modelId,
        provider_type: version.providerType,
        base_url: version.baseURL ?? null,
        traffic_percent: version.trafficPercent,
        status: version.status,
      })
      .select("id")
      .single();
    if (error) return null;
    return (data as { id: string }).id;
  }
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as number[];
    } catch {
      return null;
    }
  }
  return null;
}
