import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsClient from './_components/SettingsClient'

export const metadata = { title: 'Settings — SurgeShift' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: connections } = await supabase
    .from('platform_connections')
    .select('platform, username')
    .eq('user_id', user.id)

  const connectionMap = Object.fromEntries((connections ?? []).map(c => [c.platform, c.username as string | null]))

  const integrations = [
    { name: 'Reddit (scan)', description: 'Brave Search API — BRAVE_API_KEY', active: !!process.env.BRAVE_API_KEY },
    { name: 'YouTube (scan)', description: 'YouTube Data API v3 — YOUTUBE_API_KEY', active: !!process.env.YOUTUBE_API_KEY },
    { name: 'Twitter / X', description: 'Twitter API v2 bearer token', active: !!process.env.TWITTER_BEARER_TOKEN },
    { name: 'Claude AI', description: 'Anthropic API — scoring & reply drafting', active: !!process.env.ANTHROPIC_API_KEY },
  ]

  return (
    <SettingsClient
      email={user.email ?? ''}
      userId={user.id}
      integrations={integrations}
      redditUsername={connectionMap['reddit'] ?? null}
      youtubeUsername={connectionMap['youtube'] ?? null}
      redditConnected={'reddit' in connectionMap}
      youtubeConnected={'youtube' in connectionMap}
    />
  )
}
