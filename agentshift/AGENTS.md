<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Notably, already applied here: the `middleware` file convention is **deprecated**. Routing interception lives in `src/proxy.ts`, exporting a function named `proxy`. The `edge` runtime is not supported there.
<!-- END:nextjs-agent-rules -->

## Where the logic lives

The domain logic is deliberately pure, dependency-free and unit-tested, and it lives
apart from anything that touches a database, a model, or React:

| File | What it owns |
| --- | --- |
| `src/lib/cma.ts` | Appraisal-style adjustment grid, weighting, confidence |
| `src/lib/net-sheet.ts` | Seller net proceeds, buyer cash to close, amortisation |
| `src/lib/commission.ts` | Splits, caps, royalty, referral, team; pipeline forecast |
| `src/lib/compliance.ts` | Settlement rules, listing audit, fair housing, TCPA/DNC |
| `src/lib/timeline.ts` | Critical dates, business-day and federal-holiday arithmetic |
| `src/lib/lead-scoring.ts` | Lead quality vs. urgency, contact-probability decay |
| `src/lib/sphere.ts` | Relationship decay, tenure and life-event move signals |

**Change the math here, not in a tool or a component.** Every one of these has a
sibling `.test.ts`; if a rule changes, the test changes with it in the same commit.

## The generative UI contract

`src/lib/artifacts.ts` is the whole contract between the agent and the interface.
A tool returns `{ summary, artifacts }` — the summary is what the model reasons over,
the artifact is what the agent looks at. Adding a capability means three things and
nothing else:

1. a tool schema in `src/lib/tools/schema.ts`
2. an executor branch in `src/lib/tools/run.ts`
3. an artifact variant in `src/lib/artifacts.ts` and a renderer in
   `src/components/shift/artifacts/index.tsx`

## Rules that are not negotiable

- **Never fabricate.** A tool with no data says so. No invented comps, deadlines,
  leads or dollar figures — the system prompt says this and the executors enforce it.
- **Compliance blocks, it does not warn.** `canShowProperty` returning `allowed: false`
  must stop the booking. Do not add a bypass.
- **Nothing is sent on the agent's behalf.** Shift drafts and checks; the agent sends.
- **Fair housing runs on every generated word** before the agent sees it.

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
