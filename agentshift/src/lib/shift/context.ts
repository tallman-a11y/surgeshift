import {
  retrieveRelevantMemories,
  formatMemoriesForPrompt,
  formatPreferencesForPrompt,
  formatCollectiveIntelligenceForPrompt,
  formatCrossProductContextForPrompt,
  type CrossProductEvent,
} from '@allshift/core'
import { agentShiftPersona, type BrainLayers } from '@/lib/shift-brain'
import { SupabaseContextGraph } from './context-graph'

/**
 * Assemble everything the family knows about this agent into one prompt block.
 *
 * Four independent sources, each of which can fail without taking the turn with it:
 * memory (what Shift has learned about how this agent works), preferences (derived
 * from their accept/edit/reject signals), collective intelligence (patterns distilled
 * across every Shift product), and the cross-product inbox (what LendShift and
 * SurgeShift have sent over).
 *
 * The whole thing is wrapped in try/catch per source deliberately. An agent asking
 * what a house is worth should never lose their answer because Voyage was slow.
 */
export type FamilyContext = {
  block: string
  /** Events injected into this turn, to be marked consumed once the turn succeeds. */
  consumedEventIds: string[]
  events: CrossProductEvent[]
}

export async function buildFamilyContext(opts: {
  layers: BrainLayers
  userId: string
  query: string
}): Promise<FamilyContext> {
  const { layers, userId, query } = opts
  const parts: string[] = []
  let events: CrossProductEvent[] = []

  const queryEmbedding = layers.embedding.enabled()
    ? await layers.embedding.embedOne(query, 'query').catch(() => null)
    : null

  // 1. Memory — how this agent works, recalled across sessions.
  if (layers.memory) {
    try {
      const memories = await retrieveRelevantMemories(layers.memory, layers.embedding, {
        userId, query, limit: 10, threshold: 0.25,
      })
      const block = formatMemoriesForPrompt(memories, agentShiftPersona.domain)
      if (block) parts.push(block)
    } catch { /* recall is a bonus, never a blocker */ }
  }

  // 2. Preferences — derived from what they accept, edit and reject.
  if (layers.learning) {
    try {
      const prefs = await layers.learning.getPreferences(userId, 'agentshift')
      if (prefs) {
        const block = formatPreferencesForPrompt(prefs, agentShiftPersona.domain)
        if (block) parts.push(block)
      }
    } catch { /* ignore */ }
  }

  // 3. Collective intelligence — patterns distilled across the whole family.
  try {
    const patterns = await layers.genome.getCollectivePatterns('agentshift', queryEmbedding, 5)
    if (patterns.length > 0) {
      const block = formatCollectiveIntelligenceForPrompt(patterns)
      if (block) parts.push(block)
    }
  } catch { /* ignore */ }

  // 4. The cross-product inbox — what the siblings have sent about this user.
  if (layers.contextGraph instanceof SupabaseContextGraph) {
    try {
      events = await layers.contextGraph.pendingFor(userId)
      if (events.length > 0) {
        const block = formatCrossProductContextForPrompt(events)
        if (block) parts.push(block)
      }
    } catch { /* ignore */ }
  }

  return {
    block: parts.filter(Boolean).join('\n\n'),
    consumedEventIds: events.map(e => e.id),
    events,
  }
}

/**
 * Mark the events injected into a turn as consumed.
 *
 * Called only after the turn produced a response: consuming up front would mean a
 * failed turn silently swallows a lender's message, and the agent would never learn
 * their buyer got pre-approved.
 */
export async function consumeEvents(layers: BrainLayers, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    await layers.contextGraph.markConsumed(ids)
  } catch { /* the event stays pending and arrives next turn — the safe failure */ }
}
