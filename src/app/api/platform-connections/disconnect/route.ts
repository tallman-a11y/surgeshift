import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { platform } = await req.json() as { platform: string }
  if (!platform) return NextResponse.json({ error: 'Missing platform' }, { status: 400 })

  await supabase.from('platform_connections').delete().eq('user_id', user.id).eq('platform', platform)
  return NextResponse.json({ ok: true })
}
