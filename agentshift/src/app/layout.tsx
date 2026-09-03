import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import VersionGate from '@/components/VersionGate'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'AgentShift — the only platform a real estate agent needs open',
  description:
    'Your CRM, CMA, transaction coordinator, compliance checklist, marketing team and back office — in one conversation.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full antialiased" style={{ background: 'var(--color-background)', color: 'var(--color-text)' }}>
        <VersionGate />
        {children}
      </body>
    </html>
  )
}
