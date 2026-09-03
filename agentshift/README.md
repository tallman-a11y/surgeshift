# AgentShift

**The operating system a real estate agent runs their entire business on.**

One conversation replaces the CRM, the CMA tool, the transaction coordinator, the
compliance checklist, the showing scheduler, the marketing designer and the
back-office commission spreadsheet — roughly fourteen subscriptions that do not talk
to each other, which is why the same client details get typed in nine times.

Part of the **AllShift AI** family, alongside SurgeShift (marketing) and LendShift
(lending), sharing the `@allshift/core` memory spine and the `@allshift/ui` feel layer.

---

## What makes it different

**The interface is generated to fit the answer.** Ask what a house is worth and an
appraisal-style adjustment grid appears. Ask to book a showing and a compliance gate
appears. Every tool returns two things — a summary the model reasons over, and a typed
artifact the client renders as a live component inline in the conversation. Neither
has to make do with the other's format.

**It does the work, then tells you.** Other tools give you somewhere to do the work
yourself. AgentShift runs the analysis, drafts the copy, checks the rule, and hands
you the decision — the only part that needed you.

**It says no.** Since 17 August 2024 a buyer cannot tour a home without a signed
written representation agreement stating a specific compensation amount. Every CRM on
the market will happily let you book that showing anyway. This one will not: the gate
is in `canShowProperty`, called at the moment a showing is requested, and it returns
`allowed: false`.

## The family

AgentShift is one member of the AllShift family and shares its brain with the others.
All four layers of `@allshift/core` are wired in:

- **Memory** — what Shift has learned about how this agent works, across sessions
- **Learning** — their accept / edit / reject signals, and the response style derived
  from them (heavy editing means "too long", not "wrong")
- **Genome** — collective patterns distilled across every Shift product
- **Context graph** — the cross-product bus: a buyer who needs financing is handed to
  LendShift as a pre-approval lead; a listing going live is handed to SurgeShift for
  the campaign

The context graph is the piece that did not exist anywhere in the family before —
the interface had been declared since core 0.4, but every product was falling back to
`NoOpContextGraph`, so handoffs silently went nowhere.

**It is only genuinely cross-product when it is shared.** Each product has its own
Supabase project, so migration `003_shift_family.sql` belongs in one shared family
project that every product points at via `SHIFT_FAMILY_SUPABASE_URL`. Unset, the bus
runs product-locally: publishing and consuming work, but the siblings cannot read the
events — and the app says so rather than implying a handoff arrived.

`GET /api/shift/family` reports exactly which layers are live.

Handoffs enforce consent twice over: the receiving product must be one the user has
connected, and the contact must have recorded written contact consent before their
details travel anywhere.

## Parking lot

This repo logs to the shared Shift parking lot, the cross-product timeline that lets
any agent pick up where another left off.

```bash
npm run catchup                      # open threads for agentshift
npm run handoff "next: apply 003"    # log a resume point
npm run hooks                        # install the auto-logging post-commit hook
```

`scripts/shiftlog.mjs` forwards to the shared helper and tags every entry with this
product. When the helper is not installed it prints a note and exits 0 — it runs from
a git hook, and a missing optional tool must never block a commit.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in Supabase and Anthropic
npm run dev
```

Apply `supabase/migrations/` in order. `001` is the Shift memory spine (needs the
`vector` extension); `002` is the domain schema, with row-level security on every
table keyed to the owning agent.

```bash
npm test        # 227 unit tests over the domain logic and the family wiring
npm run lint
npm run typecheck
npm run build
```

The marketing site renders without any environment at all — the proxy falls through
when Supabase is unconfigured rather than taking the whole site down. Everything
behind the login fails closed.

## How it is put together

```
src/lib/            pure domain logic, no I/O, fully unit-tested
src/lib/tools/      tool schemas + executors (data in, artifact out)
src/lib/artifacts.ts  the agent ⇄ interface contract
src/components/shift/artifacts/  one renderer per artifact kind
src/app/api/shift/chat/  the agentic loop, streamed as SSE
```

The domain logic is deliberately dependency-free: the CMA engine, the net sheet, the
commission cap arithmetic, the compliance rules and the business-day date maths are
plain functions with no database, model or React anywhere near them. That is why they
can be tested exhaustively, and why the numbers on screen are reproducible.

See `AGENTS.md` before changing any of it.

## What it is not

Not an appraisal, and not legal advice. The compliance engine flags rules and cites
where they come from; state and local rules stack on top, and the broker's policy
governs. Nothing is ever sent to a client, signed, or published without the agent
doing it.
