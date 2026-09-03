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
npm test        # 199 unit tests over the domain logic
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
