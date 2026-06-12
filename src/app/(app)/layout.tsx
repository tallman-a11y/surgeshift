import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto md:ml-56" style={{ background: 'var(--color-background)' }}>
        {children}
      </main>
    </div>
  )
}
