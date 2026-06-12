import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runScan } from '@/lib/scanner'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Get all active brands
  const { data: brands } = await supabase
    .from('brands')
    .select('*')
    .eq('active', true)

  if (!brands || brands.length === 0) {
    return NextResponse.json({ message: 'No active brands' })
  }

  // Get user IDs for each brand
  const results = []
  for (const brand of brands) {
    try {
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
      const b = brand as BrandRow
      const scanResults = await runScan(b, b.user_id)
      results.push({ brand: b.name, ...scanResults[0] })
    } catch (err) {
      results.push({ brand: (brand as { name: string }).name, error: String(err) })
    }
  }

  return NextResponse.json({ scanned: results.length, results })
}
