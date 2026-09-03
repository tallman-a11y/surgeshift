'use client'

/**
 * The generative UI registry.
 *
 * One renderer per artifact kind. The agent decides what to show by which tool it
 * runs; this file decides how it looks. Adding a capability to AgentShift means a
 * tool, an artifact variant, and a renderer here — nothing else.
 */

import { useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, Clock, TrendingUp,
  Home, Phone, Copy, Check, ChevronDown, CircleDot, Ban,
} from 'lucide-react'
import type {
  Artifact, CmaArtifact, SellerNetArtifact, BuyerCostArtifact, ComplianceArtifact,
  TimelineArtifact, PipelineArtifact, ForecastArtifact, LeadQueueArtifact,
  SphereArtifact, ListingsArtifact, ContactsArtifact, ContentArtifact,
  MetricsArtifact, ShowingsArtifact, ChecklistArtifact,
} from '@/lib/artifacts'
import { usd, usdShort, round } from '@/lib/money'
import { relativeDay, timeAgo } from '@/lib/utils'
import { Frame, Chip, Row, Meter, Tile, scoreTone, type Tone } from './shell'

export default function ArtifactView({ artifact }: { artifact: Artifact }) {
  switch (artifact.kind) {
    case 'cma':         return <CmaView a={artifact} />
    case 'seller_net':  return <SellerNetView a={artifact} />
    case 'buyer_cost':  return <BuyerCostView a={artifact} />
    case 'compliance':  return <ComplianceView a={artifact} />
    case 'timeline':    return <TimelineView a={artifact} />
    case 'pipeline':    return <PipelineView a={artifact} />
    case 'forecast':    return <ForecastView a={artifact} />
    case 'lead_queue':  return <LeadQueueView a={artifact} />
    case 'sphere':      return <SphereView a={artifact} />
    case 'listings':    return <ListingsView a={artifact} />
    case 'contacts':    return <ContactsView a={artifact} />
    case 'content':     return <ContentView a={artifact} />
    case 'metrics':     return <MetricsView a={artifact} />
    case 'showings':    return <ShowingsView a={artifact} />
    case 'checklist':   return <ChecklistView a={artifact} />
  }
}

// ── CMA ─────────────────────────────────────────────────────────────────────────

function CmaView({ a }: { a: CmaArtifact }) {
  const [openGrid, setOpenGrid] = useState(false)
  const r = a.result

  if (r.indicatedValue === 0) {
    return (
      <Frame title={a.title} subtitle={a.subtitle} badge={<Chip tone="red">No value</Chip>}>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {r.confidenceReasons[0]}
        </p>
      </Frame>
    )
  }

  const usable = r.comps.filter(c => c.grossAdjustmentPct < 0.4)

  return (
    <Frame
      title={a.title}
      subtitle={a.subtitle}
      badge={<Chip tone={scoreTone(r.confidence)}>{r.confidence}% confidence</Chip>}
      footer={
        <span>
          {usable.length} comp{usable.length === 1 ? '' : 's'} used
          {r.excluded.length > 0 && ` · ${r.excluded.length} excluded`}
          {' · '}est. {r.estimatedDom} days on market
        </span>
      }
    >
      <div className="a-hero land-gradient-text">{usd(r.indicatedValue)}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
        Indicated value · {usd(r.low)}–{usd(r.high)} · {usd(r.pricePerSqft)}/sqft
      </div>

      <div className="mt-3 p-2.5 rounded-lg" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)' }}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold" style={{ color: 'var(--color-gold)' }}>Suggested list price</span>
          <span className="text-base font-extrabold tabular-nums" style={{ color: 'var(--color-gold)' }}>{usd(r.suggestedList)}</span>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {r.confidenceReasons.map((reason, i) => (
          <div key={i} className="flex gap-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            <CircleDot size={10} className="shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
            <span>{reason}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpenGrid(v => !v)}
        className="mt-3 flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: 'var(--color-accent-soft)' }}
      >
        <ChevronDown size={12} style={{ transform: openGrid ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
        {openGrid ? 'Hide' : 'Show'} the adjustment grid
      </button>

      {openGrid && (
        <div className="a-scroll mt-2">
          <table className="a-table">
            <thead>
              <tr>
                <th>Comparable</th><th>Sold</th><th>Date</th>
                <th>Net adj.</th><th>Gross</th><th>Adjusted</th>
              </tr>
            </thead>
            <tbody>
              {r.comps.map((c, i) => (
                <tr key={i} style={c.grossAdjustmentPct >= 0.4 ? { opacity: 0.45 } : undefined}>
                  <td>
                    {c.comp.address}
                    {c.warning && (
                      <div className="a-row-note" style={{ whiteSpace: 'normal', maxWidth: 220 }}>{c.warning}</div>
                    )}
                  </td>
                  <td>{usdShort(c.comp.soldPrice)}</td>
                  <td>{c.comp.soldDate.slice(0, 10)}</td>
                  <td className={c.netAdjustment >= 0 ? 'a-num-pos' : 'a-num-neg'}>
                    {c.netAdjustment >= 0 ? '+' : '−'}{usdShort(Math.abs(c.netAdjustment))}
                  </td>
                  <td style={{ color: c.grossAdjustmentPct >= 0.25 ? '#fbbf24' : 'var(--color-text-muted)' }}>
                    {Math.round(c.grossAdjustmentPct * 100)}%
                  </td>
                  <td className="font-semibold">{usd(c.adjustedValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
            Adjustments are applied to each comp to make it resemble the subject. Gross adjustment
            is the comparability signal: past 25% a comp only brackets the value, past 40% it is
            dropped. This is not an appraisal.
          </p>
          {r.excluded.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-dim)' }}>
                Excluded
              </div>
              {r.excluded.map((e, i) => (
                <div key={i} className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {e.comp.address} — {e.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Frame>
  )
}

// ── Money ───────────────────────────────────────────────────────────────────────

function SellerNetView({ a }: { a: SellerNetArtifact }) {
  const r = a.result
  return (
    <Frame
      title={a.title}
      subtitle={a.subtitle}
      footer={<span>Every extra $1,000 on the price is worth {usd(r.marginalPerThousand)} after costs.</span>}
    >
      <div className="a-hero" style={{ color: r.netProceeds >= 0 ? 'var(--color-accent-soft)' : '#f87171' }}>
        {usd(r.netProceeds)}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
        Net proceeds · {round(r.netPct * 100, 1)}% of the {usd(r.salePrice)} sale price
      </div>

      <div className="mt-3">
        {r.lines.map((l, i) => (
          <Row key={i} label={l.label} value={`−${usd(l.amount)}`} note={l.note} tone="neg" />
        ))}
      </div>

      {a.scenarios && a.scenarios.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border-bright)' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
            At other prices
          </div>
          {a.scenarios.map((s, i) => (
            <Row key={i} label={s.label} value={usd(s.netProceeds)} />
          ))}
        </div>
      )}
    </Frame>
  )
}

function BuyerCostView({ a }: { a: BuyerCostArtifact }) {
  const r = a.result
  const m = r.monthly
  return (
    <Frame title={a.title} subtitle={a.subtitle} footer={<span>Estimates use typical third-party fees. The lender&rsquo;s Loan Estimate governs.</span>}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="a-hero land-gradient-text">{usd(r.cashToClose)}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Cash to close</div>
        </div>
        <div>
          <div className="a-hero" style={{ color: 'var(--color-text)' }}>{usd(m.total)}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Per month, all in</div>
        </div>
      </div>

      <div className="mt-3">
        <Row label="Down payment" value={usd(r.downPayment)} note={`On a ${usd(r.loanAmount)} loan`} />
        <Row label="Closing costs" value={usd(r.totalClosingCosts)} />
        <Row label="Prepaids & escrow reserves" value={usd(r.totalPrepaids)} />
        {r.credits.map((c, i) => (
          <Row key={i} label={c.label} value={`−${usd(c.amount)}`} tone="pos" />
        ))}
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border-bright)' }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
          Monthly payment
        </div>
        <Row label="Principal & interest" value={usd(m.principalAndInterest)} />
        {m.tax > 0 && <Row label="Property tax" value={usd(m.tax)} />}
        {m.insurance > 0 && <Row label="Insurance" value={usd(m.insurance)} />}
        {m.pmi > 0 && <Row label="Mortgage insurance" value={usd(m.pmi)} note="Under 20% down" />}
        {m.hoa > 0 && <Row label="HOA" value={usd(m.hoa)} />}
      </div>
    </Frame>
  )
}

// ── Compliance ──────────────────────────────────────────────────────────────────

const SEVERITY_TONE: Record<string, Tone> = {
  blocking: 'red', critical: 'red', warning: 'amber', info: 'blue',
}

function ComplianceView({ a }: { a: ComplianceArtifact }) {
  const r = a.report
  const blocked = a.gate ? !a.gate.allowed : !r.clear
  const failing = r.checks.filter(c => c.status !== 'pass')
  const passing = r.checks.filter(c => c.status === 'pass')

  return (
    <Frame
      title={a.title}
      subtitle={a.subtitle}
      badge={<Chip tone={blocked ? 'red' : r.clear ? 'green' : 'amber'}>
        {blocked ? 'Blocked' : r.clear ? 'Clear' : 'Review'}
      </Chip>}
      footer={<span>Compliance guidance, not legal advice. State and local rules stack on top. Confirm anything unusual with your broker.</span>}
    >
      {blocked && a.gate && (
        <div
          className="flex gap-2 p-2.5 rounded-lg mb-3"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.28)' }}
        >
          <Ban size={15} className="shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <div className="text-xs leading-relaxed" style={{ color: '#fca5a5' }}>
            <strong>Do not book this showing.</strong> {a.gate.clientName} cannot tour {a.gate.propertyAddress} until
            the buyer representation agreement is in place. A written agreement is required before any tour under the
            NAR settlement practice changes effective 17 August 2024.
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1"><Meter pct={r.score} tone={scoreTone(r.score)} /></div>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{r.score}/100</span>
      </div>

      <div className="space-y-2">
        {failing.map(c => (
          <div key={c.id} className="flex gap-2">
            {c.status === 'fail'
              ? <ShieldAlert size={14} className="shrink-0 mt-0.5" style={{ color: c.severity === 'warning' ? '#fbbf24' : '#f87171' }} />
              : <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{c.rule}</span>
                <Chip tone={SEVERITY_TONE[c.severity] ?? 'grey'}>{c.severity}</Chip>
              </div>
              <div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{c.detail}</div>
              {c.remedy && (
                <div className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-accent-soft)' }}>→ {c.remedy}</div>
              )}
              {c.authority && (
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-dim)' }}>Source: {c.authority}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {passing.length > 0 && (
        <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
          {passing.map(c => (
            <div key={c.id} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
              <ShieldCheck size={11} className="shrink-0" style={{ color: '#4ade80' }} />
              <span>{c.rule}</span>
            </div>
          ))}
        </div>
      )}
    </Frame>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────────

function TimelineView({ a }: { a: TimelineArtifact }) {
  const r = a.result
  return (
    <Frame
      title={a.title}
      subtitle={a.subtitle}
      badge={<Chip tone={r.overdue.length > 0 ? 'red' : r.daysToClose < 7 ? 'amber' : 'green'}>
        {r.daysToClose >= 0 ? `${r.daysToClose} days to close` : `${Math.abs(r.daysToClose)} days past`}
      </Chip>}
      footer={
        r.conflicts.length > 0
          ? <span style={{ color: '#fbbf24' }}>{r.conflicts.join(' ')}</span>
          : <span>Business-day deadlines skip weekends and federal holidays.</span>
      }
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1"><Meter pct={r.progress * 100} /></div>
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          {Math.round(r.progress * 100)}%
        </span>
      </div>

      <div className="space-y-0.5">
        {r.milestones.map(m => {
          const tone = m.status === 'done' ? 'grey'
            : m.status === 'overdue' ? 'red'
            : m.status === 'due_today' ? 'amber'
            : 'grey'
          return (
            <div key={m.kind} className="flex items-center gap-2 py-1">
              {m.status === 'done'
                ? <CheckCircle2 size={13} className="shrink-0" style={{ color: '#4ade80' }} />
                : m.status === 'overdue'
                  ? <AlertTriangle size={13} className="shrink-0" style={{ color: '#f87171' }} />
                  : <Clock size={13} className="shrink-0" style={{ color: m.status === 'due_today' ? '#fbbf24' : 'var(--color-text-dim)' }} />}
              <div className="min-w-0 flex-1">
                <div
                  className="text-xs truncate"
                  style={{
                    color: m.status === 'done' ? 'var(--color-text-dim)' : 'var(--color-text)',
                    textDecoration: m.status === 'done' ? 'line-through' : undefined,
                    fontWeight: m.critical && m.status !== 'done' ? 600 : 400,
                  }}
                >
                  {m.label}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {m.critical && m.status !== 'done' && <Chip tone={tone}>critical</Chip>}
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                  {m.status === 'done' ? 'done' : relativeDay(m.daysAway)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}

// ── Pipeline & forecast ─────────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  lead: 'Lead', active_buyer: 'Active buyer', active_listing: 'Active listing',
  offer_out: 'Offer out', under_contract: 'Under contract',
  contingencies_cleared: 'Contingencies cleared', clear_to_close: 'Clear to close',
}

const STAGE_TONE: Record<string, Tone> = {
  lead: 'grey', active_buyer: 'blue', active_listing: 'blue', offer_out: 'amber',
  under_contract: 'green', contingencies_cleared: 'green', clear_to_close: 'green',
}

function PipelineView({ a }: { a: PipelineArtifact }) {
  return (
    <Frame
      title={a.title}
      subtitle={a.subtitle}
      badge={<Chip tone="green">{usdShort(a.totalVolume)}</Chip>}
    >
      <div className="space-y-1.5">
        {a.cards.map(c => (
          <div
            key={c.id}
            className="p-2.5 rounded-lg"
            style={{
              background: 'rgba(7,11,10,0.5)',
              border: `1px solid ${c.alert ? 'rgba(248,113,113,0.28)' : 'var(--color-border)'}`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>{c.label}</div>
                {c.address && <div className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{c.address}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-accent-soft)' }}>{usdShort(c.salePrice)}</div>
                <div className="text-[10px]" style={{ color: 'var(--color-text-dim)' }}>{c.expectedCloseDate || 'no close date'}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <Chip tone={STAGE_TONE[c.stage] ?? 'grey'}>{STAGE_LABEL[c.stage] ?? c.stage}</Chip>
              {c.alert && (
                <span className="text-[10px] font-semibold" style={{ color: '#f87171' }}>{c.alert}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function ForecastView({ a }: { a: ForecastArtifact }) {
  const r = a.result
  const max = Math.max(...r.byMonth.map(m => m.expected), 1)
  return (
    <Frame
      title={a.title}
      subtitle={a.subtitle}
      footer={<span>Plan against expected, never best case. Stage probabilities are deliberately conservative.</span>}
    >
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Committed" value={usdShort(r.committed)} note="Past contingencies" tone="green" />
        <Tile label="Expected" value={usdShort(r.expected)} note="Probability-weighted" />
        <Tile label="Best case" value={usdShort(r.bestCase)} note="Everything closes" tone="grey" />
      </div>

      {a.capProgress && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Company dollar toward cap</span>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text)' }}>
              {usdShort(a.capProgress.paid)} / {usdShort(a.capProgress.cap)}
            </span>
          </div>
          <Meter pct={(a.capProgress.paid / a.capProgress.cap) * 100} tone="amber" />
        </div>
      )}

      {r.byMonth.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {r.byMonth.map(m => (
            <div key={m.month} className="flex items-center gap-2">
              <span className="text-[11px] w-16 shrink-0 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{m.month}</span>
              <div className="flex-1"><Meter pct={(m.expected / max) * 100} /></div>
              <span className="text-[11px] w-16 text-right shrink-0 tabular-nums" style={{ color: 'var(--color-text)' }}>
                {usdShort(m.expected)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Frame>
  )
}

// ── People ──────────────────────────────────────────────────────────────────────

function LeadQueueView({ a }: { a: LeadQueueArtifact }) {
  return (
    <Frame title={a.title} subtitle={a.subtitle}>
      <div className="space-y-1.5">
        {a.leads.map(l => (
          <div key={l.id} className="p-2.5 rounded-lg" style={{ background: 'rgba(7,11,10,0.5)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{l.name}</span>
                  <Chip tone={l.grade === 'A' ? 'green' : l.grade === 'B' ? 'blue' : l.grade === 'C' ? 'amber' : 'grey'}>
                    {l.grade}
                  </Chip>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {l.source.replace(/_/g, ' ')} · {l.ageMinutes < 60 ? `${l.ageMinutes}m old` : `${Math.round(l.ageMinutes / 60)}h old`}
                  {' · '}{Math.round(l.contactProbability * 100)}% contact odds
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-extrabold tabular-nums" style={{ color: l.urgency >= 70 ? '#f87171' : l.urgency >= 40 ? '#fbbf24' : 'var(--color-text-muted)' }}>
                  {l.urgency}
                </div>
                <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>urgency</div>
              </div>
            </div>
            <div className="flex gap-1.5 mt-1.5 text-[11px]" style={{ color: 'var(--color-accent-soft)' }}>
              <Phone size={11} className="shrink-0 mt-0.5" />
              <span>{l.nextAction}</span>
            </div>
            {l.reasons.length > 0 && (
              <div className="text-[10px] mt-1" style={{ color: 'var(--color-text-dim)' }}>{l.reasons.slice(0, 2).join(' · ')}</div>
            )}
          </div>
        ))}
      </div>
    </Frame>
  )
}

function SphereView({ a }: { a: SphereArtifact }) {
  return (
    <Frame title={a.title} subtitle={a.subtitle}>
      <div className="space-y-1.5">
        {a.calls.map(c => (
          <div key={c.contact.id} className="p-2.5 rounded-lg" style={{ background: 'rgba(7,11,10,0.5)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{c.contact.name}</span>
                {c.occasion && (
                  <span className="ml-1.5"><Chip tone="amber">{c.occasion.label}</Chip></span>
                )}
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {c.reasons[0]?.why}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--color-accent-soft)' }}>{c.score}</div>
                {c.daysSinceTouch != null && (
                  <div className="text-[9px]" style={{ color: 'var(--color-text-dim)' }}>{c.daysSinceTouch}d ago</div>
                )}
              </div>
            </div>
            <div className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--color-accent-soft)' }}>{c.opener}</div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function ContactsView({ a }: { a: ContactsArtifact }) {
  return (
    <Frame title={a.title} subtitle={a.subtitle}>
      <div className="space-y-1">
        {a.contacts.map(c => (
          <div key={c.id} className="flex items-start justify-between gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(28,42,37,0.55)' }}>
            <div className="min-w-0">
              <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{c.name}</div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}
              </div>
              {c.context && <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-dim)' }}>{c.context}</div>}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <Chip tone="grey">{c.role.replace(/_/g, ' ')}</Chip>
              {c.lastTouchedAt && (
                <span className="text-[10px]" style={{ color: 'var(--color-text-dim)' }}>{timeAgo(c.lastTouchedAt)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ── Listings & showings ─────────────────────────────────────────────────────────

const LISTING_TONE: Record<string, Tone> = {
  coming_soon: 'blue', active: 'green', pending: 'amber',
  sold: 'grey', withdrawn: 'grey', expired: 'red',
}

function ListingsView({ a }: { a: ListingsArtifact }) {
  return (
    <Frame title={a.title} subtitle={a.subtitle}>
      <div className="space-y-1.5">
        {a.listings.map(l => (
          <div
            key={l.id}
            className="p-2.5 rounded-lg"
            style={{ background: 'rgba(7,11,10,0.5)', border: `1px solid ${l.alert ? 'rgba(251,191,36,0.28)' : 'var(--color-border)'}` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Home size={12} className="shrink-0" style={{ color: 'var(--color-text-dim)' }} />
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>{l.address}</span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {l.beds} bd · {l.baths} ba · {l.sqft.toLocaleString()} sqft
                  {l.daysOnMarket != null && ` · ${l.daysOnMarket} DOM`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-accent-soft)' }}>{usdShort(l.price)}</div>
                <Chip tone={LISTING_TONE[l.status] ?? 'grey'}>{l.status.replace(/_/g, ' ')}</Chip>
              </div>
            </div>
            {l.activity && (
              <div className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-dim)' }}>
                {l.activity.views ?? 0} views · {l.activity.saves ?? 0} saves · {l.activity.showings ?? 0} showings
              </div>
            )}
            {l.alert && (
              <div className="flex gap-1.5 mt-1.5 text-[11px]" style={{ color: '#fbbf24' }}>
                <TrendingUp size={11} className="shrink-0 mt-0.5" />
                <span>{l.alert}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </Frame>
  )
}

function ShowingsView({ a }: { a: ShowingsArtifact }) {
  return (
    <Frame title={a.title} subtitle={a.subtitle}>
      <div className="space-y-1">
        {a.slots.map(s => {
          const when = new Date(s.startsAt)
          return (
            <div key={s.id} className="flex items-start gap-2.5 py-1.5" style={{ borderBottom: '1px solid rgba(28,42,37,0.55)' }}>
              <div className="shrink-0 text-center w-12">
                <div className="text-[10px] uppercase" style={{ color: 'var(--color-text-dim)' }}>
                  {when.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>
                  {when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>{s.address}</div>
                <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {s.clientName} · {s.durationMinutes} min
                </div>
                {s.blockedReason && (
                  <div className="text-[11px] mt-0.5" style={{ color: '#f87171' }}>{s.blockedReason}</div>
                )}
              </div>
              <Chip tone={s.status === 'blocked' ? 'red' : s.status === 'confirmed' ? 'green' : s.status === 'completed' ? 'grey' : 'amber'}>
                {s.status}
              </Chip>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}

// ── Content ─────────────────────────────────────────────────────────────────────

function ContentView({ a }: { a: ContentArtifact }) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const variant = a.variants[active]
  const critical = a.fairHousing.filter(f => f.severity === 'critical')

  async function copy() {
    try {
      await navigator.clipboard.writeText(variant.body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard unavailable — the text is still selectable */ }
  }

  return (
    <Frame
      title={a.title}
      subtitle={a.subtitle}
      badge={<Chip tone={critical.length > 0 ? 'red' : 'green'}>
        {critical.length > 0 ? `${critical.length} fair housing` : 'Fair housing clear'}
      </Chip>}
      footer={<span>Drafted, not sent. Nothing is published until you publish it.</span>}
    >
      {a.variants.length > 1 && (
        <div className="flex gap-1 mb-2 overflow-x-auto scrollbar-none">
          {a.variants.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className="text-[11px] font-semibold px-2 py-1 rounded-md whitespace-nowrap transition-colors"
              style={{
                background: i === active ? 'rgba(16,185,129,0.12)' : 'transparent',
                border: `1px solid ${i === active ? 'rgba(16,185,129,0.3)' : 'var(--color-border)'}`,
                color: i === active ? 'var(--color-accent-soft)' : 'var(--color-text-muted)',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <pre className="a-pre">{variant.body}</pre>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] tabular-nums" style={{ color: variant.charLimit && variant.body.length > variant.charLimit ? '#fbbf24' : 'var(--color-text-dim)' }}>
          {variant.body.length}{variant.charLimit ? ` / ${variant.charLimit}` : ''} characters
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: copied ? '#4ade80' : 'var(--color-accent-soft)' }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {a.fairHousing.length > 0 && (
        <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>
            Fair housing scan
          </div>
          {a.fairHousing.map((f, i) => (
            <div key={i} className="flex gap-1.5">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" style={{ color: f.severity === 'critical' ? '#f87171' : f.severity === 'warning' ? '#fbbf24' : '#38bdf8' }} />
              <div className="min-w-0">
                <div className="text-[11px]" style={{ color: 'var(--color-text)' }}>
                  <span className="font-semibold">&ldquo;{f.term}&rdquo;</span>
                  <span style={{ color: 'var(--color-text-dim)' }}> — {f.category}</span>
                </div>
                <div className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{f.why}</div>
                <div className="text-[10px] leading-relaxed" style={{ color: 'var(--color-accent-soft)' }}>→ {f.suggestion}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Frame>
  )
}

// ── Metrics & checklist ─────────────────────────────────────────────────────────

function MetricsView({ a }: { a: MetricsArtifact }) {
  const max = Math.max(...(a.breakdown ?? []).map(b => b.value), 1)
  return (
    <Frame title={a.title} subtitle={a.subtitle}>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))' }}>
        {a.tiles.map((t, i) => (
          <Tile
            key={i}
            label={t.label}
            value={t.value}
            note={t.note}
            tone={t.value === '0' ? 'grey' : undefined}
          />
        ))}
      </div>

      {a.breakdown && a.breakdown.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          {a.breakdownTitle && (
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
              {a.breakdownTitle}
            </div>
          )}
          <div className="space-y-1.5">
            {a.breakdown.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] w-24 shrink-0 truncate" style={{ color: 'var(--color-text-muted)' }}>{b.label}</span>
                <div className="flex-1"><Meter pct={(b.value / max) * 100} /></div>
                <span className="text-[11px] w-14 text-right shrink-0 tabular-nums" style={{ color: 'var(--color-text)' }}>{b.display}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Frame>
  )
}

function ChecklistView({ a }: { a: ChecklistArtifact }) {
  const done = a.items.filter(i => i.done).length
  return (
    <Frame
      title={a.title}
      subtitle={a.subtitle}
      badge={<Chip tone={done === a.items.length ? 'green' : 'amber'}>{done}/{a.items.length}</Chip>}
    >
      <div className="space-y-1">
        {a.items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 py-1">
            {item.done
              ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
              : <CircleDot size={13} className="shrink-0 mt-0.5" style={{ color: item.critical ? '#f87171' : 'var(--color-text-dim)' }} />}
            <div className="min-w-0 flex-1">
              <div
                className="text-xs"
                style={{
                  color: item.done ? 'var(--color-text-dim)' : 'var(--color-text)',
                  textDecoration: item.done ? 'line-through' : undefined,
                }}
              >
                {item.label}
              </div>
              {item.detail && <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{item.detail}</div>}
            </div>
            {item.due && <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-dim)' }}>{item.due}</span>}
          </div>
        ))}
      </div>
    </Frame>
  )
}
