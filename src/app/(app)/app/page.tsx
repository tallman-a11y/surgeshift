'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Copy, CheckCheck, Send, TrendingUp, FileText, BarChart2 } from 'lucide-react'
import ShiftBar, { type ShiftState } from '@/components/shift/ShiftBar'
import ShiftConversation, { type Message, type ToolEvent } from '@/components/shift/ShiftConversation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type PendingCounts = Record<string, number>

type PanelContent =
  | { type: 'opportunities'; brandId: string; brandName: string }
  | { type: 'content'; text: string; contentType: string; brandName: string }
  | { type: 'performance'; brandId: string; brandName: string }
  | null

const SUGGESTED_PROMPTS = [
  'What\'s the best opportunity for me right now?',
  'Scan all my brands for new opportunities',
  'Show me what\'s been working this week',
  'Help me set up a new brand',
]

export default function ShiftIntelligencePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [shiftState, setShiftState] = useState<ShiftState>('idle')
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null)
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({})
  const [panelContent, setPanelContent] = useState<PanelContent>(null)
  const [generatedContent, setGeneratedContent] = useState<{ type: string; text: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Load pending counts on mount
  useEffect(() => {
    const supabase = createClient()
    supabase.from('brands').select('id').eq('active', true).then(async ({ data: brands }) => {
      if (!brands?.length) return
      const counts: PendingCounts = {}
      await Promise.all(
        brands.map(async b => {
          const { count } = await supabase
            .from('opportunities')
            .select('id', { count: 'exact', head: true })
            .eq('brand_id', b.id)
            .eq('status', 'pending')
          counts[b.id] = count ?? 0
        })
      )
      setPendingCounts(counts)
    })
  }, [])

  // On brand select, inject a contextual prompt
  function handleBrandSelect(id: string | null) {
    if (id === 'new') {
      setActiveBrandId(null)
      sendMessage('I want to add a new brand')
      return
    }
    setActiveBrandId(id)
    if (id && messages.length === 0) {
      sendMessage(`What's the situation with this brand? Show me the best pending opportunity.`)
    }
  }

  const sendMessage = useCallback(async (text: string) => {
    if (isStreaming) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setIsStreaming(true)
    setStreamingText('')
    setToolEvents([])
    setShiftState('thinking')

    const clientMessages = newMessages.map(m => ({ role: m.role, content: m.content }))

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/shift/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: clientMessages }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      const finalToolEvents: ToolEvent[] = []
      const activeToolEvents: ToolEvent[] = []
      const toolNamesUsed: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const event = JSON.parse(jsonStr) as {
              type: string
              delta?: string
              name?: string
              label?: string
              message?: string
            }

            if (event.type === 'text' && event.delta) {
              fullText += event.delta
              setStreamingText(fullText)
            } else if (event.type === 'tool_start' && event.name) {
              const te: ToolEvent = { name: event.name, label: event.label ?? '', done: false }
              activeToolEvents.push(te)
              toolNamesUsed.push(event.name)
              setToolEvents([...activeToolEvents])
              setShiftState(
                event.name === 'run_scan' ? 'scanning' :
                event.name === 'post_reply' ? 'posting' :
                event.name === 'generate_content' ? 'generating' : 'thinking'
              )
            } else if (event.type === 'tool_done' && event.name) {
              const idx = activeToolEvents.findIndex(e => e.name === event.name && !e.done)
              if (idx !== -1) {
                activeToolEvents[idx] = { ...activeToolEvents[idx], done: true }
                finalToolEvents.push(activeToolEvents[idx])
                setToolEvents([...activeToolEvents])
              }
              setShiftState('thinking')
            } else if (event.type === 'done') {
              break
            } else if (event.type === 'error') {
              fullText += `\n\nSomething went wrong: ${event.message}`
              setStreamingText(fullText)
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }

      // Detect generated content in response
      const contentMatch = fullText.match(/GENERATED_(\w+)\n\n([\s\S]+)/)
      if (contentMatch) {
        const type = contentMatch[1].toLowerCase().replace('_', ' ')
        const content = contentMatch[2]
        setGeneratedContent({ type, text: content })
        setPanelContent({ type: 'content', text: content, contentType: type, brandName: 'your brand' })
        fullText = fullText.replace(contentMatch[0], `I've generated the ${type} — it's ready in the panel on the right.`)
      }

      // Update pending counts after scan
      if (toolNamesUsed.includes('run_scan') || toolNamesUsed.includes('post_reply')) {
        const supabase = createClient()
        const { data: brands } = await supabase.from('brands').select('id').eq('active', true)
        if (brands?.length) {
          const counts: PendingCounts = {}
          await Promise.all(
            brands.map(async b => {
              const { count } = await supabase
                .from('opportunities')
                .select('id', { count: 'exact', head: true })
                .eq('brand_id', b.id)
                .eq('status', 'pending')
              counts[b.id] = count ?? 0
            })
          )
          setPendingCounts(counts)
        }
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullText,
        toolEvents: finalToolEvents,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Something went wrong. Try again or check your connection.',
          timestamp: new Date(),
        }
        setMessages(prev => [...prev, errorMsg])
      }
    } finally {
      setIsStreaming(false)
      setStreamingText('')
      setToolEvents([])
      setShiftState('idle')
    }
  }, [isStreaming, messages])

  // Right panel: opportunities
  return (
    <div className="flex h-screen pt-14">
      {/* Shift Bar */}
      <ShiftBar
        shiftState={shiftState}
        activeBrandId={activeBrandId}
        onBrandSelect={handleBrandSelect}
        onVoice={() => sendMessage('Hey Shift')}
        pendingCounts={pendingCounts}
      />

      {/* Conversation panel */}
      <div className={cn('flex flex-col', panelContent ? 'w-full md:w-[55%] lg:w-[60%]' : 'w-full')}>
        <ShiftConversation
          messages={messages}
          streamingText={streamingText}
          toolEvents={toolEvents}
          isStreaming={isStreaming}
          onSend={sendMessage}
          suggestedPrompts={SUGGESTED_PROMPTS}
        />
      </div>

      {/* Dynamic right panel */}
      <AnimatePresence>
        {panelContent && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="hidden md:flex flex-col w-[45%] lg:w-[40%] border-l overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {panelContent.type === 'opportunities' && (
              <OpportunityPanel
                brandId={panelContent.brandId}
                brandName={panelContent.brandName}
                onAction={() => sendMessage(`What should I do next for ${panelContent.brandName}?`)}
              />
            )}
            {panelContent.type === 'content' && generatedContent && (
              <ContentPanel
                contentType={generatedContent.type}
                text={generatedContent.text}
              />
            )}
            {panelContent.type === 'performance' && (
              <PerformancePanel brandId={panelContent.brandId} brandName={panelContent.brandName} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Opportunity panel ──────────────────────────────────────────────────────

type OpportunityRow = {
  id: string
  platform: string
  title: string
  score: number
  drafted_reply: string
  thread_url: string
  subreddit?: string
  score_reason: string
}

function OpportunityPanel({ brandId, brandName, onAction }: { brandId: string; brandName: string; onAction: () => void }) {
  const [opps, setOpps] = useState<OpportunityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('opportunities')
      .select('id, platform, title, score, drafted_reply, thread_url, subreddit, score_reason')
      .eq('brand_id', brandId)
      .eq('status', 'pending')
      .order('score', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setOpps((data ?? []) as OpportunityRow[])
        setLoading(false)
      })
  }, [brandId])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <TrendingUp size={14} style={{ color: 'var(--color-accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {brandName} · Pending
          </span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}>
          {opps.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center h-24">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</span>
          </div>
        )}
        {!loading && opps.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No pending opportunities</p>
            <button type="button" onClick={onAction} className="text-xs btn-ghost py-1.5 px-3">Run a scan</button>
          </div>
        )}
        {opps.map(opp => (
          <MiniOpportunityCard key={opp.id} opp={opp} onAction={onAction} />
        ))}
      </div>
    </div>
  )
}

function MiniOpportunityCard({ opp, onAction }: { opp: OpportunityRow; onAction: () => void }) {
  const [copied, setCopied] = useState(false)
  const [posted, setPosted] = useState(false)
  const [posting, setPosting] = useState(false)

  const scoreColor = opp.score >= 80 ? '#22c55e' : opp.score >= 55 ? '#f59e0b' : '#64748b'

  async function handlePost() {
    setPosting(true)
    const res = await fetch('/api/post-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId: opp.id, replyText: opp.drafted_reply }),
    })
    const data = await res.json() as { ok?: boolean }
    if (data.ok) setPosted(true)
    setPosting(false)
  }

  if (posted) return null

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-start gap-2 mb-2">
        <div
          className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ background: `${scoreColor}18`, color: scoreColor, border: `1px solid ${scoreColor}40` }}
        >
          {opp.score}
        </div>
        <div className="flex-1 min-w-0">
          <span className={cn('platform-badge', `platform-${opp.platform}`, 'mr-1.5')}>{opp.platform}</span>
          {opp.subreddit && (
            <span className="text-[10px]" style={{ color: 'var(--color-text-dim)' }}>r/{opp.subreddit}</span>
          )}
        </div>
        <a
          href={opp.thread_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-0.5 rounded transition-all"
          style={{ color: 'var(--color-text-dim)' }}
        >
          <ExternalLink size={11} />
        </a>
      </div>

      <p className="text-xs font-medium mb-1 line-clamp-2" style={{ color: 'var(--color-text)' }}>
        {opp.title}
      </p>
      <p className="text-[10px] mb-2.5 italic" style={{ color: 'var(--color-text-dim)' }}>
        {opp.score_reason?.slice(0, 100)}
      </p>

      {opp.drafted_reply && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(opp.drafted_reply)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            {copied ? <CheckCheck size={10} style={{ color: '#22c55e' }} /> : <Copy size={10} />}
            {copied ? 'Copied!' : 'Copy reply'}
          </button>
          {(opp.platform === 'reddit' || opp.platform === 'youtube') && (
            <button
              type="button"
              onClick={handlePost}
              disabled={posting}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-semibold transition-all"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}
            >
              <Send size={10} />
              {posting ? 'Posting...' : 'Post'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Content panel ────────────────────────────────────────────────────────

function ContentPanel({ contentType, text }: { contentType: string; text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <FileText size={14} style={{ color: 'var(--color-accent)' }} />
          <span className="text-sm font-semibold capitalize" style={{ color: 'var(--color-text)' }}>
            {contentType.replace(/_/g, ' ')}
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          {copied ? <CheckCheck size={11} style={{ color: '#22c55e' }} /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy all'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <pre
          className="text-xs leading-relaxed whitespace-pre-wrap font-sans"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {text}
        </pre>
      </div>
    </div>
  )
}

// ── Performance panel ────────────────────────────────────────────────────

type PerfData = {
  brand: string
  period_days: number
  opportunities_found: number
  replies_posted: number
  scan_count: number
  last_scan: string | null
  by_platform: Record<string, number>
}

function PerformancePanel({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [data, setData] = useState<PerfData | null>(null)

  useEffect(() => {
    // Load performance data from the API through chat won't work here
    // Show a placeholder — real data comes through Shift conversation
    setData({
      brand: brandName,
      period_days: 30,
      opportunities_found: 0,
      replies_posted: 0,
      scan_count: 0,
      last_scan: null,
      by_platform: {},
    })
  }, [brandId, brandName])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
        <BarChart2 size={14} style={{ color: 'var(--color-accent)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {brandName} · Performance
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
          Ask Shift &ldquo;How is {brandName} performing?&rdquo; to see detailed stats.
        </p>
      </div>
    </div>
  )
}
