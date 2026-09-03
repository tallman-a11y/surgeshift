'use client'

import { useState } from 'react'
import Link from 'next/link'
import { KeyRound, ArrowRight, Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || busy) return

    setBusy(true)
    setError(null)

    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/shift` },
    })

    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="land-hero-ambient absolute inset-0" />
      <div className="land-dot-grid absolute inset-0" style={{ opacity: 0.22 }} />

      <div className="relative z-10 w-full" style={{ maxWidth: 380 }}>
        <Link href="/" className="flex items-center justify-center gap-2 mb-8 no-underline">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
          >
            <KeyRound size={17} style={{ color: 'var(--color-accent)' }} />
          </div>
          <span className="land-gradient-text font-extrabold text-lg tracking-tight">AgentShift</span>
        </Link>

        <div className="land-glass rounded-2xl p-7">
          {sent ? (
            <div className="text-center">
              <MailCheck size={30} className="mx-auto mb-3" style={{ color: 'var(--color-accent)' }} />
              <h1 className="text-lg font-bold mb-1.5">Check your email</h1>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                We sent a sign-in link to <strong style={{ color: 'var(--color-text)' }}>{email}</strong>.
                It expires in an hour.
              </p>
              <button
                type="button"
                onClick={() => { setSent(false); setEmail('') }}
                className="btn-ghost mt-5 mx-auto"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-extrabold tracking-tight mb-1.5">Open your business</h1>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                No password. We&rsquo;ll email you a link.
              </p>

              <form onSubmit={submit} className="flex flex-col gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@brokerage.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
                {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
                <button type="submit" className="btn-accent justify-center" disabled={busy || !email.trim()}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <>Send the link <ArrowRight size={14} /></>}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--color-text-dim)' }}>
          Part of the <span className="land-gradient-text font-bold">AllShift AI</span> family
        </p>
      </div>
    </div>
  )
}
