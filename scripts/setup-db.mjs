import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvelnrfjuvekzzgatlbr.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PAT = process.env.SUPABASE_PAT
const PROJECT_REF = 'uvelnrfjuvekzzgatlbr'

if (!SERVICE_KEY || !PAT) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PAT env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data
}

console.log('Setting up MarketShift database...')

// brands
await sql(`
  create table if not exists brands (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users not null,
    name text not null,
    tagline text,
    description text not null,
    url text not null,
    keywords text[] not null default '{}',
    subreddits text[] not null default '{}',
    voice_notes text,
    active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
`)
console.log('✓ brands table')

// opportunities
await sql(`
  create table if not exists opportunities (
    id uuid primary key default gen_random_uuid(),
    brand_id uuid references brands on delete cascade not null,
    platform text not null,
    thread_url text not null,
    thread_id text,
    title text,
    body text,
    author text,
    subreddit text,
    score integer default 0,
    score_reason text,
    drafted_reply text,
    status text default 'pending',
    found_at timestamptz default now(),
    posted_at timestamptz,
    created_at timestamptz default now()
  );
`)
console.log('✓ opportunities table')

// scan_runs
await sql(`
  create table if not exists scan_runs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users not null,
    brand_id uuid references brands on delete set null,
    platform text,
    opportunities_found integer default 0,
    ran_at timestamptz default now()
  );
`)
console.log('✓ scan_runs table')

// indexes
await sql(`create index if not exists idx_opportunities_brand_status on opportunities(brand_id, status);`)
await sql(`create index if not exists idx_opportunities_thread_id on opportunities(thread_id);`)
await sql(`create index if not exists idx_scan_runs_user on scan_runs(user_id, ran_at desc);`)
console.log('✓ indexes')

// RLS
await sql(`alter table brands enable row level security;`)
await sql(`alter table opportunities enable row level security;`)
await sql(`alter table scan_runs enable row level security;`)

await sql(`
  do $$ begin
    if not exists (select 1 from pg_policies where tablename='brands' and policyname='brands_owner') then
      create policy brands_owner on brands for all using (auth.uid() = user_id);
    end if;
  end $$;
`)

await sql(`
  do $$ begin
    if not exists (select 1 from pg_policies where tablename='opportunities' and policyname='opportunities_via_brand') then
      create policy opportunities_via_brand on opportunities for all
        using (brand_id in (select id from brands where user_id = auth.uid()));
    end if;
  end $$;
`)

await sql(`
  do $$ begin
    if not exists (select 1 from pg_policies where tablename='scan_runs' and policyname='scan_runs_owner') then
      create policy scan_runs_owner on scan_runs for all using (auth.uid() = user_id);
    end if;
  end $$;
`)
console.log('✓ RLS policies')

// Seed WeldShift brand for user t.allman@kpsllc.org
// Use admin to look up user
const adminRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/auth/users?email=t.allman%40kpsllc.org`, {
  headers: { 'Authorization': `Bearer ${PAT}` }
})

let userId = null
if (adminRes.ok) {
  const adminData = await adminRes.json()
  userId = adminData?.users?.[0]?.id
}

if (!userId) {
  console.log('⚠ User not found yet — WeldShift brand will be seeded after first login')
} else {
  // Check if WeldShift brand already exists
  const { data: existing } = await supabase
    .from('brands')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'WeldShift Academy')
    .maybeSingle()

  if (!existing) {
    await supabase.from('brands').insert({
      user_id: userId,
      name: 'WeldShift Academy',
      tagline: 'AI-powered CWI/CWE exam prep & welding knowledge platform',
      description: 'WeldShift Academy is the #1 AI-powered platform for welders and welding inspectors. Features: CWI exam prep (200+ questions per part covering all 9 parts), CWE exam prep, AI Oracle welding assistant, weld symbols reference, WPS/PQR tools, field oracle (photo analysis for weld defects), code navigator (D1.1, ASME IX, API 1104), safety module, classroom management for instructors with assignments and certifications, business tools (invoicing, timesheets, job tracking), and digital welding passport. Perfect for welders studying for AWS certification, CWI inspectors, welding instructors, and welding contractors.',
      url: 'https://weldshiftacademy.com',
      keywords: [
        'CWI exam prep', 'CWI study guide', 'certified welding inspector',
        'CWE exam', 'AWS D1.1', 'AWS certification', 'welding inspector exam',
        'welding symbols help', 'WPS PQR welding', 'ASME IX study',
        'API 1104 exam', 'welding certification app', 'welding training app',
        'CWI practice test', 'welding inspector training', 'welding school resources',
        'weld defect identification', 'welding code resources', 'AWS CWI',
        'welding inspector study materials'
      ],
      subreddits: [
        'welding', 'metalworking', 'fabrication', 'AskEngineers',
        'manufacturing', 'WeldingTech', 'TradeSchool', 'skilled_trades'
      ],
      voice_notes: 'Knowledgeable welding professional with CWI certification experience. Casual but authoritative tone. Always provide genuine value first. Mention WeldShift naturally as a resource, not as a sales pitch. Reference specific features relevant to their situation.',
      active: true,
    })
    console.log('✓ WeldShift Academy brand seeded')
  } else {
    console.log('✓ WeldShift Academy brand already exists')
  }
}

console.log('\n✅ MarketShift database setup complete!')
console.log(`Project URL: https://uvelnrfjuvekzzgatlbr.supabase.co`)
