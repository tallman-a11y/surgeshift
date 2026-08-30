-- Migration 006: mark the subreddits SurgeShift must never post in.
--
-- These were all 'unknown' from the 005 seed — places the scanner drifted into
-- that the operator never chose. 'unknown' reads as a caution the operator can
-- overrule; 'banned' blocks the post outright. Only subreddits that would cause
-- real damage are promoted to banned. The merely-imperfect ones stay as cautions,
-- because a governor that blocks everything gets switched off.
--
-- Scoped to Tyler's account so it never touches another user's judgement.

with tyler as (
  select id from auth.users where email = 't.allman@allshiftai.com' limit 1
),
verdicts(subreddit, note) as (values
  -- Hostile audience: posting here damages the brand rather than failing quietly.
  ('tenant',              'Hostile audience — this is the opposing side of the landlord market. A landlord product pitched to tenants reads as adversarial.'),
  ('legaladvice',         'Bans self-promotion, and answering legal questions with a product pitch is the kind of reply that gets an account and a brand remembered badly.'),

  -- Keyword false positive: "AWS D1.1" is the American Welding Society structural
  -- welding code. r/awscertifications is Amazon Web Services.
  ('awscertifications',   'False keyword match — WeldShift targets AWS D1.1 (American Welding Society); this sub is Amazon Web Services.'),

  -- No topical relationship to either brand. A reply here is indistinguishable from spam.
  ('chatgptpromptgenius', 'No relationship to either brand.'),
  ('computervision',      'No relationship to either brand.'),
  ('webdev',              'No relationship to either brand.'),
  ('saas',                'No relationship to either brand — and a room full of founders is not a room full of buyers.'),
  ('selfhosted',          'No relationship to either brand.'),
  ('edc',                 'No relationship to either brand (everyday carry).'),
  ('jobsearch',           'No relationship to either brand.'),
  ('monarchmoney',        'A different product''s user community — replying there is poaching, not participating.'),

  -- City and regional subs: off-topic for a national product, and local subs
  -- are among the strictest anywhere about outside promotion.
  ('asklosangeles',       'Local sub — off-topic for a national product, and local subs are strict about outside promotion.'),
  ('askto',               'Local sub — off-topic for a national product.'),
  ('boston',              'Local sub — off-topic for a national product.'),
  ('kansascity',          'Local sub — off-topic for a national product.'),
  ('massachusetts',       'Local sub — off-topic for a national product.'),
  ('rochester',           'Local sub — off-topic for a national product.'),
  ('rva',                 'Local sub — off-topic for a national product.'),
  ('sandiego',            'Local sub — off-topic for a national product.'),

  ('entrepreneur',        'Bans self-promotion and is heavily moderated for it.')
)
insert into subreddit_policies (user_id, subreddit, stance, notes)
select t.id, v.subreddit, 'banned', v.note
from tyler t cross join verdicts v
on conflict (user_id, subreddit)
do update set stance = 'banned', notes = excluded.notes, updated_at = now();
