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

  if (error || !code) return NextResponse.redirect(`${appUrl}/settings?error=youtube_denied`)

  const cookieStore = await cookies()
  const savedState = cookieStore.get('youtube_oauth_state')?.value
  cookieStore.delete('youtube_oauth_state')
  if (state !== savedState) return NextResponse.redirect(`${appUrl}/settings?error=youtube_state`)

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${appUrl}/api/auth/youtube/callback`,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) return NextResponse.redirect(`${appUrl}/settings?error=youtube_token`)

  type GoogleTokenResponse = { access_token: string; refresh_token?: string; expires_in: number }
  const tokens = await tokenRes.json() as GoogleTokenResponse

  // Get channel name
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&key=${process.env.YOUTUBE_API_KEY}`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )
  type ChannelResponse = { items?: { snippet: { title: string } }[] }
  const channelData = channelRes.ok ? await channelRes.json() as ChannelResponse : null
  const username = channelData?.items?.[0]?.snippet?.title ?? null

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase.from('platform_connections').upsert({
    user_id: user.id,
    platform: 'youtube',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: expiresAt,
    username,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform' })

  return NextResponse.redirect(`${appUrl}/settings?connected=youtube`)
}
