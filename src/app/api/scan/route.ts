import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runScan } from '@/lib/scanner'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { brandId } = await req.json() as { brandId?: string }
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .eq('user_id', user.id)
    .single()

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  type BrandRow = {
    id: string
    name: string
    tagline: string
    description: string
    url: string
    voice_notes?: string
    keywords: string[]
    subreddits: string[]
  }

  const results = await runScan(brand as BrandRow, user.id)
  const total = results.reduce((s, r) => s + r.new_count, 0)
  const scanned = results.reduce((s, r) => s + r.total_scanned, 0)

  return NextResponse.json({ new_count: total, total_scanned: scanned, details: results })
}
