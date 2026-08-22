import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidToken, TokenRefreshError, type PlatformConnection } from '@/lib/platform-tokens'

export const dynamic = 'force-dynamic'

/**
 * Is a posting connection actually alive? "Connected" in the DB only means we
 * stored a token once; the platform may have expired or revoked it since. This
 * forces a refresh — the one operation that proves the grant still works —
 * without posting anything.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const platform = req.nextUrl.searchParams.get('platform')
  if (platform !== 'reddit' && platform !== 'youtube') {
    return NextResponse.json({ error: 'platform must be reddit or youtube' }, { status: 400 })
  }

  const { data: conn } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('platform', platform)
    .maybeSingle()

  if (!conn) return NextResponse.json({ connected: false, live: false })

  const connection = conn as PlatformConnection
  try {
    await getValidToken(supabase, connection, { force: true })
    return NextResponse.json({ connected: true, live: true, username: connection.username })
  } catch (err) {
    const error = err instanceof TokenRefreshError ? err.message : 'Could not verify the connection right now.'
    return NextResponse.json({ connected: true, live: false, username: connection.username, error })
  }
}
