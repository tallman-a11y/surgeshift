import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL!))

  const state = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set('reddit_oauth_state', state, { httpOnly: true, secure: true, maxAge: 600, path: '/' })

  const params = new URLSearchParams({
    client_id: process.env.REDDIT_CLIENT_ID!,
    response_type: 'code',
    state,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/reddit/callback`,
    duration: 'permanent',
    scope: 'submit identity',
  })

  return NextResponse.redirect(`https://www.reddit.com/api/v1/authorize?${params}`)
}
