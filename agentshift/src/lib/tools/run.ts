/**
 * Tool execution.
 *
 * Every tool follows the same shape: read the agent's real data, run it through the
 * pure domain logic in src/lib, and return a short summary plus a renderable artifact.
 * Nothing here fabricates a number. When there is no data, the tool says so — a made-up
 * comp or an invented deadline is far worse than an empty answer.
 */

import { runCma, type Comp, type Property, type Condition } from '@/lib/cma'
import { sellerNetSheet, buyerCashToClose } from '@/lib/net-sheet'
import {
  canShowProperty, auditListing, buildReport, scanFairHousing,
  type BuyerEngagement,
} from '@/lib/compliance'
import { buildTimeline, upcomingAcross, iso, type MilestoneKind } from '@/lib/timeline'
import { forecastPipeline, EMPTY_YTD, type PipelineDeal, type PipelineStage, type YearToDate } from '@/lib/commission'
import { triageQueue, type LeadIntent, type LeadSource } from '@/lib/lead-scoring'
import { dailySphereCalls, type SphereContact, type RelationshipTier, type LifeEvent } from '@/lib/sphere'
import { usd, usdShort, round } from '@/lib/money'
import { artifactId, type Artifact, type ListingCard, type ContentVariant, type PipelineCard } from '@/lib/artifacts'
import { commissionPlan, marketContext, num, str, type ToolContext, type ToolOutcome } from './context'

type Input = Record<string, unknown>

export async function runTool(name: string, input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  switch (name) {
    case 'get_dashboard':        return getDashboard(ctx)
    case 'triage_leads':         return triageLeads(input, ctx)
    case 'sphere_calls':         return sphereCalls(input, ctx)
    case 'run_cma':              return runCmaTool(input, ctx)
    case 'seller_net_sheet':     return sellerNetTool(input)
    case 'buyer_cost_estimate':  return buyerCostTool(input)
    case 'check_showing':        return checkShowingTool(input, ctx)
    case 'get_showings':         return getShowings(input, ctx)
    case 'audit_listing':        return auditListingTool(input, ctx)
    case 'transaction_timeline': return timelineTool(input, ctx)
    case 'get_pipeline':         return getPipeline(ctx)
    case 'forecast_income':      return forecastTool(ctx)
    case 'write_marketing_copy': return writeCopy(input, ctx)
    case 'get_listings':         return getListings(input, ctx)
    case 'find_contacts':        return findContacts(input, ctx)
    case 'create_contact':       return createContact(input, ctx)
    case 'log_touch':            return logTouch(input, ctx)
    case 'production_report':    return productionReport(input, ctx)
    default:                     return { summary: `Unknown tool: ${name}` }
  }
}

// ── Dashboard ───────────────────────────────────────────────────────────────────

async function getDashboard(ctx: ToolContext): Promise<ToolOutcome> {
  const { supabase, agentId, now } = ctx
  const today = iso(now)
  const weekOut = iso(new Date(now.getTime() + 7 * 86_400_000))

  const [leads, showings, listings, deals, milestones] = await Promise.all([
    supabase.from('contacts').select('id')
      .eq('agent_id', agentId).eq('role', 'lead').eq('archived', false).eq('contact_attempts', 0),
    supabase.from('showings').select('id, starts_at, status')
      .eq('agent_id', agentId).gte('starts_at', `${today}T00:00:00Z`).lte('starts_at', `${weekOut}T23:59:59Z`),
    supabase.from('listings').select('id, list_price, status').eq('agent_id', agentId).eq('status', 'active'),
    supabase.from('transactions').select('id, sale_price, stage')
      .eq('agent_id', agentId).not('stage', 'in', '("closed","fell_through")'),
    supabase.from('transaction_milestones').select('id, kind, due_date, critical, transaction_id')
      .eq('agent_id', agentId).is('completed_date', null).lte('due_date', weekOut).order('due_date'),
  ])

  const unworked = leads.data?.length ?? 0
  const showingsToday = (showings.data ?? []).filter(s => str(s.starts_at).slice(0, 10) === today).length
  const activeListings = listings.data ?? []
  const listingVolume = activeListings.reduce((s, l) => s + num(l.list_price), 0)
  const pipeline = deals.data ?? []
  const pipelineVolume = pipeline.reduce((s, d) => s + num(d.sale_price), 0)
  const due = milestones.data ?? []
  const overdue = due.filter(m => str(m.due_date) < today)

  const empty = unworked === 0 && pipeline.length === 0 && activeListings.length === 0 && due.length === 0
  if (empty) {
    return {
      summary:
        'The agent has no leads, listings, transactions or deadlines on file yet. This is a fresh account — offer to set up their profile, import contacts, or add their first listing or deal. Do not invent activity.',
    }
  }

  const artifact: Artifact = {
    kind: 'metrics',
    id: artifactId('dash'),
    title: 'Where things stand',
    subtitle: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    tiles: [
      { label: 'Unworked leads', value: String(unworked), note: unworked > 0 ? 'Nobody has called these' : 'All caught up' },
      { label: 'Showings today', value: String(showingsToday) },
      { label: 'Deadlines this week', value: String(due.length), note: overdue.length > 0 ? `${overdue.length} already overdue` : undefined },
      { label: 'Active listings', value: String(activeListings.length), note: listingVolume > 0 ? `${usdShort(listingVolume)} on market` : undefined },
      { label: 'Deals in play', value: String(pipeline.length), note: pipelineVolume > 0 ? `${usdShort(pipelineVolume)} volume` : undefined },
    ],
  }

  return {
    summary: [
      `${unworked} unworked lead(s).`,
      `${showingsToday} showing(s) today.`,
      `${due.length} deadline(s) in the next 7 days, ${overdue.length} overdue.`,
      `${activeListings.length} active listing(s) totalling ${usd(listingVolume)}.`,
      `${pipeline.length} deal(s) in the pipeline totalling ${usd(pipelineVolume)}.`,
      overdue.length > 0
        ? `OVERDUE: ${overdue.map(m => `${str(m.kind)} (due ${str(m.due_date)})`).join(', ')}. Lead with this.`
        : '',
    ].filter(Boolean).join(' '),
    artifacts: [artifact],
  }
}

// ── Leads ───────────────────────────────────────────────────────────────────────

async function triageLeads(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const limit = Math.min(num(input.limit, 10), 25)
  const { data } = await ctx.supabase.from('contacts')
    .select('*').eq('agent_id', ctx.agentId).eq('archived', false)
    .in('role', ['lead', 'buyer', 'seller', 'both'])
    .order('created_at', { ascending: false }).limit(60)

  const rows = data ?? []
  if (rows.length === 0) return { summary: 'No leads on file. Offer to add one or connect a lead source.' }

  const queue = triageQueue(rows.map(r => ({
    id: str(r.id),
    name: str(r.full_name),
    source: (str(r.source, 'unknown') as LeadSource),
    timelineMonths: r.timeline_months == null ? undefined : num(r.timeline_months),
    preApproved: !!r.pre_approved,
    lenderIntroduced: !!r.lender_introduced,
    hasAgent: !!r.has_agent,
    hasHomeToSell: !!r.has_home_to_sell,
    propertyViews: num(r.property_views),
    savedSearches: num(r.saved_searches),
    inboundReplies: num(r.inbound_replies),
    contactAttempts: num(r.contact_attempts),
    createdAt: str(r.created_at, iso(ctx.now)),
    lastContactedAt: r.last_contacted_at ? str(r.last_contacted_at) : undefined,
  } satisfies LeadIntent & { id: string; name: string })), ctx.now).slice(0, limit)

  const byId = new Map(rows.map(r => [str(r.id), r]))

  return {
    summary: queue.map(l =>
      `${l.name} — grade ${l.grade} (${l.score}), urgency ${l.urgency}, ${l.ageMinutes}min old, ${Math.round(l.contactProbability * 100)}% contact odds. ${l.nextAction}`
    ).join('\n'),
    artifacts: [{
      kind: 'lead_queue',
      id: artifactId('leads'),
      title: 'Call these, in this order',
      subtitle: 'Ranked by urgency, not by quality — a fresh lead beats a better one that just got called',
      leads: queue.map(l => ({
        ...l,
        source: str(byId.get(l.id)?.source, 'unknown'),
        note: str(byId.get(l.id)?.notes) || undefined,
      })),
    }],
  }
}

async function sphereCalls(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const limit = Math.min(num(input.limit, 8), 20)
  const [{ data: contacts }, { data: events }] = await Promise.all([
    ctx.supabase.from('contacts').select('*')
      .eq('agent_id', ctx.agentId).eq('archived', false)
      .in('role', ['past_client', 'sphere', 'both']).limit(400),
    ctx.supabase.from('life_events').select('*').eq('agent_id', ctx.agentId).limit(500),
  ])

  const rows = contacts ?? []
  if (rows.length === 0) {
    return { summary: 'No sphere or past-client contacts on file. Offer to import their database.' }
  }

  const eventsBy = new Map<string, LifeEvent[]>()
  for (const e of events ?? []) {
    const list = eventsBy.get(str(e.contact_id)) ?? []
    list.push({ kind: str(e.kind) as LifeEvent['kind'], date: str(e.event_date), note: str(e.note) || undefined })
    eventsBy.set(str(e.contact_id), list)
  }

  const calls = dailySphereCalls(rows.map(r => ({
    id: str(r.id),
    name: str(r.full_name),
    tier: str(r.tier, 'cool') as RelationshipTier,
    lastTouchedAt: r.last_touched_at ? str(r.last_touched_at) : undefined,
    homeAnniversary: r.home_anniversary ? str(r.home_anniversary) : undefined,
    birthday: r.birthday ? str(r.birthday) : undefined,
    referralsSent: num(r.referrals_sent),
    transactionsClosed: num(r.transactions_closed),
    estimatedHomeValue: r.estimated_home_value == null ? undefined : num(r.estimated_home_value),
    estimatedMortgageBalance: r.estimated_mortgage_balance == null ? undefined : num(r.estimated_mortgage_balance),
    homeowner: r.homeowner == null ? undefined : !!r.homeowner,
    optedOut: !!r.opted_out,
    lifeEvents: eventsBy.get(str(r.id)),
  } satisfies SphereContact)), limit, ctx.now)

  if (calls.length === 0) {
    return { summary: 'Nobody in the sphere has a reason to be called today — everyone is inside their cadence. Say so plainly rather than manufacturing a reason.' }
  }

  return {
    summary: calls.map(c =>
      `${c.contact.name} (${c.score}) — ${c.reasons[0]?.why ?? 'overdue'}. Opener: ${c.opener}`
    ).join('\n'),
    artifacts: [{
      kind: 'sphere',
      id: artifactId('sphere'),
      title: 'Your sphere, by why-now',
      subtitle: 'Each with the specific reason and an opening line',
      calls,
    }],
  }
}

// ── Valuation ───────────────────────────────────────────────────────────────────

async function runCmaTool(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const subject: Property = {
    address: str(input.address),
    beds: num(input.beds),
    baths: num(input.baths),
    sqft: num(input.sqft),
    lotSqft: input.lot_sqft == null ? undefined : num(input.lot_sqft),
    yearBuilt: input.year_built == null ? undefined : num(input.year_built),
    garageStalls: input.garage_stalls == null ? undefined : num(input.garage_stalls),
    condition: input.condition == null ? undefined : (Math.round(num(input.condition, 3)) as Condition),
    pool: input.pool == null ? undefined : !!input.pool,
    view: input.view == null ? undefined : !!input.view,
  }

  const cutoff = iso(new Date(ctx.now.getTime() - 400 * 86_400_000))
  const { data } = await ctx.supabase.from('comparable_sales').select('*')
    .eq('agent_id', ctx.agentId).gte('sold_date', cutoff)
    .order('sold_date', { ascending: false }).limit(60)

  const comps: Comp[] = (data ?? []).map(c => ({
    address: str(c.street_address),
    beds: num(c.beds), baths: num(c.baths), sqft: num(c.sqft),
    lotSqft: c.lot_sqft == null ? undefined : num(c.lot_sqft),
    yearBuilt: c.year_built == null ? undefined : num(c.year_built),
    garageStalls: c.garage_stalls == null ? undefined : num(c.garage_stalls),
    condition: c.condition == null ? undefined : (num(c.condition) as Condition),
    pool: c.pool == null ? undefined : !!c.pool,
    view: c.view == null ? undefined : !!c.view,
    distanceMiles: c.distance_miles == null ? undefined : num(c.distance_miles),
    soldPrice: num(c.sold_price),
    soldDate: str(c.sold_date),
    listPrice: c.list_price == null ? undefined : num(c.list_price),
    daysOnMarket: c.days_on_market == null ? undefined : num(c.days_on_market),
  }))

  if (comps.length === 0) {
    return {
      summary:
        `No comparable sales on file for ${subject.address}, so no valuation can be produced. Tell the agent plainly and offer to import comps from their MLS export. Do not estimate a value.`,
    }
  }

  const result = runCma(subject, comps, marketContext(ctx.agent), ctx.now)

  void ctx.supabase.from('cmas').insert({
    agent_id: ctx.agentId,
    subject: subject as unknown as Record<string, unknown>,
    market_context: marketContext(ctx.agent) as unknown as Record<string, unknown>,
    result: result as unknown as Record<string, unknown>,
    indicated_value: result.indicatedValue,
    suggested_list: result.suggestedList,
    confidence: result.confidence,
  }).then(() => {}, () => {})

  return {
    summary: [
      `Indicated value ${usd(result.indicatedValue)} (range ${usd(result.low)}–${usd(result.high)}).`,
      `Suggested list ${usd(result.suggestedList)} at ${usd(result.pricePerSqft)}/sqft.`,
      `Confidence ${result.confidence}/100: ${result.confidenceReasons.join('; ')}.`,
      `Estimated ${result.estimatedDom} days on market.`,
      `${result.comps.length} comps used, ${result.excluded.length} excluded.`,
      result.excluded.length > 0 ? `Excluded: ${result.excluded.map(e => `${e.comp.address} (${e.reason})`).join('; ')}.` : '',
    ].filter(Boolean).join(' '),
    artifacts: [{
      kind: 'cma',
      id: artifactId('cma'),
      title: subject.address,
      subtitle: `${subject.beds} bed · ${subject.baths} bath · ${subject.sqft.toLocaleString()} sqft`,
      result,
    }],
  }
}

// ── Money ───────────────────────────────────────────────────────────────────────

function netSheetInput(input: Input, salePrice: number) {
  return {
    salePrice,
    listingSideRate: num(input.listing_side_rate),
    buyerBrokerRate: input.buyer_broker_rate == null ? undefined : num(input.buyer_broker_rate),
    buyerBrokerFlat: input.buyer_broker_flat == null ? undefined : num(input.buyer_broker_flat),
    concessions: num(input.concessions),
    mortgagePayoff: num(input.mortgage_payoff),
    payoffRate: input.payoff_rate == null ? undefined : num(input.payoff_rate),
    payoffDays: input.payoff_days == null ? undefined : num(input.payoff_days),
    titlePolicy: num(input.title_policy),
    escrowFee: num(input.escrow_fee),
    transferTaxRate: input.transfer_tax_rate == null ? undefined : num(input.transfer_tax_rate),
    repairCredits: num(input.repair_credits),
    annualPropertyTax: input.annual_property_tax == null ? undefined : num(input.annual_property_tax),
    taxProrationDays: input.tax_proration_days == null ? undefined : num(input.tax_proration_days),
  }
}

function sellerNetTool(input: Input): ToolOutcome {
  const price = num(input.sale_price)
  const result = sellerNetSheet(netSheetInput(input, price))

  const prices = Array.isArray(input.scenarios) ? (input.scenarios as unknown[]).map(p => num(p)).filter(p => p > 0) : []
  const scenarios = prices.map(p => {
    const r = sellerNetSheet(netSheetInput(input, p))
    return { label: usd(p), salePrice: p, netProceeds: r.netProceeds }
  })

  return {
    summary: [
      `At ${usd(price)}, the seller nets ${usd(result.netProceeds)} (${round(result.netPct * 100, 1)}% of sale price).`,
      `Commission ${usd(result.totalCommission)}, closing costs ${usd(result.totalClosingCosts)}, payoffs ${usd(result.totalPayoffs)}.`,
      `Each extra $1,000 on the price is worth ${usd(result.marginalPerThousand)} to them after costs.`,
      scenarios.length > 0
        ? `Scenarios: ${scenarios.map(s => `${s.label} nets ${usd(s.netProceeds)}`).join(', ')}.`
        : '',
    ].filter(Boolean).join(' '),
    artifacts: [{
      kind: 'seller_net',
      id: artifactId('net'),
      title: 'Seller net proceeds',
      subtitle: `At a ${usd(price)} sale price`,
      result,
      scenarios: scenarios.length > 0 ? scenarios : undefined,
    }],
  }
}

function buyerCostTool(input: Input): ToolOutcome {
  const result = buyerCashToClose({
    purchasePrice: num(input.purchase_price),
    downPaymentPct: input.down_payment_pct == null ? undefined : num(input.down_payment_pct),
    loanAmount: input.loan_amount == null ? undefined : num(input.loan_amount),
    interestRate: num(input.interest_rate),
    termYears: input.term_years == null ? undefined : num(input.term_years),
    annualPropertyTax: num(input.annual_property_tax),
    annualInsurance: num(input.annual_insurance),
    monthlyHoa: num(input.monthly_hoa),
    earnestMoney: num(input.earnest_money),
    sellerConcessions: num(input.seller_concessions),
    buyerBrokerShortfall: num(input.buyer_broker_shortfall),
    // Sensible defaults so a rough question still gets a usable answer.
    originationRate: 0.01,
    appraisal: 750,
    lendersTitlePolicy: Math.round(num(input.purchase_price) * 0.0018),
    escrowFee: 900,
    recordingFees: 145,
    prepaidInterestDays: 12,
  })

  return {
    summary: [
      `Loan ${usd(result.loanAmount)}, down payment ${usd(result.downPayment)}.`,
      `Cash to close ${usd(result.cashToClose)} (closing costs ${usd(result.totalClosingCosts)}, prepaids ${usd(result.totalPrepaids)}, credits ${usd(result.totalCredits)}).`,
      `Monthly ${usd(result.monthly.total)}: P&I ${usd(result.monthly.principalAndInterest)}, tax ${usd(result.monthly.tax)}, insurance ${usd(result.monthly.insurance)}${result.monthly.pmi > 0 ? `, PMI ${usd(result.monthly.pmi)}` : ''}${result.monthly.hoa > 0 ? `, HOA ${usd(result.monthly.hoa)}` : ''}.`,
      'Estimates use typical third-party fees; the lender\'s Loan Estimate governs.',
    ].join(' '),
    artifacts: [{
      kind: 'buyer_cost',
      id: artifactId('buyer'),
      title: 'Cash to close',
      subtitle: `${usd(num(input.purchase_price))} purchase`,
      result,
    }],
  }
}

// ── Compliance ──────────────────────────────────────────────────────────────────

async function loadEngagement(
  ctx: ToolContext, contactId: string | null, contactName: string,
): Promise<{ engagement: BuyerEngagement; contactId: string | null }> {
  let id = contactId
  let name = contactName

  if (!id && contactName) {
    const { data } = await ctx.supabase.from('contacts').select('id, full_name')
      .eq('agent_id', ctx.agentId).ilike('full_name', `%${contactName}%`).limit(1).maybeSingle()
    if (data) { id = str(data.id); name = str(data.full_name) }
  }

  if (!id) {
    return { engagement: { clientName: name || 'this client', agreementSigned: false }, contactId: null }
  }

  const { data } = await ctx.supabase.from('engagements').select('*')
    .eq('agent_id', ctx.agentId).eq('contact_id', id).eq('kind', 'buyer_representation')
    .order('signed_date', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()

  if (!data) {
    return { engagement: { clientName: name || 'this client', agreementSigned: false }, contactId: id }
  }

  return {
    contactId: id,
    engagement: {
      clientName: name || 'this client',
      agreementSigned: !!data.signed,
      agreementSignedDate: data.signed_date ? str(data.signed_date) : undefined,
      agreementExpiresDate: data.expires_date ? str(data.expires_date) : undefined,
      agreedCompensationRate: data.compensation_rate == null ? undefined : num(data.compensation_rate),
      agreedCompensationFlat: data.compensation_flat == null ? undefined : num(data.compensation_flat),
      compensationIsOpenEnded: !!data.compensation_open_ended,
      agencyDisclosureDelivered: !!data.agency_disclosure_delivered,
      wireFraudAdvisoryDelivered: !!data.wire_fraud_advisory_delivered,
    },
  }
}

async function checkShowingTool(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const address = str(input.property_address)
  const showingDate = str(input.showing_date, iso(ctx.now))
  const { engagement, contactId } = await loadEngagement(
    ctx, input.contact_id ? str(input.contact_id) : null, str(input.contact_name),
  )

  const gate = canShowProperty({ engagement, showingDate, propertyAddress: address })
  const report = buildReport(gate.checks, address)

  // The audit trail matters more than the answer: a compliance claim is only worth
  // something if you can show when it was checked and what it said.
  void ctx.supabase.from('compliance_events').insert(
    gate.checks.map(c => ({
      agent_id: ctx.agentId,
      subject_type: 'showing',
      subject_id: contactId,
      check_id: c.id, rule: c.rule, severity: c.severity, status: c.status, detail: c.detail,
    })),
  ).then(() => {}, () => {})

  return {
    summary: gate.allowed
      ? `CLEARED. ${engagement.clientName} may tour ${address} on ${showingDate}. Agreement signed ${engagement.agreementSignedDate ?? 'date not recorded'}.`
      : `BLOCKED — do not book this showing. ${gate.reasons.join('; ')}. Tell the agent directly, explain that a written buyer agreement is required before any tour under the NAR settlement practice changes effective 17 Aug 2024, and offer to prepare the agreement. Do not suggest a workaround.`,
    artifacts: [{
      kind: 'compliance',
      id: artifactId('gate'),
      title: gate.allowed ? 'Clear to show' : 'Showing blocked',
      subtitle: `${engagement.clientName} · ${address} · ${showingDate}`,
      report,
      gate: { allowed: gate.allowed, propertyAddress: address, clientName: engagement.clientName },
    }],
  }
}

async function auditListingTool(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  let query = ctx.supabase.from('listings')
    .select('*, properties(street_address, year_built, tax_record_sqft)')
    .eq('agent_id', ctx.agentId)

  if (input.listing_id) query = query.eq('id', str(input.listing_id))
  const { data } = await query.limit(10)

  let rows = data ?? []
  const address = str(input.address)
  if (address && rows.length > 1) {
    const needle = address.toLowerCase()
    const matched = rows.filter(r => {
      const p = r.properties as { street_address?: string } | null
      return str(p?.street_address).toLowerCase().includes(needle)
    })
    if (matched.length > 0) rows = matched
  }

  if (rows.length === 0) {
    return { summary: 'No listing found to audit. Ask which listing they mean, or offer to add it.' }
  }

  const row = rows[0]
  const property = row.properties as { street_address?: string; year_built?: number; tax_record_sqft?: number } | null

  const report = auditListing({
    address: str(property?.street_address, 'this listing'),
    listingAgreementSigned: !!row.engagement_id,
    compensationPublishedInMls: !!row.compensation_published_in_mls,
    sellerAuthorizedConcessions: !!row.seller_authorized_concessions,
    brokerageNameInAdvertising: !!row.brokerage_name_in_advertising,
    fairHousingStatementPresent: !!row.fair_housing_statement,
    sellerDisclosureDelivered: !!row.seller_disclosure_delivered,
    leadPaintDisclosureDelivered: !!row.lead_paint_disclosure_delivered,
    advertisedSqft: row.advertised_sqft == null ? undefined : num(row.advertised_sqft),
    taxRecordSqft: property?.tax_record_sqft == null ? undefined : num(property.tax_record_sqft),
    yearBuilt: property?.year_built == null ? undefined : num(property.year_built),
  })

  void ctx.supabase.from('compliance_events').insert(
    report.checks.filter(c => c.status !== 'pass').map(c => ({
      agent_id: ctx.agentId, subject_type: 'listing', subject_id: str(row.id),
      check_id: c.id, rule: c.rule, severity: c.severity, status: c.status, detail: c.detail,
    })),
  ).then(() => {}, () => {})

  return {
    summary: `${report.summary} Score ${report.score}/100. ` +
      report.checks.filter(c => c.status !== 'pass')
        .map(c => `[${c.severity}] ${c.rule}: ${c.detail}${c.remedy ? ` → ${c.remedy}` : ''}`).join(' '),
    artifacts: [{
      kind: 'compliance',
      id: artifactId('audit'),
      title: 'Listing compliance',
      subtitle: str(property?.street_address, 'Listing audit'),
      report,
    }],
  }
}

// ── Transactions ────────────────────────────────────────────────────────────────

async function loadTransaction(input: Input, ctx: ToolContext) {
  let query = ctx.supabase.from('transactions').select('*').eq('agent_id', ctx.agentId)
  if (input.transaction_id) query = query.eq('id', str(input.transaction_id))
  else if (input.address) query = query.ilike('street_address', `%${str(input.address)}%`)
  else query = query.in('stage', ['under_contract', 'contingencies_cleared', 'clear_to_close'])
  const { data } = await query.order('closing_date', { nullsFirst: false }).limit(1)
  return data?.[0] ?? null
}

async function timelineTool(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const tx = await loadTransaction(input, ctx)
  if (!tx) return { summary: 'No matching transaction found. Ask which deal they mean.' }
  if (!tx.contract_date || !tx.closing_date) {
    return { summary: `Transaction "${str(tx.label)}" has no contract or closing date recorded, so no timeline can be built. Ask for the missing dates.` }
  }

  const { data: milestoneRows } = await ctx.supabase.from('transaction_milestones')
    .select('kind, completed_date').eq('transaction_id', str(tx.id)).not('completed_date', 'is', null)

  const completed: Partial<Record<MilestoneKind, string>> = {}
  for (const m of milestoneRows ?? []) completed[str(m.kind) as MilestoneKind] = str(m.completed_date)

  const result = buildTimeline({
    contractDate: str(tx.contract_date),
    closingDate: str(tx.closing_date),
    completed,
    overrides: (tx.timeline_overrides ?? {}) as Record<string, never>,
    today: iso(ctx.now),
  })

  return {
    summary: [
      `${str(tx.label)} — ${result.daysToClose} days to close (${str(tx.closing_date)}).`,
      result.overdue.length > 0
        ? `OVERDUE: ${result.overdue.map(m => `${m.label} (was due ${m.date}${m.critical ? ', CRITICAL' : ''})`).join('; ')}. Lead with this.`
        : 'Nothing overdue.',
      result.next ? `Next: ${result.next.label} on ${result.next.date} (${result.next.who}).` : '',
      result.conflicts.length > 0 ? `CONFLICTS: ${result.conflicts.join(' ')}` : '',
    ].filter(Boolean).join(' '),
    artifacts: [{
      kind: 'timeline',
      id: artifactId('timeline'),
      title: str(tx.label),
      subtitle: `Contract ${str(tx.contract_date)} · Closing ${str(tx.closing_date)}`,
      transactionId: str(tx.id),
      propertyAddress: str(tx.street_address),
      contractDate: str(tx.contract_date),
      closingDate: str(tx.closing_date),
      result,
    }],
  }
}

const ACTIVE_STAGES: PipelineStage[] = [
  'lead', 'active_buyer', 'active_listing', 'offer_out',
  'under_contract', 'contingencies_cleared', 'clear_to_close',
]

async function loadPipelineDeals(ctx: ToolContext) {
  const { data } = await ctx.supabase.from('transactions').select('*')
    .eq('agent_id', ctx.agentId).in('stage', ACTIVE_STAGES).order('closing_date', { nullsFirst: false })
  return data ?? []
}

async function getPipeline(ctx: ToolContext): Promise<ToolOutcome> {
  const rows = await loadPipelineDeals(ctx)
  if (rows.length === 0) return { summary: 'No active transactions. Offer to add one.' }

  const today = iso(ctx.now)
  const { data: overdueRows } = await ctx.supabase.from('transaction_milestones')
    .select('transaction_id, kind, due_date').eq('agent_id', ctx.agentId)
    .is('completed_date', null).lt('due_date', today)

  const overdueBy = new Map<string, string[]>()
  for (const m of overdueRows ?? []) {
    const list = overdueBy.get(str(m.transaction_id)) ?? []
    list.push(`${str(m.kind).replace(/_/g, ' ')} overdue`)
    overdueBy.set(str(m.transaction_id), list)
  }

  const cards: PipelineCard[] = rows.map(r => ({
    id: str(r.id),
    label: str(r.label),
    address: str(r.street_address) || undefined,
    stage: str(r.stage) as PipelineStage,
    salePrice: num(r.sale_price),
    expectedCloseDate: str(r.closing_date, ''),
    alert: overdueBy.get(str(r.id))?.join(', '),
  }))

  const totalVolume = cards.reduce((s, c) => s + c.salePrice, 0)

  return {
    summary: `${cards.length} active deal(s), ${usd(totalVolume)} volume. ` +
      cards.map(c => `${c.label}: ${c.stage.replace(/_/g, ' ')}, ${usd(c.salePrice)}, closing ${c.expectedCloseDate || 'TBD'}${c.alert ? ` — ${c.alert}` : ''}`).join('; '),
    artifacts: [{
      kind: 'pipeline',
      id: artifactId('pipe'),
      title: 'Pipeline',
      subtitle: `${cards.length} deals · ${usdShort(totalVolume)} volume`,
      cards,
      totalVolume,
    }],
  }
}

async function forecastTool(ctx: ToolContext): Promise<ToolOutcome> {
  const rows = await loadPipelineDeals(ctx)
  if (rows.length === 0) return { summary: 'No pipeline to forecast. Offer to add deals.' }

  const plan = commissionPlan(ctx.agent)
  const yearStart = `${ctx.now.getUTCFullYear()}-01-01`
  const { data: closed } = await ctx.supabase.from('commissions')
    .select('company_dollar, royalty_fee, gross_commission, agent_net, sides')
    .eq('agent_id', ctx.agentId).gte('closed_on', yearStart)

  const ytd: YearToDate = (closed ?? []).reduce((acc, c) => ({
    companyDollarPaid: acc.companyDollarPaid + num(c.company_dollar),
    royaltyPaid: acc.royaltyPaid + num(c.royalty_fee),
    closedSides: acc.closedSides + num(c.sides, 1),
    gci: acc.gci + num(c.gross_commission),
    agentNet: acc.agentNet + num(c.agent_net),
  }), EMPTY_YTD)

  const pipeline: PipelineDeal[] = rows.map(r => ({
    id: str(r.id),
    label: str(r.label),
    stage: str(r.stage) as PipelineStage,
    salePrice: num(r.sale_price),
    sideRate: r.side_rate == null ? undefined : num(r.side_rate),
    flatCommission: r.flat_commission == null ? undefined : num(r.flat_commission),
    referralRate: r.referral_rate == null ? undefined : num(r.referral_rate),
    dualAgency: str(r.side) === 'dual',
    expectedCloseDate: str(r.closing_date, iso(ctx.now)),
  }))

  const result = forecastPipeline(pipeline, plan, ytd)

  return {
    summary: [
      `Expected (probability-weighted) ${usd(result.expected)} net. Committed ${usd(result.committed)}. Best case ${usd(result.bestCase)}.`,
      `YTD closed: ${usd(ytd.agentNet)} net on ${usd(ytd.gci)} gross across ${ytd.closedSides} sides.`,
      plan.annualCap ? `Cap: ${usd(ytd.companyDollarPaid)} of ${usd(plan.annualCap)} company dollar paid.` : '',
      `By month: ${result.byMonth.map(m => `${m.month} ${usd(m.expected)}`).join(', ')}.`,
      'Plan against expected, not best case.',
    ].filter(Boolean).join(' '),
    artifacts: [{
      kind: 'forecast',
      id: artifactId('forecast'),
      title: 'Commission forecast',
      subtitle: 'After splits, cap, royalty and fees',
      result,
      capProgress: plan.annualCap ? { paid: ytd.companyDollarPaid, cap: plan.annualCap } : undefined,
    }],
  }
}

// ── Showings, listings, contacts ────────────────────────────────────────────────

async function getShowings(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const days = Math.min(num(input.days, 7), 60)
  const from = iso(ctx.now)
  const to = iso(new Date(ctx.now.getTime() + days * 86_400_000))

  const { data } = await ctx.supabase.from('showings')
    .select('*, contacts(full_name)')
    .eq('agent_id', ctx.agentId)
    .gte('starts_at', `${from}T00:00:00Z`).lte('starts_at', `${to}T23:59:59Z`)
    .order('starts_at')

  const rows = data ?? []
  if (rows.length === 0) return { summary: `No showings scheduled in the next ${days} days.` }

  const slots = rows.map(r => ({
    id: str(r.id),
    address: str(r.street_address),
    clientName: str((r.contacts as { full_name?: string } | null)?.full_name, 'Unnamed'),
    startsAt: str(r.starts_at),
    durationMinutes: num(r.duration_minutes, 30),
    status: str(r.status, 'requested') as 'requested' | 'confirmed' | 'blocked' | 'completed',
    blockedReason: r.blocked_reason ? str(r.blocked_reason) : undefined,
  }))

  const blocked = slots.filter(s => s.status === 'blocked')

  return {
    summary: `${slots.length} showing(s) in the next ${days} days. ` +
      slots.map(s => `${s.startsAt} ${s.address} with ${s.clientName} (${s.status})`).join('; ') +
      (blocked.length > 0 ? ` ${blocked.length} BLOCKED on compliance — surface these first.` : ''),
    artifacts: [{
      kind: 'showings',
      id: artifactId('showings'),
      title: 'Showing schedule',
      subtitle: `Next ${days} days`,
      slots,
    }],
  }
}

async function getListings(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  let query = ctx.supabase.from('listings')
    .select('*, properties(street_address, city, beds, baths, sqft)')
    .eq('agent_id', ctx.agentId)
  if (input.status) query = query.eq('status', str(input.status))
  const { data } = await query.order('listed_on', { ascending: false, nullsFirst: false }).limit(40)

  const rows = data ?? []
  if (rows.length === 0) return { summary: 'No listings on file. Offer to add one.' }

  const medianDom = ctx.agent?.median_dom ?? 30

  const listings: ListingCard[] = rows.map(r => {
    const p = r.properties as { street_address?: string; city?: string; beds?: number; baths?: number; sqft?: number } | null
    const dom = r.listed_on
      ? Math.max(0, Math.round((ctx.now.getTime() - new Date(str(r.listed_on)).getTime()) / 86_400_000))
      : undefined

    // A listing well past the market's median with no offer is a price conversation,
    // not a marketing one. Say so rather than suggesting another open house.
    let alert: string | undefined
    if (str(r.status) === 'active' && dom != null && dom > medianDom * 1.5) {
      alert = `${dom} days on market against a ${medianDom}-day median — this is a price conversation`
    } else if (str(r.status) === 'active' && dom != null && dom > 14 && num(r.showings_count) === 0) {
      alert = `${dom} days with no showings — the price or the photos are wrong`
    }

    return {
      id: str(r.id),
      address: str(p?.street_address, 'Address unknown'),
      city: p?.city ? str(p.city) : undefined,
      price: num(r.list_price),
      beds: num(p?.beds), baths: num(p?.baths), sqft: num(p?.sqft),
      status: str(r.status, 'active') as ListingCard['status'],
      daysOnMarket: dom,
      activity: { views: num(r.views), saves: num(r.saves), showings: num(r.showings_count) },
      alert,
    }
  })

  return {
    summary: listings.map(l =>
      `${l.address}: ${l.status}, ${usd(l.price)}, ${l.daysOnMarket ?? '?'} DOM, ${l.activity?.showings ?? 0} showings${l.alert ? ` — ${l.alert}` : ''}`
    ).join('; '),
    artifacts: [{
      kind: 'listings',
      id: artifactId('listings'),
      title: 'Listings',
      subtitle: `${listings.length} propert${listings.length === 1 ? 'y' : 'ies'}`,
      listings,
    }],
  }
}

async function findContacts(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const limit = Math.min(num(input.limit, 8), 25)
  let query = ctx.supabase.from('contacts').select('*')
    .eq('agent_id', ctx.agentId).eq('archived', false)
  if (input.query) query = query.ilike('full_name', `%${str(input.query)}%`)
  if (input.role) query = query.eq('role', str(input.role))
  const { data } = await query.order('last_touched_at', { ascending: false, nullsFirst: false }).limit(limit)

  const rows = data ?? []
  if (rows.length === 0) return { summary: 'No matching contacts.' }

  return {
    summary: rows.map(r =>
      `${str(r.full_name)} (${str(r.role)}, ${str(r.tier)}) — ${str(r.email) || 'no email'}, ${str(r.phone) || 'no phone'}. ` +
      `Consent: ${r.contact_consent ? 'yes' : 'NO'}. DNC: ${r.on_do_not_call ? 'YES' : 'no'}. Opted out: ${r.opted_out ? 'YES' : 'no'}.`
    ).join('\n'),
    artifacts: [{
      kind: 'contacts',
      id: artifactId('contacts'),
      title: 'Contacts',
      subtitle: `${rows.length} match${rows.length === 1 ? '' : 'es'}`,
      contacts: rows.map(r => ({
        id: str(r.id),
        name: str(r.full_name),
        role: str(r.role, 'lead') as 'buyer' | 'seller' | 'both' | 'past_client' | 'sphere' | 'lead' | 'vendor',
        email: str(r.email) || undefined,
        phone: str(r.phone) || undefined,
        tags: (r.tags as string[] | null) ?? undefined,
        lastTouchedAt: r.last_touched_at ? str(r.last_touched_at) : undefined,
        context: [
          str(r.tier),
          r.opted_out ? 'opted out of marketing' : null,
          r.on_do_not_call ? 'on the Do-Not-Call registry' : null,
          !r.contact_consent ? 'no written contact consent' : null,
        ].filter(Boolean).join(' · '),
      })),
    }],
  }
}

async function createContact(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const { data, error } = await ctx.supabase.from('contacts').insert({
    agent_id: ctx.agentId,
    full_name: str(input.full_name),
    email: str(input.email) || null,
    phone: str(input.phone) || null,
    role: str(input.role, 'lead'),
    source: str(input.source, 'unknown'),
    timeline_months: input.timeline_months == null ? null : num(input.timeline_months),
    pre_approved: !!input.pre_approved,
    contact_consent: !!input.contact_consent,
    consent_date: input.contact_consent ? ctx.now.toISOString() : null,
    notes: str(input.notes) || null,
  }).select('id, full_name').single()

  if (error) return { summary: `Could not add the contact: ${error.message}` }

  return {
    summary: `Added ${str(data.full_name)}.` +
      (input.contact_consent
        ? ' Written contact consent recorded.'
        : ' No contact consent recorded — do not text or call this person until consent is captured. Mention this.'),
  }
}

async function logTouch(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  let contactId = input.contact_id ? str(input.contact_id) : null
  if (!contactId && input.contact_name) {
    const { data } = await ctx.supabase.from('contacts').select('id')
      .eq('agent_id', ctx.agentId).ilike('full_name', `%${str(input.contact_name)}%`).limit(1).maybeSingle()
    contactId = data ? str(data.id) : null
  }
  if (!contactId) return { summary: 'No matching contact to log against. Ask who they mean.' }

  const { error } = await ctx.supabase.from('contact_events').insert({
    agent_id: ctx.agentId,
    contact_id: contactId,
    kind: str(input.kind, 'note'),
    body: str(input.summary),
    occurred_at: ctx.now.toISOString(),
  })

  if (error) return { summary: `Could not log the touch: ${error.message}` }
  return { summary: `Logged the ${str(input.kind)}. Last-touched is updated, so the sphere ranking now reflects it.` }
}

// ── Marketing ───────────────────────────────────────────────────────────────────

const CHANNEL_BRIEF: Record<string, { label: string; limit?: number; brief: string }> = {
  mls: { label: 'MLS remarks', limit: 1000, brief: 'Factual, feature-led, no superlatives or claims you cannot substantiate. No occupant descriptions.' },
  instagram: { label: 'Instagram caption', limit: 2200, brief: 'Short lines, a hook in the first sentence, 3-5 relevant hashtags at the end.' },
  facebook: { label: 'Facebook post', limit: 1200, brief: 'Conversational, one clear call to action, written to be shared locally.' },
  email: { label: 'Email', limit: 1500, brief: 'Subject line, then a short body. One idea, one ask.' },
  sms: { label: 'Text message', limit: 320, brief: 'Under 320 characters, no links unless essential, sign off with the agent name.' },
  video_script: { label: 'Video script', limit: 1600, brief: 'Spoken word, 45-60 seconds, hook in the first three seconds, natural sentences.' },
  flyer: { label: 'Flyer copy', limit: 700, brief: 'Headline, three feature bullets, and the details block.' },
  blog: { label: 'Blog post', limit: 4000, brief: 'A useful local-market piece with a heading structure, not a listing advert.' },
  linkedin: { label: 'LinkedIn post', limit: 2000, brief: 'Professional register, a market insight rather than a sales pitch.' },
}

async function writeCopy(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const channels = (Array.isArray(input.channels) ? input.channels : [])
    .map(c => str(c)).filter(c => c in CHANNEL_BRIEF)
  if (channels.length === 0) return { summary: 'No valid channel requested. Ask which channel the copy is for.' }

  const subject = str(input.subject)
  const details = str(input.details)

  const system = [
    'You write real estate marketing copy for a licensed agent.',
    ctx.agent?.voice_notes ? `The agent\'s voice: ${ctx.agent.voice_notes}` : '',
    ctx.agent?.brokerage_name ? `Brokerage: ${ctx.agent.brokerage_name}.` : '',
    '',
    'Fair housing rules are absolute. Describe the PROPERTY, never the people who should live in it.',
    'Never write: no children, adults only, perfect for singles/couples/young professionals, family-friendly,',
    'safe neighborhood, good schools, exclusive or restricted area, any religion, any racial or ethnic description.',
    'Use "primary bedroom", not "master". Give distances in miles rather than "walking distance".',
    'Make no claim you cannot substantiate.',
    '',
    'Return ONLY a JSON array, no prose and no code fence:',
    '[{"channel":"mls","body":"..."}]',
  ].filter(Boolean).join('\n')

  const prompt = [
    `Write marketing copy about: ${subject}`,
    details ? `Details to use: ${details}` : '',
    '',
    'Channels:',
    ...channels.map(c => `- ${c} (${CHANNEL_BRIEF[c].label}, max ~${CHANNEL_BRIEF[c].limit} chars): ${CHANNEL_BRIEF[c].brief}`),
  ].filter(Boolean).join('\n')

  let variants: ContentVariant[] = []
  try {
    const raw = await ctx.generate(system, prompt, 2500)
    const json = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)
    const parsed = JSON.parse(json) as { channel?: string; body?: string }[]
    variants = parsed
      .filter(v => v.body && v.channel && v.channel in CHANNEL_BRIEF)
      .map(v => ({
        channel: v.channel as ContentVariant['channel'],
        label: CHANNEL_BRIEF[v.channel!].label,
        body: v.body!.trim(),
        charLimit: CHANNEL_BRIEF[v.channel!].limit,
      }))
  } catch {
    return { summary: 'Copy generation failed to return usable text. Tell the agent and offer to try again.' }
  }

  if (variants.length === 0) {
    return { summary: 'No copy was produced. Tell the agent and offer to try again.' }
  }

  // Screen every word before the agent ever sees it. This is the point of doing the
  // copywriting here rather than in a general-purpose tool.
  const findings = variants.flatMap(v => scanFairHousing(v.body))
  const critical = findings.filter(f => f.severity === 'critical')

  void ctx.supabase.from('marketing_assets').insert(
    variants.map(v => ({
      agent_id: ctx.agentId,
      listing_id: input.listing_id ? str(input.listing_id) : null,
      channel: v.channel,
      title: subject,
      body: v.body,
      fair_housing_findings: findings.filter(f => v.body.includes(f.term)) as unknown as Record<string, unknown>[],
    })),
  ).then(() => {}, () => {})

  return {
    summary: [
      `Drafted ${variants.length} variant(s) for ${channels.join(', ')}.`,
      critical.length > 0
        ? `FAIR HOUSING: ${critical.length} critical finding(s) — ${critical.map(f => `"${f.term}" (${f.category})`).join(', ')}. Flag these to the agent before they publish and offer the rewrite.`
        : 'Fair housing scan clean.',
      'The copy is drafted, not sent. The agent publishes it.',
    ].join(' '),
    artifacts: [{
      kind: 'content',
      id: artifactId('copy'),
      title: subject,
      subtitle: `${variants.length} variant${variants.length === 1 ? '' : 's'} · fair housing screened`,
      variants,
      fairHousing: findings,
    }],
  }
}

// ── Production ──────────────────────────────────────────────────────────────────

async function productionReport(input: Input, ctx: ToolContext): Promise<ToolOutcome> {
  const months = Math.min(num(input.months, 12), 60)
  const from = iso(new Date(ctx.now.getTime() - months * 30.44 * 86_400_000))

  const [{ data: closings }, { data: sources }] = await Promise.all([
    ctx.supabase.from('commissions').select('*').eq('agent_id', ctx.agentId).gte('closed_on', from),
    ctx.supabase.from('transactions').select('id, stage, client_contact_id, sale_price, contacts(source)')
      .eq('agent_id', ctx.agentId).eq('stage', 'closed'),
  ])

  const rows = closings ?? []
  if (rows.length === 0) {
    return { summary: `No closed transactions in the last ${months} months. Say so plainly rather than reporting zeros as a result.` }
  }

  const volume = rows.reduce((s, r) => s + num(r.sale_price), 0)
  const gci = rows.reduce((s, r) => s + num(r.gross_commission), 0)
  const net = rows.reduce((s, r) => s + num(r.agent_net), 0)
  const sides = rows.reduce((s, r) => s + num(r.sides, 1), 0)
  const avgPrice = volume / rows.length

  const bySource = new Map<string, number>()
  for (const t of sources ?? []) {
    const src = str((t.contacts as { source?: string } | null)?.source, 'unknown')
    bySource.set(src, (bySource.get(src) ?? 0) + num(t.sale_price))
  }
  const breakdown = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label: label.replace(/_/g, ' '), value, display: usdShort(value) }))

  return {
    summary: [
      `Last ${months} months: ${sides} sides, ${usd(volume)} volume, ${usd(gci)} gross commission, ${usd(net)} net after splits.`,
      `Average sale price ${usd(avgPrice)}. Effective take-home rate ${round((net / gci) * 100, 1)}% of GCI.`,
      breakdown.length > 0 ? `Volume by source: ${breakdown.map(b => `${b.label} ${b.display}`).join(', ')}.` : '',
    ].filter(Boolean).join(' '),
    artifacts: [{
      kind: 'metrics',
      id: artifactId('prod'),
      title: 'Production',
      subtitle: `Last ${months} months`,
      tiles: [
        { label: 'Closed sides', value: String(sides) },
        { label: 'Volume', value: usdShort(volume) },
        { label: 'Gross commission', value: usdShort(gci) },
        { label: 'Net after splits', value: usdShort(net), note: `${round((net / gci) * 100, 1)}% of GCI` },
        { label: 'Average sale price', value: usdShort(avgPrice) },
      ],
      breakdown: breakdown.length > 0 ? breakdown : undefined,
      breakdownTitle: 'Volume by lead source',
    }],
  }
}

export { upcomingAcross }
