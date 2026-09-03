'use client'

/**
 * The hero demo: a real AgentShift exchange, rendered with the same artifact
 * components the product uses. Not a screenshot and not a video — the actual UI,
 * so what the landing page promises is literally what ships.
 *
 * The scenario is deliberately the unglamorous one. An agent asks to book a showing;
 * the answer is no, because the buyer agreement is not signed. That is the moment
 * this product earns its place, and it is the moment no other tool covers.
 */

import { motion } from 'framer-motion'
import { KeyRound, Check } from 'lucide-react'
import ArtifactView from '@/components/shift/artifacts'
import type { Artifact } from '@/lib/artifacts'
import { runCma, type Comp, type Property } from '@/lib/cma'

const EASE = [0.22, 1, 0.36, 1] as const

const SUBJECT: Property = {
  address: '412 Alder Lane',
  beds: 4, baths: 2.5, sqft: 2400, lotSqft: 8000,
  yearBuilt: 2005, garageStalls: 2, condition: 3,
}

// Comps as an MLS export would give them. The value on screen is computed by the same
// engine the product runs, at render time — nothing here is a hard-coded number.
const COMPS: Comp[] = [
  { address: '388 Alder Ln',   beds: 4, baths: 2.5, sqft: 2350, lotSqft: 7800, yearBuilt: 2004, garageStalls: 2, condition: 3, soldPrice: 592_000, soldDate: '2026-07-15', daysOnMarket: 18, distanceMiles: 0.2 },
  { address: '1204 Birch Ct',  beds: 4, baths: 3,   sqft: 2500, lotSqft: 8200, yearBuilt: 2006, garageStalls: 2, condition: 4, soldPrice: 631_000, soldDate: '2026-06-02', daysOnMarket: 26, distanceMiles: 0.5 },
  { address: '77 Cedar Way',   beds: 3, baths: 2.5, sqft: 2280, lotSqft: 7400, yearBuilt: 2003, garageStalls: 2, condition: 3, soldPrice: 574_000, soldDate: '2026-05-20', daysOnMarket: 33, distanceMiles: 0.7 },
  { address: '19 Alder Pl',    beds: 4, baths: 2.5, sqft: 2420, lotSqft: 8100, yearBuilt: 2005, garageStalls: 2, condition: 3, soldPrice: 604_000, soldDate: '2026-08-01', daysOnMarket: 12, distanceMiles: 0.3 },
  { address: '902 Sumac Dr',   beds: 5, baths: 3.5, sqft: 3180, lotSqft: 9600, yearBuilt: 2016, garageStalls: 3, condition: 5, soldPrice: 812_000, soldDate: '2026-07-28', daysOnMarket: 9,  distanceMiles: 1.4 },
]

const NOW = new Date('2026-09-03T00:00:00Z')

const cmaArtifact: Artifact = {
  kind: 'cma',
  id: 'demo_cma',
  title: '412 Alder Lane',
  subtitle: '4 bed · 2.5 bath · 2,400 sqft',
  result: runCma(SUBJECT, COMPS, { annualAppreciation: 0.048, medianDom: 24, listToSaleRatio: 0.985 }, NOW),
}

const gateArtifact: Artifact = {
  kind: 'compliance',
  id: 'demo_gate',
  title: 'Showing blocked',
  subtitle: 'Dana Reyes · 88 Pine Avenue · Thursday 10:30',
  gate: { allowed: false, propertyAddress: '88 Pine Avenue', clientName: 'Dana Reyes' },
  report: {
    clear: false,
    score: 20,
    summary: '1 blocking issue on 88 Pine Avenue — resolve before proceeding.',
    blocking: [],
    checks: [
      {
        id: 'buyer_rep_signed',
        rule: 'Written buyer agreement before touring',
        severity: 'blocking',
        status: 'fail',
        detail: 'Dana Reyes has no signed buyer representation agreement. Touring 88 Pine Avenue without one is prohibited.',
        remedy: 'Send the buyer representation agreement for signature before this showing is confirmed.',
        authority: 'NAR settlement practice changes, effective 17 Aug 2024',
      },
      {
        id: 'agency_disclosure',
        rule: 'Agency disclosure delivered',
        severity: 'critical',
        status: 'pass',
        detail: 'Delivered 28 Aug 2026.',
      },
      {
        id: 'wire_fraud',
        rule: 'Wire fraud advisory delivered',
        severity: 'warning',
        status: 'pass',
        detail: 'Delivered at engagement.',
      },
    ],
  },
}

function Mark() {
  return (
    <div
      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
      style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
    >
      <KeyRound size={11} style={{ color: 'var(--color-accent)' }} />
    </div>
  )
}

function ToolChip({ label }: { label: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
      style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', color: 'var(--color-accent-soft)' }}
    >
      <Check size={10} strokeWidth={3} />
      {label}
    </div>
  )
}

function UserTurn({ text, delay }: { text: string; delay: number }) {
  return (
    <motion.div
      className="flex justify-end mb-4"
      initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: EASE }} viewport={{ once: true, margin: '-60px' }}
    >
      <div
        className="max-w-[82%] px-3.5 py-2 rounded-2xl rounded-tr-sm text-[13px] leading-relaxed"
        style={{ background: 'var(--color-accent)', color: '#04140e', fontWeight: 500 }}
      >
        {text}
      </div>
    </motion.div>
  )
}

function ShiftTurn({
  tool, artifact, children, delay,
}: {
  tool: string
  artifact: Artifact
  children: React.ReactNode
  delay: number
}) {
  return (
    <motion.div
      className="flex gap-2.5 mb-6"
      initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, delay, ease: EASE }} viewport={{ once: true, margin: '-60px' }}
    >
      <Mark />
      <div className="flex-1 min-w-0">
        <div className="mb-2"><ToolChip label={tool} /></div>
        <ArtifactView artifact={artifact} />
        <div className="text-[13px] leading-relaxed mt-1" style={{ color: 'var(--color-text)' }}>
          {children}
        </div>
      </div>
    </motion.div>
  )
}

export default function DemoThread() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(9,14,12,0.94)',
        border: '1px solid rgba(16,185,129,0.14)',
        boxShadow: '0 40px 90px rgba(0,0,0,0.6), 0 0 0 1px rgba(16,185,129,0.05)',
      }}
    >
      {/* Browser chrome */}
      <div
        className="flex items-center gap-1.5 px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)' }}
      >
        {['#ef4444', '#f59e0b', '#22c55e'].map(c => (
          <div key={c} className="w-2 h-2 rounded-full" style={{ background: c, opacity: 0.45 }} />
        ))}
        <div
          className="flex-1 mx-2 rounded flex items-center px-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', height: 18 }}
        >
          <span className="text-[10px]" style={{ color: 'var(--color-text-dim)' }}>agentshift.ai/shift</span>
        </div>
      </div>

      <div className="p-4 md:p-5">
        <UserTurn text="What's 412 Alder Lane worth? 4 bed, 2.5 bath, 2400 square feet." delay={0.05} />
        <ShiftTurn tool="Running the comparable analysis" artifact={cmaArtifact} delay={0.2}>
          Five sales in the last four months. The two on Alder needed under 3% adjustment — that
          is where the confidence comes from. 902 Sumac needed 34%: it&rsquo;s 3,180 square feet and
          fully renovated, so it stays on the grid as a bracket but carries almost none of the
          weight in that number.
        </ShiftTurn>

        <UserTurn text="Great. Book Dana Reyes in at 88 Pine on Thursday at 10:30." delay={0.1} />
        <ShiftTurn tool="Checking representation compliance" artifact={gateArtifact} delay={0.2}>
          I haven&rsquo;t booked it. Dana has no signed buyer representation agreement, and since
          August 2024 that has to be in place before a tour, not after. I&rsquo;ve drafted the
          agreement with your standard 2.5% — say the word and it goes out for signature, then
          I&rsquo;ll confirm Thursday.
        </ShiftTurn>
      </div>
    </div>
  )
}
