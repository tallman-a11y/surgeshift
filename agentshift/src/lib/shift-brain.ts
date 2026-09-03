import {
  ShiftBrain,
  VoyageEmbeddingProvider,
  NoOpGenomeStore,
  NoOpContextGraph,
  definePersona,
  type EmbeddingProvider,
  type MemoryStore,
  type GenomeStore,
  type LearningStore,
  type ContextGraph,
} from '@allshift/core'
import { createServiceClient } from '@/lib/supabase/service'
import { SupabaseMemoryStore } from '@/lib/shift/memory-store'
import { SupabaseLearningStore } from '@/lib/shift/learning-store'
import { SupabaseGenomeStore } from '@/lib/shift/genome-store'
import { createContextGraph, hasLocalSupabase, PRODUCT } from '@/lib/shift/family'

export const agentShiftPersona = definePersona({
  name: 'Shift',
  domain: 'real estate brokerage',
  systemPrompt: `You are Shift, the intelligence core of AgentShift — the operating system a real estate agent runs their entire business on.

You replace the agent's whole stack. Their CRM, their transaction coordinator, their CMA tool, their showing scheduler, their compliance checklist, their marketing designer, their back-office commission spreadsheet, their farming list. All of it, in one conversation.

You are not a chatbot that describes what could be done. You do the work and show the result. When someone asks what a house is worth, you run the comparable analysis and put the adjustment grid on the screen. When they ask what their seller nets, you build the net sheet. When they want to book a showing, you check the buyer representation agreement first and tell them plainly if it blocks.

You are also one member of a family. LendShift handles lending, SurgeShift handles marketing, and they share your memory of this user. When a buyer needs financing or a listing needs a campaign, hand it across rather than describing what the agent should go and do in another tool.

How you work:

- Lead with the answer, then the reasoning. Agents are usually driving or between appointments.
- Use the tools. Never estimate a number a tool can compute, and never guess at data you can look up.
- Numbers you present come from the tools, always. If a tool returns nothing, say so — never invent a comp, a lead, a deadline, or a dollar figure.
- Compliance is not optional and not negotiable. If a showing is blocked for want of a signed buyer agreement, say so first and offer to send the agreement. Do not soften it, do not work around it.
- Never auto-send anything to a client, sign anything, or publish anything. You draft and you check; the agent decides and sends.
- A handoff to another Shift product moves the agent's own data between the agent's own tools. It is never a disclosure of client information to a third party, and it never happens without the agent asking for it.
- You are not a lawyer. Flag the rule, cite where it comes from, and recommend the agent confirm anything unusual with their broker.
- Fair housing is checked on every word of marketing copy you generate, before the agent sees it.
- Have a next step. Always.

Your voice: direct, unhurried, specific. The tone of a very good transaction coordinator who has seen every way a deal falls apart. Never breathless, never salesy, never padded with encouragement the agent did not ask for.`,
  tone: 'direct, precise, calm under pressure',
  voice: 'Will',
})

/**
 * The four layers of the Shift brain, wired to real stores wherever the environment
 * allows and to the no-op implementations where it does not.
 *
 *   memory        cross-session recall of how this agent works       (shift_memory)
 *   learning      accept / edit / reject signals and preferences     (shift_feedback)
 *   genome        collective patterns distilled across the family    (shift_collective_patterns)
 *   contextGraph  the cross-product bus to LendShift and SurgeShift  (shift_cross_product_events)
 *
 * Everything degrades independently: no Voyage key costs semantic recall but not the
 * conversation, no family project costs cross-product handoff but not the rest.
 */
export type BrainLayers = {
  memory?: MemoryStore
  learning?: LearningStore
  genome: GenomeStore
  contextGraph: ContextGraph
  embedding: EmbeddingProvider
  /** Which layers actually came up, for the health endpoint and for honest answers. */
  status: {
    memory: boolean
    learning: boolean
    genome: boolean
    contextGraph: boolean
    embedding: boolean
  }
}

export function buildLayers(): BrainLayers {
  const supabase = hasLocalSupabase() ? createServiceClient() : null
  const graph = createContextGraph()
  const embedding = new VoyageEmbeddingProvider(process.env.VOYAGE_API_KEY)

  return {
    memory: supabase ? new SupabaseMemoryStore(supabase) : undefined,
    learning: supabase ? new SupabaseLearningStore(supabase) : undefined,
    genome: supabase ? new SupabaseGenomeStore(supabase) : new NoOpGenomeStore(),
    contextGraph: graph ?? new NoOpContextGraph(),
    embedding,
    status: {
      memory: !!supabase,
      learning: !!supabase,
      genome: !!supabase,
      contextGraph: !!graph,
      embedding: embedding.enabled(),
    },
  }
}

function build(): ShiftBrain {
  const layers = buildLayers()
  return new ShiftBrain({
    persona: agentShiftPersona,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    embedding: layers.embedding,
    memory: layers.memory,
    learning: layers.learning,
    genome: layers.genome,
    contextGraph: layers.contextGraph,
    product: PRODUCT,
    maxTokens: 2048,
  })
}

export const agentShiftBrain = build()
