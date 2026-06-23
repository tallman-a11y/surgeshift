-- Shift Brain memory layer for SurgeShift: cross-session semantic memory.
-- Lets Shift remember brand voice preferences, successful reply patterns,
-- top-performing topics, and user workflow preferences across sessions.

create extension if not exists vector;

create table if not exists shift_memory (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        references auth.users(id) on delete cascade not null,
  type                text        not null default 'general',
  source              text        not null default 'conversation',
  content             text        not null,
  embedding           vector(1024),
  confidence          real        not null default 0.7,
  salience            real        not null default 0.5,
  reinforcement_count int         not null default 1,
  last_seen_at        timestamptz not null default now(),
  status              text        not null default 'active',
  superseded_by       uuid        references shift_memory(id) on delete set null,
  created_at          timestamptz not null default now()
);

alter table shift_memory enable row level security;

create policy "users manage own memories" on shift_memory
  for all using (auth.uid() = user_id);

create index shift_memory_user_status_idx on shift_memory(user_id, status);
create index shift_memory_embedding_idx   on shift_memory using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create or replace function match_memories(
  query_embedding      vector(1024),
  match_user_id        uuid,
  match_count          int   default 12,
  similarity_threshold float default 0.25
)
returns table (
  id uuid, type text, content text,
  confidence real, salience real, created_at timestamptz, similarity float
)
language sql stable
as $$
  select m.id, m.type, m.content, m.confidence, m.salience, m.created_at,
         1 - (m.embedding <=> query_embedding) as similarity
  from shift_memory m
  where m.user_id = match_user_id
    and m.status = 'active'
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) > similarity_threshold
  order by (0.75 * (1 - (m.embedding <=> query_embedding)) + 0.25 * m.salience) desc
  limit match_count;
$$;

create or replace function find_similar_memory(
  query_embedding      vector(1024),
  match_user_id        uuid,
  similarity_threshold float default 0.9
)
returns table (id uuid, content text, similarity float)
language sql stable
as $$
  select m.id, m.content, 1 - (m.embedding <=> query_embedding) as similarity
  from shift_memory m
  where m.user_id = match_user_id
    and m.status = 'active'
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) >= similarity_threshold
  order by m.embedding <=> query_embedding
  limit 1;
$$;

create or replace function reinforce_memory(memory_id uuid)
returns void
language sql
as $$
  update shift_memory
  set reinforcement_count = reinforcement_count + 1,
      last_seen_at        = now(),
      salience            = least(1.0, salience + 0.08),
      confidence          = least(1.0, confidence + 0.04)
  where id = memory_id;
$$;

grant execute on function match_memories      to authenticated, service_role;
grant execute on function find_similar_memory to authenticated, service_role;
grant execute on function reinforce_memory    to authenticated, service_role;
