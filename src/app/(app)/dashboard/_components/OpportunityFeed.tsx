'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import OpportunityCard from './OpportunityCard'
import { Loader2, SearchX } from 'lucide-react'

type Opportunity = {
  id: string
  brand_id: string
  platform: string
  thread_url: string
  title: string
  body: string
  author: string
  subreddit?: string
  score: number
  score_reason: string
  drafted_reply: string
  status: string
  found_at: string
}

export default function OpportunityFeed({
  brandIds,
  filter,
}: {
  brandIds: string[]
  filter: string
}) {
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    let query = supabase
      .from('opportunities')
      .select('*')
      .in('brand_id', brandIds)
      .order('found_at', { ascending: false })
      .order('score', { ascending: false })
      .limit(50)

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data } = await query
    setOpps((data ?? []) as Opportunity[])
    setLoading(false)
  }, [brandIds, filter])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: string) {
    const supabase = createClient()
    await supabase.from('opportunities').update({
      status,
      ...(status === 'posted' ? { posted_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    setOpps(prev => prev.filter(o => o.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      </div>
    )
  }

  if (opps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <SearchX size={32} style={{ color: 'var(--color-text-dim)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {filter === 'pending' ? 'No pending opportunities — run a scan to find some' : `No ${filter} opportunities`}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {opps.map(opp => (
        <OpportunityCard key={opp.id} opp={opp} onStatusChange={updateStatus} />
      ))}
    </div>
  )
}
