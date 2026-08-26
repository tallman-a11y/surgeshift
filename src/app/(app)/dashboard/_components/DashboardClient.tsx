'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ScanSearch, Loader2, Zap, Target, CheckCircle2, TrendingUp, Bug, X } from 'lucide-react'
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

type ScanResult = {
  new_count: number
  total_scanned: number
  platforms?: { reddit: number; youtube: number; twitter: number }
}

type DiagResult = {
  env: Record<string, boolean>
  reddit: { count: number; error: string | null; sample: { title: string; url: string }[] }
  youtube: { count: number; error: string | null }
  twitter: { count: number; error: string | null }
  existingOpportunities: number
  braveProbe?: { status: number; resultCount: number; postCount: number; error: string | null }
  scoreTest?: { post: string; score: number; reason: string; error: string | null } | null
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
  const router = useRouter()
  const [scanning, startScan] = useTransition()
  const [diagnosing, startDiag] = useTransition()
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [diagResult, setDiagResult] = useState<DiagResult>(null)
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
          const data = await res.json() as ScanResult
          setScanResult(data)
          router.refresh()
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
          setScanError(err.error ?? `Scan failed (HTTP ${res.status})`)
        }
      } catch (e) {
        setScanError(e instanceof Error ? e.message : 'Scan failed — check your connection')
      }
    })
  }

  async function handleDiagnose() {
    if (!selectedBrandId) return
    setDiagResult(null)
    startDiag(async () => {
      try {
        const res = await fetch('/api/scan/debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId: selectedBrandId }),
        })
        if (res.ok) {
          const data = await res.json() as DiagResult
          setDiagResult(data)
        }
      } catch { /* ignore */ }
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
        <Link href="/brands/new" className="btn-accent mt-2">Add Your First Brand</Link>
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
              aria-label="Select brand"
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
            type="button"
            onClick={handleDiagnose}
            disabled={diagnosing || scanning}
            aria-label="Diagnose — see what each platform is returning"
            title="Diagnose — see what each platform is returning"
            style={{ padding: '0.45rem 0.65rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            {diagnosing ? <Loader2 size={14} className="animate-spin" /> : <Bug size={14} />}
          </button>
          <button
            type="button"
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
            Scan complete — {scanResult.new_count} new opportunities from {scanResult.total_scanned} posts scored
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

      {/* Diagnostics panel */}
      {diagResult && (
        <div className="mb-5 rounded-xl text-xs" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span className="font-semibold" style={{ color: 'var(--color-text)' }}>Scan Diagnostics</span>
            <button type="button" aria-label="Close diagnostics" onClick={() => setDiagResult(null)} style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
          <div className="px-4 py-3 grid gap-2">
            {/* Env vars */}
            <div className="flex gap-4 flex-wrap">
              {Object.entries(diagResult.env).map(([k, v]) => (
                <span key={k} style={{ color: v ? 'var(--color-green)' : '#ef4444' }}>
                  {v ? '✓' : '✗'} {k}
                </span>
              ))}
            </div>
            <div style={{ height: 1, background: 'var(--color-border)' }} />
            {/* Platform results */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>Reddit</div>
                <div style={{ color: diagResult.reddit.count > 0 ? 'var(--color-green)' : '#ef4444' }}>
                  {diagResult.reddit.count} posts
                </div>
                {diagResult.reddit.error && <div style={{ color: '#ef4444' }}>{diagResult.reddit.error}</div>}
                {diagResult.braveProbe && (
                  <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Brave: {diagResult.braveProbe.postCount} results
                    {diagResult.braveProbe.error && <span style={{ color: '#ef4444' }}> — {diagResult.braveProbe.error}</span>}
                  </div>
                )}
                {diagResult.reddit.sample.slice(0, 2).map((s, i) => (
                  <div key={i} style={{ color: 'var(--color-text-muted)', marginTop: 2 }} className="truncate">{s.title}</div>
                ))}
              </div>
              <div>
                <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>YouTube</div>
                <div style={{ color: diagResult.youtube.count > 0 ? 'var(--color-green)' : '#ef4444' }}>
                  {diagResult.youtube.count} posts
                </div>
                {diagResult.youtube.error && <div style={{ color: '#ef4444' }}>{diagResult.youtube.error}</div>}
              </div>
              <div>
                <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>X / Twitter</div>
                <div style={{ color: diagResult.twitter.count > 0 ? 'var(--color-green)' : '#ef4444' }}>
                  {diagResult.twitter.count} posts
                </div>
                {diagResult.twitter.error && <div style={{ color: '#ef4444' }}>{diagResult.twitter.error}</div>}
              </div>
            </div>
            {diagResult.scoreTest && (
              <>
                <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />
                <div>
                  <span className="font-medium" style={{ color: 'var(--color-text)' }}>Score test — </span>
                  <span style={{ color: 'var(--color-text-muted)' }}>&quot;{diagResult.scoreTest.post}&quot;</span>
                </div>
                {diagResult.scoreTest.error
                  ? <div style={{ color: '#ef4444' }}>Claude error: {diagResult.scoreTest.error}</div>
                  : <div style={{ color: diagResult.scoreTest.score >= 30 ? 'var(--color-green)' : '#ef4444' }}>
                      Score: {diagResult.scoreTest.score} — {diagResult.scoreTest.reason}
                    </div>
                }
              </>
            )}
            <div style={{ color: 'var(--color-text-muted)', marginTop: 2 }}>
              {diagResult.existingOpportunities} opportunities already in DB (already-seen posts are skipped)
            </div>
          </div>
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
            type="button"
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
