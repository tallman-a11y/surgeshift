'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'

/**
 * Two kinds of authenticated surface share the (app) route group:
 *  - /app — the conversational Shift Intelligence OS. It owns the whole viewport
 *    (ShiftBar + split panels) and must not scroll as a page.
 *  - the classic pages (/dashboard, /brands, /settings) — normal scrolling pages
 *    that need the sidebar. Commit 541c8d4 dropped the sidebar from the layout
 *    when the OS launched, which left these pages with no navigation at all.
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isOs = pathname === '/app' || pathname.startsWith('/app/')

  if (isOs) {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--color-background)' }}>
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-background)' }}>
      <Sidebar />
      <main className="md:pl-56">{children}</main>
    </div>
  )
}
