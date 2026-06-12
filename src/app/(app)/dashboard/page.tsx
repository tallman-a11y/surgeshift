import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './_components/DashboardClient'

export const metadata = { title: 'Dashboard — SurgeShift' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load brands
  const { data: brands } = await supabase
    .from('brands')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('created_at')

  // Stats
  const { count: totalPending } = await supabase
    .from('opportunities')
    .select('*', { count: 'exact', head: true })
    .in('brand_id', (brands ?? []).map(b => b.id))
    .eq('status', 'pending')

  const { count: postedThisWeek } = await supabase
    .from('opportunities')
    .select('*', { count: 'exact', head: true })
    .in('brand_id', (brands ?? []).map(b => b.id))
    .eq('status', 'posted')
    .gte('posted_at', new Date(Date.now() - 7 * 86400000).toISOString())

  const { count: totalFound } = await supabase
    .from('opportunities')
    .select('*', { count: 'exact', head: true })
    .in('brand_id', (brands ?? []).map(b => b.id))

  // Last scan
  const { data: lastScan } = await supabase
    .from('scan_runs')
    .select('ran_at, opportunities_found')
    .eq('user_id', user.id)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <DashboardClient
      brands={brands ?? []}
      stats={{
        totalPending: totalPending ?? 0,
        postedThisWeek: postedThisWeek ?? 0,
        totalFound: totalFound ?? 0,
      }}
      lastScan={lastScan ?? null}
    />
  )
}
