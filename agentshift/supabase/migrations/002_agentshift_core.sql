-- AgentShift core schema — the whole of a real estate agent's business in one place.
--
-- Shaped around the categories the job actually splits into, each of which is a
-- separate SaaS subscription today: CRM and sphere, lead capture, listings and
-- valuation, showings, transaction management and compliance, marketing, farming,
-- open houses, and back-office commission accounting.
--
-- Every table is owned by an agent and protected by row-level security on that
-- ownership. Client and lead data is the most sensitive thing an agent holds, and
-- there is no cross-agent read anywhere in this schema.

-- ── Agent profile & compensation plan ───────────────────────────────────────────

create table if not exists agents (
  id                    uuid        primary key references auth.users(id) on delete cascade,
  full_name             text        not null,
  email                 text,
  phone                 text,
  license_number        text,
  license_state         text,
  brokerage_name        text,
  brokerage_license     text,
  team_name             text,
  -- Market context, used to seed CMA time adjustments and price-to-list ratios.
  market_area           text,
  annual_appreciation   real        not null default 0.04,
  median_dom            int         not null default 30,
  list_to_sale_ratio    real        not null default 0.99,
  -- Compensation plan; mirrors CommissionPlan in src/lib/commission.ts.
  split_to_agent        real        not null default 0.70,
  annual_cap            numeric(12,2),
  royalty_rate          real        not null default 0,
  royalty_cap           numeric(12,2),
  transaction_fee       numeric(10,2) not null default 0,
  eo_fee                numeric(10,2) not null default 0,
  team_split_to_agent   real,
  -- Anniversary date the cap resets on.
  cap_year_start        date,
  -- Free-text voice notes so generated copy sounds like this agent, not like AI.
  voice_notes           text,
  disclosure_line       text,
  onboarded_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── People ──────────────────────────────────────────────────────────────────────

create type contact_role as enum
  ('lead', 'buyer', 'seller', 'both', 'past_client', 'sphere', 'vendor');

create type relationship_tier as enum
  ('advocate', 'strong', 'warm', 'cool', 'dormant');

create table if not exists contacts (
  id                  uuid        primary key default gen_random_uuid(),
  agent_id            uuid        not null references agents(id) on delete cascade,
  full_name           text        not null,
  email               text,
  phone               text,
  role                contact_role not null default 'lead',
  tier                relationship_tier not null default 'cool',
  source              text        not null default 'unknown',
  tags                text[]      not null default '{}',
  -- Sphere intelligence inputs; see src/lib/sphere.ts.
  last_touched_at     timestamptz,
  home_anniversary    date,
  birthday            date,
  referrals_sent      int         not null default 0,
  transactions_closed int         not null default 0,
  estimated_home_value      numeric(12,2),
  estimated_mortgage_balance numeric(12,2),
  homeowner           boolean,
  street_address      text,
  city                text,
  state               text,
  postal_code         text,
  -- Lead intent inputs; see src/lib/lead-scoring.ts.
  timeline_months     int,
  pre_approved        boolean     not null default false,
  lender_introduced   boolean     not null default false,
  has_agent           boolean     not null default false,
  has_home_to_sell    boolean     not null default false,
  budget_min          numeric(12,2),
  budget_max          numeric(12,2),
  property_views      int         not null default 0,
  saved_searches      int         not null default 0,
  inbound_replies     int         not null default 0,
  contact_attempts    int         not null default 0,
  last_contacted_at   timestamptz,
  -- Consent. Nothing is sent to a contact without checking these first.
  contact_consent     boolean     not null default false,
  consent_date        timestamptz,
  on_do_not_call      boolean     not null default false,
  opted_out           boolean     not null default false,
  notes               text,
  archived            boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index contacts_agent_idx        on contacts(agent_id) where not archived;
create index contacts_agent_role_idx   on contacts(agent_id, role) where not archived;
create index contacts_last_touched_idx on contacts(agent_id, last_touched_at);

-- Every interaction, so "last touched" is derived from reality rather than a field
-- somebody forgot to update.
create table if not exists contact_events (
  id           uuid        primary key default gen_random_uuid(),
  agent_id     uuid        not null references agents(id) on delete cascade,
  contact_id   uuid        not null references contacts(id) on delete cascade,
  kind         text        not null,   -- call | text | email | meeting | showing | note | automated
  direction    text        not null default 'outbound',
  subject      text,
  body         text,
  -- Set when Shift, rather than the agent, made the touch.
  by_shift     boolean     not null default false,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index contact_events_contact_idx on contact_events(contact_id, occurred_at desc);

create table if not exists life_events (
  id          uuid        primary key default gen_random_uuid(),
  agent_id    uuid        not null references agents(id) on delete cascade,
  contact_id  uuid        not null references contacts(id) on delete cascade,
  kind        text        not null,  -- new_job | marriage | new_child | divorce | retirement | relocation | inheritance | empty_nest
  event_date  date        not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index life_events_contact_idx on life_events(contact_id, event_date desc);

-- ── Representation agreements — the compliance spine ────────────────────────────

create type engagement_kind as enum ('buyer_representation', 'listing', 'referral');

create table if not exists engagements (
  id                    uuid        primary key default gen_random_uuid(),
  agent_id              uuid        not null references agents(id) on delete cascade,
  contact_id            uuid        not null references contacts(id) on delete cascade,
  kind                  engagement_kind not null,
  signed                boolean     not null default false,
  signed_date           date,
  expires_date          date,
  -- Post-settlement, compensation must be specific and objective. Exactly one of the
  -- rate or the flat amount should be set; open_ended is the state that blocks a tour.
  compensation_rate     real,
  compensation_flat     numeric(12,2),
  compensation_open_ended boolean   not null default false,
  agency_disclosure_delivered  boolean not null default false,
  wire_fraud_advisory_delivered boolean not null default false,
  document_url          text,
  esign_envelope_id     text,
  esign_status          text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index engagements_agent_idx   on engagements(agent_id);
create index engagements_contact_idx on engagements(contact_id, kind);

-- A signed agreement must carry a specific amount. This is the settlement rule
-- expressed as a constraint, so the database cannot hold a non-compliant agreement.
alter table engagements add constraint engagements_compensation_specific check (
  kind <> 'buyer_representation'
  or not signed
  or compensation_open_ended
  or compensation_rate is not null
  or compensation_flat is not null
);

-- ── Property, listings and comparable sales ─────────────────────────────────────

create type listing_status as enum
  ('coming_soon', 'active', 'pending', 'sold', 'withdrawn', 'expired');

create table if not exists properties (
  id            uuid        primary key default gen_random_uuid(),
  agent_id      uuid        not null references agents(id) on delete cascade,
  street_address text       not null,
  city          text,
  state         text,
  postal_code   text,
  mls_number    text,
  beds          real,
  baths         real,
  sqft          int,
  lot_sqft      int,
  year_built    int,
  garage_stalls int,
  -- 1 = needs full renovation … 5 = fully renovated. Drives the CMA condition line.
  condition     int         check (condition between 1 and 5),
  pool          boolean,
  view          boolean,
  property_type text,
  hoa_monthly   numeric(10,2),
  annual_tax    numeric(12,2),
  latitude      double precision,
  longitude     double precision,
  tax_record_sqft int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index properties_agent_idx on properties(agent_id);

create table if not exists listings (
  id                  uuid        primary key default gen_random_uuid(),
  agent_id            uuid        not null references agents(id) on delete cascade,
  property_id         uuid        not null references properties(id) on delete cascade,
  seller_contact_id   uuid        references contacts(id) on delete set null,
  engagement_id       uuid        references engagements(id) on delete set null,
  status              listing_status not null default 'coming_soon',
  list_price          numeric(12,2),
  original_list_price numeric(12,2),
  listed_on           date,
  expires_on          date,
  -- Compliance flags audited by src/lib/compliance.ts.
  compensation_published_in_mls boolean not null default false,
  seller_authorized_concessions boolean not null default false,
  brokerage_name_in_advertising boolean not null default true,
  fair_housing_statement        boolean not null default true,
  seller_disclosure_delivered   boolean not null default false,
  lead_paint_disclosure_delivered boolean not null default false,
  advertised_sqft     int,
  public_remarks      text,
  showing_instructions text,
  views               int         not null default 0,
  saves               int         not null default 0,
  showings_count      int         not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index listings_agent_status_idx on listings(agent_id, status);

-- Sold records used as comparables. Kept separate from listings because a comp is
-- usually somebody else's sale, pulled from the MLS rather than owned by this agent.
create table if not exists comparable_sales (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  street_address text        not null,
  city           text,
  postal_code    text,
  mls_number     text,
  beds           real        not null,
  baths          real        not null,
  sqft           int         not null check (sqft > 0),
  lot_sqft       int,
  year_built     int,
  garage_stalls  int,
  condition      int         check (condition between 1 and 5),
  pool           boolean,
  view           boolean,
  sold_price     numeric(12,2) not null check (sold_price > 0),
  sold_date      date        not null,
  list_price     numeric(12,2),
  days_on_market int,
  distance_miles real,
  created_at     timestamptz not null default now()
);

create index comparable_sales_agent_idx on comparable_sales(agent_id, sold_date desc);

-- A saved CMA, stored whole so a pricing conversation can be reopened months later
-- exactly as the seller saw it.
create table if not exists cmas (
  id               uuid        primary key default gen_random_uuid(),
  agent_id         uuid        not null references agents(id) on delete cascade,
  property_id      uuid        references properties(id) on delete set null,
  contact_id       uuid        references contacts(id) on delete set null,
  subject          jsonb       not null,
  market_context   jsonb       not null,
  result           jsonb       not null,
  indicated_value  numeric(12,2),
  suggested_list   numeric(12,2),
  confidence       int,
  created_at       timestamptz not null default now()
);

create index cmas_agent_idx on cmas(agent_id, created_at desc);

-- ── Showings ────────────────────────────────────────────────────────────────────

create type showing_status as enum ('requested', 'confirmed', 'blocked', 'completed', 'cancelled');

create table if not exists showings (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  contact_id     uuid        references contacts(id) on delete set null,
  listing_id     uuid        references listings(id) on delete set null,
  property_id    uuid        references properties(id) on delete set null,
  street_address text        not null,
  starts_at      timestamptz not null,
  duration_minutes int       not null default 30,
  status         showing_status not null default 'requested',
  -- Populated by the compliance gate when a tour is blocked for want of a signed
  -- buyer agreement. Kept on the record so the reason survives the conversation.
  blocked_reason text,
  feedback       text,
  feedback_rating int        check (feedback_rating between 1 and 5),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index showings_agent_time_idx on showings(agent_id, starts_at);

-- ── Transactions ────────────────────────────────────────────────────────────────

create type transaction_side as enum ('listing', 'buyer', 'dual');
create type transaction_stage as enum (
  'lead', 'active_buyer', 'active_listing', 'offer_out',
  'under_contract', 'contingencies_cleared', 'clear_to_close', 'closed', 'fell_through'
);

create table if not exists transactions (
  id                 uuid        primary key default gen_random_uuid(),
  agent_id           uuid        not null references agents(id) on delete cascade,
  property_id        uuid        references properties(id) on delete set null,
  listing_id         uuid        references listings(id) on delete set null,
  client_contact_id  uuid        references contacts(id) on delete set null,
  engagement_id      uuid        references engagements(id) on delete set null,
  label              text        not null,
  street_address     text,
  side               transaction_side not null,
  stage              transaction_stage not null default 'lead',
  sale_price         numeric(12,2),
  side_rate          real,
  flat_commission    numeric(12,2),
  referral_rate      real,
  contract_date      date,
  closing_date       date,
  actual_closing_date date,
  -- Per-transaction overrides of the default milestone offsets.
  timeline_overrides jsonb       not null default '{}'::jsonb,
  earnest_money      numeric(12,2),
  -- What the buyer's brokerage is actually paid, checked against the engagement.
  buyer_broker_compensation numeric(12,2),
  title_company      text,
  lender_name        text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index transactions_agent_stage_idx on transactions(agent_id, stage);
create index transactions_closing_idx     on transactions(agent_id, closing_date);

create table if not exists transaction_milestones (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  transaction_id uuid        not null references transactions(id) on delete cascade,
  kind           text        not null,
  due_date       date        not null,
  completed_date date,
  critical       boolean     not null default false,
  responsible    text,
  note           text,
  created_at     timestamptz not null default now(),
  unique (transaction_id, kind)
);

create index transaction_milestones_due_idx on transaction_milestones(agent_id, due_date)
  where completed_date is null;

create table if not exists documents (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  transaction_id uuid        references transactions(id) on delete cascade,
  listing_id     uuid        references listings(id) on delete cascade,
  engagement_id  uuid        references engagements(id) on delete cascade,
  name           text        not null,
  category       text,
  storage_path   text,
  esign_envelope_id text,
  esign_status   text,
  required       boolean     not null default false,
  received       boolean     not null default false,
  received_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index documents_transaction_idx on documents(transaction_id);

-- Immutable audit trail. A compliance claim is only worth anything if you can show
-- when it was checked and what it said at the time.
create table if not exists compliance_events (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  subject_type   text        not null,   -- showing | listing | transaction | outreach | content
  subject_id     uuid,
  check_id       text        not null,
  rule           text        not null,
  severity       text        not null,
  status         text        not null,
  detail         text,
  -- What the agent did about it, filled in later.
  resolved_at    timestamptz,
  resolution     text,
  created_at     timestamptz not null default now()
);

create index compliance_events_agent_idx on compliance_events(agent_id, created_at desc);
create index compliance_events_open_idx  on compliance_events(agent_id, severity)
  where resolved_at is null;

-- ── Marketing ───────────────────────────────────────────────────────────────────

create table if not exists marketing_assets (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  listing_id     uuid        references listings(id) on delete set null,
  contact_id     uuid        references contacts(id) on delete set null,
  channel        text        not null,   -- mls | instagram | facebook | email | sms | video_script | flyer | blog | linkedin
  title          text,
  body           text        not null,
  -- The fair housing scan result at the time of generation, kept for the record.
  fair_housing_findings jsonb not null default '[]'::jsonb,
  approved       boolean     not null default false,
  published_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index marketing_assets_agent_idx on marketing_assets(agent_id, created_at desc);

create table if not exists farms (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  name           text        not null,
  -- A postal code, subdivision, or polygon description.
  definition     text        not null,
  household_count int,
  turnover_rate  real,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists open_houses (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  listing_id     uuid        references listings(id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists open_house_visitors (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  open_house_id  uuid        not null references open_houses(id) on delete cascade,
  contact_id     uuid        references contacts(id) on delete set null,
  full_name      text        not null,
  email          text,
  phone          text,
  has_agent      boolean     not null default false,
  timeline_months int,
  pre_approved   boolean     not null default false,
  -- Consent captured on the sign-in sheet itself, which is where it has to happen.
  contact_consent boolean    not null default false,
  signed_in_at   timestamptz not null default now()
);

create index open_house_visitors_idx on open_house_visitors(open_house_id);

-- ── Back office ─────────────────────────────────────────────────────────────────

-- The closed-deal ledger. Rows are appended at closing and drive cap tracking, so
-- the commission math has a single source of truth rather than a spreadsheet.
create table if not exists commissions (
  id                uuid        primary key default gen_random_uuid(),
  agent_id          uuid        not null references agents(id) on delete cascade,
  transaction_id    uuid        references transactions(id) on delete set null,
  closed_on         date        not null,
  sale_price        numeric(12,2) not null,
  gross_commission  numeric(12,2) not null,
  referral_fee      numeric(12,2) not null default 0,
  royalty_fee       numeric(12,2) not null default 0,
  company_dollar    numeric(12,2) not null default 0,
  transaction_fees  numeric(12,2) not null default 0,
  team_fee          numeric(12,2) not null default 0,
  agent_net         numeric(12,2) not null,
  sides             int         not null default 1,
  created_at        timestamptz not null default now()
);

create index commissions_agent_idx on commissions(agent_id, closed_on desc);

create table if not exists expenses (
  id          uuid        primary key default gen_random_uuid(),
  agent_id    uuid        not null references agents(id) on delete cascade,
  incurred_on date        not null,
  category    text        not null,
  vendor      text,
  amount      numeric(12,2) not null,
  transaction_id uuid     references transactions(id) on delete set null,
  deductible  boolean     not null default true,
  note        text,
  created_at  timestamptz not null default now()
);

create index expenses_agent_idx on expenses(agent_id, incurred_on desc);

-- The partner bench: lenders, inspectors, title, photographers. `shift_product` is
-- how a handoff reaches a sibling Shift product — a lender on LendShift, say —
-- instead of dying in a text message.
create table if not exists vendors (
  id            uuid        primary key default gen_random_uuid(),
  agent_id      uuid        not null references agents(id) on delete cascade,
  name          text        not null,
  company       text,
  category      text        not null,   -- lender | inspector | title | photographer | stager | contractor | attorney | insurance
  email         text,
  phone         text,
  shift_product text,
  shift_handle  text,
  rating        int         check (rating between 1 and 5),
  notes         text,
  active        boolean     not null default true,
  created_at    timestamptz not null default now()
);

create index vendors_agent_category_idx on vendors(agent_id, category) where active;

create table if not exists tasks (
  id             uuid        primary key default gen_random_uuid(),
  agent_id       uuid        not null references agents(id) on delete cascade,
  contact_id     uuid        references contacts(id) on delete cascade,
  transaction_id uuid        references transactions(id) on delete cascade,
  listing_id     uuid        references listings(id) on delete cascade,
  title          text        not null,
  detail         text,
  due_date       date,
  critical       boolean     not null default false,
  completed_at   timestamptz,
  -- Set when Shift created the task rather than the agent.
  by_shift       boolean     not null default false,
  created_at     timestamptz not null default now()
);

create index tasks_agent_open_idx on tasks(agent_id, due_date) where completed_at is null;

-- ── Conversations ───────────────────────────────────────────────────────────────

create table if not exists conversations (
  id          uuid        primary key default gen_random_uuid(),
  agent_id    uuid        not null references agents(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists messages (
  id              uuid        primary key default gen_random_uuid(),
  agent_id        uuid        not null references agents(id) on delete cascade,
  conversation_id uuid        not null references conversations(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant')),
  content         text        not null,
  -- The generative-UI artifacts rendered with this message, so reopening a thread
  -- brings back the CMA and the net sheet, not just the prose about them.
  artifacts       jsonb       not null default '[]'::jsonb,
  tool_events     jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on messages(conversation_id, created_at);

-- ── Row-level security ──────────────────────────────────────────────────────────
-- One rule, applied everywhere: you see your own rows and nobody else's.

alter table agents                enable row level security;
alter table contacts              enable row level security;
alter table contact_events        enable row level security;
alter table life_events           enable row level security;
alter table engagements           enable row level security;
alter table properties            enable row level security;
alter table listings              enable row level security;
alter table comparable_sales      enable row level security;
alter table cmas                  enable row level security;
alter table showings              enable row level security;
alter table transactions          enable row level security;
alter table transaction_milestones enable row level security;
alter table documents             enable row level security;
alter table compliance_events     enable row level security;
alter table marketing_assets      enable row level security;
alter table farms                 enable row level security;
alter table open_houses           enable row level security;
alter table open_house_visitors   enable row level security;
alter table commissions           enable row level security;
alter table expenses              enable row level security;
alter table vendors               enable row level security;
alter table tasks                 enable row level security;
alter table conversations         enable row level security;
alter table messages              enable row level security;

create policy "agents manage own profile" on agents
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array[
    'contacts', 'contact_events', 'life_events', 'engagements', 'properties',
    'listings', 'comparable_sales', 'cmas', 'showings', 'transactions',
    'transaction_milestones', 'documents', 'compliance_events', 'marketing_assets',
    'farms', 'open_houses', 'open_house_visitors', 'commissions', 'expenses',
    'vendors', 'tasks', 'conversations', 'messages'
  ]
  loop
    execute format(
      'create policy "agents manage own %1$s" on %1$I for all using (auth.uid() = agent_id) with check (auth.uid() = agent_id)',
      t
    );
  end loop;
end $$;

-- ── Triggers ────────────────────────────────────────────────────────────────────

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'agents', 'contacts', 'engagements', 'properties', 'listings',
    'showings', 'transactions', 'conversations'
  ]
  loop
    execute format(
      'create trigger %1$s_touch_updated_at before update on %1$I for each row execute function touch_updated_at()',
      t
    );
  end loop;
end $$;

-- Keep contacts.last_touched_at honest: it is derived from the event log rather than
-- maintained by hand, because the whole sphere ranking depends on it being true.
create or replace function sync_contact_last_touched()
returns trigger language plpgsql as $$
begin
  update contacts
  set last_touched_at = greatest(coalesce(last_touched_at, new.occurred_at), new.occurred_at)
  where id = new.contact_id;
  return new;
end $$;

create trigger contact_events_sync_last_touched
  after insert on contact_events
  for each row execute function sync_contact_last_touched();

-- A new sign-up gets an agent row automatically; nothing in the app works without one.
create or replace function handle_new_agent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into agents (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created_agentshift
  after insert on auth.users
  for each row execute function handle_new_agent();
