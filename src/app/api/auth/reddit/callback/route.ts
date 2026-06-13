import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login`)

  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code) return NextResponse.redirect(`${appUrl}/settings?error=reddit_denied`)

  const cookieStore = await cookies()
  const savedState = cookieStore.get('reddit_oauth_state')?.value
  cookieStore.delete('reddit_oauth_state')
  if (state !== savedState) return NextResponse.redirect(`${appUrl}/settings?error=reddit_state`)

  // Exchange code for tokens
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
      'User-Agent': 'SurgeShift/1.0',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${appUrl}/api/auth/reddit/callback`,
    }),
  })

  if (!tokenRes.ok) return NextResponse.redirect(`${appUrl}/settings?error=reddit_token`)

  type RedditTokenResponse = { access_token: string; refresh_token: string; expires_in: number }
  const tokens = await tokenRes.json() as RedditTokenResponse

  // Get Reddit username
  const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'User-Agent': 'SurgeShift/1.0',
    },
  })
  type RedditMeResponse = { name: string }
  const me = meRes.ok ? await meRes.json() as RedditMeResponse : null

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase.from('platform_connections').upsert({
    user_id: user.id,
    platform: 'reddit',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    username: me?.name ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform' })

  return NextResponse.redirect(`${appUrl}/settings?connected=reddit`)
}
