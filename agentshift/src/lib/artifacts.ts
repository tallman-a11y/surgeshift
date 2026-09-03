/**
 * Generative UI contract.
 *
 * A conversational tool that answers "what's my seller netting at $650k?" with a
 * paragraph has thrown away the answer. The number belongs in a net sheet the agent
 * can hand to the client; a comp set belongs in an adjustment grid; a compliance
 * result belongs in a checklist with the blocking items at the top.
 *
 * So every tool the agent runs returns two things: a compact text summary for the
 * model to reason about, and — where there is something to *show* — a typed artifact
 * that the client renders as a live component inline in the conversation. The union
 * below is the whole contract between the agent and the UI. Adding a capability means
 * adding a variant here and a renderer in components/shift/artifacts.
 */

import type { CmaResult } from './cma'
import type { SellerNetResult, BuyerCostResult } from './net-sheet'
import type { ComplianceCheck, ComplianceReport, FairHousingFinding } from './compliance'
import type { TimelineResult } from './timeline'
import type { ForecastResult, PipelineStage } from './commission'
import type { LeadScore } from './lead-scoring'
import type { SphereSignal } from './sphere'

export type ArtifactBase = {
  /** Stable within a conversation, so a re-render never remounts the component. */
  id: string
  title: string
  /** One line under the title. */
  subtitle?: string
}

export type CmaArtifact = ArtifactBase & {
  kind: 'cma'
  result: CmaResult
}

export type SellerNetArtifact = ArtifactBase & {
  kind: 'seller_net'
  result: SellerNetResult
  /** Alternate prices, so the seller can see the curve rather than one point. */
  scenarios?: { label: string; salePrice: number; netProceeds: number }[]
}

export type BuyerCostArtifact = ArtifactBase & {
  kind: 'buyer_cost'
  result: BuyerCostResult
}

export type ComplianceArtifact = ArtifactBase & {
  kind: 'compliance'
  report: ComplianceReport
  /** Set when this is a showing gate rather than a general audit. */
  gate?: { allowed: boolean; propertyAddress: string; clientName: string }
}

export type TimelineArtifact = ArtifactBase & {
  kind: 'timeline'
  transactionId?: string
  propertyAddress: string
  contractDate: string
  closingDate: string
  result: TimelineResult
}

export type PipelineCard = {
  id: string
  label: string
  address?: string
  stage: PipelineStage
  salePrice: number
  expectedCloseDate: string
  clientName?: string
  /** Anything overdue on this deal, surfaced on the card. */
  alert?: string
}

export type PipelineArtifact = ArtifactBase & {
  kind: 'pipeline'
  cards: PipelineCard[]
  totalVolume: number
  forecast?: ForecastResult
}

export type ForecastArtifact = ArtifactBase & {
  kind: 'forecast'
  result: ForecastResult
  /** Company dollar paid so far, against the cap. */
  capProgress?: { paid: number; cap: number }
}

export type LeadQueueArtifact = ArtifactBase & {
  kind: 'lead_queue'
  leads: (LeadScore & { id: string; name: string; source: string; note?: string })[]
}

export type SphereArtifact = ArtifactBase & {
  kind: 'sphere'
  calls: SphereSignal[]
}

export type ListingCard = {
  id: string
  address: string
  city?: string
  price: number
  beds: number
  baths: number
  sqft: number
  status: 'coming_soon' | 'active' | 'pending' | 'sold' | 'withdrawn' | 'expired'
  daysOnMarket?: number
  photoUrl?: string
  /** Views, saves and showings — the listing's own vital signs. */
  activity?: { views?: number; saves?: number; showings?: number }
  /** Why this listing needs attention right now. */
  alert?: string
}

export type ListingsArtifact = ArtifactBase & {
  kind: 'listings'
  listings: ListingCard[]
}

export type ContactCard = {
  id: string
  name: string
  role: 'buyer' | 'seller' | 'both' | 'past_client' | 'sphere' | 'lead' | 'vendor'
  email?: string
  phone?: string
  tags?: string[]
  lastTouchedAt?: string
  /** The relationship in one line — what the agent needs before dialling. */
  context?: string
  /** Blocking or advisory compliance state on this person. */
  checks?: ComplianceCheck[]
}

export type ContactsArtifact = ArtifactBase & {
  kind: 'contacts'
  contacts: ContactCard[]
}

export type ContentVariant = {
  label: string
  body: string
  /** Where this variant is meant to go — sets the character budget shown. */
  channel: 'mls' | 'instagram' | 'facebook' | 'email' | 'sms' | 'video_script' | 'flyer' | 'blog' | 'linkedin'
  charLimit?: number
}

export type ContentArtifact = ArtifactBase & {
  kind: 'content'
  variants: ContentVariant[]
  /** Every generated word is scanned before the agent ever sees it. */
  fairHousing: FairHousingFinding[]
}

export type MetricTile = {
  label: string
  value: string
  /** Change against the comparison period, as a decimal. */
  delta?: number
  /** For a delta where down is good — days on market, say. */
  lowerIsBetter?: boolean
  note?: string
}

export type MetricsArtifact = ArtifactBase & {
  kind: 'metrics'
  tiles: MetricTile[]
  /** Optional breakdown, rendered as a ranked bar list. */
  breakdown?: { label: string; value: number; display: string }[]
  breakdownTitle?: string
}

export type ShowingSlot = {
  id: string
  address: string
  clientName: string
  startsAt: string
  durationMinutes: number
  status: 'requested' | 'confirmed' | 'blocked' | 'completed'
  /** Set when compliance blocks the showing — the gate, rendered. */
  blockedReason?: string
}

export type ShowingsArtifact = ArtifactBase & {
  kind: 'showings'
  slots: ShowingSlot[]
}

export type ChecklistItem = {
  label: string
  done?: boolean
  detail?: string
  due?: string
  /** Rendered with an urgent treatment. */
  critical?: boolean
}

export type ChecklistArtifact = ArtifactBase & {
  kind: 'checklist'
  items: ChecklistItem[]
}

export type Artifact =
  | CmaArtifact
  | SellerNetArtifact
  | BuyerCostArtifact
  | ComplianceArtifact
  | TimelineArtifact
  | PipelineArtifact
  | ForecastArtifact
  | LeadQueueArtifact
  | SphereArtifact
  | ListingsArtifact
  | ContactsArtifact
  | ContentArtifact
  | MetricsArtifact
  | ShowingsArtifact
  | ChecklistArtifact

export type ArtifactKind = Artifact['kind']

/** Server-sent event frames on /api/shift/chat. */
export type ShiftEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; name: string; label: string }
  | { type: 'tool_done'; name: string }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'error'; message: string }
  | { type: 'done' }

let artifactCounter = 0
export function artifactId(prefix: string): string {
  artifactCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${artifactCounter}`
}
