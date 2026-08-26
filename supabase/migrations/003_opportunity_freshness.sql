-- Migration 003: record when the SOURCE post/comment was actually published.
--
-- Until now `found_at` (when WE scanned it) was the only date, and the Reddit
-- scanner literally faked `created_utc = Date.now()`. Because Brave Search ranks
-- by SEO authority rather than recency, the queue filled with threads from 2016,
-- 2021 and 2022 — many of them past Reddit's 6-month archive cutoff, where a
-- reply is rejected outright. Idempotent.

alter table opportunities
  add column if not exists source_published_at timestamptz;

comment on column opportunities.source_published_at is
  'When the source post/comment was published on its platform (NULL = unknown). Distinct from found_at, which is when SurgeShift discovered it.';

-- Freshest-first is the default ordering for a review queue.
create index if not exists idx_opportunities_source_published
  on opportunities (brand_id, status, source_published_at desc nulls last);
