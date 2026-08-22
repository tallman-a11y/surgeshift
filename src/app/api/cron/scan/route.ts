import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runScan } from '@/lib/scanner'

export const runtime = 'nodejs'
export const maxDuration = 300

// Vercel cron hits this with no user session, so the cookie-based client sees
// nothing under RLS (brands → [] → "No active brands", forever). Use the
// service-role client for the whole run: reading brands, de-duping, inserting
// opportunities and logging scan_runs.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: brands, error } = await supabase
    .from('brands')
    .select('*')
    .eq('active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!brands || brands.length === 0) {
    return NextResponse.json({ message: 'No active brands' })
  }

  type BrandRow = {
    id: string
    name: string
    tagline: string
    description: string
    url: string
    voice_notes?: string
    keywords: string[]
    subreddits: string[]
    user_id: string
  }

  const results = []
  for (const brand of brands as BrandRow[]) {
    try {
      const scanResults = await runScan(brand, brand.user_id, supabase)
      results.push({ brand: brand.name, ...scanResults[0] })
    } catch (err) {
      results.push({ brand: brand.name, error: String(err) })
    }
  }

  return NextResponse.json({ scanned: results.length, results })
}
