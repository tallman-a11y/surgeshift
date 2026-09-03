/**
 * Commission, caps and GCI forecasting — the brokerage back-office math that agents
 * currently do wrong in a spreadsheet and only discover at tax time.
 *
 * The order of operations is the whole game, and it is not intuitive:
 *
 *   gross commission
 *     → referral fee off the top      (the referring broker is paid before anyone)
 *     → franchise / royalty fee       (a share of GCI, usually capped for the year)
 *     → brokerage split               (until the agent's annual cap is met, then 100%)
 *     → per-transaction & E&O fees    (flat, charged whether or not you have capped)
 *     → team split                    (only what reaches the agent is split with the team)
 *     = agent net, pre-tax
 *
 * Caps are per anniversary year and measured in *company dollar* — the money the
 * brokerage actually kept from the split — not in GCI. Getting that wrong is how an
 * agent thinks they capped in August and finds out in October that they did not.
 */

import { clamp, round } from './money'

export type CommissionPlan = {
  /** Agent's share before the cap, e.g. 0.70 for a 70/30 split. */
  splitToAgent: number
  /**
   * Company dollar the agent pays per anniversary year before the split goes to 100%.
   * Zero or undefined means no cap.
   */
  annualCap?: number
  /** Franchise royalty as a share of GCI, e.g. 0.06. */
  royaltyRate?: number
  /** Annual ceiling on royalty paid. */
  royaltyCap?: number
  /** Flat fee per closed transaction. */
  transactionFee?: number
  /** Errors & omissions insurance per transaction. */
  eoFee?: number
  /** Agent's share of what reaches them after the brokerage, e.g. 0.65 on a team. */
  teamSplitToAgent?: number
}

export type DealInput = {
  salePrice: number
  /** The side rate this agent earns, e.g. 0.025. */
  sideRate?: number
  /** A flat commission instead of a percentage. */
  flatCommission?: number
  /** Both sides of the deal, doubling the gross. */
  dualAgency?: boolean
  /** Referral fee owed off the top, as a share of gross commission. */
  referralRate?: number
}

/** Running totals across an anniversary year. Feed the result of one deal into the next. */
export type YearToDate = {
  companyDollarPaid: number
  royaltyPaid: number
  closedSides: number
  gci: number
  agentNet: number
}

export const EMPTY_YTD: YearToDate = {
  companyDollarPaid: 0,
  royaltyPaid: 0,
  closedSides: 0,
  gci: 0,
  agentNet: 0,
}

export type CommissionBreakdown = {
  grossCommission: number
  referralFee: number
  royaltyFee: number
  /** Post-referral, post-royalty amount the split is actually taken from. */
  splittable: number
  companyDollar: number
  transactionFees: number
  teamFee: number
  agentNet: number
  /** True when this deal is the one that met the cap. */
  cappedOnThisDeal: boolean
  /** Company dollar still owed before 100% split, after this deal. */
  capRemaining: number
  ytd: YearToDate
}

export function grossCommission(deal: DealInput): number {
  if (deal.flatCommission != null && deal.flatCommission > 0) {
    return deal.dualAgency ? deal.flatCommission * 2 : deal.flatCommission
  }
  const oneSide = deal.salePrice * (deal.sideRate ?? 0)
  return deal.dualAgency ? oneSide * 2 : oneSide
}

export function calculateCommission(
  deal: DealInput,
  plan: CommissionPlan,
  ytd: YearToDate = EMPTY_YTD,
): CommissionBreakdown {
  const gross = grossCommission(deal)

  // 1. Referral off the top.
  const referralFee = gross * clamp(deal.referralRate ?? 0, 0, 1)
  const afterReferral = gross - referralFee

  // 2. Royalty, against its own annual cap.
  const royaltyRaw = afterReferral * (plan.royaltyRate ?? 0)
  const royaltyRoom = plan.royaltyCap != null
    ? Math.max(0, plan.royaltyCap - ytd.royaltyPaid)
    : Number.POSITIVE_INFINITY
  const royaltyFee = Math.min(royaltyRaw, royaltyRoom)

  const splittable = afterReferral - royaltyFee

  // 3. Split, stopping the instant the cap is met. The portion of this deal that
  //    lands after the cap comes back at 100% — a deal can straddle the cap.
  const capRoom = plan.annualCap != null && plan.annualCap > 0
    ? Math.max(0, plan.annualCap - ytd.companyDollarPaid)
    : Number.POSITIVE_INFINITY
  const brokerageShareRate = 1 - clamp(plan.splitToAgent, 0, 1)
  const companyDollarRaw = splittable * brokerageShareRate
  const companyDollar = Math.min(companyDollarRaw, capRoom)
  // True only on the deal that *crosses* the cap. Once capRoom is zero the agent
  // capped on an earlier deal, and reporting it again on every deal after would
  // make the milestone meaningless.
  const cappedOnThisDeal =
    Number.isFinite(capRoom) && capRoom > 0 && companyDollarRaw >= capRoom

  const afterSplit = splittable - companyDollar

  // 4. Flat fees, charged capped or not.
  const transactionFees = (plan.transactionFee ?? 0) + (plan.eoFee ?? 0)
  const afterFees = afterSplit - transactionFees

  // 5. Team split, on what actually reached the agent.
  const teamRate = plan.teamSplitToAgent != null ? clamp(plan.teamSplitToAgent, 0, 1) : 1
  const teamFee = afterFees > 0 ? afterFees * (1 - teamRate) : 0
  const agentNet = afterFees - teamFee

  const nextYtd: YearToDate = {
    companyDollarPaid: round(ytd.companyDollarPaid + companyDollar, 2),
    royaltyPaid: round(ytd.royaltyPaid + royaltyFee, 2),
    closedSides: ytd.closedSides + (deal.dualAgency ? 2 : 1),
    gci: round(ytd.gci + gross, 2),
    agentNet: round(ytd.agentNet + agentNet, 2),
  }

  return {
    grossCommission: round(gross, 2),
    referralFee: round(referralFee, 2),
    royaltyFee: round(royaltyFee, 2),
    splittable: round(splittable, 2),
    companyDollar: round(companyDollar, 2),
    transactionFees: round(transactionFees, 2),
    teamFee: round(teamFee, 2),
    agentNet: round(agentNet, 2),
    cappedOnThisDeal,
    capRemaining: Number.isFinite(capRoom) ? round(Math.max(0, capRoom - companyDollar), 2) : 0,
    ytd: nextYtd,
  }
}

/** Run a whole year of deals in order, so the cap applies where it actually falls. */
export function runYear(
  deals: DealInput[],
  plan: CommissionPlan,
  start: YearToDate = EMPTY_YTD,
): { breakdowns: CommissionBreakdown[]; ytd: YearToDate } {
  let ytd = start
  const breakdowns: CommissionBreakdown[] = []
  for (const deal of deals) {
    const b = calculateCommission(deal, plan, ytd)
    breakdowns.push(b)
    ytd = b.ytd
  }
  return { breakdowns, ytd }
}

export type PipelineDeal = DealInput & {
  id: string
  label: string
  /** Contract-to-close stage, which is what really sets the odds. */
  stage: PipelineStage
  expectedCloseDate: string
  /** Override the stage's default probability when you know something the stage doesn't. */
  probabilityOverride?: number
}

export type PipelineStage =
  | 'lead'
  | 'active_buyer'
  | 'active_listing'
  | 'offer_out'
  | 'under_contract'
  | 'contingencies_cleared'
  | 'clear_to_close'

/**
 * Close probability by stage. These are deliberately conservative — a forecast that
 * flatters the pipeline is worse than no forecast, because agents spend against it.
 */
export const STAGE_PROBABILITY: Record<PipelineStage, number> = {
  lead: 0.08,
  active_buyer: 0.25,
  active_listing: 0.45,
  offer_out: 0.35,
  under_contract: 0.72,
  contingencies_cleared: 0.90,
  clear_to_close: 0.98,
}

export type ForecastResult = {
  deals: {
    id: string
    label: string
    stage: PipelineStage
    expectedCloseDate: string
    probability: number
    grossCommission: number
    expectedAgentNet: number
    weightedAgentNet: number
  }[]
  /** Every deal closing at full value — the number to never plan against. */
  bestCase: number
  /** Probability-weighted, the number to actually plan against. */
  expected: number
  /** Only the deals past the contingency period. */
  committed: number
  byMonth: { month: string; expected: number; committed: number }[]
}

/**
 * Forecast the pipeline. Deals are run through the cap in expected-close order, so a
 * forecast that crosses the cap shows the real jump in take-home rather than applying
 * one average split to the whole year.
 */
export function forecastPipeline(
  pipeline: PipelineDeal[],
  plan: CommissionPlan,
  ytd: YearToDate = EMPTY_YTD,
): ForecastResult {
  const ordered = [...pipeline].sort(
    (a, b) => new Date(a.expectedCloseDate).getTime() - new Date(b.expectedCloseDate).getTime(),
  )

  let running = ytd
  const deals: ForecastResult['deals'] = []

  for (const d of ordered) {
    const probability = clamp(d.probabilityOverride ?? STAGE_PROBABILITY[d.stage], 0, 1)
    const b = calculateCommission(d, plan, running)
    // Advance the cap by the expected value, not the full value: a 25% deal should
    // not push the agent a full deal closer to capping.
    running = {
      companyDollarPaid: round(running.companyDollarPaid + b.companyDollar * probability, 2),
      royaltyPaid: round(running.royaltyPaid + b.royaltyFee * probability, 2),
      closedSides: running.closedSides,
      gci: round(running.gci + b.grossCommission * probability, 2),
      agentNet: round(running.agentNet + b.agentNet * probability, 2),
    }
    deals.push({
      id: d.id,
      label: d.label,
      stage: d.stage,
      expectedCloseDate: d.expectedCloseDate,
      probability,
      grossCommission: b.grossCommission,
      expectedAgentNet: b.agentNet,
      weightedAgentNet: round(b.agentNet * probability, 2),
    })
  }

  const bestCase = round(deals.reduce((s, d) => s + d.expectedAgentNet, 0), 2)
  const expected = round(deals.reduce((s, d) => s + d.weightedAgentNet, 0), 2)
  const committedStages: PipelineStage[] = ['contingencies_cleared', 'clear_to_close']
  const committed = round(
    deals.filter(d => committedStages.includes(d.stage))
      .reduce((s, d) => s + d.weightedAgentNet, 0),
    2,
  )

  const monthMap = new Map<string, { expected: number; committed: number }>()
  for (const d of deals) {
    const month = d.expectedCloseDate.slice(0, 7)
    const cur = monthMap.get(month) ?? { expected: 0, committed: 0 }
    cur.expected += d.weightedAgentNet
    if (committedStages.includes(d.stage)) cur.committed += d.weightedAgentNet
    monthMap.set(month, cur)
  }
  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, expected: round(v.expected, 2), committed: round(v.committed, 2) }))

  return { deals, bestCase, expected, committed, byMonth }
}
