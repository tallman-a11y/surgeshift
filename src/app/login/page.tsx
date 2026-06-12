'use client'

import { useState } from 'react'
import { signIn } from '@/lib/supabase/auth-actions'
import { Zap, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signIn(email, password)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--color-background)' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-accent)', boxShadow: '0 0 24px rgba(99,102,241,0.5)' }}>
          <Zap size={20} fill="white" color="white" />
        </div>
        <div>
          <div className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>SurgeShift</div>
          <div className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>AI Marketing Intelligence</div>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl p-8 surface" style={{ boxShadow: '0 0 40px rgba(99,102,241,0.1)' }}>
        <h1 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>Sign in</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Find people looking for your products — right now.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn-accent justify-center mt-2" disabled={loading}>
            {loading ? <><Loader2 size={15} className="animate-spin" /> Signing in…</> : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs" style={{ color: 'var(--color-text-dim)' }}>
        Part of the <span style={{ color: 'var(--color-accent)' }}>AllShift AI</span> family
      </p>
    </div>
  )
}
