import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * Ingest a visit from a destination site.
 *
 * Every posted reply links to one of Tyler's own products with `?ref=<code>`.
 * The destination posts that code here so SurgeShift can tie a real visitor back
 * to the exact thread, subreddit and keyword that produced them — the loop the
 * audit found missing.
 *
 * Deliberately open (no auth): the caller is a browser on another origin, and the
 * only thing it can do is claim a visit against a code it already knows. Unknown
 * codes are still recorded so a typo in a destination's snippet is visible rather
 * than silently dropped.
 *
 * Destination snippet — the Blob type MUST be text/plain. `application/json` is
 * not a CORS-simple content type, so it makes sendBeacon trigger a preflight it
 * cannot complete and the beacon fails silently. Verified against production:
 * the JSON variant never arrived, the text/plain one did. The body is still JSON;
 * only the declared type differs, and req.json() parses it either way.
 *
 *   const ref = new URLSearchParams(location.search).get('ref')
 *   if (ref) navigator.sendBeacon('https://surgeshiftai.com/api/attribution/visit',
 *     new Blob([JSON.stringify({ ref, path: location.pathname })], { type: 'text/plain;charset=UTF-8' }))
 *
 * Live implementations: RealShift and WeldShift `components/app/ReferralBeacon.tsx`.
 */
export async function POST(req: NextRequest) {
  let body: { ref?: string; path?: string }
  try {
    body = await req.json() as { ref?: string; path?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS })
  }

  const code = body.ref?.trim()
  if (!code || code.length > 64) {
    return NextResponse.json({ error: 'ref required' }, { status: 400, headers: CORS })
  }

  const supabase = createServiceClient()
  const { data: link } = await supabase
    .from('tracked_links')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  await supabase.from('link_visits').insert({
    link_id: (link as { id: string } | null)?.id ?? null,
    code,
    referer: req.headers.get('referer')?.slice(0, 500) ?? null,
    user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    path: body.path?.slice(0, 300) ?? null,
  })

  return NextResponse.json({ ok: true }, { headers: CORS })
}
