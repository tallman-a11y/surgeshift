<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


## Shift agent coordination — parking lot + local↔prod reconcile

This repo is part of the **central Shift parking lot**: a shared cross-product timeline
of what every agent does, so any agent can pick up where another left off.

- **Start of work** → `/catchup` (open threads/handoffs for this product) before touching anything.
- **Stopping / handing off** → `/handoff` (logs a resume_point to the shared timeline). Commits & deploys auto-log.
- **"pickup <product>"** resumes from the parking lot first, then the resume memory.
- Helper if a skill isn't available: `node ~/.claude/shift-parking-lot/shiftlog.mjs catchup|log|resolve`.

**Reconcile local ↔ prod — adopt the MOST advanced/current side, whichever it is.** The
newest work can be on either side: local may be **behind** `origin` (another agent/machine
pushed) OR **ahead** with uncommitted WIP; prod may hold newer commits, **migrations, env,
or data** (often applied via the Supabase Management API or Vercel/Fly secrets, never in the
local tree). Before assuming local is current or deploying: `git fetch --all --prune && git
status -sb`, check local WIP (`git status --porcelain`), and check the live deploy (`vercel
ls` / `/api/version` / `flyctl status`). Never deploy from a branch behind its remote, never
overwrite newer uncommitted work, and when the two sides diverge, surface it — don't guess.
