import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Globe, Tag } from 'lucide-react'

export const metadata = { title: 'Brands — SurgeShift' }

export default async function BrandsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: brands } = await supabase
    .from('brands')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Brands</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Each brand gets its own keyword profile and opportunity feed</p>
        </div>
        <Link href="/brands/new" className="btn-accent">
          <Plus size={14} />
          Add Brand
        </Link>
      </div>

      {brands && brands.length > 0 ? (
        <div className="grid gap-4">
          {brands.map(brand => (
            <Link
              key={brand.id}
              href={`/brands/${brand.id}`}
              className="block surface-elevated rounded-2xl p-5 transition-all hover:border-[var(--color-accent)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{brand.name}</h2>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${brand.active ? 'text-green-400 bg-green-400/10 border border-green-400/20' : 'text-slate-500 bg-slate-500/10'}`}>
                      {brand.active ? 'ACTIVE' : 'PAUSED'}
                    </span>
                  </div>
                  {brand.tagline && <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>{brand.tagline}</p>}
                  <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-dim)' }}>
                    <span className="flex items-center gap-1"><Globe size={11} /> {brand.url}</span>
                    <span className="flex items-center gap-1"><Tag size={11} /> {(brand.keywords as string[]).length} keywords</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 surface rounded-2xl">
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>No brands yet. Add your first brand to start scanning.</p>
          <Link href="/brands/new" className="btn-accent">
            <Plus size={14} />
            Add Your First Brand
          </Link>
        </div>
      )}
    </div>
  )
}
