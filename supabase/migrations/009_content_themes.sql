-- Migration 009: turn the scanner into a content roadmap.
--
-- SurgeShift has collected hundreds of questions real buyers actually typed, each
-- already scored for relevance. That is a better content brief than any keyword
-- tool sells, and it was being used once and discarded: reply to one person, move
-- on. Replying is linear — one thread, one reader. A piece that answers the whole
-- cluster keeps working.
--
-- A theme is a group of semantically similar questions, found by embedding the
-- titles and clustering them, then named by the model.

create table if not exists content_themes (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references brands(id) on delete cascade,
  user_id           uuid not null,
  label             text not null,
  summary           text,
  question_count    int  not null default 0,
  example_questions jsonb,
  opportunity_ids   uuid[],
  avg_score         numeric,
  -- Set once a piece has been written for this theme, so the gap is visible.
  content_piece_id  uuid references content_pieces(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_content_themes_brand
  on content_themes (brand_id, question_count desc);

alter table content_themes enable row level security;
drop policy if exists "owner_all_content_themes" on content_themes;
create policy "owner_all_content_themes" on content_themes for all using (auth.uid() = user_id);
drop policy if exists "service_all_content_themes" on content_themes;
create policy "service_all_content_themes" on content_themes for all using (auth.role() = 'service_role');

comment on table content_themes is
  'Clusters of semantically similar buyer questions found by the scanner. Ranked by how many real people asked, which is what makes it a demand signal rather than a guess.';

-- Which theme a piece answers, so the roadmap and the library stay linked.
alter table content_pieces add column if not exists theme_id uuid references content_themes(id) on delete set null;
