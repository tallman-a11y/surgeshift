import Link from 'next/link'

export const metadata = {
  title: 'SurgeShift AI — Find People Already Looking for Your Product',
  description: 'AI-powered social opportunity discovery. SurgeShift scans Reddit, YouTube, and Twitter in real time — scoring high-intent conversations and drafting replies that sound human.',
}

const CYAN = '#22d3ee'
const MAGENTA = '#e879f9'
const PURPLE = '#a855f7'

function GradientText({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{
      background: `linear-gradient(135deg, ${CYAN} 0%, ${PURPLE} 50%, ${MAGENTA} 100%)`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      ...style,
    }}>
      {children}
    </span>
  )
}

function MockCard({ platform, subreddit, title, score, reply, platformColor }: {
  platform: string; subreddit?: string; title: string; score: number; reply: string; platformColor: string;
}) {
  const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#94a3b8'
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '0.875rem',
      padding: '1rem 1.1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: platformColor, border: `1px solid ${platformColor}44`, background: `${platformColor}11`,
            padding: '0.15rem 0.45rem', borderRadius: '9999px',
          }}>{platform}</span>
          {subreddit && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>r/{subreddit}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 500 }}>Score</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: scoreColor }}>{score}</span>
        </div>
      </div>
      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', lineHeight: 1.4, margin: 0 }}>{title}</p>
      <div style={{
        background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)',
        borderRadius: '0.5rem', padding: '0.5rem 0.65rem',
      }}>
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>{reply}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 600, padding: '0.25rem 0.65rem', borderRadius: '0.375rem',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', cursor: 'default',
        }}>Skip</span>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '0.375rem',
          background: 'linear-gradient(135deg, #c026d3, #22d3ee)', color: '#fff', cursor: 'default',
        }}>Post Reply</span>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div style={{ background: '#06060f', color: '#e2e8f0', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* Ambient background glow */}
      <div style={{
        position: 'fixed', top: '-100px', left: '50%', transform: 'translateX(-50%)',
        width: '900px', height: '500px', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 40% 30%, rgba(192,38,211,0.10) 0%, rgba(34,211,238,0.05) 50%, transparent 70%)',
      }} />

      {/* ── NAV ── */}
      <nav style={{
        position: 'relative', zIndex: 10,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '0 1.5rem',
      }}>
        <div style={{
          maxWidth: '1100px', margin: '0 auto', height: '64px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <img src="/surgeshift-full.png" alt="SurgeShift AI" style={{ height: '36px', objectFit: 'contain' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/login" style={{ fontSize: '0.875rem', color: '#64748b', textDecoration: 'none' }}>
              Sign In
            </Link>
            <Link href="/login" style={{
              background: 'linear-gradient(135deg, #c026d3, #22d3ee)',
              color: '#fff', padding: '0.45rem 1.1rem', borderRadius: '0.5rem',
              fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none',
            }}>
              Get Started →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '5rem 1.5rem 3.5rem' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{
            display: 'inline-block', marginBottom: '1.5rem',
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            background: 'rgba(232,121,249,0.1)', border: '1px solid rgba(232,121,249,0.2)',
            color: '#e879f9', padding: '0.3rem 0.85rem', borderRadius: '9999px',
          }}>
            AI Marketing Intelligence
          </div>

          <h1 style={{
            fontSize: 'clamp(2.25rem, 6vw, 4rem)', fontWeight: 900, lineHeight: 1.08,
            letterSpacing: '-0.02em', marginBottom: '1.5rem',
          }}>
            <GradientText>Find people already asking<br />for what you sell</GradientText>
          </h1>

          <p style={{
            fontSize: '1.125rem', lineHeight: 1.75, color: '#64748b',
            maxWidth: '560px', margin: '0 auto 2.5rem',
          }}>
            SurgeShift AI scans Reddit, YouTube, and Twitter in real time — scoring high-intent conversations and drafting replies that sound human. You review, edit, and post in one click.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" style={{
              background: 'linear-gradient(135deg, #c026d3, #22d3ee)',
              color: '#fff', padding: '0.8rem 2.25rem', borderRadius: '0.625rem',
              fontSize: '1rem', fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 0 32px rgba(192,38,211,0.25)',
            }}>
              Start for free →
            </Link>
            <Link href="/login" style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#94a3b8', padding: '0.8rem 1.75rem', borderRadius: '0.625rem',
              fontSize: '1rem', fontWeight: 500, textDecoration: 'none',
            }}>
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── DASHBOARD MOCK ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '0 1.5rem 5rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          {/* Browser chrome */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '1rem 1rem 0 0',
            padding: '0.65rem 1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', opacity: 0.6 }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', opacity: 0.6 }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', opacity: 0.6 }} />
            <div style={{
              flex: 1, margin: '0 0.5rem',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '0.35rem', height: '22px',
              display: 'flex', alignItems: 'center', padding: '0 0.6rem',
            }}>
              <span style={{ fontSize: '0.65rem', color: '#334155' }}>surgeshiftai.com/dashboard</span>
            </div>
          </div>

          {/* Dashboard body */}
          <div style={{
            background: 'rgba(15,15,26,0.9)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderTop: 'none',
            borderRadius: '0 0 1rem 1rem',
            padding: '1.25rem',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,85,247,0.08)',
          }}>
            {/* Stat bar */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { label: 'Pending', value: '12', color: '#a855f7' },
                { label: 'Posted this week', value: '7', color: '#22d3ee' },
                { label: 'Total found', value: '84', color: '#64748b' },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1, background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '0.6rem', padding: '0.6rem 0.75rem',
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <MockCard
                platform="Reddit"
                subreddit="welding"
                title="Anyone know good CWI exam prep resources? I've been studying for months and still don't feel confident about the visual inspection sections."
                score={94}
                reply="The visual exam is what trips most people up — practice identifying defects on actual weld coupons, not just diagrams. WeldShift AI has a Field Oracle module built specifically for this: it walks you through defect identification by type and helps you nail the D1.1 criteria. weldshiftacademy.com (I built it)"
                platformColor="#ff6314"
              />
              <MockCard
                platform="YouTube"
                title="Failing weld inspection mock tests — is the real CWI test this hard or am I overthinking it?"
                score={87}
                reply="The mock tests are harder than the real thing by design — they expose gaps before you're in the exam room. The biggest mistake is treating it as pure memorization. If you want AI-guided walkthroughs that adapt to where you're getting stuck, WeldShift Academy covers exactly this. weldshiftacademy.com"
                platformColor="#ff0000"
              />
            </div>
          </div>

          {/* Glow under mock */}
          <div style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.3), rgba(34,211,238,0.3), transparent)',
            margin: '0 2rem',
          }} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
              From setup to posting in minutes
            </h2>
            <p style={{ color: '#64748b', fontSize: '1rem' }}>Three steps. No developer required.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            {[
              {
                n: '01',
                title: 'Set up your brand',
                body: 'Tell SurgeShift about your product, target keywords, and which subreddits your audience lives in. Takes 2 minutes.',
              },
              {
                n: '02',
                title: 'Run a scan',
                body: 'Hit scan and AI searches Reddit, YouTube, and Twitter for conversations where your brand would genuinely add value — scored 0–100.',
              },
              {
                n: '03',
                title: 'Review and post',
                body: 'Read the AI-drafted reply, tweak if needed, and post directly from SurgeShift. No copy-paste. No tab switching.',
              },
            ].map(step => (
              <div key={step.n} style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '1rem', padding: '1.5rem',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  fontSize: '2.5rem', fontWeight: 900, lineHeight: 1,
                  background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  marginBottom: '0.75rem', opacity: 0.3,
                }}>{step.n}</div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>{step.title}</h3>
                <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6, margin: 0 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p style={{ color: '#64748b', fontSize: '1rem' }}>Built for founders and small teams who want to market without sounding like they&apos;re marketing.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {[
              {
                icon: '🔍',
                title: 'Multi-platform scanning',
                body: 'Reddit threads, YouTube comments, and Twitter conversations — all in one scan. No API keys to manage.',
              },
              {
                icon: '🎯',
                title: 'AI relevance scoring',
                body: 'Every post gets a 0–100 score. SurgeShift explains why it matched so you can decide whether it\'s worth a reply.',
              },
              {
                icon: '✍️',
                title: 'Human-sounding drafts',
                body: 'Claude AI writes replies that address the question first, then mention your brand naturally — never like an ad.',
              },
              {
                icon: '📬',
                title: 'One-click OAuth posting',
                body: 'Connect your Reddit and YouTube accounts. Edit the draft, hit Post Reply — it goes live without leaving the app.',
              },
              {
                icon: '🏷️',
                title: 'Disclosure compliance',
                body: 'Set a disclosure line per brand and it\'s automatically appended to every drafted reply. Stay within Reddit\'s Responsible Builder Policy.',
              },
              {
                icon: '⚡',
                title: 'Per-brand intelligence',
                body: 'Run multiple brands from one account, each with its own keywords, subreddits, voice notes, and posting history.',
              },
            ].map(feat => (
              <div key={feat.title} style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '0.875rem', padding: '1.25rem',
                transition: 'border-color 0.2s',
              }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.65rem' }}>{feat.icon}</div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>{feat.title}</h3>
                <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6, margin: 0 }}>{feat.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLATFORMS ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '3rem 1.5rem' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#334155', marginBottom: '1.75rem' }}>
            Monitors conversations across
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { name: 'Reddit', color: '#ff6314' },
              { name: 'YouTube', color: '#ff0000' },
              { name: 'Twitter / X', color: '#1d9bf0' },
            ].map(p => (
              <div key={p.name} style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                background: `${p.color}0d`, border: `1px solid ${p.color}33`,
                fontSize: '0.875rem', fontWeight: 700, color: p.color,
              }}>{p.name}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '5rem 1.5rem 6rem' }}>
        <div style={{ maxWidth: '620px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            background: 'rgba(168,85,247,0.04)',
            border: '1px solid rgba(168,85,247,0.15)',
            borderRadius: '1.5rem', padding: '3rem 2rem',
            boxShadow: '0 0 60px rgba(192,38,211,0.08)',
          }}>
            <h2 style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 900,
              letterSpacing: '-0.02em', marginBottom: '1rem',
            }}>
              Start finding opportunities<br />
              <GradientText>today</GradientText>
            </h2>
            <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
              Your next customer is out there right now asking a question you could answer. SurgeShift helps you be there.
            </p>
            <Link href="/login" style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #c026d3, #22d3ee)',
              color: '#fff', padding: '0.875rem 2.5rem', borderRadius: '0.625rem',
              fontSize: '1.05rem', fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 0 40px rgba(192,38,211,0.3)',
            }}>
              Get started free →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        position: 'relative', zIndex: 1,
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '2rem 1.5rem',
      }}>
        <div style={{
          maxWidth: '1100px', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/surgeshift-full.png" alt="SurgeShift AI" style={{ height: '28px', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <Link href="/login" style={{ fontSize: '0.8rem', color: '#334155', textDecoration: 'none' }}>Sign In</Link>
            <span style={{ fontSize: '0.8rem', color: '#1e293b' }}>
              Part of the{' '}
              <span style={{
                background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                fontWeight: 600,
              }}>AllShift AI</span> family
            </span>
          </div>
        </div>
      </footer>

    </div>
  )
}
