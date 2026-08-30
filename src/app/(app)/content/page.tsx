import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContentClient from './_components/ContentClient'

export const metadata = { title: 'Content — SurgeShift' }
export const dynamic = 'force-dynamic'

export default async function ContentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: brands } = await supabase
    .from('brands')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('created_at')

  const brandIds = (brands ?? []).map(b => b.id as string)

  const [{ data: themes }, { data: pieces }] = await Promise.all([
    supabase
      .from('content_themes')
      .select('id, brand_id, label, summary, question_count, example_questions, avg_score, content_piece_id')
      .in('brand_id', brandIds)
      .order('question_count', { ascending: false }),
    supabase
      .from('content_pieces')
      .select('id, brand_id, title, content_type, body, status, created_at, theme_id')
      .in('brand_id', brandIds)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return (
    <ContentClient
      brands={(brands ?? []) as { id: string; name: string }[]}
      themes={(themes ?? []) as never}
      pieces={(pieces ?? []) as never}
    />
  )
}
