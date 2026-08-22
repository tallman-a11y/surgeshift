'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Zap, Sparkles, Briefcase, Settings, LogOut, ScanSearch, TrendingUp, Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/auth-actions'
import type { User } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Shift', href: '/app', icon: Sparkles },
  { label: 'Opportunities', href: '/dashboard', icon: TrendingUp },
  { label: 'Brands', href: '/brands', icon: Briefcase },
  { label: 'Settings', href: '/settings', icon: Settings },
]

type NavContentProps = {
  pathname: string
  user: User | null
  initials: string
  onSignOut: () => void
  onNavigate: () => void
}

// Module-level on purpose: defining this inside Sidebar would re-create the
// component every render and remount its whole subtree.
function NavContent({ pathname, user, initials, onSignOut, onNavigate }: NavContentProps) {
  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent)', boxShadow: '0 0 16px rgba(99,102,241,0.4)' }}>
          <Zap size={16} fill="white" color="white" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>SurgeShift</div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>AI Intelligence</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'text-white'
                  : 'hover:text-white'
              )}
              style={active ? {
                background: 'var(--color-accent-muted)',
                color: 'white',
                border: '1px solid rgba(99,102,241,0.3)',
              } : { color: 'var(--color-text-muted)' }}
            >
              <Icon size={16} style={{ color: active ? 'var(--color-accent)' : undefined }} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Scan shortcut */}
      <div className="px-3 pb-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-bold w-full transition-all"
          style={{ background: 'var(--color-accent)', color: 'white', boxShadow: '0 0 16px rgba(99,102,241,0.3)' }}
        >
          <ScanSearch size={15} />
          Run Scan
        </Link>
      </div>

      {/* User */}
      {user && (
        <div className="px-3 pb-4 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--color-accent)' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>
                {(user.user_metadata?.display_name as string) || user.email?.split('@')[0]}
              </p>
              <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{user.email}</p>
            </div>
            <button type="button" onClick={onSignOut} className="p-1.5 rounded-md transition-all" style={{ color: 'var(--color-text-muted)' }} title="Sign out">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const initials = user?.user_metadata?.display_name
    ? (user.user_metadata.display_name as string).slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '??'

  // The drawer closes on navigation via each link's onClick (no pathname effect needed).
  const closeDrawer = () => setMobileOpen(false)
  const navProps: NavContentProps = { pathname, user, initials, onSignOut: handleSignOut, onNavigate: closeDrawer }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        title="Open menu"
        className="fixed top-4 left-4 z-50 md:hidden w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={closeDrawer} />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 w-56 flex flex-col z-50 md:hidden transition-transform duration-300',
        )}
        style={{
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <button type="button" onClick={closeDrawer} aria-label="Close menu" title="Close menu" className="absolute top-4 right-4 p-1.5 rounded-md" style={{ color: 'var(--color-text-muted)' }}>
          <X size={16} />
        </button>
        <NavContent {...navProps} />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 w-56 flex-col hidden md:flex"
        style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}
      >
        <NavContent {...navProps} />
      </aside>
    </>
  )
}
