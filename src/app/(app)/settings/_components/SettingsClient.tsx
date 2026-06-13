'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { User, Key, Zap, CheckCircle, XCircle, Link2, Link2Off, PlayCircle } from 'lucide-react'

type Integration = { name: string; description: string; active: boolean }

type Props = {
  email: string
  userId: string
  integrations: Integration[]
  redditConnected: boolean
  youtubeConnected: boolean
  redditUsername: string | null
  youtubeUsername: string | null
}

export default function SettingsClient({
  email, userId, integrations, redditConnected, youtubeConnected, redditUsername, youtubeUsername,
}: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected === 'reddit') setBanner({ type: 'success', msg: 'Reddit connected successfully.' })
    else if (connected === 'youtube') setBanner({ type: 'success', msg: 'YouTube connected successfully.' })
    else if (error === 'reddit_denied') setBanner({ type: 'error', msg: 'Reddit authorization was denied.' })
    else if (error === 'youtube_denied') setBanner({ type: 'error', msg: 'YouTube authorization was denied.' })
    else if (error === 'reddit_state' || error === 'youtube_state') setBanner({ type: 'error', msg: 'OAuth state mismatch — try again.' })
    else if (error === 'reddit_token') setBanner({ type: 'error', msg: 'Failed to get Reddit token — check your app credentials.' })
    else if (error === 'youtube_token') setBanner({ type: 'error', msg: 'Failed to get YouTube token — check your app credentials.' })

    if (connected || error) {
      const url = new URL(window.location.href)
      url.searchParams.delete('connected')
      url.searchParams.delete('error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  async function handleDisconnect(platform: string) {
    setDisconnecting(platform)
    try {
      await fetch('/api/platform-connections/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      })
      setBanner({ type: 'success', msg: `${platform === 'reddit' ? 'Reddit' : 'YouTube'} disconnected.` })
      router.refresh()
    } finally {
      setDisconnecting(null)
    }
  }

  const postingConnections = [
    {
      platform: 'reddit',
      label: 'Reddit',
      description: 'Post replies to Reddit threads on your behalf',
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M10 0C4.478 0 0 4.478 0 10c0 5.523 4.478 10 10 10 5.523 0 10-4.477 10-10C20 4.478 15.523 0 10 0zm6.894 10.01a1.39 1.39 0 01-1.39 1.39c-.38 0-.724-.153-.977-.4-1.208.875-2.887 1.44-4.756 1.502l.808 3.8 2.634-.56a1.25 1.25 0 112.447.01 1.25 1.25 0 01-2.5 0l-2.943.626a.312.312 0 01-.37-.234l-.9-4.232c-1.89-.047-3.594-.612-4.816-1.494a1.39 1.39 0 11-1.842-2.083 1.39 1.39 0 01.815 1.25c0 .19-.039.37-.107.534.107.6.107 1.209 0 1.802C3.106 11.4 3.106 11.4 3.106 10a1.39 1.39 0 011.39-1.39c.38 0 .724.153.977.4C6.68 8.13 8.36 7.563 10.228 7.5l-.894-4.196 2.635-.56a1.25 1.25 0 112.446-.009 1.25 1.25 0 01-2.5 0l-2.944.626.808 3.8c1.892.048 3.596.614 4.818 1.497.252-.247.596-.4.976-.4a1.39 1.39 0 011.32 1.752z" />
        </svg>
      ),
      connected: redditConnected,
      username: redditUsername,
      connectHref: '/api/auth/reddit',
    },
    {
      platform: 'youtube',
      label: 'YouTube',
      description: 'Post comments on YouTube videos and threads on your behalf',
      icon: <PlayCircle size={20} />,
      connected: youtubeConnected,
      username: youtubeUsername,
      connectHref: '/api/auth/youtube',
    },
  ]

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Account and integration status</p>
      </div>

      {banner && (
        <div
          className="rounded-xl px-4 py-3 text-sm font-medium"
          style={{
            background: banner.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: banner.type === 'success' ? 'var(--color-green)' : '#f87171',
            border: `1px solid ${banner.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}
        >
          {banner.msg}
        </div>
      )}

      {/* Account */}
      <div className="surface-elevated rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
            <User size={16} style={{ color: 'var(--color-accent)' }} />
          </div>
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Account</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Email</span>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>User ID</span>
            <span className="text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>{userId.slice(0, 8)}…</span>
          </div>
        </div>
      </div>

      {/* Posting Connections */}
      <div className="surface-elevated rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
            <Link2 size={16} style={{ color: 'var(--color-accent)' }} />
          </div>
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Posting Accounts</h2>
        </div>
        <p className="text-xs mb-4 ml-11" style={{ color: 'var(--color-text-dim)' }}>
          Connect accounts to post replies directly from SurgeShift without leaving the app.
        </p>
        <div className="space-y-1">
          {postingConnections.map((item, i) => (
            <div
              key={item.platform}
              className={`flex items-center justify-between py-3.5 ${i < postingConnections.length - 1 ? 'border-b border-white/5' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span style={{ color: item.connected ? 'var(--color-accent)' : 'var(--color-text-dim)' }}>
                  {item.icon}
                </span>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{item.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                    {item.connected && item.username ? `Connected as ${item.username}` : item.description}
                  </p>
                </div>
              </div>
              <div>
                {item.connected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(item.platform)}
                    disabled={disconnecting === item.platform}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                  >
                    <Link2Off size={11} />
                    {disconnecting === item.platform ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : (
                  <a
                    href={item.connectHref}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                    style={{ background: 'var(--color-accent)', color: '#000' }}
                  >
                    <Link2 size={11} />
                    Connect
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scan Integrations */}
      <div className="surface-elevated rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
            <Zap size={16} style={{ color: 'var(--color-accent)' }} />
          </div>
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Scan Integrations</h2>
        </div>
        <div className="space-y-1">
          {integrations.map((item, i) => (
            <div
              key={item.name}
              className={`flex items-center justify-between py-3 ${i < integrations.length - 1 ? 'border-b border-white/5' : ''}`}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{item.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>{item.description}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {item.active ? (
                  <><CheckCircle size={14} className="text-green-400" /><span className="text-xs text-green-400 font-medium">Active</span></>
                ) : (
                  <><XCircle size={14} className="text-red-400" /><span className="text-xs text-red-400 font-medium">Missing key</span></>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* API Keys hint */}
      <div className="surface rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Key size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--color-text-dim)' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
            Scan API keys are managed via Vercel environment variables. Posting accounts use OAuth — connect them above.
          </p>
        </div>
      </div>
    </div>
  )
}
