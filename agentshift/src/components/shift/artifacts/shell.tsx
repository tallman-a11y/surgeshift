'use client'

import type { ReactNode } from 'react'

/** The frame every artifact sits in, so a CMA and a net sheet read as one system. */
export function Frame({
  title, subtitle, badge, footer, children,
}: {
  title: string
  subtitle?: string
  badge?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="artifact">
      <div className="artifact-head">
        <div className="min-w-0">
          <div className="artifact-title">{title}</div>
          {subtitle && <div className="artifact-sub">{subtitle}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      <div className="artifact-body">{children}</div>
      {footer && <div className="artifact-foot">{footer}</div>}
    </div>
  )
}

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'grey'

export function Chip({ tone = 'grey', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`a-chip a-chip-${tone}`}>{children}</span>
}

export function Row({
  label, value, note, tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'pos' | 'neg'
}) {
  return (
    <div className="a-row">
      <div className="min-w-0">
        <div className="a-row-label">{label}</div>
        {note && <div className="a-row-note">{note}</div>}
      </div>
      <div className={`a-row-value shrink-0 ${tone === 'pos' ? 'a-num-pos' : tone === 'neg' ? 'a-num-neg' : ''}`}>
        {value}
      </div>
    </div>
  )
}

export function Meter({ pct, tone = 'green' }: { pct: number; tone?: Tone }) {
  const color = tone === 'red' ? '#f87171' : tone === 'amber' ? '#fbbf24'
    : tone === 'blue' ? '#38bdf8' : '#10b981'
  return (
    <div className="a-meter">
      <div
        className="a-meter-fill"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  )
}

export function Tile({
  label, value, note, tone,
}: {
  label: string
  value: string
  note?: string
  tone?: Tone
}) {
  const color = tone === 'red' ? '#f87171' : tone === 'amber' ? '#fbbf24'
    : tone === 'blue' ? '#38bdf8' : tone === 'grey' ? 'var(--color-text)' : 'var(--color-accent-soft)'
  return (
    <div className="a-tile">
      <div className="a-tile-value" style={{ color }}>{value}</div>
      <div className="a-tile-label">{label}</div>
      {note && <div className="a-tile-note">{note}</div>}
    </div>
  )
}

/** Confidence and score colours are the same everywhere, so they read consistently. */
export function scoreTone(score: number): Tone {
  if (score >= 75) return 'green'
  if (score >= 50) return 'amber'
  return 'red'
}
