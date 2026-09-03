-- Migration 003: join the Shift family environment.
--
-- Three layers, all of which the rest of the family already speaks:
--
--   1. Genome    — feedback signals, distilled collective patterns, outcome
--                  tracking, fine-tuning corpus. Mirrors surgeshift/002_genome.sql
--                  and lendshift/008_genome.sql so a signal recorded here has the
--                  same shape as one recorded there.
--   2. Learning  — reuses the genome's shift_feedback / shift_learning_outcomes.
--   3. Context   — the cross-product bus. This is the part that did not exist
--                  anywhere in the family yet: every product was falling back to
--                  NoOpContextGraph, so a buyer who needed a lender never actually
--                  reached LendShift.
--
-- ── Where the bus lives ────────────────────────────────────────────────────────
-- Each Shift product has its own Supabase project, so a bus written into this
-- project is only visible to this product. For genuine cross-product handoff these
-- two tables belong in ONE shared "family" project that every product points at
-- via SHIFT_FAMILY_SUPABASE_URL / SHIFT_FAMILY_SUPABASE_SERVICE_KEY.
--
-- Apply this file to that shared project. Applying it here as well is harmless and
-- is what happens when the family project is not configured: the bus degrades to
-- product-local, which still works for publish/consume within AgentShift and
-- becomes cross-product the moment the shared project is pointed at.

create extension if not exists vector;

-- ── Genome ──────────────────────────────────────────────────────────────────────

create table if not exists shift_feedback (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  message_id         text,
  signal             text not null check (signal in ('accept', 'edit', 'reject')),
  original_text      text not null,
  edited_text        text,
  user_message       text,
  domain             text not null default 'agentshift',
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
-- An agent may read their own signals; only the service role writes them.
drop policy if exists "owner_reads_shift_feedback" on shift_feedback;
create policy "owner_reads_shift_feedback" on shift_feedback
  for select using (auth.uid() = user_id);

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

create table if not exists shift_learning_outcomes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  prediction_type text not null,
  prediction_id   text not null,
  predicted_value jsonb,
  actual_value    jsonb,
  resolved_at     timestamptz,
  domain          text not null default 'agentshift',
  created_at      timestamptz not null default now()
);
create index if not exists idx_shift_learning_outcomes_user
  on shift_learning_outcomes (user_id, prediction_type, created_at desc);
alter table shift_learning_outcomes enable row level security;
drop policy if exists "service_all_shift_learning_outcomes" on shift_learning_outcomes;
create policy "service_all_shift_learning_outcomes" on shift_learning_outcomes
  for all using (auth.role() = 'service_role');

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

create or replace function match_collective_patterns(
  query_embedding vector(1024),
  match_domain    text,
  match_count     int default 5
)
returns table (
  id uuid, domain text, pattern text, confidence float,
  signal_count int, examples jsonb, updated_at timestamptz, similarity float
)
language sql stable
as $$
  select id, domain, pattern, confidence, signal_count, examples, updated_at,
         1 - (embedding <=> query_embedding) as similarity
  from shift_collective_patterns
  where domain = match_domain and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function match_collective_patterns(vector, text, int)
  to anon, authenticated, service_role;

-- ── The cross-product bus ───────────────────────────────────────────────────────

-- One row per handoff between products. A buyer in AgentShift who needs financing
-- publishes a `lender_referral` targeted at lendshift; LendShift picks it up on that
-- user's next turn, acts on it, and marks it consumed.
create table if not exists shift_cross_product_events (
  id             uuid        primary key default gen_random_uuid(),
  source_product text        not null,
  -- Null means "any product that cares" — a broadcast rather than a handoff.
  target_product text,
  event_type     text        not null,
  -- The GLOBAL user id, not a product-local one. Resolve through shift_identities
  -- before publishing; a product-local id here would be meaningless to the reader.
  user_id        uuid        not null,
  payload        jsonb       not null default '{}'::jsonb,
  consumed       boolean     not null default false,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- The read path is always (target_product, user_id, unconsumed), so index exactly that.
create index if not exists idx_cross_product_pending
  on shift_cross_product_events (target_product, user_id, created_at)
  where not consumed;
create index if not exists idx_cross_product_source
  on shift_cross_product_events (source_product, created_at desc);

alter table shift_cross_product_events enable row level security;
drop policy if exists "service_all_cross_product_events" on shift_cross_product_events;
create policy "service_all_cross_product_events" on shift_cross_product_events
  for all using (auth.role() = 'service_role');
-- A user may read events about themselves; only the service role publishes.
drop policy if exists "owner_reads_cross_product_events" on shift_cross_product_events;
create policy "owner_reads_cross_product_events" on shift_cross_product_events
  for select using (auth.uid() = user_id);

-- Identity linking. The same person is a different row id in every product, so the
-- bus needs one global id and a map to each product's local id. `consented_products`
-- is the gate: nothing is shared with a product the user has not opted into, and an
-- empty list means this person's data stays where it is.
create table if not exists shift_identities (
  global_user_id      uuid        primary key default gen_random_uuid(),
  -- { "agentshift": "<uuid>", "lendshift": "<uuid>", "surgeshift": "<uuid>" }
  product_accounts    jsonb       not null default '{}'::jsonb,
  consented_products  text[]      not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Look-ups go the other way — "who is agentshift user X globally?" — so index the
-- account map for containment queries.
create index if not exists idx_shift_identities_accounts
  on shift_identities using gin (product_accounts jsonb_path_ops);

alter table shift_identities enable row level security;
drop policy if exists "service_all_shift_identities" on shift_identities;
create policy "service_all_shift_identities" on shift_identities
  for all using (auth.role() = 'service_role');

-- Resolve a product-local user id to their global identity.
create or replace function resolve_shift_identity(
  p_product  text,
  p_local_id text
)
returns table (
  global_user_id uuid,
  product_accounts jsonb,
  consented_products text[]
)
language sql stable
as $$
  select i.global_user_id, i.product_accounts, i.consented_products
  from shift_identities i
  where i.product_accounts ->> p_product = p_local_id
  limit 1;
$$;
grant execute on function resolve_shift_identity(text, text) to service_role;

-- Link a product account to a global identity, creating the identity when this is
-- the person's first Shift product. Merging rather than replacing matters: linking
-- LendShift must not drop the AgentShift account already recorded.
create or replace function link_shift_identity(
  p_global_user_id uuid,
  p_product        text,
  p_local_id       text,
  p_consented      text[]
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  -- An existing link for this product account wins over the passed global id, so
  -- calling link twice can never fork one person into two identities.
  select global_user_id into v_id
  from shift_identities
  where product_accounts ->> p_product = p_local_id
  limit 1;

  if v_id is null then
    v_id := coalesce(p_global_user_id, gen_random_uuid());
  end if;

  insert into shift_identities (global_user_id, product_accounts, consented_products)
  values (v_id, jsonb_build_object(p_product, p_local_id), coalesce(p_consented, '{}'))
  on conflict (global_user_id) do update
    set product_accounts   = shift_identities.product_accounts
                             || jsonb_build_object(p_product, p_local_id),
        consented_products = (
          select array(
            select distinct unnest(
              shift_identities.consented_products || coalesce(p_consented, '{}')
            )
          )
        ),
        updated_at = now();

  return v_id;
end $$;
grant execute on function link_shift_identity(uuid, text, text, text[]) to service_role;
