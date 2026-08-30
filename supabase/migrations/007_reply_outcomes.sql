-- Migration 007: find out what happened to the replies we posted.
--
-- Twelve replies had gone out and SurgeShift knew nothing about any of them. The
-- platforms hand this over for free — upvotes, likes, replies, removals — but
-- only if we remember which comment was ours, which post-reply was discarding.
--
-- This closes the last input to the learning loop: we predict a score before
-- posting, the platform reports what actually happened, and the gap between the
-- two is the calibration signal.

-- ── Which comment is ours ─────────────────────────────────────────────────────
alter table opportunities add column if not exists posted_comment_id text;
alter table opportunities add column if not exists posted_permalink  text;

comment on column opportunities.posted_comment_id is
  'Platform id of the comment WE created (Reddit t1_… / YouTube comment id). Without it a posted reply cannot be followed up.';

-- Denormalised latest state, so the queue can show outcomes without a join.
alter table opportunities add column if not exists reply_score      int;
alter table opportunities add column if not exists reply_count      int;
alter table opportunities add column if not exists reply_removed    boolean;
alter table opportunities add column if not exists reply_checked_at timestamptz;

-- ── The trajectory ────────────────────────────────────────────────────────────
-- One row per check rather than a single latest value: a reply that reached +12
-- in a day is a different signal from one that took a month to get there.
create table if not exists reply_outcomes (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  checked_at     timestamptz not null default now(),
  score          int,
  reply_count    int,
  removed        boolean not null default false,
  raw            jsonb
);
create index if not exists idx_reply_outcomes_opportunity
  on reply_outcomes (opportunity_id, checked_at desc);

alter table reply_outcomes enable row level security;
drop policy if exists "service_all_reply_outcomes" on reply_outcomes;
create policy "service_all_reply_outcomes" on reply_outcomes
  for all using (auth.role() = 'service_role');
drop policy if exists "owner_reads_reply_outcomes" on reply_outcomes;
create policy "owner_reads_reply_outcomes" on reply_outcomes for select
  using (exists (
    select 1 from opportunities o join brands b on b.id = o.brand_id
    where o.id = reply_outcomes.opportunity_id and b.user_id = auth.uid()
  ));
