-- Migration 005: stop SurgeShift from getting the accounts banned.
--
-- The 2026-08-22 audit found the scanner drifting badly outside the subreddits a
-- brand actually chose — 37 of 90 RealShift opportunities came from 26 subreddits
-- that were not in its config, including several that ban self-promotion outright.
-- Nothing modelled per-subreddit rules, nothing rate-limited posting, and nothing
-- stopped 36 drafts being fired from one account in one afternoon. A Reddit ban is
-- permanent and ends the channel, so this is a guardrail, not a nicety.

-- ── Per-subreddit stance ──────────────────────────────────────────────────────
-- Anything the operator has not judged stays 'unknown', which reads as caution.
-- Only an explicit 'banned' blocks a post outright.
create table if not exists subreddit_policies (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  subreddit     text not null,
  stance        text not null default 'unknown'
                check (stance in ('allowed', 'caution', 'banned', 'unknown')),
  cooldown_days int  not null default 7 check (cooldown_days >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, subreddit)
);
create index if not exists idx_subreddit_policies_user on subreddit_policies (user_id, stance);

alter table subreddit_policies enable row level security;
drop policy if exists "owner_all_subreddit_policies" on subreddit_policies;
create policy "owner_all_subreddit_policies" on subreddit_policies for all using (auth.uid() = user_id);
drop policy if exists "service_all_subreddit_policies" on subreddit_policies;
create policy "service_all_subreddit_policies" on subreddit_policies for all using (auth.role() = 'service_role');

comment on table subreddit_policies is
  'Operator judgement about where it is safe to post. Subreddits a brand explicitly targets are seeded as allowed; everything the scanner drifts into starts unknown.';

-- ── Per-brand cadence limits ──────────────────────────────────────────────────
-- Conservative defaults: a genuine community member does not post three times a
-- day in the same subreddit, and Reddit's informal 9:1 rule punishes accounts
-- whose history is mostly promotion.
alter table brands add column if not exists max_posts_per_day       int not null default 3;
alter table brands add column if not exists subreddit_cooldown_days int not null default 7;

comment on column brands.max_posts_per_day is
  'Ceiling on replies posted per day for this brand across all platforms.';
comment on column brands.subreddit_cooldown_days is
  'Minimum days between replies in the same subreddit. Falls back when the subreddit has no policy row of its own.';

-- ── Seed: every subreddit a brand already targets is allowed ──────────────────
-- Without this the governor would flag the operator's own deliberate choices.
insert into subreddit_policies (user_id, subreddit, stance, notes)
select distinct b.user_id, lower(s.sub), 'allowed',
       'Seeded from the brand''s own subreddit list.'
from brands b
cross join lateral unnest(b.subreddits) as s(sub)
where s.sub is not null and length(trim(s.sub)) > 0
on conflict (user_id, subreddit) do nothing;

-- Everywhere the scanner has actually drifted, recorded so it is reviewable
-- rather than invisible.
insert into subreddit_policies (user_id, subreddit, stance, notes)
select distinct b.user_id, lower(o.subreddit), 'unknown',
       'Scanner drifted here — never chosen by the operator. Review before posting.'
from opportunities o
join brands b on b.id = o.brand_id
where o.subreddit is not null and length(trim(o.subreddit)) > 0
on conflict (user_id, subreddit) do nothing;
