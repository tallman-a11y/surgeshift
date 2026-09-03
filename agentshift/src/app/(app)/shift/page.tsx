'use client'

/**
 * The whole app is this one screen.
 *
 * Not a dashboard with a chat panel bolted on — the conversation *is* the interface,
 * and every result that deserves to be looked at rather than read is rendered as a
 * live component inside the thread.
 */

import { useState, useCallback, useRef } from 'react'
import { KeyRound, LogOut, RotateCcw } from 'lucide-react'
import ShiftConversation, { type Message, type ToolEvent } from '@/components/shift/ShiftConversation'
import { createClient } from '@/lib/supabase/client'
import type { Artifact, ShiftEvent } from '@/lib/artifacts'

const SUGGESTED_PROMPTS = [
  'What should I be doing right now?',
  'What is 412 Alder Lane worth?',
  'Can I show 88 Pine to the Reyes family tomorrow?',
  'What am I on track to make this quarter?',
]

export default function ShiftPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [streamingArtifacts, setStreamingArtifacts] = useState<Artifact[]>([])
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    if (isStreaming) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() }
    const next = [...messages, userMsg]

    setMessages(next)
    setIsStreaming(true)
    setStreamingText('')
    setStreamingArtifacts([])
    setToolEvents([])

    // Accumulated outside React state so the final message is assembled from what
    // actually arrived, not from a state value that may still be settling.
    let fullText = ''
    const artifacts: Artifact[] = []
    const events: ToolEvent[] = []

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/shift/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      // SSE frames can split across chunks; hold the remainder rather than dropping it.
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''

        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue

          let event: ShiftEvent
          try {
            event = JSON.parse(line.slice(6)) as ShiftEvent
          } catch {
            continue
          }

          switch (event.type) {
            case 'text':
              fullText += event.delta
              setStreamingText(fullText)
              break
            case 'tool_start':
              events.push({ name: event.name, label: event.label, done: false })
              setToolEvents([...events])
              break
            case 'tool_done': {
              const pending = events.find(e => e.name === event.name && !e.done)
              if (pending) pending.done = true
              setToolEvents([...events])
              break
            }
            case 'artifact':
              artifacts.push(event.artifact)
              setStreamingArtifacts([...artifacts])
              break
            case 'error':
              fullText += `\n\n**Something went wrong.** ${event.message}`
              setStreamingText(fullText)
              break
            case 'done':
              break
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        fullText += `\n\n**Could not reach Shift.** ${err instanceof Error ? err.message : 'Unknown error'}`
      }
    } finally {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullText,
        toolEvents: events.length > 0 ? events : undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        timestamp: new Date(),
      }])
      setStreamingText('')
      setStreamingArtifacts([])
      setToolEvents([])
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [isStreaming, messages])

  async function signOut() {
    await createClient().auth.signOut()
    window.location.href = '/'
  }

  return (
    <>
      <header className="shift-glass sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
            >
              <KeyRound size={14} style={{ color: 'var(--color-accent)' }} />
            </div>
            <span className="land-gradient-text font-extrabold text-sm tracking-tight">AgentShift</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="btn-ghost text-xs"
                style={{ padding: '0.35rem 0.7rem' }}
                disabled={isStreaming}
              >
                <RotateCcw size={12} /> New
              </button>
            )}
            <button
              type="button"
              onClick={signOut}
              className="btn-ghost text-xs"
              style={{ padding: '0.35rem 0.7rem' }}
              aria-label="Sign out"
            >
              <LogOut size={12} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <ShiftConversation
          messages={messages}
          streamingText={streamingText}
          streamingArtifacts={streamingArtifacts}
          toolEvents={toolEvents}
          isStreaming={isStreaming}
          onSend={sendMessage}
          suggestedPrompts={SUGGESTED_PROMPTS}
        />
      </main>
    </>
  )
}
