import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The posting governor.
 *
 * A Reddit ban is permanent and ends the channel, so this decides whether a reply
 * is safe to send before it goes out. The audit found nothing guarding any of it:
 * the scanner drifted into 26 subreddits the operator never chose (including
 * r/legaladvice and r/tenant — the opposing side of the landlord market), and
 * 36 drafts sat ready to fire from a single account in one afternoon.
 *
 * Deliberately conservative about blocking. Only three things stop a post outright:
 * an explicitly banned subreddit, a cooldown, and the daily cap. Everything else
 * is a caution the operator can read and overrule, because a governor that cries
 * wolf gets ignored — and an ignored governor prevents nothing.
 */

export type Severity = 'block' | 'caution'

export type PolicyReason = {
  code: string
  severity: Severity
  message: string
}

export type PolicyVerdict = {
  decision: 'allow' | 'caution' | 'block'
  reasons: PolicyReason[]
}

export type PolicyBrand = {
  id: string
  user_id: string
  subreddits: string[] | null
  max_posts_per_day: number | null
  subreddit_cooldown_days: number | null
}

export type PolicyOpportunity = {
  id: string
  platform: string
  subreddit: string | null
  source_published_at: string | null
}

// Reddit archives most posts around six months and rejects replies outright.
const REDDIT_ARCHIVE_DAYS = 180

function verdictFrom(reasons: PolicyReason[]): PolicyVerdict {
  if (reasons.some(r => r.severity === 'block')) return { decision: 'block', reasons }
  if (reasons.length > 0) return { decision: 'caution', reasons }
  return { decision: 'allow', reasons }
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : (Date.now() - t) / 86_400_000
}

export async function evaluatePosting(
  supabase: SupabaseClient,
  brand: PolicyBrand,
  opp: PolicyOpportunity,
): Promise<PolicyVerdict> {
  const reasons: PolicyReason[] = []
  const sub = opp.subreddit?.trim().toLowerCase() || null

  // 1. An archived thread rejects the reply at the platform, so posting only
  //    burns an attempt and looks like necroposting to anyone who sees it.
  if (opp.platform === 'reddit') {
    const age = daysSince(opp.source_published_at)
    if (age !== null && age > REDDIT_ARCHIVE_DAYS) {
      reasons.push({
        code: 'thread_archived',
        severity: 'block',
        message: `This thread is ${Math.round(age)} days old. Reddit archives posts at about six months and will reject the reply.`,
      })
    }
  }

  // 2. Where are we posting, and has the operator judged it?
  if (sub) {
    const { data: policy } = await supabase
      .from('subreddit_policies')
      .select('stance, cooldown_days, notes')
      .eq('user_id', brand.user_id)
      .eq('subreddit', sub)
      .maybeSingle()

    const stance = (policy as { stance?: string } | null)?.stance ?? 'unknown'
    const chosen = (brand.subreddits ?? []).some(s => s.trim().toLowerCase() === sub)

    if (stance === 'banned') {
      reasons.push({
        code: 'subreddit_banned',
        severity: 'block',
        message: `You marked r/${sub} as off limits.`,
      })
    } else if (stance === 'caution') {
      reasons.push({
        code: 'subreddit_caution',
        severity: 'caution',
        message: `You flagged r/${sub} as risky — read its rules before posting.`,
      })
    } else if (stance === 'unknown' && !chosen) {
      reasons.push({
        code: 'subreddit_off_list',
        severity: 'caution',
        message: `r/${sub} is not one of this brand's subreddits — the scanner drifted here. Check whether it allows self-promotion before replying.`,
      })
    }

    // 3. Cooldown: repeatedly dropping the same link into one subreddit is the
    //    single most reliable way to get read as a spammer.
    const cooldownDays = (policy as { cooldown_days?: number } | null)?.cooldown_days
      ?? brand.subreddit_cooldown_days ?? 7
    if (cooldownDays > 0) {
      const since = new Date(Date.now() - cooldownDays * 86_400_000).toISOString()
      const { data: recent } = await supabase
        .from('opportunities')
        .select('posted_at')
        .eq('brand_id', brand.id)
        .eq('status', 'posted')
        .eq('subreddit', opp.subreddit)
        .gte('posted_at', since)
        .order('posted_at', { ascending: false })
        .limit(1)

      const last = (recent as Array<{ posted_at: string }> | null)?.[0]
      if (last) {
        const ago = Math.max(0, Math.round(daysSince(last.posted_at) ?? 0))
        reasons.push({
          code: 'subreddit_cooldown',
          severity: 'block',
          message: `You posted in r/${sub} ${ago === 0 ? 'today' : `${ago} day${ago === 1 ? '' : 's'} ago`}. Wait ${cooldownDays} days between replies in the same subreddit.`,
        })
      }
    }
  }

  // 4. Daily cap across the brand. Genuine participation does not arrive in bursts.
  const cap = brand.max_posts_per_day ?? 3
  if (cap > 0) {
    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'posted')
      .gte('posted_at', dayStart.toISOString())

    if ((count ?? 0) >= cap) {
      reasons.push({
        code: 'daily_cap',
        severity: 'block',
        message: `You've already posted ${count} ${count === 1 ? 'reply' : 'replies'} for this brand today (cap ${cap}). Continue tomorrow.`,
      })
    }
  }

  return verdictFrom(reasons)
}
