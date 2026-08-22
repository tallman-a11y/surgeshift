import AppChrome from '@/components/layout/AppChrome'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppChrome>{children}</AppChrome>
}
