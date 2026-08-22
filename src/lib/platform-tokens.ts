import type { SupabaseClient } from '@supabase/supabase-js'

export type PlatformConnection = {
  id: string
  platform: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  username: string | null
}

/** A refresh that the platform itself refused — the user has to reconnect. */
export class TokenRefreshError extends Error {
  constructor(public readonly platform: string, message: string) {
    super(message)
    this.name = 'TokenRefreshError'
  }
}

export async function refreshRedditToken(conn: PlatformConnection): Promise<string> {
  if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
    throw new TokenRefreshError('reddit', 'Reddit app credentials are not configured yet (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET).')
  }
  if (!conn.refresh_token) throw new TokenRefreshError('reddit', 'No Reddit refresh token stored — reconnect Reddit.')

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
      'User-Agent': 'SurgeShift/1.0',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
  })
  const data = await res.json().catch(() => ({})) as { access_token?: string; error?: string }
  if (!res.ok || !data.access_token) {
    throw new TokenRefreshError('reddit', `Reddit refused the token refresh (${data.error ?? `HTTP ${res.status}`}) — reconnect Reddit in Settings.`)
  }
  return data.access_token
}

export async function refreshYouTubeToken(conn: PlatformConnection): Promise<string> {
  if (!conn.refresh_token) throw new TokenRefreshError('youtube', 'No YouTube refresh token stored — reconnect YouTube.')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  })
  const data = await res.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    // invalid_grant = the refresh token expired or was revoked (Google "Testing" apps expire them after 7 days).
    const why = data.error === 'invalid_grant'
      ? 'YouTube access expired or was revoked'
      : `Google refused the token refresh (${data.error ?? `HTTP ${res.status}`})`
    throw new TokenRefreshError('youtube', `${why} — reconnect YouTube in Settings.`)
  }
  return data.access_token
}

/**
 * Returns a usable access token, refreshing (and persisting) it when the stored one
 * is expired. `force` refreshes regardless — the only way to prove the grant is alive.
 * Throws TokenRefreshError when the platform refuses, so callers can tell the user
 * to reconnect instead of posting with a dead token.
 */
export async function getValidToken(
  supabase: SupabaseClient,
  conn: PlatformConnection,
  opts: { force?: boolean } = {},
): Promise<string> {
  const expired = !!conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 60_000
  if (!expired && !opts.force) return conn.access_token

  const newToken = conn.platform === 'reddit'
    ? await refreshRedditToken(conn)
    : await refreshYouTubeToken(conn)

  await supabase.from('platform_connections').update({
    access_token: newToken,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', conn.id)

  return newToken
}
