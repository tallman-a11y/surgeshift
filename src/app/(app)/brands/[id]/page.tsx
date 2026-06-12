import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BrandForm from '../_components/BrandForm'

export const metadata = { title: 'Edit Brand — SurgeShift' }

export default async function EditBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!brand) notFound()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Edit Brand</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Update your brand profile and scanning keywords</p>
      <BrandForm brand={brand} />
    </div>
  )
}
