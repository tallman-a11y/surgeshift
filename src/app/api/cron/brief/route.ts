import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email'
import { threadAge } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * The morning brief.
 *
 * The audit's clearest number was 464 pending against 12 ever posted: a tool that
 * requires you to remember it is a tool you don't use. This brings the two or
 * three threads worth ten minutes to the inbox instead.
 *
 * Two rules keep it worth opening:
 *   - it never sends an empty brief (nothing new = silence, not a chore)
 *   - it sends at most once per user per day (notification_log unique key)
 */

const MIN_SCORE = 45
const PER_BRAND = 3

type Row = {
  id: string
  brand_id: string
  platform: string
  title: string | null
  score: number
  score_reason: string | null
  thread_url: string
  subreddit: string | null
  source_published_at: string | null
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://surgeshiftai.com'
  const today = new Date().toISOString().slice(0, 10)

  const { data: brands } = await supabase
    .from('brands')
    .select('id, name, user_id')
    .eq('active', true)
  if (!brands?.length) return NextResponse.json({ sent: 0, reason: 'no active brands' })

  type BrandRow = { id: string; name: string; user_id: string }
  const byUser = new Map<string, BrandRow[]>()
  for (const b of brands as BrandRow[]) {
    byUser.set(b.user_id, [...(byUser.get(b.user_id) ?? []), b])
  }

  const results: Array<Record<string, unknown>> = []

  for (const [userId, userBrands] of byUser) {
    // Already briefed today? The unique key would reject the insert anyway; check
    // first so we don't send the mail and then fail to record it.
    const { data: already } = await supabase
      .from('notification_log')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', 'morning_brief')
      .eq('sent_for', today)
      .maybeSingle()
    if (already) { results.push({ userId, skipped: 'already sent today' }); continue }

    const sections: Array<{ brand: BrandRow; rows: Row[] }> = []
    for (const brand of userBrands) {
      const { data } = await supabase
        .from('opportunities')
        .select('id, brand_id, platform, title, score, score_reason, thread_url, subreddit, source_published_at')
        .eq('brand_id', brand.id)
        .eq('status', 'pending')
        .gte('score', MIN_SCORE)
        // Freshest first among the ones we know the age of; migration 003 means
        // anything scanned before today has a null date and sorts last.
        .order('source_published_at', { ascending: false, nullsFirst: false })
        .order('score', { ascending: false })
        .limit(PER_BRAND)
      if (data?.length) sections.push({ brand, rows: data as Row[] })
    }

    const total = sections.reduce((n, s) => n + s.rows.length, 0)
    if (total === 0) { results.push({ userId, skipped: 'nothing worth sending' }); continue }

    const { data: userRow } = await supabase.auth.admin.getUserById(userId)
    const to = userRow?.user?.email
    if (!to) { results.push({ userId, skipped: 'no email on account' }); continue }

    const best = sections.flatMap(s => s.rows).sort((a, b) => b.score - a.score)[0]
    const subject = total === 1
      ? `1 thread worth your time — ${best.title?.slice(0, 60) ?? 'new opportunity'}`
      : `${total} threads worth your time today`

    const blocks = sections.map(s => {
      const items = s.rows.map(r => {
        const age = threadAge(r.source_published_at, r.platform)
        const where = r.subreddit ? `r/${r.subreddit}` : r.platform
        return `
          <tr><td style="padding:14px 0;border-bottom:1px solid #e6e8f0;">
            <div style="font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#6b7288;letter-spacing:.04em;">
              ${esc(String(r.score))} · ${esc(where)} · ${esc(age.label)}
            </div>
            <div style="font:600 15px/1.4 -apple-system,Segoe UI,sans-serif;color:#10131f;margin:5px 0 4px;">
              ${esc(r.title ?? 'Untitled thread')}
            </div>
            <div style="font:400 13px/1.5 -apple-system,Segoe UI,sans-serif;color:#4b5163;margin-bottom:7px;">
              ${esc((r.score_reason ?? '').slice(0, 180))}
            </div>
            <a href="${esc(r.thread_url)}" style="font:500 13px -apple-system,Segoe UI,sans-serif;color:#4f46e5;text-decoration:none;">Read the thread →</a>
          </td></tr>`
      }).join('')
      return `
        <div style="font:700 13px -apple-system,Segoe UI,sans-serif;color:#10131f;margin:26px 0 2px;">${esc(s.brand.name)}</div>
        <table cellpadding="0" cellspacing="0" width="100%">${items}</table>`
    }).join('')

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6fa;">
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#f5f6fa;padding:28px 16px;">
        <tr><td align="center">
          <table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e6e8f0;border-radius:12px;padding:26px 28px;">
            <tr><td>
              <div style="font:700 18px/1.3 -apple-system,Segoe UI,sans-serif;color:#10131f;">Good morning.</div>
              <div style="font:400 14px/1.6 -apple-system,Segoe UI,sans-serif;color:#4b5163;margin-top:6px;">
                ${total === 1 ? 'One thread is' : `${total} threads are`} worth a look — freshest and highest-scoring first.
              </div>
              ${blocks}
              <div style="margin-top:26px;padding-top:18px;border-top:1px solid #e6e8f0;">
                <a href="${esc(appUrl)}/dashboard" style="display:inline-block;background:#4f46e5;color:#ffffff;font:600 14px -apple-system,Segoe UI,sans-serif;text-decoration:none;padding:10px 18px;border-radius:7px;">Open the queue</a>
              </div>
              <div style="font:400 12px/1.5 -apple-system,Segoe UI,sans-serif;color:#8a90a6;margin-top:18px;">
                Sent because these threads are still live. SurgeShift stays quiet on days it finds nothing.
              </div>
            </td></tr>
          </table>
        </td></tr>
      </table></body></html>`

    const text = [
      `${total === 1 ? 'One thread is' : `${total} threads are`} worth a look today.`,
      '',
      ...sections.flatMap(s => [
        s.brand.name,
        ...s.rows.map(r => {
          const age = threadAge(r.source_published_at, r.platform)
          return `  [${r.score}] ${r.subreddit ? 'r/' + r.subreddit : r.platform} · ${age.label}\n  ${r.title ?? ''}\n  ${r.thread_url}`
        }),
        '',
      ]),
      `Open the queue: ${appUrl}/dashboard`,
    ].join('\n')

    const sent = await sendEmail({ to, subject, html, text })
    if (sent.ok) {
      await supabase.from('notification_log').insert({
        user_id: userId,
        kind: 'morning_brief',
        sent_for: today,
        detail: { total, brands: sections.map(s => s.brand.name), message_id: sent.id },
      })
      results.push({ userId, to, total, sent: sent.id })
    } else {
      results.push({ userId, to, total, error: sent.error })
    }
  }

  return NextResponse.json({ briefs: results.length, results })
}
