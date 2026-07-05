import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import VersionGate from '@/components/VersionGate'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'SurgeShift — AI Marketing Intelligence',
  description: 'Find people already looking for your product. AI-powered social opportunity discovery.',
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
