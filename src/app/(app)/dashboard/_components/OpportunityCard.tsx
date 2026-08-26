'use client'

import { useState } from 'react'
import { ExternalLink, Copy, CheckCheck, ThumbsDown, ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react'
import { scoreColor, scoreBg, scoreBorder, timeAgo, threadAge, truncate } from '@/lib/utils'
import { cn } from '@/lib/utils'

type Opportunity = {
  id: string
  platform: string
  thread_url: string
  title: string
  body: string
  author: string
  subreddit?: string
  score: number
  score_reason: string
  drafted_reply: string
  status: string
  found_at: string
  source_published_at?: string | null
}

export default function OpportunityCard({
  opp,
  onStatusChange,
}: {
  opp: Opportunity
  onStatusChange: (id: string, status: string, dbAlreadyUpdated?: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [replyText, setReplyText] = useState(opp.drafted_reply)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  const age = threadAge(opp.source_published_at, opp.platform)
  // Reddit rejects replies on archived posts outright, so do not offer a one-click post.
  const canAutoPost = (opp.platform === 'reddit' || opp.platform === 'youtube') && !(opp.platform === 'reddit' && age.tone === 'dead')
  const platformLabel = opp.platform === 'twitter' ? 'X/Twitter' : opp.platform

  async function handleCopy() {
    await navigator.clipboard.writeText(replyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handlePostReply() {
    if (!replyText.trim()) return
    setPosting(true)
    setPostError(null)
    try {
      const res = await fetch('/api/post-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: opp.id, replyText }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setPostError(data.error ?? 'Failed to post reply')
      } else {
        onStatusChange(opp.id, 'posted', true)
      }
    } catch {
      setPostError('Network error — try again')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div
      className="rounded-2xl surface-elevated overflow-hidden transition-all"
      style={{ borderColor: scoreBorder(opp.score) }}
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <div
            className="flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0 text-center font-bold"
            style={{ background: scoreBg(opp.score), border: `1px solid ${scoreBorder(opp.score)}` }}
          >
            <span className={cn('text-lg leading-none', scoreColor(opp.score))}>{opp.score}</span>
            <span className="text-[9px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>SCORE</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn('platform-badge', `platform-${opp.platform}`)}>{platformLabel}</span>
              {opp.subreddit && (
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>r/{opp.subreddit}</span>
              )}
              <span
                className="text-[11px]"
                style={{ color: age.tone === 'dead' ? '#f87171' : age.tone === 'live' ? 'var(--color-green)' : 'var(--color-text-dim)' }}
                title={age.tone === 'unknown' ? `Found ${timeAgo(opp.found_at)}; this one predates thread-age tracking` : `Found ${timeAgo(opp.found_at)}`}
              >
                · {age.label}
              </span>
            </div>
            <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
              {truncate(opp.title, 110)}
            </h3>
            {opp.body && (
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {truncate(opp.body, 160)}
              </p>
            )}
            <p className="text-[11px] mt-1.5 italic" style={{ color: 'var(--color-text-dim)' }}>
              {opp.score_reason}
            </p>
          </div>
        </div>
      </div>

      {/* Draft reply section */}
      {opp.drafted_reply && (
        <div className="border-t mx-4" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 py-2.5 text-xs font-medium w-full transition-all"
            style={{ color: 'var(--color-accent)' }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Hide drafted reply' : 'Show drafted reply'}
          </button>

          {expanded && (
            <div className="pb-4">
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={5}
                title="Edit reply before posting"
                className="text-xs leading-relaxed resize-none"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.8rem' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Post error — always visible, not buried inside the collapsed draft section */}
      {postError && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
          {postError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <a
          href={opp.thread_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost text-xs py-1.5 px-3"
        >
          <ExternalLink size={12} />
          Open Thread
        </a>

        {opp.drafted_reply && (
          <button type="button" onClick={handleCopy} className="btn-ghost text-xs py-1.5 px-3">
            {copied ? <><CheckCheck size={12} style={{ color: 'var(--color-green)' }} /> Copied!</> : <><Copy size={12} /> Copy</>}
          </button>
        )}

        <div className="flex-1" />

        {opp.status === 'pending' && (
          <>
            {canAutoPost && opp.drafted_reply ? (
              <button
                type="button"
                onClick={() => { setExpanded(true); handlePostReply() }}
                disabled={posting}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all"
                style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-green)', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                {posting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                {posting ? 'Posting…' : 'Post Reply'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStatusChange(opp.id, 'posted')}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all"
                style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-green)', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <Send size={11} />
                Mark Posted
              </button>
            )}
            <button
              type="button"
              onClick={() => onStatusChange(opp.id, 'dismissed')}
              className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all"
              style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              <ThumbsDown size={11} />
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  )
}
