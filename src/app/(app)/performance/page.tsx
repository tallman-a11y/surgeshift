import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MousePointerClick, MessageSquare, Target, ShieldAlert, ExternalLink } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

export const metadata = { title: 'Performance — SurgeShift' }
export const dynamic = 'force-dynamic'

/**
 * What the replies actually did.
 *
 * Every number here is measured, not modelled. Where there is nothing to show
 * yet the panel says what would put something there, because an empty chart with
 * no explanation reads as broken rather than new.
 */

type VisitRow = {
  visited_at: string
  tracked_links: {
    platform: string | null
    subreddit: string | null
    brands: { name: string } | null
    opportunities: { title: string | null; score: number | null; thread_url: string | null } | null
  } | null
}

type OutcomeRow = {
  reply_score: number | null
  reply_removed: boolean | null
  reply_checked_at: string | null
  score: number
  title: string | null
  platform: string
  subreddit: string | null
  posted_permalink: string | null
}

function Stat({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub: string; tone?: 'alert'
}) {
  return (
    <div className="surface-elevated rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--color-text-muted)' }}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: tone === 'alert' ? '#f87171' : 'var(--color-text)' }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--color-text-dim)' }}>{sub}</div>
    </div>
  )
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="surface-elevated rounded-2xl p-6">
      <h2 className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>{title}</h2>
      {hint && <p className="text-xs mb-4" style={{ color: 'var(--color-text-dim)' }}>{hint}</p>}
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm py-3" style={{ color: 'var(--color-text-muted)' }}>{children}</p>
}

export default async function PerformancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // shift_learning_outcomes is service-role only, and the joins below are read-only
  // aggregates over this user's own brands, so one admin client serves the page.
  const admin = createServiceClient()

  const { data: brandRows } = await admin.from('brands').select('id, name').eq('user_id', user.id)
  const brandIds = (brandRows ?? []).map(b => b.id as string)

  const [visitsRes, outcomesRes, calibrationRes, queueRes, postedRes] = await Promise.all([
    admin
      .from('link_visits')
      .select('visited_at, tracked_links!inner(platform, subreddit, brands!inner(name), opportunities(title, score, thread_url))')
      .not('link_id', 'is', null)
      .order('visited_at', { ascending: false })
      .limit(200),
    admin
      .from('opportunities')
      .select('reply_score, reply_removed, reply_checked_at, score, title, platform, subreddit, posted_permalink')
      .in('brand_id', brandIds)
      .eq('status', 'posted')
      .not('reply_checked_at', 'is', null)
      .order('reply_score', { ascending: false })
      .limit(50),
    admin
      .from('shift_learning_outcomes')
      .select('predicted_value, actual_value')
      .eq('user_id', user.id)
      .eq('prediction_type', 'opportunity_score')
      .limit(500),
    admin
      .from('opportunities')
      .select('subreddit, platform')
      .in('brand_id', brandIds)
      .eq('status', 'pending')
      .limit(2000),
    admin
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .in('brand_id', brandIds)
      .eq('status', 'posted'),
  ])

  const visits = (visitsRes.data ?? []) as unknown as VisitRow[]
  const outcomes = (outcomesRes.data ?? []) as unknown as OutcomeRow[]
  const calibration = (calibrationRes.data ?? []) as Array<{
    predicted_value: { score?: number } | null
    actual_value: { verdict?: string } | null
  }>
  const postedTotal = postedRes.count ?? 0

  // Which conversations actually sent people to the demo.
  const bySource = new Map<string, number>()
  for (const v of visits) {
    const t = v.tracked_links
    if (!t) continue
    bySource.set(t.subreddit ? `r/${t.subreddit}` : (t.platform ?? 'unknown'),
      (bySource.get(t.subreddit ? `r/${t.subreddit}` : (t.platform ?? 'unknown')) ?? 0) + 1)
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxSource = sources[0]?.[1] ?? 1

  const removed = outcomes.filter(o => o.reply_removed).length
  const totalReplyScore = outcomes.reduce((s, o) => s + (o.reply_score ?? 0), 0)

  // Does a high score actually predict a good outcome? Bucketed rather than
  // correlated — with this few points a correlation coefficient would be theatre.
  const buckets = new Map<string, { n: number; good: number }>()
  for (const c of calibration) {
    const s = c.predicted_value?.score ?? 0
    const key = s >= 80 ? '80+' : s >= 60 ? '60–79' : s >= 40 ? '40–59' : 'under 40'
    const b = buckets.get(key) ?? { n: 0, good: 0 }
    b.n++
    if (c.actual_value?.verdict === 'landed' || c.actual_value?.verdict === 'received') b.good++
    buckets.set(key, b)
  }

  const queue = (queueRes.data ?? []) as Array<{ subreddit: string | null; platform: string }>
  const { data: policies } = await admin
    .from('subreddit_policies')
    .select('subreddit, stance')
    .eq('user_id', user.id)
  const stanceBySub = new Map((policies ?? []).map(p => [p.subreddit as string, p.stance as string]))
  const queueSplit = { allowed: 0, caution: 0, banned: 0, youtube: 0 }
  for (const q of queue) {
    if (!q.subreddit) { queueSplit.youtube++; continue }
    const st = stanceBySub.get(q.subreddit.toLowerCase()) ?? 'unknown'
    if (st === 'allowed') queueSplit.allowed++
    else if (st === 'banned') queueSplit.banned++
    else queueSplit.caution++
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Performance</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          What the replies actually did. Every number here is measured.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<MousePointerClick size={14} />}
          label="Demo visits"
          value={String(visits.length)}
          sub={visits.length === 0 ? 'none traced yet' : `latest ${timeAgo(visits[0].visited_at)}`}
        />
        <Stat
          icon={<MessageSquare size={14} />}
          label="Replies posted"
          value={String(postedTotal)}
          sub={`${outcomes.length} followed up`}
        />
        <Stat
          icon={<Target size={14} />}
          label="Engagement earned"
          value={String(totalReplyScore)}
          sub="upvotes and likes across all replies"
        />
        <Stat
          icon={<ShieldAlert size={14} />}
          label="Replies removed"
          value={String(removed)}
          sub={removed === 0 ? 'nothing rejected' : 'review what these had in common'}
          tone={removed > 0 ? 'alert' : undefined}
        />
      </div>

      <Panel
        title="Where visitors came from"
        hint="Each visit is a real person who followed a reply through to the demo, traced back to the thread that produced them."
      >
        {sources.length === 0 ? (
          <Empty>
            No traced visits yet. Every reply you Copy or Post carries a tracking code, so this
            fills in as you work the queue — the beacon is already live on both destination sites.
          </Empty>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sources.map(([source, count]) => (
              <div key={source} className="flex items-center gap-3">
                <span className="text-xs w-40 shrink-0 truncate" style={{ color: 'var(--color-text-muted)' }}>{source}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(count / maxSource) * 100}%`, background: 'var(--color-accent)' }} />
                </div>
                <span className="text-xs w-8 text-right tabular-nums" style={{ color: 'var(--color-text)' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="How the replies landed"
        hint="Checked daily for 30 days after posting. A removal is the clearest signal a community can give."
      >
        {outcomes.length === 0 ? (
          <Empty>
            Nothing followed up yet. Replies posted from here are checked every morning —
            YouTube works today; Reddit joins once the API credentials land.
          </Empty>
        ) : (
          <div className="flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {outcomes.slice(0, 10).map((o, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <span
                  className="text-sm font-bold w-10 text-right tabular-nums shrink-0"
                  style={{ color: o.reply_removed ? '#f87171' : 'var(--color-text)' }}
                >
                  {o.reply_removed ? '—' : (o.reply_score ?? 0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate" style={{ color: 'var(--color-text)' }}>{o.title ?? 'Untitled'}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                    {o.subreddit ? `r/${o.subreddit}` : o.platform} · we scored it {o.score}
                    {o.reply_removed && ' · removed'}
                  </p>
                </div>
                {o.posted_permalink && (
                  <a href={o.posted_permalink} target="_blank" rel="noopener noreferrer"
                     className="shrink-0" style={{ color: 'var(--color-accent)' }}>
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Is the score honest?"
        hint="How often each score band actually earned engagement. If the bands don't separate, the score isn't earning its place."
      >
        {calibration.length === 0 ? (
          <Empty>
            Needs posted replies with outcomes before it can say anything. Until then the score is
            a prediction nobody has checked.
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {['80+', '60–79', '40–59', 'under 40'].filter(k => buckets.has(k)).map(k => {
              const b = buckets.get(k)!
              const pct = Math.round((b.good / b.n) * 100)
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs w-20 shrink-0" style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--color-green)' }} />
                  </div>
                  <span className="text-xs w-24 text-right tabular-nums" style={{ color: 'var(--color-text-dim)' }}>
                    {pct}% of {b.n}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Queue safety"
        hint="Where the pending opportunities sit against your subreddit policy."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            ['Safe to post', queueSplit.allowed, 'var(--color-green)'],
            ['Needs a look', queueSplit.caution, '#eab308'],
            ['Blocked', queueSplit.banned, '#f87171'],
            ['YouTube', queueSplit.youtube, 'var(--color-text-muted)'],
          ] as const).map(([label, n, color]) => (
            <div key={label} className="rounded-xl p-3" style={{ background: 'var(--color-surface)' }}>
              <div className="text-xl font-bold tabular-nums" style={{ color }}>{n}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
            </div>
          ))}
        </div>
        {queueSplit.banned > 0 && (
          <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
            {queueSplit.banned} pending {queueSplit.banned === 1 ? 'reply sits' : 'replies sit'} in subreddits
            you marked off limits. They will refuse to post — dismiss them from{' '}
            <Link href="/dashboard" style={{ color: 'var(--color-accent)' }}>the queue</Link> to clear the noise.
          </p>
        )}
      </Panel>
    </div>
  )
}
