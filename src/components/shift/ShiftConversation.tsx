'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Mic, Zap, User, Loader2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToolEvent = {
  name: string
  label: string
  done: boolean
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolEvents?: ToolEvent[]
  timestamp: Date
}

type Props = {
  messages: Message[]
  streamingText: string
  toolEvents: ToolEvent[]
  isStreaming: boolean
  onSend: (text: string) => void
  suggestedPrompts?: string[]
  placeholder?: string
}

const TOOL_LABELS: Record<string, string> = {
  get_brands:         'Loading brands',
  get_opportunities:  'Fetching opportunities',
  run_scan:           'Scanning Reddit, YouTube, Twitter',
  post_reply:         'Posting reply',
  create_brand:       'Creating brand profile',
  get_performance:    'Analyzing performance',
  generate_content:   'Generating content',
  dismiss_opportunity:'Dismissing',
}

function ToolEventChip({ event }: { event: ToolEvent }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
      style={{
        background: event.done ? 'rgba(34,197,94,0.08)' : 'rgba(34,211,238,0.08)',
        border: `1px solid ${event.done ? 'rgba(34,197,94,0.2)' : 'rgba(34,211,238,0.2)'}`,
        color: event.done ? '#22c55e' : '#22d3ee',
      }}
    >
      {event.done ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#22d3ee' }} />
      )}
      {TOOL_LABELS[event.name] ?? event.label}
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div
          className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5 mb-5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}
      >
        <Zap size={13} style={{ color: 'var(--color-accent)' }} />
      </div>
      <div className="flex-1 min-w-0">
        {/* Tool events */}
        {msg.toolEvents && msg.toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {msg.toolEvents.map((e, i) => (
              <ToolEventChip key={i} event={e} />
            ))}
          </div>
        )}
        {/* Content with markdown-lite rendering */}
        <div
          className="text-sm leading-relaxed shift-prose"
          style={{ color: 'var(--color-text)' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdownLite(msg.content) }}
        />
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-dim)' }}>
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function StreamingBubble({ text, toolEvents }: { text: string; toolEvents: ToolEvent[] }) {
  return (
    <div className="flex gap-2.5 mb-5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 animate-pulse"
        style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}
      >
        <Zap size={13} style={{ color: 'var(--color-accent)' }} />
      </div>
      <div className="flex-1 min-w-0">
        {toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {toolEvents.map((e, i) => (
              <ToolEventChip key={i} event={e} />
            ))}
          </div>
        )}
        {text ? (
          <div
            className="text-sm leading-relaxed shift-prose"
            style={{ color: 'var(--color-text)' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdownLite(text) }}
          />
        ) : toolEvents.length === 0 ? (
          <div className="flex gap-1 pt-1">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ background: 'var(--color-accent)', animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Very lightweight markdown renderer — bold, inline code, line breaks, headers
function renderMarkdownLite(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="shift-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="shift-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="shift-h1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="shift-code">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="shift-li">$1</li>')
    .replace(/\n\n/g, '</p><p class="shift-p">')
    .replace(/\n/g, '<br/>')
}

export default function ShiftConversation({
  messages,
  streamingText,
  toolEvents,
  isStreaming,
  onSend,
  suggestedPrompts = [],
  placeholder = 'Ask Shift anything about your marketing...',
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolEvents])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    onSend(text)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, isStreaming, onSend])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  const showWelcome = messages.length === 0 && !isStreaming

  return (
    <div className="flex flex-col h-full">
      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-2">
        {showWelcome && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <Zap size={24} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div>
              <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Shift is ready</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Your marketing intelligence is standing by.<br />Tell me what you need or I&apos;ll find the best opportunity right now.
              </p>
            </div>
            {suggestedPrompts.length > 0 && (
              <div className="flex flex-col gap-2 w-full max-w-sm mt-2">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSend(prompt)}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm text-left transition-all group"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
                  >
                    <ChevronRight size={13} className="shrink-0 group-hover:translate-x-0.5 transition-transform" style={{ color: 'var(--color-accent)' }} />
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {isStreaming && (
          <StreamingBubble text={streamingText} toolEvents={toolEvents} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div
          className="flex items-end gap-2 rounded-2xl px-3 py-2"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-bright)' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none text-sm leading-relaxed bg-transparent outline-none"
            style={{
              color: 'var(--color-text)',
              minHeight: '24px',
              maxHeight: '160px',
              overflow: 'hidden',
            }}
            disabled={isStreaming}
          />
          <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
            <button
              type="button"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{ color: 'var(--color-text-muted)' }}
              title="Voice input (Hey Shift)"
            >
              <Mic size={14} />
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                input.trim() && !isStreaming ? 'opacity-100' : 'opacity-40'
              )}
              style={{
                background: input.trim() && !isStreaming ? 'var(--color-accent)' : 'var(--color-surface-elevated)',
                color: input.trim() && !isStreaming ? 'white' : 'var(--color-text-dim)',
              }}
            >
              {isStreaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
        </div>
        <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--color-text-dim)' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
