'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight, ShieldCheck, Users, Home, Calculator, CalendarCheck, FileCheck2,
  Megaphone, MapPinned, DoorOpen, Wallet, LineChart, Handshake, MessageSquare,
  KeyRound, Menu, X, Check, Sparkles,
} from 'lucide-react'
import DemoThread from './_components/DemoThread'

const EASE = [0.22, 1, 0.36, 1] as const

const navLinks = [
  { label: 'What it replaces', href: '#replaces' },
  { label: 'What it does', href: '#pillars' },
  { label: 'Compliance', href: '#compliance' },
]

/**
 * The stack a working agent actually pays for. Prices are the typical published
 * range for a solo agent or small team in 2026 — they move constantly and vary by
 * market, so the page says representative rather than quoting anyone exactly.
 */
const STACK = [
  { category: 'CRM & lead management',   examples: 'Follow Up Boss, BoldTrail, Lofty, Wise Agent', low: 49,  high: 499 },
  { category: 'Lead generation',         examples: 'Zillow Premier Agent, Ylopo, CINC, Real Geeks', low: 300, high: 1000 },
  { category: 'IDX website',             examples: 'Sierra Interactive, Showcase IDX, Luxury Presence', low: 60, high: 500 },
  { category: 'CMA & valuation',         examples: 'Cloud CMA, RPR, ToolkitCMA',                  low: 0,   high: 99 },
  { category: 'Transaction management',  examples: 'Dotloop, SkySlope, Brokermint',               low: 30,  high: 100 },
  { category: 'E-signature',             examples: 'DocuSign, Authentisign',                      low: 15,  high: 65 },
  { category: 'Showing scheduling',      examples: 'ShowingTime, Calendly',                       low: 0,   high: 40 },
  { category: 'Video & email marketing', examples: 'BombBomb, Mailchimp, Constant Contact',       low: 30,  high: 150 },
  { category: 'Design & collateral',     examples: 'Canva Pro, Adobe Express',                    low: 15,  high: 60 },
  { category: 'Social scheduling',       examples: 'Later, Buffer, Hootsuite',                    low: 15,  high: 99 },
  { category: 'Prospecting data',        examples: 'REDX, Vulcan7, Espresso Agent',               low: 60,  high: 200 },
  { category: 'Open house sign-in',      examples: 'Spacio, Curb Hero',                           low: 0,   high: 50 },
  { category: 'Back office & commission',examples: 'Loft47, Brokermint, a spreadsheet',           low: 0,   high: 80 },
  { category: 'Compliance & audit',      examples: 'Broker checklists, a folder of PDFs',         low: 0,   high: 60 },
]

const PILLARS = [
  { Icon: Users,        title: 'CRM & sphere intelligence',
    body: 'Not a database that stores names — one that tells you the Hendersons hit eleven years in the house last week, which is when people in their bracket move, and gives you the opening line.' },
  { Icon: MessageSquare, title: 'Lead triage in seconds, not hours',
    body: 'Ranked by urgency rather than quality, because a portal lead ninety seconds old beats a better one that was called an hour ago. Contact odds are shown on every card.' },
  { Icon: Calculator,   title: 'CMA with a real adjustment grid',
    body: 'Appraisal-style adjustments for size, age, condition, and market movement — with the gross-adjustment figure that says which comps actually support the value and which just bracket it.' },
  { Icon: Wallet,       title: 'Net sheets & cash to close',
    body: 'Seller proceeds and buyer cash, with the listing fee and buyer-broker compensation as the separate negotiated lines they now are. Plus what another $1,000 on the price is really worth.' },
  { Icon: CalendarCheck,title: 'Showings, gated on compliance',
    body: 'Scheduling that checks the buyer representation agreement before it books, and refuses when there is not one. The gate lives in the code, not on a checklist.' },
  { Icon: FileCheck2,   title: 'Contract to close, counted correctly',
    body: 'Every critical date derived from the contract — business days skipping weekends and federal holidays, which is exactly where hand-counted deadlines go wrong.' },
  { Icon: ShieldCheck,  title: 'Compliance that blocks, not nags',
    body: 'Buyer agreements, the compensation ceiling, no offers of compensation in the MLS, lead paint on pre-1978, square footage against the tax record, TCPA and Do-Not-Call before any outreach.' },
  { Icon: Megaphone,    title: 'Marketing, fair-housing screened',
    body: 'Listing remarks, social, email, video scripts and flyers in your voice — every word scanned for steering and protected-class language before you ever see it.' },
  { Icon: Home,         title: 'Listings that tell you when to talk price',
    body: 'A listing forty days into a twenty-four-day market with no showings is a price conversation, not another open house. It says so.' },
  { Icon: MapPinned,    title: 'Farming & prospecting',
    body: 'Geographic farms, absentee owners, expireds and FSBOs — scrubbed against consent and the Do-Not-Call registry before a single number is dialled.' },
  { Icon: DoorOpen,     title: 'Open houses that capture consent',
    body: 'Digital sign-in that records written contact consent at the door, where it has to happen, then routes every visitor into triage.' },
  { Icon: LineChart,    title: 'Back office & commission forecast',
    body: 'Splits, caps in company dollar, franchise royalty, referral fees and team splits in the right order — and a probability-weighted forecast you can actually plan against.' },
  { Icon: Handshake,    title: 'Your partner bench, connected',
    body: 'Lenders, inspectors, title and photographers on one bench — and a lender on LendShift receives the handoff as a real referral instead of a text message.' },
  { Icon: Sparkles,     title: 'It remembers how you work',
    body: 'How you price, who your sphere is, which scripts land, what you always forget. The Shift memory spine carries it across every session.' },
]

const DIFFERENTIATORS = [
  { title: 'One conversation, not twelve tabs',
    body: 'There is no navigation to learn. You ask; it does the work and shows you the result. The interface is generated to fit the answer, so a valuation arrives as a grid and a deadline arrives as a timeline.' },
  { title: 'It does the work, then tells you',
    body: 'Other tools give you a place to do the work yourself. AgentShift runs the analysis, drafts the copy, checks the rule, and hands you the decision — which is the only part that needed you.' },
  { title: 'It says no',
    body: 'The showing that would breach your buyer agreement does not get booked. The copy with steering language does not get published. A tool that only ever agrees with you is not protecting your licence.' },
]

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ position: 'relative', zIndex: 1, padding: '5.5rem 1.5rem' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>{children}</div>
    </section>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="land-glass land-pill-eyebrow inline-flex items-center rounded-full mb-5">
      <span className="text-[0.72rem] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--color-accent-soft)' }}>
        {children}
      </span>
    </div>
  )
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const stackLow = STACK.reduce((s, t) => s + t.low, 0)
  const stackHigh = STACK.reduce((s, t) => s + t.high, 0)

  return (
    <div style={{ background: 'var(--color-background)', color: 'var(--color-text)', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <motion.nav
        initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: scrolled ? 'rgba(7,11,10,0.88)' : 'transparent',
          borderBottom: `1px solid ${scrolled ? 'rgba(16,185,129,0.1)' : 'transparent'}`,
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
          transition: 'background 0.4s, border-color 0.4s',
        }}
      >
        <div className="land-nav-inner" style={{ maxWidth: 1140, margin: '0 auto', padding: '0 1.5rem' }}>
          <div className="hidden md:flex items-center gap-7">
            {navLinks.map(l => (
              <a key={l.href} href={l.href} className="text-sm no-underline transition-colors"
                style={{ color: 'rgba(230,239,236,0.45)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(230,239,236,0.45)' }}
              >{l.label}</a>
            ))}
          </div>
          <button type="button" className="flex md:hidden bg-transparent border-0 p-0 cursor-pointer"
            style={{ color: 'rgba(230,239,236,0.5)' }} onClick={() => setMobileOpen(o => !o)} aria-label="Menu">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <a href="#" className="flex items-center justify-center gap-2 no-underline">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <KeyRound size={15} style={{ color: 'var(--color-accent)' }} />
            </div>
            <span className="land-gradient-text font-extrabold text-lg tracking-tight">AgentShift</span>
          </a>

          <div className="hidden md:flex items-center justify-end gap-3">
            <Link href="/login" className="text-sm no-underline" style={{ color: 'rgba(230,239,236,0.42)' }}>Sign in</Link>
            <Link href="/login" className="land-gradient-btn inline-flex items-center gap-1.5 no-underline rounded-full px-5 py-2 text-sm font-bold"
              style={{ color: '#04140e' }}>
              Get started <ArrowRight size={13} />
            </Link>
          </div>
          <div className="flex md:hidden" />
        </div>

        {mobileOpen && (
          <div className="flex flex-col gap-4 px-6 py-5"
            style={{ background: 'rgba(7,11,10,0.97)', borderBottom: '1px solid rgba(16,185,129,0.1)', backdropFilter: 'blur(20px)' }}>
            {navLinks.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                className="text-[0.95rem] no-underline" style={{ color: 'rgba(230,239,236,0.6)' }}>{l.label}</a>
            ))}
            <div className="flex flex-col gap-3 pt-4" style={{ borderTop: '1px solid rgba(16,185,129,0.1)' }}>
              <Link href="/login" className="text-[0.95rem] no-underline text-center" style={{ color: 'rgba(230,239,236,0.45)' }}>Sign in</Link>
              <Link href="/login" className="land-gradient-btn flex justify-center items-center gap-1.5 no-underline rounded-full py-3 text-[0.95rem] font-bold"
                style={{ color: '#04140e' }}>Get started <ArrowRight size={14} /></Link>
            </div>
          </div>
        )}
      </motion.nav>

      {/* ── HERO ── */}
      <section className="relative flex flex-col items-center overflow-hidden">
        <div className="land-hero-ambient absolute inset-0" />
        <div className="land-dot-grid absolute inset-0" style={{ opacity: 0.26 }} />
        <div className="land-orb absolute" style={{ top: '4%', left: '2%', width: 620, height: 620, background: 'rgba(16,185,129,0.07)' }} />
        <div className="land-orb land-orb-2 absolute" style={{ bottom: '12%', right: '1%', width: 520, height: 520, background: 'rgba(251,191,36,0.045)' }} />

        <div
          className="relative z-10 w-full flex flex-col items-center text-center"
          style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem', paddingTop: 'clamp(9rem, 17vh, 12rem)', paddingBottom: '3rem' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="land-glass land-pill-eyebrow inline-flex items-center gap-2 rounded-full mb-9"
          >
            <span className="w-1.5 h-1.5 rounded-full block" style={{ background: 'var(--color-accent-soft)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
            <span className="text-[0.78rem] font-semibold tracking-wide" style={{ color: 'var(--color-accent-soft)' }}>
              The real estate operating system
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.08, ease: EASE }}
            style={{ fontSize: 'clamp(2.7rem, 7.5vw, 6rem)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.0, marginBottom: '2rem' }}
          >
            Close the<br /><span className="land-gradient-text">other tabs.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.16, ease: EASE }}
            style={{ fontSize: 'clamp(1rem, 2.1vw, 1.22rem)', color: 'rgba(230,239,236,0.44)', maxWidth: 620, lineHeight: 1.72, marginBottom: '2.75rem' }}
          >
            Your CRM, your CMA tool, your transaction coordinator, your compliance checklist, your
            marketing team and your back office — one conversation that does the work and shows you
            the result.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
            className="flex flex-wrap justify-center gap-4 mb-9"
          >
            <Link href="/login" className="land-gradient-btn land-glow-sm inline-flex items-center gap-2 no-underline rounded-full font-extrabold"
              style={{ color: '#04140e', padding: '1rem 2.5rem', fontSize: '1.05rem' }}>
              Start free <ArrowRight size={16} />
            </Link>
            <a href="#replaces" className="land-glass inline-flex items-center no-underline rounded-full font-semibold"
              style={{ color: 'rgba(230,239,236,0.55)', padding: '1rem 2rem', fontSize: '1.05rem' }}>
              See what it replaces
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.32 }}
            className="flex flex-wrap justify-center gap-2"
          >
            {[
              'Compliant with the 2024 practice changes',
              'Fair housing screened, every word',
              'Your data, never anyone else’s',
            ].map(label => (
              <div key={label} className="land-glass land-pill-trust inline-flex items-center gap-1.5 rounded-full">
                <Check size={11} strokeWidth={3} style={{ color: 'var(--color-accent)' }} />
                <span className="text-[0.78rem]" style={{ color: 'rgba(230,239,236,0.42)' }}>{label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-56 pointer-events-none"
          style={{ background: 'linear-gradient(to top, var(--color-background), transparent)' }} />
      </section>

      {/* ── LIVE DEMO ── */}
      <section className="relative z-[1] px-6 pb-24" style={{ marginTop: '-1rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }} viewport={{ once: true, margin: '-80px' }}
            className="text-center mb-8"
          >
            <h2 style={{ fontSize: 'clamp(1.5rem, 3.4vw, 2.1rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: '0.6rem' }}>
              The interface is <span className="land-gradient-text">generated to fit the answer</span>
            </h2>
            <p style={{ color: 'rgba(230,239,236,0.36)', fontSize: '1rem', maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
              Ask what a house is worth and a valuation grid appears. Ask to book a showing and a
              compliance gate appears. Nothing below is a mockup — it is the product, rendering.
            </p>
          </motion.div>
          <DemoThread />
        </div>
      </section>

      {/* ── WHAT IT REPLACES ── */}
      <Section id="replaces">
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }} viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Eyebrow>What it replaces</Eyebrow>
          <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.85rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.12, marginBottom: '0.9rem' }}>
            Fourteen subscriptions.<br /><span className="land-gradient-text">One login.</span>
          </h2>
          <p style={{ color: 'rgba(230,239,236,0.34)', fontSize: '1.02rem', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
            This is the stack a working agent actually carries. None of it talks to any of the rest
            of it, which is why the same client details get typed in nine times.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }} viewport={{ once: true }}
          className="land-glass rounded-2xl overflow-hidden"
        >
          <div className="a-scroll">
            <table className="a-table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.7rem 1rem' }}>Category</th>
                  <th style={{ padding: '0.7rem 1rem' }}>What agents use today</th>
                  <th style={{ padding: '0.7rem 1rem', textAlign: 'right' }}>Typical / month</th>
                </tr>
              </thead>
              <tbody>
                {STACK.map(t => (
                  <tr key={t.category}>
                    <td style={{ padding: '0.6rem 1rem', fontWeight: 600, whiteSpace: 'normal' }}>{t.category}</td>
                    <td style={{ padding: '0.6rem 1rem', color: 'var(--color-text-muted)', whiteSpace: 'normal' }}>{t.examples}</td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                      ${t.low.toLocaleString()}–${t.high.toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 800, borderTop: '1px solid var(--color-border-bright)' }}>The whole stack</td>
                  <td style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--color-border-bright)', color: 'var(--color-text-dim)', whiteSpace: 'normal' }}>
                    Plus the hours spent moving data between them
                  </td>
                  <td className="land-gradient-text" style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 900, fontSize: '0.95rem', borderTop: '1px solid var(--color-border-bright)' }}>
                    ${stackLow.toLocaleString()}–${stackHigh.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="artifact-foot">
            Representative published pricing for a solo agent or small team in 2026. Prices move
            constantly and vary by market and brokerage; treat the range as an order of magnitude,
            not a quote.
          </div>
        </motion.div>
      </Section>

      {/* ── PILLARS ── */}
      <Section id="pillars">
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }} viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Eyebrow>What it does</Eyebrow>
          <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.85rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.12, marginBottom: '0.9rem' }}>
            Everything the job<br />actually <span className="land-gradient-text">consists of.</span>
          </h2>
        </motion.div>

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {PILLARS.map(({ Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: (i % 3) * 0.07, ease: EASE }} viewport={{ once: true, margin: '-40px' }}
              className="land-glass rounded-xl p-5"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3.5"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.18)' }}>
                <Icon size={16} style={{ color: 'var(--color-accent)' }} />
              </div>
              <h3 className="text-[0.92rem] font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>{title}</h3>
              <p className="text-[0.82rem] leading-relaxed m-0" style={{ color: 'rgba(230,239,236,0.36)' }}>{body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── COMPLIANCE ── */}
      <Section id="compliance">
        <motion.div
          initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: EASE }} viewport={{ once: true }}
          className="land-glass-gold rounded-2xl"
          style={{ padding: 'clamp(2rem, 5vw, 3.25rem)' }}
        >
          <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div>
              <div className="land-glass-gold land-pill-eyebrow inline-flex items-center rounded-full mb-5">
                <span className="text-[0.72rem] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--color-gold)' }}>
                  Since 17 August 2024
                </span>
              </div>
              <h2 style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.4rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.14, marginBottom: '1rem' }}>
                The rules changed.<br />Most software <span style={{ color: 'var(--color-gold)' }}>did not.</span>
              </h2>
              <p style={{ color: 'rgba(230,239,236,0.4)', fontSize: '0.97rem', lineHeight: 1.75 }}>
                A written buyer agreement before any tour. A specific, objective compensation amount —
                not &ldquo;whatever the seller offers&rdquo;. No offers of compensation in the MLS. And
                you may not collect more than your agreement says, even when the seller offers more.
              </p>
              <p style={{ color: 'rgba(230,239,236,0.4)', fontSize: '0.97rem', lineHeight: 1.75, marginTop: '1rem' }}>
                Every CRM on the market will happily let you book a showing without any of it.
                AgentShift will not — the gate is in the code, at the moment the showing is requested,
                not on a checklist somebody remembers on the way to closing.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {[
                { rule: 'Written buyer agreement before touring', detail: 'Checked at booking. Blocked without it.' },
                { rule: 'Compensation must be specific and objective', detail: 'An open-ended term blocks the tour.' },
                { rule: 'Compensation may not exceed the agreement', detail: 'The excess is flagged and credited back.' },
                { rule: 'No offers of compensation in the MLS', detail: 'Audited on every listing before it goes live.' },
                { rule: 'Fair housing in all advertising', detail: 'Scanned on every word generated.' },
                { rule: 'TCPA and Do-Not-Call before outreach', detail: 'Consent checked before a number is dialled.' },
              ].map(item => (
                <div key={item.rule} className="flex gap-2.5">
                  <ShieldCheck size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--color-gold)' }} />
                  <div>
                    <div className="text-[0.86rem] font-semibold" style={{ color: 'var(--color-text)' }}>{item.rule}</div>
                    <div className="text-[0.78rem]" style={{ color: 'rgba(230,239,236,0.34)' }}>{item.detail}</div>
                  </div>
                </div>
              ))}
              <p className="text-[0.72rem] leading-relaxed mt-2" style={{ color: 'var(--color-text-dim)' }}>
                Compliance guidance, not legal advice. State and local rules stack on top, and your
                broker&rsquo;s policy governs.
              </p>
            </div>
          </div>
        </motion.div>
      </Section>

      {/* ── DIFFERENTIATORS ── */}
      <Section>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {DIFFERENTIATORS.map((d, i) => (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.09, ease: EASE }} viewport={{ once: true }}
            >
              <div className="land-gradient-text mb-3" style={{ fontSize: '2.4rem', fontWeight: 900, lineHeight: 1, opacity: 0.28 }}>
                0{i + 1}
              </div>
              <h3 className="text-[1.02rem] font-bold mb-2" style={{ color: 'var(--color-text)' }}>{d.title}</h3>
              <p className="text-[0.87rem] leading-relaxed m-0" style={{ color: 'rgba(230,239,236,0.36)' }}>{d.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── FINAL CTA ── */}
      <section className="relative z-[1] px-6" style={{ padding: '4rem 1.5rem 7rem' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }} viewport={{ once: true }}
            className="land-glass land-glow rounded-3xl text-center"
            style={{ padding: 'clamp(2.5rem, 6vw, 4rem) clamp(1.5rem, 5vw, 3rem)' }}
          >
            <h2 style={{ fontSize: 'clamp(1.75rem, 4.4vw, 2.9rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.12, marginBottom: '1.15rem' }}>
              The work is the same.<br /><span className="land-gradient-text">The tabs are not.</span>
            </h2>
            <p style={{ color: 'rgba(230,239,236,0.36)', fontSize: '1.02rem', lineHeight: 1.72, maxWidth: 400, margin: '0 auto 2.5rem' }}>
              Bring your database, your listings and your deals. Ask Shift what to do next.
            </p>
            <Link href="/login" className="land-gradient-btn land-glow-sm inline-flex items-center gap-2 no-underline rounded-full font-extrabold"
              style={{ color: '#04140e', padding: '1rem 2.75rem', fontSize: '1.05rem' }}>
              Get started free <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-[1] px-6 py-8" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4" style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <KeyRound size={13} style={{ color: 'var(--color-accent)' }} />
            </div>
            <span className="land-gradient-text text-sm font-extrabold">AgentShift</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-xs no-underline" style={{ color: 'var(--color-text-dim)' }}>Sign in</Link>
            <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
              Part of the <span className="land-gradient-text font-bold">AllShift AI</span> family
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
