'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, PenLine, Copy, CheckCheck, FileText, MessagesSquare } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

type Brand = { id: string; name: string }
type Theme = {
  id: string
  brand_id: string
  label: string
  summary: string | null
  question_count: number
  example_questions: string[] | null
  avg_score: number | null
  content_piece_id: string | null
}
type Piece = {
  id: string
  brand_id: string
  title: string | null
  content_type: string
  body: string
  status: string
  created_at: string
  theme_id: string | null
}

export default function ContentClient({ brands, themes, pieces }: {
  brands: Brand[]; themes: Theme[]; pieces: Piece[]
}) {
  const router = useRouter()
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [openPiece, setOpenPiece] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const brandThemes = themes.filter(t => t.brand_id === brandId)
  const brandPieces = pieces.filter(p => p.brand_id === brandId)

  async function rebuild() {
    setBusy('themes'); setNote(null)
    try {
      const res = await fetch('/api/content/themes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
      const data = await res.json() as { themes?: unknown[]; skipped?: string; considered?: number; error?: string }
      if (!res.ok) setNote(data.error ?? 'Could not read the questions.')
      else if (data.skipped) setNote(`${data.skipped} — looked at ${data.considered ?? 0} questions.`)
      else { setNote(`Found ${data.themes?.length ?? 0} themes across ${data.considered ?? 0} questions.`); router.refresh() }
    } catch { setNote('Network error — try again.') }
    finally { setBusy(null) }
  }

  async function write(themeId: string) {
    setBusy(themeId); setNote(null)
    try {
      const res = await fetch('/api/content/write', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId, contentType: 'blog_post' }),
      })
      const data = await res.json() as { piece?: { title: string }; error?: string }
      if (!res.ok) setNote(data.error ?? 'Could not write the piece.')
      else { setNote(`Wrote “${data.piece?.title}”.`); router.refresh() }
    } catch { setNote('Network error — try again.') }
    finally { setBusy(null) }
  }

  async function copy(piece: Piece) {
    await navigator.clipboard.writeText(piece.body)
    setCopied(piece.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Content</h1>
          <p className="text-sm mt-0.5 max-w-xl" style={{ color: 'var(--color-text-muted)' }}>
            The questions buyers keep asking, grouped. Replying reaches one person; answering the
            whole group keeps working.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brands.length > 1 && (
            <select aria-label="Brand" value={brandId} onChange={e => setBrandId(e.target.value)}
                    style={{ width: 'auto', padding: '0.45rem 0.75rem' }}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button type="button" onClick={rebuild} disabled={busy !== null || !brandId} className="btn-accent">
            {busy === 'themes' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {busy === 'themes' ? 'Reading the questions…' : 'Find themes'}
          </button>
        </div>
      </div>

      {note && (
        <div className="rounded-xl px-4 py-3 text-sm"
             style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
          {note}
        </div>
      )}

      <section className="space-y-3">
        {brandThemes.length === 0 ? (
          <div className="surface-elevated rounded-2xl p-8 text-center">
            <MessagesSquare size={22} className="mx-auto mb-3" style={{ color: 'var(--color-accent)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>No themes yet</p>
            <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--color-text-muted)' }}>
              Hit “Find themes” and Shift will read every question the scanner has collected for this
              brand and group the ones people keep asking. Three or more asking the same thing makes
              a topic worth writing about.
            </p>
          </div>
        ) : brandThemes.map(theme => (
          <article key={theme.id} className="surface-elevated rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md tabular-nums"
                        style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}>
                    {theme.question_count} asked
                  </span>
                  {theme.avg_score != null && (
                    <span className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                      avg score {theme.avg_score}
                    </span>
                  )}
                  {theme.content_piece_id && (
                    <span className="text-[11px]" style={{ color: 'var(--color-green)' }}>· written</span>
                  )}
                </div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{theme.label}</h2>
                {theme.summary && (
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    {theme.summary}
                  </p>
                )}
                {theme.example_questions && theme.example_questions.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {theme.example_questions.slice(0, 3).map((q, i) => (
                      <li key={i} className="text-[11px] truncate" style={{ color: 'var(--color-text-dim)' }}>— {q}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="button" onClick={() => write(theme.id)} disabled={busy !== null}
                      className="btn-ghost text-xs py-1.5 px-3 shrink-0">
                {busy === theme.id ? <Loader2 size={12} className="animate-spin" /> : <PenLine size={12} />}
                {busy === theme.id ? 'Writing…' : theme.content_piece_id ? 'Write again' : 'Write the piece'}
              </button>
            </div>
          </article>
        ))}
      </section>

      {brandPieces.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold pt-2" style={{ color: 'var(--color-text)' }}>Written</h2>
          {brandPieces.map(piece => (
            <article key={piece.id} className="surface-elevated rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <FileText size={15} className="shrink-0" style={{ color: 'var(--color-accent)' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {piece.title ?? 'Untitled'}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                    {piece.content_type.replace('_', ' ')} · {piece.status} · {timeAgo(piece.created_at)}
                  </p>
                </div>
                <button type="button" onClick={() => copy(piece)} className="btn-ghost text-xs py-1.5 px-3 shrink-0">
                  {copied === piece.id
                    ? <><CheckCheck size={12} style={{ color: 'var(--color-green)' }} /> Copied</>
                    : <><Copy size={12} /> Copy</>}
                </button>
                <button type="button" onClick={() => setOpenPiece(openPiece === piece.id ? null : piece.id)}
                        className="btn-ghost text-xs py-1.5 px-3 shrink-0">
                  {openPiece === piece.id ? 'Hide' : 'Read'}
                </button>
              </div>
              {openPiece === piece.id && (
                <pre className="px-4 pb-4 text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto"
                     style={{ color: 'var(--color-text-muted)', fontFamily: 'inherit' }}>{piece.body}</pre>
              )}
            </article>
          ))}
          <p className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
            Copy takes the markdown. Neither product has a blog yet — once one does, publishing can
            post straight to it.
          </p>
        </section>
      )}
    </div>
  )
}
