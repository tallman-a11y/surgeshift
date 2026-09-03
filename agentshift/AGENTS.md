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

## The Shift family environment

AgentShift is wired into all four layers of the shared brain (`@allshift/core`).
`buildLayers()` in `src/lib/shift-brain.ts` constructs them; each degrades on its own,
and `/api/shift/family` reports which are actually live.

| Layer | Store | Tables | Degrades to |
| --- | --- | --- | --- |
| Memory | `SupabaseMemoryStore` | `shift_memory` | no cross-session recall |
| Learning | `SupabaseLearningStore` | `shift_feedback`, `shift_learning_outcomes` | no derived preferences |
| Genome | `SupabaseGenomeStore` | `shift_collective_patterns` + corpus | `NoOpGenomeStore` |
| Context | `SupabaseContextGraph` | `shift_cross_product_events`, `shift_identities` | `NoOpContextGraph` |

**The context graph is ours.** `@allshift/core` has declared the `ContextGraph`
interface since 0.4 but no product had implemented it, so every product was
constructing `NoOpContextGraph` and that interface carried nothing.
`src/lib/shift/context-graph.ts` is the first real implementation — if you port it to
RealShift or LendShift, port the tests with it.

**This is not the only handoff mechanism, and it is not the one carrying traffic.**
RealShift and LendShift already interoperate over a signed HTTP pipe —
`POST /api/partner/referral`, shared `PARTNER_SECRET`, HMAC over the raw body — which
predates the context graph and works today. `src/lib/shift/partner.ts` speaks it, and
`partner.test.ts` round-trips a signed body against the way RealShift verifies it.

Which to use:

- **Partner pipe** — a person moving between products (a buyer who needs a lender, a
  borrower who needs an agent). Real-time, lands in the receiving product's inbox.
- **Context graph** — ambient context about a shared user that the sibling should know
  next time it speaks to them. Queued, consumed on their next turn.

`hand_off_to_family` does both: the bus row is the durable record, the pipe is the
live delivery, and the tool reports which of the two actually happened.

### The bus is only cross-product when it is shared

Each product has its own Supabase project, so a bus written into this project is
invisible to the others. Migration `003_shift_family.sql` belongs in **one shared
family project** that every product points at via `SHIFT_FAMILY_SUPABASE_URL` /
`SHIFT_FAMILY_SUPABASE_SERVICE_KEY`.

Unset, it falls back to product-local: publish and consume work, identities resolve,
nothing throws — but siblings cannot read the events. **Never let the UI or the model
claim a handoff arrived when `familyBusIsShared()` is false.** The tool summaries and
the system prompt both say so explicitly; keep it that way.

### Rules for cross-product work

- Events are addressed to the **global** user id from `shift_identities`, never a
  product-local one. Use `publishFor()`, which resolves identity for you.
- **Consent is enforced in `publishFor()`, not in the caller** — a consent check the
  caller has to remember is one that gets forgotten.
- A referral carries a client's details. `hand_off_to_family` refuses when the contact
  has no recorded written contact consent. Do not add a bypass.
- Events are marked consumed **after** a turn succeeds. Consuming on read means a
  failed turn silently swallows a lender's message.

## Shift agent coordination — parking lot + local↔prod reconcile

This repo is part of the **central Shift parking lot**: a shared cross-product timeline
of what every agent does, so any agent can pick up where another left off.

- **Start of work** → `/catchup` (open threads/handoffs for this product) before touching anything.
- **Stopping / handing off** → `/handoff` (logs a resume_point to the shared timeline). Commits & deploys auto-log.
- **"pickup <product>"** resumes from the parking lot first, then the resume memory.
- Helper if a skill isn't available: `node ~/.claude/shift-parking-lot/shiftlog.mjs catchup|log|resolve`.
- **From this repo:** `npm run catchup`, `npm run handoff "<resume point>"`. These go
  through `scripts/shiftlog.mjs`, which forwards to the shared helper and tags every
  entry with `--product agentshift`. When the helper is not installed it prints a note
  and **exits 0** — it runs from a git hook, and a missing optional tool must never
  block a commit.
- `npm run hooks` installs the post-commit hook that auto-logs commits. Opt-in on
  purpose: a repo that installs git hooks behind your back is one you stop trusting.

**Reconcile local ↔ prod — adopt the MOST advanced/current side, whichever it is.** The
newest work can be on either side: local may be **behind** `origin` (another agent/machine
pushed) OR **ahead** with uncommitted WIP; prod may hold newer commits, **migrations, env,
or data** (often applied via the Supabase Management API or Vercel/Fly secrets, never in the
local tree). Before assuming local is current or deploying: `git fetch --all --prune && git
status -sb`, check local WIP (`git status --porcelain`), and check the live deploy (`vercel
ls` / `/api/version` / `flyctl status`). Never deploy from a branch behind its remote, never
overwrite newer uncommitted work, and when the two sides diverge, surface it — don't guess.
