-- Migration 008: promote the caution subreddits that are genuinely good targets.
--
-- 005 seeded everything the scanner drifted into as 'unknown', which reads as a
-- caution on every card. Some of those are better prospects than the brands' own
-- original lists — r/cwi_cwe is literally the certification WeldShift teaches.
-- Leaving them flagged trains the operator to ignore the flag, which is exactly
-- how a governor stops working.
--
-- Promoted on topical fit AND audience match: the reader has to be a plausible
-- buyer, not merely someone discussing the subject.

with tyler as (
  select id from auth.users where email = 't.allman@allshiftai.com' limit 1
),
promotions(subreddit, note) as (values
  -- RealShift — investors and landlords, US market.
  ('commercialrealestate', 'Investors discussing deals — the audience RealShift is built for.'),
  ('realestateadvice',     'People asking exactly the questions deal analysis answers.'),
  ('realestatefinance',    'Financing and returns questions map straight onto the deal analysis and DSCR maths.'),
  ('rentalinvesting',      'Rental investors — core audience.'),
  ('leaselords',           'Landlord community; lease and rent tracking is the daily pain here.'),
  ('airbnbhosts',          'Short-term rental hosts are landlords with the same ledger and maintenance problems.'),

  -- WeldShift — welders, inspectors, educators.
  ('badwelding',           'Weld defect photos — precisely what Field Oracle does.'),
  ('nondestructivetesting','NDT and inspection: WeldShift''s core subject.'),
  ('cwi_cwe',              'Literally the CWI/CWE certifications WeldShift prepares people for.'),
  ('weldingengineering',   'Procedure and code questions — Code Navigator and the WPS builder.'),
  ('skilledtrades',        'Trades audience; the brand already targets the r/skilled_trades variant.'),
  ('unitedassociation',    'Pipefitters union community; the brand already targets r/Pipefitters.'),
  ('structuralengineering','Engineers specifying and accepting welds — AWS D1.1 territory.')
)
insert into subreddit_policies (user_id, subreddit, stance, notes)
select t.id, p.subreddit, 'allowed', p.note
from tyler t cross join promotions p
on conflict (user_id, subreddit)
-- Never overrule a ban: if the operator has since marked one off limits, that wins.
do update set
  stance     = case when subreddit_policies.stance = 'banned' then 'banned' else 'allowed' end,
  notes      = case when subreddit_policies.stance = 'banned' then subreddit_policies.notes else excluded.notes end,
  updated_at = now();
