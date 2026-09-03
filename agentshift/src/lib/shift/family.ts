import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { SupabaseContextGraph } from './context-graph'

export const PRODUCT = 'agentshift'

/** The sibling products AgentShift knows how to hand work to. */
export const FAMILY_PRODUCTS = ['realshift', 'lendshift', 'surgeshift'] as const
export type FamilyProduct = (typeof FAMILY_PRODUCTS)[number]

export function hasLocalSupabase(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * The shared "family" Supabase project that carries the cross-product bus.
 *
 * Each Shift product has its own database, so a bus written into AgentShift's project
 * is invisible to LendShift. Point every product at one shared project with
 * SHIFT_FAMILY_SUPABASE_URL / SHIFT_FAMILY_SUPABASE_SERVICE_KEY and the handoffs
 * become real.
 *
 * Unset, this falls back to the product's own database. The bus then works
 * product-locally — publish and consume still function, identities still resolve,
 * nothing throws — and becomes cross-product the moment the shared project is
 * configured, with no code change. `familyBusIsShared()` reports which mode is live
 * so the app never claims a handoff reached a sibling when it did not.
 */
export function createFamilyClient(): SupabaseClient | null {
  const url = process.env.SHIFT_FAMILY_SUPABASE_URL
  const key = process.env.SHIFT_FAMILY_SUPABASE_SERVICE_KEY

  if (url && key) {
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  if (!hasLocalSupabase()) return null
  return createServiceClient()
}

export function familyBusIsShared(): boolean {
  return !!(process.env.SHIFT_FAMILY_SUPABASE_URL && process.env.SHIFT_FAMILY_SUPABASE_SERVICE_KEY)
}

/** The context graph, or null when there is no database at all to put it on. */
export function createContextGraph(): SupabaseContextGraph | null {
  const client = createFamilyClient()
  return client ? new SupabaseContextGraph(client, PRODUCT) : null
}

/**
 * What a handoff to each sibling means, in the receiving product's terms.
 *
 * Kept here rather than inline in the tool so the vocabulary is one list the whole
 * family can agree on, and so an unknown event type is a compile error rather than a
 * message nobody picks up.
 */
export const HANDOFF_TYPES = {
  lender_referral: {
    target: 'lendshift' as const,
    what: 'A buyer who needs financing. LendShift picks them up as a pre-approval lead.',
  },
  listing_live: {
    target: 'surgeshift' as const,
    what: 'A listing has gone active. SurgeShift can build the campaign around it.',
  },
  client_closed: {
    target: 'lendshift' as const,
    what: 'A transaction closed. Tells the lender side the loan funded.',
  },
  seller_lead: {
    target: 'surgeshift' as const,
    what: 'A homeowner thinking about selling. SurgeShift can nurture them.',
  },
  investor_referral: {
    target: 'realshift' as const,
    what: 'A client buying as an investment. RealShift runs the deal analysis and rent ledger.',
  },
} as const

export type HandoffType = keyof typeof HANDOFF_TYPES
