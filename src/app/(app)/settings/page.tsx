import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { User, Key, Zap, CheckCircle, XCircle } from 'lucide-react'

export const metadata = { title: 'Settings — SurgeShift' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const integrations = [
    {
      name: 'Reddit',
      description: 'RSS feeds — no credentials required',
      active: true,
    },
    {
      name: 'YouTube',
      description: 'YouTube Data API v3',
      active: !!process.env.YOUTUBE_API_KEY,
    },
    {
      name: 'Twitter / X',
      description: 'Twitter API v2 bearer token',
      active: !!process.env.TWITTER_BEARER_TOKEN,
    },
    {
      name: 'Claude AI',
      description: 'Anthropic API — scoring & reply drafting',
      active: !!process.env.ANTHROPIC_API_KEY,
    },
  ]

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Account and integration status</p>
      </div>

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
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{user.email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>User ID</span>
            <span className="text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>{user.id.slice(0, 8)}…</span>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="surface-elevated rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
            <Zap size={16} style={{ color: 'var(--color-accent)' }} />
          </div>
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Integrations</h2>
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
                  <>
                    <CheckCircle size={14} className="text-green-400" />
                    <span className="text-xs text-green-400 font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle size={14} className="text-red-400" />
                    <span className="text-xs text-red-400 font-medium">Missing key</span>
                  </>
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
            API keys are managed via Vercel environment variables. Any integration showing &ldquo;Missing key&rdquo; will be skipped during scans.
          </p>
        </div>
      </div>
    </div>
  )
}
