/**
 * The compliance engine — the part of the job that has changed most, and the part
 * software has helped with least.
 *
 * Since the NAR settlement took effect on 17 August 2024, a buyer's agent must have a
 * signed written representation agreement, with a specific and objective compensation
 * amount, *before* touring a single home. Offers of compensation may not appear in the
 * MLS. An agent may not collect more than the agreement states. These are not best
 * practices; agents lose commissions and licences over them, and the failure mode is
 * always the same — a showing that got booked before the paperwork caught up.
 *
 * So the gate is enforced here, in code, at the moment a showing is requested, rather
 * than left as a checklist item somebody remembers on the way to closing.
 *
 * Everything in this module is deliberately pure and severity-graded. It flags; it
 * never auto-sends, auto-signs, or decides on the agent's behalf. Nothing here is
 * legal advice, and state and local rules stack on top of it.
 */

export type Severity = 'blocking' | 'critical' | 'warning' | 'info'
export type CheckStatus = 'pass' | 'fail' | 'attention' | 'na'

export type ComplianceCheck = {
  id: string
  rule: string
  severity: Severity
  status: CheckStatus
  detail: string
  /** What the agent should actually do about it. */
  remedy?: string
  /** Where the rule comes from, so the agent can defend it to a broker or a client. */
  authority?: string
}

export type ComplianceReport = {
  checks: ComplianceCheck[]
  /** True when nothing blocking or critical is failing. */
  clear: boolean
  blocking: ComplianceCheck[]
  score: number // 0-100
  summary: string
}

export type BuyerEngagement = {
  clientName: string
  /** Signed written buyer representation agreement. */
  agreementSigned: boolean
  agreementSignedDate?: string
  agreementExpiresDate?: string
  /**
   * The compensation the buyer agreed to, as a decimal of price or a flat dollar
   * amount. The settlement requires this be objective — "whatever the seller offers"
   * is exactly the open-ended term that is now prohibited.
   */
  agreedCompensationRate?: number
  agreedCompensationFlat?: number
  /** Set when the agreement says something open-ended instead of a number. */
  compensationIsOpenEnded?: boolean
  /** What the seller side is actually offering on this specific property. */
  offeredCompensation?: number
  agencyDisclosureDelivered?: boolean
  wireFraudAdvisoryDelivered?: boolean
  /** Written consent to call or text, for TCPA and Do-Not-Call. */
  contactConsent?: boolean
  consentDate?: string
}

export type ShowingContext = {
  engagement: BuyerEngagement
  /** ISO date the showing is scheduled for. */
  showingDate: string
  propertyAddress: string
}

export type ShowingGate = {
  allowed: boolean
  reasons: string[]
  checks: ComplianceCheck[]
}

/**
 * The gate. Called before any showing is booked; a false here should stop the booking,
 * not warn about it.
 */
export function canShowProperty(ctx: ShowingContext): ShowingGate {
  const e = ctx.engagement
  const checks: ComplianceCheck[] = []
  const reasons: string[] = []

  if (!e.agreementSigned) {
    reasons.push('No signed buyer representation agreement on file')
    checks.push({
      id: 'buyer_rep_signed',
      rule: 'Written buyer agreement before touring',
      severity: 'blocking',
      status: 'fail',
      detail: `${e.clientName} has no signed buyer representation agreement. Touring ${ctx.propertyAddress} without one is prohibited.`,
      remedy: 'Send the buyer representation agreement for signature before this showing is confirmed.',
      authority: 'NAR settlement practice changes, effective 17 Aug 2024',
    })
  } else {
    checks.push({
      id: 'buyer_rep_signed',
      rule: 'Written buyer agreement before touring',
      severity: 'blocking',
      status: 'pass',
      detail: `Signed ${e.agreementSignedDate ?? 'date not recorded'}.`,
      authority: 'NAR settlement practice changes, effective 17 Aug 2024',
    })
  }

  if (e.agreementSigned && e.agreementSignedDate && ctx.showingDate) {
    const signed = new Date(e.agreementSignedDate)
    const showing = new Date(ctx.showingDate)
    if (!Number.isNaN(signed.getTime()) && !Number.isNaN(showing.getTime()) && signed > showing) {
      reasons.push('Agreement is dated after the showing')
      checks.push({
        id: 'buyer_rep_timing',
        rule: 'Agreement must precede the tour',
        severity: 'blocking',
        status: 'fail',
        detail: `Agreement signed ${e.agreementSignedDate} but the showing is ${ctx.showingDate}. The agreement has to come first.`,
        remedy: 'Move the showing, or execute the agreement before the tour date.',
        authority: 'NAR settlement practice changes',
      })
    }
  }

  if (e.agreementSigned && e.agreementExpiresDate) {
    const expires = new Date(e.agreementExpiresDate)
    const showing = new Date(ctx.showingDate)
    if (!Number.isNaN(expires.getTime()) && !Number.isNaN(showing.getTime()) && expires < showing) {
      reasons.push('Buyer agreement has expired')
      checks.push({
        id: 'buyer_rep_expiry',
        rule: 'Agreement must be in force on the showing date',
        severity: 'blocking',
        status: 'fail',
        detail: `The agreement expired ${e.agreementExpiresDate}, before the ${ctx.showingDate} showing.`,
        remedy: 'Renew or extend the buyer representation agreement.',
        authority: 'NAR settlement practice changes',
      })
    }
  }

  if (e.agreementSigned && e.compensationIsOpenEnded) {
    reasons.push('Compensation term is open-ended')
    checks.push({
      id: 'buyer_rep_objective_comp',
      rule: 'Compensation must be objective and specific',
      severity: 'blocking',
      status: 'fail',
      detail: 'The agreement leaves compensation open-ended. It must state a specific, objective amount — not "whatever the seller offers".',
      remedy: 'Amend the agreement to a specific percentage, flat fee, or hourly rate before touring.',
      authority: 'NAR settlement practice changes',
    })
  }

  if (
    e.agreementSigned &&
    !e.compensationIsOpenEnded &&
    e.agreedCompensationRate == null &&
    e.agreedCompensationFlat == null
  ) {
    reasons.push('No compensation amount recorded')
    checks.push({
      id: 'buyer_rep_comp_recorded',
      rule: 'Compensation must be objective and specific',
      severity: 'blocking',
      status: 'fail',
      detail: 'The agreement is signed but no compensation amount is recorded, so it cannot be shown to be specific.',
      remedy: 'Record the agreed rate or flat fee on the engagement.',
      authority: 'NAR settlement practice changes',
    })
  }

  return { allowed: reasons.length === 0, reasons, checks }
}

export type OfferContext = {
  engagement: BuyerEngagement
  salePrice: number
  /** What the buyer's brokerage will actually be paid on this deal. */
  compensationToBuyerBroker: number
  /** Any compensation the buyer is asked to cover directly. */
  buyerPaidPortion?: number
}

/**
 * The other half of the settlement rule that catches agents out: you may not receive
 * more than your agreement says, even when the seller offers more. The excess has to
 * go back — usually to the buyer.
 */
export function auditCompensation(ctx: OfferContext): ComplianceCheck[] {
  const e = ctx.engagement
  const checks: ComplianceCheck[] = []

  const agreedAmount = e.agreedCompensationFlat != null
    ? e.agreedCompensationFlat
    : e.agreedCompensationRate != null
      ? ctx.salePrice * e.agreedCompensationRate
      : null

  if (agreedAmount == null) {
    checks.push({
      id: 'comp_ceiling',
      rule: 'Compensation may not exceed the agreement',
      severity: 'critical',
      status: 'attention',
      detail: 'No agreed compensation amount is on file, so the ceiling cannot be checked.',
      remedy: 'Record the agreed compensation from the buyer representation agreement.',
      authority: 'NAR settlement practice changes',
    })
    return checks
  }

  // A cent of float either way is rounding, not a violation.
  const excess = ctx.compensationToBuyerBroker - agreedAmount
  if (excess > 1) {
    checks.push({
      id: 'comp_ceiling',
      rule: 'Compensation may not exceed the agreement',
      severity: 'critical',
      status: 'fail',
      detail: `The deal pays your brokerage $${Math.round(ctx.compensationToBuyerBroker).toLocaleString()} but the agreement caps it at $${Math.round(agreedAmount).toLocaleString()} — $${Math.round(excess).toLocaleString()} over.`,
      remedy: 'Reduce the compensation to the agreed amount, or credit the excess to the buyer at closing.',
      authority: 'NAR settlement practice changes',
    })
  } else {
    checks.push({
      id: 'comp_ceiling',
      rule: 'Compensation may not exceed the agreement',
      severity: 'critical',
      status: 'pass',
      detail: `$${Math.round(ctx.compensationToBuyerBroker).toLocaleString()} is within the agreed $${Math.round(agreedAmount).toLocaleString()}.`,
      authority: 'NAR settlement practice changes',
    })
  }

  const shortfall = agreedAmount - ctx.compensationToBuyerBroker
  if (shortfall > 1) {
    checks.push({
      id: 'comp_shortfall',
      rule: 'Buyer owes the difference',
      severity: 'warning',
      status: 'attention',
      detail: `The seller side covers $${Math.round(ctx.compensationToBuyerBroker).toLocaleString()} of the agreed $${Math.round(agreedAmount).toLocaleString()}. Your buyer owes the $${Math.round(shortfall).toLocaleString()} difference.`,
      remedy: 'Confirm the buyer knows this is coming out of pocket, and show it on their cash-to-close.',
    })
  }

  return checks
}

export type ListingContext = {
  address: string
  listingAgreementSigned: boolean
  /**
   * Buyer-broker compensation published in the MLS. This is now prohibited, and it is
   * the single easiest violation to commit by habit.
   */
  compensationPublishedInMls?: boolean
  sellerAuthorizedConcessions?: boolean
  /** Brokerage name present in every advertisement of the listing. */
  brokerageNameInAdvertising?: boolean
  fairHousingStatementPresent?: boolean
  /** Square footage as advertised vs. the tax record, to catch misrepresentation. */
  advertisedSqft?: number
  taxRecordSqft?: number
  sellerDisclosureDelivered?: boolean
  leadPaintDisclosureRequired?: boolean
  leadPaintDisclosureDelivered?: boolean
  yearBuilt?: number
}

export function auditListing(ctx: ListingContext): ComplianceReport {
  const checks: ComplianceCheck[] = []

  checks.push(ctx.listingAgreementSigned
    ? mk('listing_agreement', 'Signed listing agreement', 'blocking', 'pass', 'Listing agreement on file.')
    : mk('listing_agreement', 'Signed listing agreement', 'blocking', 'fail',
        `No signed listing agreement for ${ctx.address}.`,
        'Get the listing agreement signed before the property is marketed.'))

  if (ctx.compensationPublishedInMls) {
    checks.push(mk('mls_compensation', 'No offers of compensation in the MLS', 'blocking', 'fail',
      'Buyer-broker compensation is published on this MLS listing. That is prohibited.',
      'Remove the compensation field from the MLS entry. Communicate it off-MLS instead.',
      'NAR settlement practice changes, effective 17 Aug 2024'))
  } else {
    checks.push(mk('mls_compensation', 'No offers of compensation in the MLS', 'blocking', 'pass',
      'No compensation offer published in the MLS.', undefined,
      'NAR settlement practice changes, effective 17 Aug 2024'))
  }

  checks.push(ctx.sellerAuthorizedConcessions === false
    ? mk('concession_authority', 'Written authority for concessions', 'critical', 'attention',
        'Concessions are being advertised without recorded written seller authorisation.',
        'Get the seller’s written authorisation before advertising any concession.')
    : mk('concession_authority', 'Written authority for concessions', 'critical', 'pass',
        'Seller authorisation recorded.'))

  checks.push(ctx.brokerageNameInAdvertising === false
    ? mk('brokerage_in_ads', 'Brokerage name in advertising', 'critical', 'fail',
        'Advertising for this listing does not carry the brokerage name.',
        'Add the brokerage name to every ad, post and sign. Most states require it.')
    : mk('brokerage_in_ads', 'Brokerage name in advertising', 'critical', 'pass',
        'Brokerage name present in advertising.'))

  checks.push(ctx.fairHousingStatementPresent === false
    ? mk('fair_housing_statement', 'Equal Housing Opportunity statement', 'warning', 'attention',
        'No Equal Housing Opportunity statement on the listing marketing.',
        'Add the Equal Housing Opportunity logo or statement.')
    : mk('fair_housing_statement', 'Equal Housing Opportunity statement', 'warning', 'pass',
        'Fair housing statement present.'))

  if (ctx.advertisedSqft != null && ctx.taxRecordSqft != null && ctx.taxRecordSqft > 0) {
    const delta = Math.abs(ctx.advertisedSqft - ctx.taxRecordSqft) / ctx.taxRecordSqft
    checks.push(delta > 0.05
      ? mk('sqft_accuracy', 'Advertised square footage', 'critical', 'attention',
          `Advertised ${ctx.advertisedSqft.toLocaleString()} sqft against a tax record of ${ctx.taxRecordSqft.toLocaleString()} — ${Math.round(delta * 100)}% apart.`,
          'Cite the source of the measurement in the listing, or use the tax record figure. Square-footage misrepresentation is a common licence complaint.')
      : mk('sqft_accuracy', 'Advertised square footage', 'critical', 'pass',
          'Advertised square footage matches the tax record.'))
  }

  const needsLeadPaint = ctx.leadPaintDisclosureRequired
    ?? (ctx.yearBuilt != null && ctx.yearBuilt < 1978)
  if (needsLeadPaint) {
    checks.push(ctx.leadPaintDisclosureDelivered
      ? mk('lead_paint', 'Lead-based paint disclosure', 'critical', 'pass',
          'Lead-based paint disclosure delivered.', undefined, 'federal Residential Lead-Based Paint Hazard Reduction Act')
      : mk('lead_paint', 'Lead-based paint disclosure', 'critical', 'fail',
          `Built ${ctx.yearBuilt ?? 'pre-1978'} — the federal lead-based paint disclosure is required and has not been delivered.`,
          'Deliver the lead-based paint disclosure and EPA pamphlet before the buyer is obligated.',
          'federal Residential Lead-Based Paint Hazard Reduction Act'))
  }

  checks.push(ctx.sellerDisclosureDelivered === false
    ? mk('seller_disclosure', 'Seller property disclosure', 'critical', 'attention',
        'Seller property disclosure not recorded as delivered.',
        'Deliver the state seller disclosure; timing rules vary by state.')
    : mk('seller_disclosure', 'Seller property disclosure', 'critical', 'pass',
        'Seller disclosure delivered.'))

  return buildReport(checks, ctx.address)
}

function mk(
  id: string, rule: string, severity: Severity, status: CheckStatus,
  detail: string, remedy?: string, authority?: string,
): ComplianceCheck {
  return { id, rule, severity, status, detail, remedy, authority }
}

export function buildReport(checks: ComplianceCheck[], subject: string): ComplianceReport {
  const failing = checks.filter(c => c.status === 'fail' || c.status === 'attention')
  const blocking = checks.filter(
    c => (c.severity === 'blocking' || c.severity === 'critical') && c.status === 'fail',
  )

  const weight: Record<Severity, number> = { blocking: 40, critical: 18, warning: 6, info: 2 }
  const penalty = failing.reduce(
    (s, c) => s + weight[c.severity] * (c.status === 'fail' ? 1 : 0.5),
    0,
  )
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)))

  const summary = blocking.length > 0
    ? `${blocking.length} blocking issue${blocking.length === 1 ? '' : 's'} on ${subject} — resolve before proceeding.`
    : failing.length > 0
      ? `${subject} is clear to proceed with ${failing.length} item${failing.length === 1 ? '' : 's'} to tidy up.`
      : `${subject} is fully compliant.`

  return { checks, clear: blocking.length === 0, blocking, score, summary }
}

// ── Fair housing copy scan ──────────────────────────────────────────────────────

export type FairHousingFinding = {
  term: string
  category: string
  severity: Severity
  why: string
  suggestion: string
  index: number
}

type Pattern = {
  re: RegExp
  category: string
  severity: Severity
  why: string
  suggestion: string
}

/**
 * Terms that draw fair housing complaints. Grouped by the protected class they touch.
 *
 * The rule is that advertising describes the *property*, never the people who should
 * live in it — so most of these are fixed by talking about a feature instead of an
 * occupant. A few are contested rather than settled (`walking distance`, `master
 * bedroom`); those are graded as warnings so the agent decides, and the scan never
 * rewrites copy on its own.
 */
const FAIR_HOUSING_PATTERNS: Pattern[] = [
  { re: /\bno (?:kids|children)\b/gi, category: 'Familial status', severity: 'critical',
    why: 'Excludes families with children, a protected class under the Fair Housing Act.',
    suggestion: 'Remove it. Describe the property, not who should live in it.' },
  { re: /\badults?[- ]only\b/gi, category: 'Familial status', severity: 'critical',
    why: 'Excludes families with children.',
    suggestion: 'Remove it, unless the property is a verified 55+ community — then say exactly that.' },
  { re: /\b(?:perfect|ideal|great) for (?:singles|couples|a single|young professionals|empty nesters|bachelors?)\b/gi,
    category: 'Familial status', severity: 'critical',
    why: 'Describes a preferred occupant rather than the property.',
    suggestion: 'Describe the feature instead: "one-bedroom layout", "low-maintenance yard".' },
  { re: /\bmature (?:couple|individual|tenant|buyer)s?\b/gi, category: 'Age / familial status', severity: 'critical',
    why: 'Signals an age preference.', suggestion: 'Remove the occupant description.' },
  { re: /\bbachelor pad\b/gi, category: 'Familial status', severity: 'warning',
    why: 'Implies a preferred sex and household type.', suggestion: 'Try "open studio layout".' },
  { re: /\b(?:christian|catholic|jewish|muslim|mormon)\b/gi, category: 'Religion', severity: 'critical',
    why: 'References religion in the advertisement of a dwelling.',
    suggestion: 'Remove. Naming a nearby place of worship as a landmark is also risky.' },
  { re: /\bwalk(?:ing)? (?:distance|to) (?:church|temple|mosque|synagogue)\b/gi, category: 'Religion', severity: 'critical',
    why: 'Uses a religious institution to describe who the home suits.',
    suggestion: 'Reference distance to neutral landmarks instead.' },
  { re: /\b(?:exclusive|restricted|private) (?:neighborhood|community|area)\b/gi, category: 'Race / national origin', severity: 'critical',
    why: '"Exclusive" and "restricted" carry a documented history of racial exclusion.',
    suggestion: 'Describe amenities: "gated", "24-hour security", "HOA-managed".' },
  { re: /\b(?:integrated|ethnic|hispanic|asian|black|white) (?:neighborhood|community|area|block)\b/gi,
    category: 'Race / national origin', severity: 'critical',
    why: 'Describes the racial or ethnic composition of an area — textbook steering.',
    suggestion: 'Remove entirely.' },
  { re: /\b(?:safe|secure|low[- ]crime) (?:neighborhood|area|community|part of town)\b/gi,
    category: 'Steering', severity: 'critical',
    why: 'Widely read as a coded racial signal, and it is a claim you cannot substantiate.',
    suggestion: 'Point buyers to published crime statistics and let them draw conclusions.' },
  { re: /\b(?:good|great|top|best|excellent) schools?\b/gi, category: 'Steering', severity: 'warning',
    why: 'School quality claims are a recognised steering risk and are rarely substantiated.',
    suggestion: 'Name the district factually and link the buyer to the state report card.' },
  { re: /\bfamily[- ]friendly\b/gi, category: 'Familial status', severity: 'warning',
    why: 'Suggests a preferred household type.', suggestion: 'Describe the feature: "fenced yard", "cul-de-sac".' },
  { re: /\b(?:able[- ]bodied|no wheelchairs?|not (?:handicap|wheelchair)[- ]accessible)\b/gi,
    category: 'Disability', severity: 'critical',
    why: 'Excludes people with disabilities.',
    suggestion: 'State accessibility features factually: "step-free entry", "36-inch doorways".' },
  { re: /\bhandicapped?\b/gi, category: 'Disability', severity: 'warning',
    why: 'Outdated term; "accessible" is the accepted usage.',
    suggestion: 'Use "accessible" and name the specific feature.' },
  { re: /\bwalking distance\b/gi, category: 'Disability', severity: 'warning',
    why: 'Contested — some jurisdictions treat it as excluding people with mobility disabilities.',
    suggestion: 'Give the distance: "0.3 miles from the park".' },
  { re: /\bmaster (?:bedroom|bath|suite)\b/gi, category: 'Terminology', severity: 'info',
    why: 'Many MLSs and brokerages have moved to "primary".',
    suggestion: 'Use "primary bedroom", "primary suite".' },
  { re: /\b(?:he|she|his|her) (?:will|would) love\b/gi, category: 'Sex', severity: 'warning',
    why: 'Describes a preferred occupant by sex.', suggestion: 'Address the buyer neutrally, or describe the feature.' },
]

/**
 * Scan marketing copy for fair housing risk. Returns findings in the order they appear
 * so the agent can walk the text top to bottom.
 */
export function scanFairHousing(text: string): FairHousingFinding[] {
  const findings: FairHousingFinding[] = []
  for (const p of FAIR_HOUSING_PATTERNS) {
    // Fresh regex per scan: the source patterns are global and carry lastIndex.
    const re = new RegExp(p.re.source, p.re.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      findings.push({
        term: m[0],
        category: p.category,
        severity: p.severity,
        why: p.why,
        suggestion: p.suggestion,
        index: m.index,
      })
      if (m[0].length === 0) re.lastIndex++ // never spin on a zero-width match
    }
  }
  return findings.sort((a, b) => a.index - b.index)
}

/** True when copy is safe to publish — no critical or blocking fair housing findings. */
export function copyIsPublishable(text: string): { ok: boolean; findings: FairHousingFinding[] } {
  const findings = scanFairHousing(text)
  return {
    ok: !findings.some(f => f.severity === 'critical' || f.severity === 'blocking'),
    findings,
  }
}

// ── Outreach: TCPA and Do-Not-Call ──────────────────────────────────────────────

export type OutreachContext = {
  channel: 'call' | 'sms' | 'email'
  contactName: string
  /** Written consent to be contacted on this channel. */
  hasWrittenConsent?: boolean
  onDoNotCallRegistry?: boolean
  /** An existing business relationship narrows, but does not remove, the exposure. */
  existingBusinessRelationship?: boolean
  /** Local time at the contact, 0–23. Calls outside 8am–9pm are prohibited. */
  localHour?: number
}

export function auditOutreach(ctx: OutreachContext): ComplianceCheck[] {
  const checks: ComplianceCheck[] = []
  if (ctx.channel === 'email') {
    checks.push(mk('outreach_channel', 'Outreach consent', 'info', 'pass',
      'Email outreach — CAN-SPAM applies. Include a physical address and a working opt-out.'))
    return checks
  }

  if (ctx.onDoNotCallRegistry && !ctx.hasWrittenConsent && !ctx.existingBusinessRelationship) {
    checks.push(mk('dnc', 'Do-Not-Call registry', 'critical', 'fail',
      `${ctx.contactName} is on the Do-Not-Call registry with no written consent and no existing business relationship.`,
      'Do not call or text. Reach them another way, or get written consent first.',
      'Telephone Consumer Protection Act / FTC Do-Not-Call Rule'))
  } else {
    checks.push(mk('dnc', 'Do-Not-Call registry', 'critical', 'pass',
      ctx.hasWrittenConsent ? 'Written consent on file.'
        : ctx.existingBusinessRelationship ? 'Existing business relationship applies.'
        : 'Not on the registry.'))
  }

  if (ctx.channel === 'sms' && !ctx.hasWrittenConsent) {
    checks.push(mk('tcpa_sms', 'Prior express written consent for texts', 'critical', 'attention',
      `No written consent on file for texting ${ctx.contactName}.`,
      'Capture written consent before texting. TCPA statutory damages run $500–$1,500 per message.',
      'Telephone Consumer Protection Act'))
  }

  if (ctx.localHour != null && (ctx.localHour < 8 || ctx.localHour >= 21)) {
    checks.push(mk('calling_hours', 'Permitted calling hours', 'critical', 'fail',
      `It is ${ctx.localHour}:00 for ${ctx.contactName}. Solicitation is limited to 8am–9pm local time.`,
      'Schedule this for the morning.',
      'FTC Telemarketing Sales Rule'))
  }

  return checks
}
