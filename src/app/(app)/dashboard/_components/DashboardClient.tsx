'use client'

import { useState, useTransition } from 'react'
import { ScanSearch, Loader2, Zap, Target, CheckCircle2, TrendingUp } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import OpportunityFeed from './OpportunityFeed'

type Brand = {
  id: string
  name: string
  url: string
  tagline?: string
}

type Stats = {
  totalPending: number
  postedThisWeek: number
  totalFound: number
}

type LastScan = {
  ran_at: string
  opportunities_found: number
} | null

export default function DashboardClient({
  brands,
  stats,
  lastScan,
}: {
  brands: Brand[]
  stats: Stats
  lastScan: LastScan
}) {
  const [scanning, startScan] = useTransition()
  const [scanResult, setScanResult] = useState<{ new_count: number; total_scanned: number; platforms?: { reddit: number; youtube: number; twitter: number } } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [selectedBrandId, setSelectedBrandId] = useState<string>(brands[0]?.id ?? '')
  const [filter, setFilter] = useState<'all' | 'pending' | 'posted' | 'dismissed'>('pending')

  async function handleScan() {
    if (!selectedBrandId) return
    setScanResult(null)
    setScanError(null)
    startScan(async () => {
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId: selectedBrandId }),
        })
        if (res.ok) {
          const data = await res.json() as { new_count: number; total_scanned: number; platforms?: { reddit: number; youtube: number; twitter: number } }
          setScanResult(data)
          window.location.reload()
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
          setScanError(err.error ?? `Scan failed (HTTP ${res.status})`)
        }
      } catch (e) {
        setScanError(e instanceof Error ? e.message : 'Scan failed — check your connection')
      }
    })
  }

  if (brands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2" style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)' }}>
          <Zap size={24} style={{ color: 'var(--color-accent)' }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>No brands yet</h2>
        <p className="text-sm max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
          Add your first brand to start scanning social media for high-intent opportunities.
        </p>
        <a href="/brands/new" className="btn-accent mt-2">Add Your First Brand</a>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Opportunities</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {lastScan
              ? `Last scan ${timeAgo(lastScan.ran_at)} · ${lastScan.opportunities_found} new found`
              : 'No scans run yet — hit Scan to find opportunities'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {brands.length > 1 && (
            <select
              value={selectedBrandId}
              onChange={e => setSelectedBrandId(e.target.value)}
              style={{ width: 'auto', padding: '0.45rem 0.75rem' }}
            >
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button
            className="btn-accent"
            onClick={handleScan}
            disabled={scanning || !selectedBrandId}
          >
            {scanning
              ? <><Loader2 size={14} className="animate-spin" /> Scanning…</>
              : <><ScanSearch size={14} /> Scan Now</>
            }
          </button>
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: 'var(--color-green)' }}>
          <CheckCircle2 size={16} />
          <span>
            Scan complete — {scanResult.new_count} new opportunities from {scanResult.total_scanned} posts
            {scanResult.platforms && (
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                {' '}(Reddit {scanResult.platforms.reddit} · YouTube {scanResult.platforms.youtube} · X {scanResult.platforms.twitter})
              </span>
            )}
          </span>
        </div>
      )}

      {/* Scan error banner */}
      {scanError && (
        <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
          <ScanSearch size={16} />
          Scan failed: {scanError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending', value: stats.totalPending, icon: Target, color: 'var(--color-accent)' },
          { label: 'Posted This Week', value: stats.postedThisWeek, icon: CheckCircle2, color: 'var(--color-green)' },
          { label: 'Total Found', value: stats.totalFound, icon: TrendingUp, color: 'var(--color-amber)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl p-4 surface">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} style={{ color }} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {(['pending', 'posted', 'dismissed', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all"
            style={filter === f ? { background: 'var(--color-accent)', color: 'white' } : { color: 'var(--color-text-muted)' }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Opportunity Feed */}
      <OpportunityFeed brandIds={brands.map(b => b.id)} filter={filter} />
    </div>
  )
}
