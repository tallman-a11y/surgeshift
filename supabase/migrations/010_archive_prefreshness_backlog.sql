-- Migration 010: archive the pre-freshness backlog.
--
-- The queue showed 560 pending when roughly 55 deserved attention. 398 of those
-- were found between 13 June and 25 August by scans that had no recency filter
-- and recorded no publish date — the cohort verified to contain threads from
-- 2016, 2021 and 2022, most of them past Reddit's archive cutoff and unanswerable.
-- Five morning briefs went unacted-on against that wall.
--
-- Scoped deliberately:
--   * only status='pending' — nothing posted or already judged is touched
--   * only source_published_at IS NULL — anything whose age we know is left alone
--   * only found_at < 2026-08-26 — the ~64 undated rows found AFTER the freshness
--     fix passed the recency gate and are genuinely recent; the platform simply
--     did not report a date. Those stay in the queue.
--
-- Status is 'archived', not 'dismissed'. Dismissal is an operator judgement that
-- feeds the learning corpus; this is housekeeping. Writing 462 rejections would
-- teach the model that hundreds of perfectly good questions were bad replies.
-- Nothing is written to shift_feedback here, and nothing is deleted.
--
-- To undo, in full:
--   update opportunities set status = 'pending', dismiss_reason = null
--   where status = 'archived' and dismiss_reason like 'Archived 2026-09-03%';

update opportunities
set status = 'archived',
    dismiss_reason = 'Archived 2026-09-03: found before thread-age tracking existed, by a scan with no recency filter. Age unknown and probably past Reddit''s archive cutoff.'
where status = 'pending'
  and source_published_at is null
  and found_at < '2026-08-26';
