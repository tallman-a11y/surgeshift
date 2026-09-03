import type { SupabaseClient } from '@supabase/supabase-js'
import type { Artifact } from '@/lib/artifacts'
import type { CommissionPlan } from '@/lib/commission'
import type { MarketContext } from '@/lib/cma'
import type { SupabaseContextGraph } from '@/lib/shift/context-graph'

/** The agent profile row, narrowed to what the tools actually read. */
export type AgentProfile = {
  id: string
  full_name: string
  brokerage_name: string | null
  market_area: string | null
  annual_appreciation: number
  median_dom: number
  list_to_sale_ratio: number
  split_to_agent: number
  annual_cap: number | null
  royalty_rate: number
  royalty_cap: number | null
  transaction_fee: number
  eo_fee: number
  team_split_to_agent: number | null
  voice_notes: string | null
  disclosure_line: string | null
}

export type LayerStatus = {
  memory: boolean
  learning: boolean
  genome: boolean
  contextGraph: boolean
  embedding: boolean
}

export type ToolContext = {
  supabase: SupabaseClient
  agentId: string
  agent: AgentProfile | null
  /** Injected so the copywriting tool can call the model without a circular import. */
  generate: (system: string, prompt: string, maxTokens?: number) => Promise<string>
  now: Date
  /** The family bus, when one is configured. Null means handoffs cannot be sent. */
  contextGraph: SupabaseContextGraph | null
  /** Which brain layers actually came up, so tools can report the truth. */
  layerStatus: LayerStatus
}

/**
 * What every tool returns: a compact summary the model reasons over, and — when there
 * is something worth showing rather than describing — an artifact the client renders.
 */
export type ToolOutcome = {
  summary: string
  artifacts?: Artifact[]
}

export function commissionPlan(agent: AgentProfile | null): CommissionPlan {
  return {
    splitToAgent: agent?.split_to_agent ?? 0.7,
    annualCap: agent?.annual_cap ?? undefined,
    royaltyRate: agent?.royalty_rate ?? 0,
    royaltyCap: agent?.royalty_cap ?? undefined,
    transactionFee: agent?.transaction_fee ?? 0,
    eoFee: agent?.eo_fee ?? 0,
    teamSplitToAgent: agent?.team_split_to_agent ?? undefined,
  }
}

export function marketContext(agent: AgentProfile | null): MarketContext {
  return {
    annualAppreciation: agent?.annual_appreciation ?? 0.04,
    medianDom: agent?.median_dom ?? 30,
    listToSaleRatio: agent?.list_to_sale_ratio ?? 0.99,
  }
}

/** Numeric columns come back from PostgREST as strings for numeric(); normalise. */
export function num(v: unknown, fallback = 0): number {
  if (v == null) return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
