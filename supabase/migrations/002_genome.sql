-- Migration 002: Shift Genome layer for SurgeShift.
-- Mirrors the schema that was applied to project qjjvazzsecjyofakguxs on 2026-06-23
-- (a fresh project that never held the app's tables, users, or data). This file
-- re-homes it onto the app's real project, uvelnrfjuvekzzgatlbr. Every statement is
-- idempotent. Pattern source: lendshift/supabase/migrations/008_genome.sql.
--
-- Apply: POST https://api.supabase.com/v1/projects/uvelnrfjuvekzzgatlbr/database/query
--        { "query": "<this file>" }  (Bearer = Supabase personal access token)

create extension if not exists vector;

-- Feedback signals (accept / edit / reject) with embeddings for nightly distillation.
create table if not exists shift_feedback (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  message_id         text,
  signal             text not null check (signal in ('accept', 'edit', 'reject')),
  original_text      text not null,
  edited_text        text,
  user_message       text,
  domain             text not null default 'unknown',
  metadata           jsonb,
  response_embedding vector(1024),
  query_embedding    vector(1024),
  created_at         timestamptz not null default now()
);
create index if not exists idx_shift_feedback_user_domain
  on shift_feedback (user_id, domain, created_at desc);
create index if not exists idx_shift_feedback_response_emb
  on shift_feedback using ivfflat (response_embedding vector_cosine_ops) with (lists = 50);
alter table shift_feedback enable row level security;
drop policy if exists "service_all_shift_feedback" on shift_feedback;
create policy "service_all_shift_feedback" on shift_feedback
  for all using (auth.role() = 'service_role');

-- Collective patterns: LLM-distilled insights from clusters of accepted signals.
create table if not exists shift_collective_patterns (
  id           uuid primary key default gen_random_uuid(),
  domain       text not null,
  pattern      text not null,
  confidence   float not null default 0.5,
  signal_count int   not null default 0,
  examples     jsonb,
  embedding    vector(1024),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_collective_patterns_domain_conf
  on shift_collective_patterns (domain, confidence desc);
create index if not exists idx_collective_patterns_emb
  on shift_collective_patterns using ivfflat (embedding vector_cosine_ops) with (lists = 10);
alter table shift_collective_patterns enable row level security;
drop policy if exists "service_all_collective_patterns" on shift_collective_patterns;
create policy "service_all_collective_patterns" on shift_collective_patterns
  for all using (auth.role() = 'service_role');

-- Prediction vs actual outcomes.
create table if not exists shift_learning_outcomes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  prediction_type text not null,
  prediction_id   text not null,
  predicted_value jsonb,
  actual_value    jsonb,
  resolved_at     timestamptz,
  domain          text not null default 'unknown',
  created_at      timestamptz not null default now()
);
create index if not exists idx_shift_learning_outcomes_user
  on shift_learning_outcomes (user_id, prediction_type, created_at desc);
alter table shift_learning_outcomes enable row level security;
drop policy if exists "service_all_shift_learning_outcomes" on shift_learning_outcomes;
create policy "service_all_shift_learning_outcomes" on shift_learning_outcomes
  for all using (auth.role() = 'service_role');

-- Fine-tuning job submissions.
create table if not exists shift_training_jobs (
  id                  uuid primary key default gen_random_uuid(),
  domain              text not null,
  product             text not null,
  format              text not null check (format in ('openai', 'anthropic', 'hf')),
  pair_count          int  not null,
  submitted_at        timestamptz not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'training', 'complete', 'failed')),
  external_job_id     text,
  fine_tuned_model_id text,
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_training_jobs_domain_status
  on shift_training_jobs (domain, status, created_at desc);
alter table shift_training_jobs enable row level security;
drop policy if exists "service_all_training_jobs" on shift_training_jobs;
create policy "service_all_training_jobs" on shift_training_jobs
  for all using (auth.role() = 'service_role');

-- Deployed model versions + traffic split (shadow -> canary -> production).
create table if not exists shift_model_versions (
  id              uuid primary key default gen_random_uuid(),
  domain          text not null,
  product         text not null,
  version         text not null,
  model_id        text not null,
  provider_type   text not null,
  base_url        text,
  traffic_percent int  not null default 0 check (traffic_percent >= 0 and traffic_percent <= 100),
  status          text not null default 'shadow'
                  check (status in ('shadow', 'canary', 'production', 'retired')),
  created_at      timestamptz not null default now()
);
create index if not exists idx_model_versions_domain_status
  on shift_model_versions (domain, status, created_at desc);
alter table shift_model_versions enable row level security;
drop policy if exists "service_all_model_versions" on shift_model_versions;
create policy "service_all_model_versions" on shift_model_versions
  for all using (auth.role() = 'service_role');

-- Semantic search over collective patterns.
create or replace function match_collective_patterns(
  query_embedding vector(1024),
  match_domain    text,
  match_count     int default 5
)
returns table (
  id           uuid,
  domain       text,
  pattern      text,
  confidence   float,
  signal_count int,
  examples     jsonb,
  updated_at   timestamptz,
  similarity   float
)
language sql stable
as $$
  select
    id, domain, pattern, confidence, signal_count, examples, updated_at,
    1 - (embedding <=> query_embedding) as similarity
  from shift_collective_patterns
  where domain = match_domain
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function match_collective_patterns(vector, text, int) to anon, authenticated, service_role;
