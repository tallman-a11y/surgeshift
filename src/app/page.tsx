'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { ArrowRight, Search, Zap, Shield, MessageSquare, BarChart2, Globe, CheckCircle, Menu, X } from 'lucide-react'

const EASE = [0.22, 1, 0.36, 1] as const

const navLinks = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Platforms', href: '#platforms' },
]

const floatingStats = [
  { value: '47',  label: 'Opportunities today',     sub: '↑ 12 since last scan',          delay: 0.55 },
  { value: '91',  label: 'Avg AI match score',       sub: 'Across all brands this week',    delay: 0.70 },
  { value: '3×',  label: 'Reply rate vs cold DM',    sub: 'Because they asked first',       delay: 0.85 },
]

const steps = [
  { n: '01', title: 'Set up your brand',   body: 'Describe your product, add target keywords and subreddits. Two minutes, done.' },
  { n: '02', title: 'Run a scan',          body: 'AI searches Reddit, YouTube, and Twitter for high-intent conversations — scored 0–100.' },
  { n: '03', title: 'Post in one click',   body: 'Edit the AI-drafted reply if you want, then post directly from SurgeShift. No tab switching.' },
]

const features = [
  { Icon: Search,         title: 'Real-time social scanning',   body: 'Reddit threads, YouTube comments, Twitter conversations — found as they happen across all your brands.' },
  { Icon: BarChart2,      title: 'AI relevance scoring',        body: 'Every post gets a 0–100 score with a plain-English reason so you can decide instantly.' },
  { Icon: MessageSquare,  title: 'Human-sounding drafts',       body: 'Claude AI answers their question first, mentions your brand second. Reads like a knowledgeable community member.' },
  { Icon: Zap,            title: 'One-click OAuth posting',     body: 'Connect Reddit and YouTube once. Edit the draft, hit Post — live without leaving the app.' },
  { Icon: Shield,         title: 'Disclosure compliance',       body: 'Set a disclosure line per brand. Appended to every draft automatically, per Reddit\'s Responsible Builder Policy.' },
  { Icon: Globe,          title: 'Multi-brand intelligence',    body: 'Run multiple brands from one account, each with its own keywords, voice notes, and posting history.' },
]

const platforms = [
  { name: 'Reddit',      color: '#ff6314', bg: 'rgba(255,99,20,0.08)',   border: 'rgba(255,99,20,0.3)' },
  { name: 'YouTube',     color: '#ff0000', bg: 'rgba(255,0,0,0.08)',     border: 'rgba(255,0,0,0.3)' },
  { name: 'Twitter / X', color: '#1d9bf0', bg: 'rgba(29,155,240,0.08)', border: 'rgba(29,155,240,0.3)' },
]

function MockCard({ platform, sub, title, score, reply, pColor, delay }: {
  platform: string; sub?: string; title: string; score: number; reply: string; pColor: string; delay: number
}) {
  const sc = score >= 80 ? '#22c55e' : '#f59e0b'
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      style={{ background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(168,85,247,0.14)', borderRadius: '0.875rem', padding: '0.95rem 1.05rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: pColor, border: `1px solid ${pColor}44`, background: `${pColor}11`, padding: '0.1rem 0.4rem', borderRadius: '9999px' }}>{platform}</span>
          {sub && <span style={{ fontSize: '0.68rem', color: '#475569' }}>r/{sub}</span>}
        </div>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: sc }}>{score}</span>
      </div>
      <p style={{ fontSize: '0.76rem', fontWeight: 600, color: '#e2e8f0', lineHeight: 1.4, margin: 0 }}>{title}</p>
      <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.11)', borderRadius: '0.4rem', padding: '0.4rem 0.55rem' }}>
        <p style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.55, margin: 0 }}>{reply}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.2rem 0.55rem', borderRadius: '0.3rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#334155' }}>Skip</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '0.3rem', background: 'linear-gradient(135deg,#c026d3,#22d3ee)', color: '#fff' }}>Post Reply</span>
      </div>
    </motion.div>
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

  return (
    <div style={{ background: '#06060f', color: '#e2e8f0', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: scrolled ? 'rgba(6,6,15,0.88)' : 'transparent',
          borderBottom: scrolled ? '1px solid rgba(168,85,247,0.08)' : '1px solid transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
          transition: 'background 0.4s, border-color 0.4s',
        }}
      >
        <div className="land-nav-inner" style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1.5rem' }}>

          {/* Left: nav links */}
          <div className="hidden md:flex" style={{ alignItems: 'center', gap: '2rem' }}>
            {navLinks.map(l => (
              <a key={l.href} href={l.href}
                style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.42)', textDecoration: 'none', transition: 'color 0.2s', letterSpacing: '0.01em' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'white' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.42)' }}
              >{l.label}</a>
            ))}
          </div>
          <button
            type="button"
            className="flex md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            aria-label="Menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* Center: logo */}
          <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', textDecoration: 'none' }}>
            <div style={{ width: 44, height: 44, borderRadius: '0.625rem', overflow: 'hidden', flexShrink: 0 }}>
              <Image src="/surgeshift.png" alt="SurgeShift AI" width={58} height={58} style={{ margin: '-7px', display: 'block' }} priority />
            </div>
            <span className="land-gradient-text hidden md:block" style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.01em' }}>SurgeShift AI</span>
          </a>

          {/* Right: CTAs */}
          <div className="hidden md:flex" style={{ alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Link href="/login" style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.38)', textDecoration: 'none' }}>Sign In</Link>
            <Link href="/login" className="land-gradient-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#fff', padding: '0.5rem 1.25rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none' }}>
              Get Started <ArrowRight size={13} />
            </Link>
          </div>
          {/* Mobile right spacer */}
          <div className="flex md:hidden" />
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{ background: 'rgba(6,6,15,0.96)', borderBottom: '1px solid rgba(168,85,247,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {navLinks.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>{l.label}</a>
            ))}
            <div style={{ borderTop: '1px solid rgba(168,85,247,0.08)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link href="/login" style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', textAlign: 'center' }}>Sign In</Link>
              <Link href="/login" className="land-gradient-btn"
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', color: '#fff', padding: '0.75rem', borderRadius: '9999px', fontSize: '0.95rem', fontWeight: 700, textDecoration: 'none' }}>
                Get Started <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </motion.nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
        <div className="land-hero-ambient" style={{ position: 'absolute', inset: 0 }} />
        <div className="land-dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.28 }} />
        <div className="land-orb" style={{ position: 'absolute', top: '6%', left: '3%', width: 640, height: 640, background: 'rgba(192,38,211,0.07)' }} />
        <div className="land-orb land-orb-2" style={{ position: 'absolute', bottom: '10%', right: '2%', width: 520, height: 520, background: 'rgba(34,211,238,0.05)' }} />

        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '860px', margin: '0 auto', padding: '0 1.5rem', paddingTop: 'clamp(9rem, 18vh, 13rem)', paddingBottom: 'clamp(3rem, 6vh, 5rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="land-glass land-pill-eyebrow"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', borderRadius: '9999px', marginBottom: '2.5rem' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e879f9', display: 'block', animation: 'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: '0.78rem', color: '#e879f9', fontWeight: 600, letterSpacing: '0.04em' }}>AI Marketing Intelligence</span>
          </motion.div>

          {/* H1 */}
          <motion.h1
            initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.08, ease: EASE }}
            style={{ fontSize: 'clamp(3rem, 8.5vw, 7rem)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.0, marginBottom: '2.5rem' }}
          >
            Stop guessing.<br />
            <span className="land-gradient-text">Start surging.</span>
          </motion.h1>

          {/* Sub */}
          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.16, ease: EASE }}
            style={{ fontSize: 'clamp(1rem, 2.2vw, 1.25rem)', color: 'rgba(255,255,255,0.38)', maxWidth: '530px', lineHeight: 1.75, marginBottom: '3rem' }}
          >
            SurgeShift finds people already asking for what you sell — on Reddit, YouTube, and Twitter — scores each opportunity, and drafts a reply that sounds like you.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem', marginBottom: '3rem' }}
          >
            <Link href="/login" className="land-gradient-btn land-glow-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#fff', padding: '1rem 2.5rem', borderRadius: '9999px', fontSize: '1.05rem', fontWeight: 800, textDecoration: 'none' }}>
              Start for free <ArrowRight size={16} />
            </Link>
            <Link href="/login" className="land-glass"
              style={{ display: 'inline-flex', alignItems: 'center', color: 'rgba(255,255,255,0.5)', padding: '1rem 2rem', borderRadius: '9999px', fontSize: '1.05rem', fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </motion.div>

          {/* Trust pills */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.32 }}
            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginBottom: '4.5rem' }}
          >
            {[
              { Icon: CheckCircle, label: 'No credit card required' },
              { Icon: Shield,      label: 'Reddit policy compliant' },
              { Icon: Zap,         label: 'First scan in 2 minutes' },
            ].map(({ Icon, label }) => (
              <div key={label} className="land-glass land-pill-trust"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderRadius: '9999px' }}>
                <Icon size={11} style={{ color: '#a855f7' }} />
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)' }}>{label}</span>
              </div>
            ))}
          </motion.div>

          {/* Floating stat cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem', width: '100%' }}>
            {floatingStats.map(s => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: s.delay, ease: EASE }}
                className="land-glass land-glow-sm"
                style={{ flex: '1 1 175px', minWidth: '155px', maxWidth: '215px', borderRadius: '1rem', padding: '1.5rem 1.6rem', textAlign: 'left' }}
              >
                <div className="land-gradient-text" style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1, marginBottom: '0.4rem' }}>{s.value}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '0.2rem' }}>{s.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.28)' }}>{s.sub}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '14rem', background: 'linear-gradient(to top, #06060f, transparent)', pointerEvents: 'none' }} />
      </section>

      {/* ── MOCK DASHBOARD ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '0 1.5rem 6rem' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            viewport={{ once: true }}
          >
            {/* Browser chrome */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '0.875rem 0.875rem 0 0', padding: '0.55rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {['#ef4444','#f59e0b','#22c55e'].map((c, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.5 }} />)}
              <div style={{ flex: 1, margin: '0 0.45rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '0.25rem', height: '18px', display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
                <span style={{ fontSize: '0.6rem', color: '#1e293b' }}>surgeshiftai.com/dashboard</span>
              </div>
            </div>
            <div style={{ background: 'rgba(11,11,20,0.96)', border: '1px solid rgba(168,85,247,0.1)', borderTop: 'none', borderRadius: '0 0 0.875rem 0.875rem', padding: '1rem', boxShadow: '0 40px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(168,85,247,0.06)' }}>
              {/* Stats */}
              <div style={{ display: 'flex', gap: '0.55rem', marginBottom: '0.85rem' }}>
                {[{ l:'Pending', v:'12', c:'#a855f7' }, { l:'Posted this week', v:'7', c:'#22d3ee' }, { l:'Total found', v:'84', c:'#334155' }].map(s => (
                  <div key={s.l} style={{ flex: 1, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '0.45rem', padding: '0.5rem 0.65rem' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: '0.58rem', color: '#1e293b', fontWeight: 500 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <MockCard platform="Reddit" sub="welding" title="Anyone know good CWI exam prep resources? Been studying for months and still not confident about visual inspection." score={94} pColor="#ff6314" delay={0.15}
                  reply="The visual exam trips most people up — practice defect ID on real coupons, not just diagrams. WeldShift AI has a Field Oracle module built exactly for this. weldshiftacademy.com (I built it)" />
                <MockCard platform="YouTube" title="Failing weld inspection mock tests — is the real CWI exam this hard or am I overthinking it?" score={87} pColor="#ff0000" delay={0.28}
                  reply="Mock tests are harder by design to expose gaps before the exam room. The biggest mistake is pure memorization. WeldShift walks you through adaptive practice on your weak sections. weldshiftacademy.com" />
              </div>
            </div>
          </motion.div>
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.3), rgba(34,211,238,0.25), transparent)', margin: '0 2.5rem' }} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} viewport={{ once: true }} style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <div className="land-glass land-pill-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '9999px', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#a855f7', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>How It Works</span>
            </div>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: '0.75rem' }}>
              Setup to posting in <span className="land-gradient-text">minutes</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: '1.05rem', maxWidth: '400px', margin: '0 auto' }}>No developer required. No API keys to manage.</p>
          </motion.div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {steps.map((step, i) => (
              <motion.div key={step.n} initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }} viewport={{ once: true }}
                className="land-glass" style={{ borderRadius: '1rem', padding: '2rem 1.75rem' }}>
                <div className="land-gradient-text" style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, marginBottom: '1rem', opacity: 0.22 }}>{step.n}</div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.55rem', color: '#e2e8f0' }}>{step.title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.33)', lineHeight: 1.65, margin: 0 }}>{step.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} viewport={{ once: true }} style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: '0.75rem' }}>
              Everything you need.<br /><span className="land-gradient-text">Nothing you don&apos;t.</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: '1.05rem', maxWidth: '430px', margin: '0 auto' }}>Built for founders and small teams who want to market without sounding like they&apos;re marketing.</p>
          </motion.div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {features.map(({ Icon, title, body }, i) => (
              <motion.div key={title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: i * 0.08, ease: EASE }} viewport={{ once: true }}
                className="land-glass" style={{ borderRadius: '0.875rem', padding: '1.5rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '0.5rem', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.875rem' }}>
                  <Icon size={16} style={{ color: '#a855f7' }} />
                </div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.45rem', color: '#e2e8f0' }}>{title}</h3>
                <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.33)', lineHeight: 1.6, margin: 0 }}>{body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLATFORMS ── */}
      <section id="platforms" style={{ position: 'relative', zIndex: 1, padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} viewport={{ once: true }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#1e293b', marginBottom: '2rem' }}>Monitors conversations across</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {platforms.map(p => (
                <div key={p.name} style={{ padding: '0.7rem 1.75rem', borderRadius: '0.5rem', background: p.bg, border: `1px solid ${p.border}`, fontSize: '1rem', fontWeight: 700, color: p.color }}>{p.name}</div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem 7rem' }}>
        <div style={{ maxWidth: '620px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }} viewport={{ once: true }}
            className="land-glass land-glow"
            style={{ borderRadius: '1.5rem', padding: 'clamp(2.5rem, 6vw, 4rem) clamp(1.5rem, 5vw, 3rem)', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4.5vw, 3rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: '1.25rem' }}>
              Your next customer is out there<br /><span className="land-gradient-text">asking right now.</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.33)', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: '360px', margin: '0 auto 2.5rem' }}>
              SurgeShift helps you be there with the right answer at the right moment.
            </p>
            <Link href="/login" className="land-gradient-btn land-glow-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#fff', padding: '1rem 2.75rem', borderRadius: '9999px', fontSize: '1.05rem', fontWeight: 800, textDecoration: 'none' }}>
              Get started free <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.04)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '0.45rem', overflow: 'hidden', flexShrink: 0, opacity: 0.85 }}>
              <Image src="/surgeshift.png" alt="" width={42} height={42} style={{ margin: '-5px', display: 'block' }} />
            </div>
            <span className="land-gradient-text" style={{ fontSize: '0.9rem', fontWeight: 800 }}>SurgeShift AI</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <Link href="/login" style={{ fontSize: '0.8rem', color: '#1e293b', textDecoration: 'none' }}>Sign In</Link>
            <span style={{ fontSize: '0.8rem', color: '#0f172a' }}>
              Part of the <span className="land-gradient-text" style={{ fontWeight: 700 }}>AllShift AI</span> family
            </span>
          </div>
        </div>
      </footer>

    </div>
  )
}
