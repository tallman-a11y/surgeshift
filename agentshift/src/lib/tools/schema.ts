import type Anthropic from '@anthropic-ai/sdk'

/**
 * The tool surface. Each of these stands in for a product an agent pays for today —
 * the CRM, the CMA tool, the transaction coordinator, the compliance checklist, the
 * showing scheduler, the marketing designer, the back-office commission spreadsheet.
 *
 * Descriptions are written for the model, so they say when to reach for a tool and
 * not merely what it does. The commonest failure mode in a conversational product is
 * a model that answers from its own head when a tool would have given the real number.
 */
export const SHIFT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_dashboard',
    description:
      'The state of the agent\'s business right now: unworked leads, deadlines due this week, showings today, active listings, pipeline value. Call this first for any open-ended question — "what should I do today", "where do things stand", "catch me up", or a bare greeting.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'triage_leads',
    description:
      'Rank leads by what needs calling first. Urgency is not the same as quality: a brand-new portal inquiry outranks an excellent lead that was called an hour ago, because contact rates collapse within minutes. Use for "who do I call", "any new leads", "work my leads".',
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'number', description: 'Max leads, default 10' } },
      required: [],
    },
  },
  {
    name: 'sphere_calls',
    description:
      'Who in the agent\'s sphere deserves a call today and the specific reason — a home anniversary, a life event, years-in-home hitting the move window, large equity, or simply overdue against their tier cadence. Use for "who should I reach out to", "past clients", "sphere", "database".',
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'number', description: 'Max contacts, default 8' } },
      required: [],
    },
  },
  {
    name: 'run_cma',
    description:
      'Run a full comparative market analysis with an appraisal-style adjustment grid, and render it. Use whenever anyone asks what a property is worth, what to list at, or to price a listing appointment. Pass whatever subject details are known; the tool pulls comparable sales from the agent\'s data. Never estimate a value yourself — always run this.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string' },
        beds: { type: 'number' },
        baths: { type: 'number', description: 'e.g. 2.5 for two full and one half' },
        sqft: { type: 'number' },
        lot_sqft: { type: 'number' },
        year_built: { type: 'number' },
        garage_stalls: { type: 'number' },
        condition: { type: 'number', description: '1 needs full reno, 3 average, 5 fully renovated' },
        pool: { type: 'boolean' },
        view: { type: 'boolean' },
        property_id: { type: 'string', description: 'Use an existing property record instead of passing details' },
      },
      required: ['address', 'beds', 'baths', 'sqft'],
    },
  },
  {
    name: 'seller_net_sheet',
    description:
      'What a seller actually walks away with. Post-settlement the listing-side fee and any buyer-broker compensation are separate negotiated lines, so both are passed separately. Use for "what do I net", "net sheet", "what if they offer X", listing appointments, and offer comparisons.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sale_price: { type: 'number' },
        listing_side_rate: { type: 'number', description: 'Decimal, e.g. 0.025' },
        buyer_broker_rate: { type: 'number', description: 'Decimal. Zero when the seller is not paying the buyer side.' },
        buyer_broker_flat: { type: 'number' },
        concessions: { type: 'number' },
        mortgage_payoff: { type: 'number' },
        payoff_rate: { type: 'number' },
        payoff_days: { type: 'number' },
        title_policy: { type: 'number' },
        escrow_fee: { type: 'number' },
        transfer_tax_rate: { type: 'number' },
        repair_credits: { type: 'number' },
        annual_property_tax: { type: 'number' },
        tax_proration_days: { type: 'number' },
        scenarios: {
          type: 'array',
          description: 'Alternate sale prices to show alongside, so the seller sees the curve.',
          items: { type: 'number' },
        },
      },
      required: ['sale_price', 'listing_side_rate'],
    },
  },
  {
    name: 'buyer_cost_estimate',
    description:
      'Buyer cash to close and the full monthly payment including tax, insurance, PMI and HOA. Use for "what do I need to bring", "what is my payment", affordability questions, and any offer the buyer is weighing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        purchase_price: { type: 'number' },
        down_payment_pct: { type: 'number', description: 'Decimal, e.g. 0.20' },
        loan_amount: { type: 'number' },
        interest_rate: { type: 'number', description: 'Decimal, e.g. 0.0645' },
        term_years: { type: 'number' },
        annual_property_tax: { type: 'number' },
        annual_insurance: { type: 'number' },
        monthly_hoa: { type: 'number' },
        earnest_money: { type: 'number' },
        seller_concessions: { type: 'number' },
        buyer_broker_shortfall: { type: 'number', description: 'Compensation the buyer owes that the seller is not covering' },
      },
      required: ['purchase_price', 'interest_rate'],
    },
  },
  {
    name: 'check_showing',
    description:
      'MANDATORY before booking any showing. Checks the buyer representation agreement is signed, in force, and states a specific compensation amount. Since 17 Aug 2024 a tour without one is prohibited. If this returns blocked, tell the agent plainly and offer to send the agreement — never suggest a workaround.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_id: { type: 'string' },
        contact_name: { type: 'string', description: 'Used when no contact_id is known' },
        property_address: { type: 'string' },
        showing_date: { type: 'string', description: 'ISO date' },
      },
      required: ['property_address', 'showing_date'],
    },
  },
  {
    name: 'get_showings',
    description: 'The showing calendar — requested, confirmed, blocked and completed tours. Use for "what is my schedule", "showings today", "this week".',
    input_schema: {
      type: 'object' as const,
      properties: { days: { type: 'number', description: 'Days ahead, default 7' } },
      required: [],
    },
  },
  {
    name: 'audit_listing',
    description:
      'Compliance audit of a listing: signed listing agreement, no compensation published in the MLS, advertising carries the brokerage name, square footage matches the tax record, lead paint disclosure on pre-1978 homes, seller disclosure delivered. Use before going live, and for "am I compliant", "check my listing".',
    input_schema: {
      type: 'object' as const,
      properties: { listing_id: { type: 'string' }, address: { type: 'string' } },
      required: [],
    },
  },
  {
    name: 'transaction_timeline',
    description:
      'Every critical date on a transaction, counted correctly — business days skip weekends and federal holidays, which is where hand-counted deadlines go wrong. Shows what is overdue, what is next, and whether the deadlines can fit before closing. Use for "where are we on", "what is due", "deadlines".',
    input_schema: {
      type: 'object' as const,
      properties: {
        transaction_id: { type: 'string' },
        address: { type: 'string', description: 'Match by property address when no id is known' },
      },
      required: [],
    },
  },
  {
    name: 'get_pipeline',
    description: 'The deal board: every active transaction by stage, with volume and anything overdue flagged on the card. Use for "my pipeline", "what is under contract", "how many deals".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'forecast_income',
    description:
      'Probability-weighted commission forecast by month, after splits, caps, royalty and fees — the number to actually plan against, alongside best case and the committed portion. Use for "how much am I making", "forecast", "am I going to cap", "can I afford".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'write_marketing_copy',
    description:
      'Generate listing and marketing copy in the agent\'s voice across channels, every word scanned for fair housing risk before it is shown. Use for listing descriptions, social posts, just-listed and just-sold, open house promotion, email, video scripts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'What the copy is about — an address, an event, a market update' },
        channels: {
          type: 'array',
          description: 'Which channels to write for',
          items: { type: 'string', enum: ['mls', 'instagram', 'facebook', 'email', 'sms', 'video_script', 'flyer', 'blog', 'linkedin'] },
        },
        details: { type: 'string', description: 'Features, price, hooks — anything the copy should carry' },
        listing_id: { type: 'string' },
      },
      required: ['subject', 'channels'],
    },
  },
  {
    name: 'get_listings',
    description: 'The agent\'s listings with status, days on market, and activity. Flags a listing that needs a price conversation. Use for "my listings", "how is X doing", "any price reductions needed".',
    input_schema: {
      type: 'object' as const,
      properties: { status: { type: 'string', enum: ['coming_soon', 'active', 'pending', 'sold', 'withdrawn', 'expired'] } },
      required: [],
    },
  },
  {
    name: 'find_contacts',
    description: 'Search the database by name, role, tag or source. Use whenever a person is mentioned and you need their record, their consent state, or their agreement status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' },
        role: { type: 'string', enum: ['lead', 'buyer', 'seller', 'both', 'past_client', 'sphere', 'vendor'] },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'create_contact',
    description: 'Add a person to the database. Capture contact consent explicitly — texting without written consent carries real statutory exposure.',
    input_schema: {
      type: 'object' as const,
      properties: {
        full_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        role: { type: 'string', enum: ['lead', 'buyer', 'seller', 'both', 'past_client', 'sphere', 'vendor'] },
        source: { type: 'string' },
        timeline_months: { type: 'number' },
        pre_approved: { type: 'boolean' },
        contact_consent: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['full_name'],
    },
  },
  {
    name: 'log_touch',
    description: 'Record an interaction with a contact. This is what keeps the sphere ranking honest, so log every call, text and meeting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_id: { type: 'string' },
        contact_name: { type: 'string' },
        kind: { type: 'string', enum: ['call', 'text', 'email', 'meeting', 'showing', 'note'] },
        summary: { type: 'string' },
      },
      required: ['kind', 'summary'],
    },
  },
  {
    name: 'hand_off_to_family',
    description:
      'Hand work across to another Shift product the agent already uses: a buyer who needs financing goes to LendShift as a pre-approval lead; a listing going live goes to SurgeShift for the campaign; a homeowner thinking about selling goes to SurgeShift to nurture. Use this instead of telling the agent to go and do something in another tool. It moves the agent\'s own data between the agent\'s own products — but only ever when they have asked for it, and only to a product they have connected.',
    input_schema: {
      type: 'object' as const,
      properties: {
        handoff: {
          type: 'string',
          enum: ['lender_referral', 'listing_live', 'client_closed', 'seller_lead'],
          description: 'What is being handed across',
        },
        contact_id: { type: 'string' },
        contact_name: { type: 'string', description: 'Used when no contact_id is known' },
        note: { type: 'string', description: 'Context the receiving product should have' },
        property_address: { type: 'string' },
      },
      required: ['handoff'],
    },
  },
  {
    name: 'family_status',
    description:
      'Which parts of the Shift family are actually connected for this agent — memory, learning, collective intelligence, and the cross-product bus to LendShift and SurgeShift — plus anything sitting in their cross-product inbox. Use when the agent asks what is connected, why a handoff did not go through, or what Shift remembers.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'production_report',
    description: 'Closed production: volume, sides, gross commission, net after splits, average sale price and days on market, plus which lead sources actually produced. Use for "how did I do", "my numbers", "which sources work".',
    input_schema: {
      type: 'object' as const,
      properties: { months: { type: 'number', description: 'Look-back window, default 12' } },
      required: [],
    },
  },
]

/** What the agent sees on the chip while a tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  get_dashboard: 'Reading your business',
  triage_leads: 'Triaging leads',
  sphere_calls: 'Ranking your sphere',
  run_cma: 'Running the comparable analysis',
  seller_net_sheet: 'Building the net sheet',
  buyer_cost_estimate: 'Calculating cash to close',
  check_showing: 'Checking representation compliance',
  get_showings: 'Loading the showing calendar',
  audit_listing: 'Auditing the listing',
  transaction_timeline: 'Recalculating critical dates',
  get_pipeline: 'Loading the pipeline',
  forecast_income: 'Forecasting commission',
  write_marketing_copy: 'Writing and fair-housing screening',
  get_listings: 'Loading listings',
  find_contacts: 'Searching contacts',
  create_contact: 'Adding contact',
  log_touch: 'Logging the touch',
  production_report: 'Pulling production numbers',
  hand_off_to_family: 'Handing across to the family',
  family_status: 'Checking family connections',
}
