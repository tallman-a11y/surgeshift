-- Migration 004: close the marketing loop.
--
-- The 2026-08-22 audit found SurgeShift had the first two links of the loop
-- (find → reply) and none of the last three (measure → learn → find better):
--   * all four genome tables sat at 0 rows — nothing ever wrote a signal
--   * 12 replies posted, zero knowledge of what any of them did
--   * generate_content produced blog posts that vanished on refresh
-- This adds the storage those three need. Idempotent.

-- ── 1. Attribution ────────────────────────────────────────────────────────────
-- Every posted reply carries a ref code on its link. The destination is one of
-- Tyler's own sites, so the visit can be reported back to /api/attribution/visit.
-- Deliberately NOT a URL shortener: a shortened link in a Reddit reply reads as
-- spam, which is the one thing this product cannot afford.
create table if not exists tracked_links (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  brand_id       uuid not null references brands(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  target_url     text not null,
  platform       text,
  subreddit      text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_tracked_links_brand on tracked_links (brand_id, created_at desc);
create index if not exists idx_tracked_links_opportunity on tracked_links (opportunity_id);

create table if not exists link_visits (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid references tracked_links(id) on delete cascade,
  code       text not null,
  visited_at timestamptz not null default now(),
  referer    text,
  user_agent text,
  path       text
);
create index if not exists idx_link_visits_link on link_visits (link_id, visited_at desc);
create index if not exists idx_link_visits_code on link_visits (code, visited_at desc);

alter table tracked_links enable row level security;
alter table link_visits   enable row level security;
drop policy if exists "service_all_tracked_links" on tracked_links;
create policy "service_all_tracked_links" on tracked_links for all using (auth.role() = 'service_role');
drop policy if exists "owner_reads_tracked_links" on tracked_links;
create policy "owner_reads_tracked_links" on tracked_links for select
  using (exists (select 1 from brands b where b.id = tracked_links.brand_id and b.user_id = auth.uid()));
drop policy if exists "service_all_link_visits" on link_visits;
create policy "service_all_link_visits" on link_visits for all using (auth.role() = 'service_role');
drop policy if exists "owner_reads_link_visits" on link_visits;
create policy "owner_reads_link_visits" on link_visits for select
  using (exists (
    select 1 from tracked_links t join brands b on b.id = t.brand_id
    where t.id = link_visits.link_id and b.user_id = auth.uid()
  ));

-- ── 2. What was actually posted, and why things were rejected ─────────────────
-- The difference between drafted_reply and what Tyler actually sent IS the
-- training signal. Without storing it there is no way to learn his edits.
alter table opportunities add column if not exists posted_reply_text text;
alter table opportunities add column if not exists dismiss_reason    text;
alter table opportunities add column if not exists tracked_code      text;

comment on column opportunities.posted_reply_text is
  'The exact text posted. Differs from drafted_reply when the operator edited it — that delta is the learning signal.';
comment on column opportunities.dismiss_reason is
  'Why the operator rejected this draft. Feeds shift_feedback as a reject signal.';

-- ── 3. Generated content that survives a refresh ──────────────────────────────
create table if not exists content_pieces (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null references brands(id) on delete cascade,
  user_id               uuid not null,
  content_type          text not null,
  title                 text,
  body                  text not null,
  topic                 text,
  source_opportunity_id uuid references opportunities(id) on delete set null,
  status                text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  scheduled_for         timestamptz,
  published_at          timestamptz,
  published_url         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_content_pieces_brand on content_pieces (brand_id, status, created_at desc);
alter table content_pieces enable row level security;
drop policy if exists "owner_all_content_pieces" on content_pieces;
create policy "owner_all_content_pieces" on content_pieces for all using (auth.uid() = user_id);
drop policy if exists "service_all_content_pieces" on content_pieces;
create policy "service_all_content_pieces" on content_pieces for all using (auth.role() = 'service_role');

-- ── 4. Notification log — so the morning brief never double-sends ─────────────
create table if not exists notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  kind       text not null,
  sent_for   date not null,
  detail     jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, sent_for)
);
alter table notification_log enable row level security;
drop policy if exists "service_all_notification_log" on notification_log;
create policy "service_all_notification_log" on notification_log for all using (auth.role() = 'service_role');
