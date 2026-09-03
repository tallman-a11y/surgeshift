'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Loader2, ChevronRight, Check, KeyRound } from 'lucide-react'
import ArtifactView from './artifacts'
import { TOOL_LABELS } from '@/lib/tools/schema'
import type { Artifact } from '@/lib/artifacts'

export type ToolEvent = { name: string; label: string; done: boolean }

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolEvents?: ToolEvent[]
  /** The live components this reply produced. Rendered between the tools and the prose. */
  artifacts?: Artifact[]
  timestamp: Date
}

type Props = {
  messages: Message[]
  streamingText: string
  streamingArtifacts: Artifact[]
  toolEvents: ToolEvent[]
  isStreaming: boolean
  onSend: (text: string) => void
  suggestedPrompts?: string[]
  placeholder?: string
}

function ToolChip({ event }: { event: ToolEvent }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
      style={{
        background: event.done ? 'rgba(16,185,129,0.08)' : 'rgba(251,191,36,0.08)',
        border: `1px solid ${event.done ? 'rgba(16,185,129,0.22)' : 'rgba(251,191,36,0.22)'}`,
        color: event.done ? 'var(--color-accent-soft)' : 'var(--color-gold)',
      }}
    >
      {event.done
        ? <Check size={10} strokeWidth={3} />
        : <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-gold)', animation: 'pulse-dot 1.2s ease-in-out infinite' }} />}
      {TOOL_LABELS[event.name] ?? event.label}
    </div>
  )
}

/** Bold, inline code, headings, bullets and line breaks. Everything else is escaped. */
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
    .replace(/^[-*] (.+)$/gm, '<li class="shift-li">$1</li>')
    .replace(/\n\n/g, '</p><p class="shift-p">')
    .replace(/\n/g, '<br/>')
}

function ShiftMark({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <div
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
      style={{
        background: 'rgba(16,185,129,0.12)',
        border: '1px solid rgba(16,185,129,0.25)',
        animation: pulsing ? 'pulse-dot 1.6s ease-in-out infinite' : undefined,
      }}
    >
      <KeyRound size={13} style={{ color: 'var(--color-accent)' }} />
    </div>
  )
}

function AssistantTurn({
  content, toolEvents, artifacts, timestamp, streaming,
}: {
  content: string
  toolEvents: ToolEvent[]
  artifacts: Artifact[]
  timestamp?: Date
  streaming?: boolean
}) {
  const nothingYet = !content && artifacts.length === 0 && toolEvents.length === 0

  return (
    <div className="flex gap-2.5 mb-5">
      <ShiftMark pulsing={streaming} />
      <div className="flex-1 min-w-0">
        {toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {toolEvents.map((e, i) => <ToolChip key={`${e.name}-${i}`} event={e} />)}
          </div>
        )}

        {/* The artifacts come before the prose: the agent looks at the net sheet
            first and reads the explanation second. */}
        {artifacts.map(artifact => (
          <ArtifactView key={artifact.id} artifact={artifact} />
        ))}

        {content && (
          <div
            className="text-sm leading-relaxed shift-prose"
            style={{ color: 'var(--color-text)' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdownLite(content) }}
          />
        )}

        {nothingYet && streaming && (
          <div className="flex gap-1 pt-1.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ background: 'var(--color-accent)', animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

        {timestamp && !streaming && (
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-dim)' }}>
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}

export default function ShiftConversation({
  messages, streamingText, streamingArtifacts, toolEvents, isStreaming,
  onSend, suggestedPrompts = [],
  placeholder = 'Ask Shift anything about your business…',
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, streamingArtifacts, toolEvents])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    onSend(text)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, isStreaming, onSend])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 170)}px`
  }

  const showWelcome = messages.length === 0 && !isStreaming

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-6 pb-2">
        <div className="mx-auto w-full" style={{ maxWidth: 720 }}>
          {showWelcome && (
            <div className="flex flex-col items-center justify-center text-center gap-4 py-16">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.22)' }}
              >
                <KeyRound size={24} style={{ color: 'var(--color-accent)' }} />
              </div>
              <div>
                <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Shift is ready</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  Your whole business, one conversation.<br />
                  Ask for anything — I&rsquo;ll do the work and show you the result.
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

          {messages.map(msg => msg.role === 'user' ? (
            <div key={msg.id} className="flex justify-end mb-4">
              <div
                className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
                style={{ background: 'var(--color-accent)', color: '#04140e', fontWeight: 500 }}
              >
                {msg.content}
              </div>
            </div>
          ) : (
            <AssistantTurn
              key={msg.id}
              content={msg.content}
              toolEvents={msg.toolEvents ?? []}
              artifacts={msg.artifacts ?? []}
              timestamp={msg.timestamp}
            />
          ))}

          {isStreaming && (
            <AssistantTurn
              content={streamingText}
              toolEvents={toolEvents}
              artifacts={streamingArtifacts}
              streaming
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="px-4 md:px-6 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 720 }}>
          <div
            className="flex items-end gap-2 rounded-2xl px-3 py-2"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-bright)' }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none text-sm leading-relaxed bg-transparent outline-none border-0 p-0"
              style={{ color: 'var(--color-text)', minHeight: 24, maxHeight: 170, overflow: 'hidden', boxShadow: 'none' }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              aria-label="Send"
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all mb-0.5"
              style={{
                background: input.trim() && !isStreaming ? 'var(--color-accent)' : 'var(--color-surface-elevated)',
                color: input.trim() && !isStreaming ? '#04140e' : 'var(--color-text-dim)',
                opacity: input.trim() && !isStreaming ? 1 : 0.5,
              }}
            >
              {isStreaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
          <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--color-text-dim)' }}>
            Enter to send · Shift+Enter for a new line · Shift never sends anything to a client without you
          </p>
        </div>
      </div>
    </div>
  )
}
