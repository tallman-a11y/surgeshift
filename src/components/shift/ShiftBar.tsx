'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Plus, Settings, LogOut, ChevronDown, Inbox, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/auth-actions'
import { cn } from '@/lib/utils'

export type ShiftState = 'idle' | 'scanning' | 'thinking' | 'posting' | 'generating'

type Brand = {
  id: string
  name: string
  active: boolean
}

type PendingCounts = Record<string, number>

type Props = {
  shiftState: ShiftState
  activeBrandId: string | null
  onBrandSelect: (id: string | null) => void
  onVoice?: () => void
  pendingCounts?: PendingCounts
}

const STATE_CONFIG: Record<ShiftState, { label: string; color: string; glow: string }> = {
  idle:       { label: 'Ready',      color: '#6366f1', glow: 'rgba(99,102,241,0.4)' },
  thinking:   { label: 'Thinking',   color: '#a855f7', glow: 'rgba(168,85,247,0.4)' },
  scanning:   { label: 'Scanning',   color: '#22d3ee', glow: 'rgba(34,211,238,0.4)' },
  posting:    { label: 'Posting',    color: '#22c55e', glow: 'rgba(34,197,94,0.4)' },
  generating: { label: 'Generating', color: '#f59e0b', glow: 'rgba(245,158,11,0.4)' },
}

export default function ShiftBar({ shiftState, activeBrandId, onBrandSelect, onVoice, pendingCounts = {} }: Props) {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [userEmail, setUserEmail] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? '')
    })
    supabase.from('brands').select('id, name, active').eq('active', true).order('created_at').then(({ data }) => {
      setBrands((data ?? []) as Brand[])
    })
  }, [])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const config = STATE_CONFIG[shiftState]
  const totalPending = Object.values(pendingCounts).reduce((s, n) => s + n, 0)

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3"
      style={{
        background: 'rgba(8,8,14,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(99,102,241,0.12)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--color-accent)', boxShadow: '0 0 14px rgba(99,102,241,0.5)' }}
        >
          <Zap size={14} fill="white" color="white" />
        </div>
        <span className="text-sm font-bold tracking-tight hidden sm:block" style={{ color: 'var(--color-text)' }}>
          SurgeShift
        </span>
      </div>

      <div className="w-px h-5 shrink-0" style={{ background: 'var(--color-border)' }} />

      {/* Brand pills */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => onBrandSelect(null)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-all',
            activeBrandId === null ? 'text-white' : ''
          )}
          style={activeBrandId === null
            ? { background: 'var(--color-accent)', color: 'white' }
            : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }
          }
        >
          All brands
          {totalPending > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: activeBrandId === null ? 'rgba(255,255,255,0.2)' : 'var(--color-accent)', color: 'white' }}
            >
              {totalPending}
            </span>
          )}
        </button>

        {brands.map(brand => {
          const pending = pendingCounts[brand.id] ?? 0
          const active = activeBrandId === brand.id
          return (
            <button
              key={brand.id}
              type="button"
              onClick={() => onBrandSelect(brand.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-all',
              )}
              style={active
                ? { background: 'var(--color-accent)', color: 'white' }
                : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }
              }
            >
              {brand.name}
              {pending > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: active ? 'rgba(255,255,255,0.2)' : 'var(--color-accent)', color: 'white' }}
                >
                  {pending}
                </span>
              )}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => onBrandSelect('new')}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs shrink-0 transition-all"
          style={{ color: 'var(--color-text-dim)', border: '1px dashed var(--color-border)' }}
          title="Add brand"
        >
          <Plus size={11} />
          <span className="hidden sm:inline">Add brand</span>
        </button>
      </div>

      {/* Shift state indicator */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span
            className={cn('w-1.5 h-1.5 rounded-full', shiftState !== 'idle' && 'animate-pulse')}
            style={{ background: config.color, boxShadow: shiftState !== 'idle' ? `0 0 6px ${config.glow}` : 'none' }}
          />
          <span className="text-[11px] font-medium hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>
            {config.label}
          </span>
        </div>

        {/* Hey Shift voice button */}
        {onVoice && (
          <button
            type="button"
            onClick={onVoice}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0"
            style={{ background: 'var(--color-accent)', color: 'white', boxShadow: '0 0 12px rgba(99,102,241,0.3)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V6zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            <span className="hidden sm:inline">Hey Shift</span>
          </button>
        )}

        {/* Settings + user menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen(o => !o)}
            className="flex items-center gap-1.5 p-1.5 rounded-lg transition-all"
            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ background: 'rgba(99,102,241,0.2)', color: 'var(--color-accent)' }}
            >
              {userEmail.slice(0, 2).toUpperCase()}
            </div>
            <ChevronDown size={11} />
          </button>

          {userMenuOpen && (
            <div
              className="absolute top-full right-0 mt-1 w-44 rounded-xl py-1 z-50"
              style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)' }}
            >
              <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>{userEmail}</p>
              </div>
              <button
                type="button"
                onClick={() => { router.push('/dashboard'); setUserMenuOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-all text-left"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <Inbox size={12} /> Opportunity feed
              </button>
              <button
                type="button"
                onClick={() => { router.push('/brands'); setUserMenuOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-all text-left"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <Tag size={12} /> Brands
              </button>
              <button
                type="button"
                onClick={() => { router.push('/settings'); setUserMenuOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-all text-left"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <Settings size={12} /> Settings
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-all text-left"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
