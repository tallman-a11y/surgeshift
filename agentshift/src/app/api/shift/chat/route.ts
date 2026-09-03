/**
 * The conversation endpoint.
 *
 * An agentic loop over the tool surface, streamed as server-sent events. The one thing
 * that makes this different from a chat endpoint: when a tool has something worth
 * *showing*, it returns an artifact alongside its text summary, and the artifact is
 * pushed down the same stream. The model reasons over the summary; the agent looks at
 * the rendered component. Neither has to make do with the other's format.
 */

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { recordMemory } from '@allshift/core'
import { createClient } from '@/lib/supabase/server'
import { agentShiftPersona, buildLayers } from '@/lib/shift-brain'
import { buildFamilyContext, consumeEvents } from '@/lib/shift/context'
import { SupabaseContextGraph } from '@/lib/shift/context-graph'
import { familyBusIsShared } from '@/lib/shift/family'
import { SHIFT_TOOLS, TOOL_LABELS } from '@/lib/tools/schema'
import { runTool } from '@/lib/tools/run'
import type { AgentProfile, ToolContext } from '@/lib/tools/context'
import type { Artifact } from '@/lib/artifacts'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = 'claude-sonnet-4-6'
const MAX_ITERATIONS = 8

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// One brain wiring for the process: memory, learning, genome and the cross-product
// bus, each degrading independently when its backing service is absent.
const layers = buildLayers()

type ClientMessage = { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(agent: AgentProfile | null, today: string): string {
  const lines = [
    agentShiftPersona.systemPrompt,
    '',
    `Today is ${today}.`,
  ]

  if (!agent) {
    lines.push(
      '',
      'This agent has no profile yet. Before running anything that depends on their numbers — commission forecasts, net sheets, CMAs — offer to set up their brokerage split, cap and market context. Say why it matters rather than presenting it as a form to fill in.',
    )
    return lines.join('\n')
  }

  // The model must never imply a handoff reached a sibling when the bus is only
  // product-local, so tell it plainly which mode it is running in.
  lines.push(
    '',
    '## The family',
    familyBusIsShared()
      ? 'The cross-product bus is connected to the shared family project. Handoffs to LendShift and SurgeShift reach them.'
      : 'The cross-product bus is running product-locally: handoffs are queued but the sibling products cannot read them yet. If you hand something across, say that plainly rather than implying it arrived.',
  )

  lines.push(
    '',
    '## This agent',
    `Name: ${agent.full_name}`,
    agent.brokerage_name ? `Brokerage: ${agent.brokerage_name}` : '',
    agent.market_area ? `Market: ${agent.market_area}` : '',
    `Market context: ${(agent.annual_appreciation * 100).toFixed(1)}% annual appreciation, ${agent.median_dom}-day median days on market, ${(agent.list_to_sale_ratio * 100).toFixed(1)}% sale-to-list ratio.`,
    `Compensation: ${(agent.split_to_agent * 100).toFixed(0)}% split to agent` +
      (agent.annual_cap ? `, capping at $${agent.annual_cap.toLocaleString()} company dollar` : ', no cap') +
      (agent.royalty_rate > 0 ? `, ${(agent.royalty_rate * 100).toFixed(0)}% royalty` : '') + '.',
    agent.voice_notes ? `Voice notes for generated copy: ${agent.voice_notes}` : '',
  )

  return lines.filter(Boolean).join('\n')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = (await req.json()) as { messages: ClientMessage[] }
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('No messages', { status: 400 })
  }

  const { data: agentRow } = await supabase.from('agents').select('*').eq('id', user.id).maybeSingle()
  const agent = (agentRow ?? null) as AgentProfile | null

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''

  // Everything the family knows about this agent: memory, their derived preferences,
  // collective patterns distilled across the products, and the cross-product inbox.
  // Each source fails independently — losing recall must never cost the answer.
  const family = await buildFamilyContext({
    layers,
    userId: user.id,
    query: lastUserMessage || 'real estate business overview',
  })

  const systemPrompt = buildSystemPrompt(agent, today) + (family.block ? `\n\n${family.block}` : '')

  const ctx: ToolContext = {
    supabase,
    agentId: user.id,
    agent,
    now,
    contextGraph: layers.contextGraph instanceof SupabaseContextGraph ? layers.contextGraph : null,
    layerStatus: layers.status,
    generate: async (system, prompt, maxTokens = 2000) => {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      })
      return msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
    },
  }

  const claudeMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (data: Record<string, unknown>) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let assistantText = ''
        const artifacts: Artifact[] = []

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const apiStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: systemPrompt,
            messages: claudeMessages,
            tools: SHIFT_TOOLS,
          })

          for await (const event of apiStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta' &&
              event.delta.text
            ) {
              assistantText += event.delta.text
              send({ type: 'text', delta: event.delta.text })
            }
          }

          const finalMsg = await apiStream.finalMessage()
          if (finalMsg.stop_reason !== 'tool_use') break

          const toolUses = finalMsg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          )
          claudeMessages.push({ role: 'assistant', content: finalMsg.content })

          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const toolUse of toolUses) {
            send({ type: 'tool_start', name: toolUse.name, label: TOOL_LABELS[toolUse.name] ?? toolUse.name })

            let summary: string
            try {
              const outcome = await runTool(
                toolUse.name,
                (toolUse.input ?? {}) as Record<string, unknown>,
                ctx,
              )
              summary = outcome.summary
              for (const artifact of outcome.artifacts ?? []) {
                artifacts.push(artifact)
                send({ type: 'artifact', artifact })
              }
            } catch (err) {
              // Hand the failure back to the model rather than killing the turn — it
              // can tell the agent what broke and carry on with the rest.
              summary = `Tool failed: ${err instanceof Error ? err.message : 'unknown error'}. Tell the agent this specific thing did not work; do not substitute an estimate.`
            }

            send({ type: 'tool_done', name: toolUse.name })
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: summary })
          }

          claudeMessages.push({ role: 'user', content: toolResults })
        }

        if (layers.memory && lastUserMessage && assistantText) {
          void recordMemory(layers.memory, layers.embedding, {
            userId: user.id,
            content: `Agent: ${lastUserMessage.slice(0, 300)}\nShift: ${assistantText.slice(0, 500)}`,
            type: 'context',
            source: 'conversation',
            confidence: 0.6,
            salience: 0.4,
          }).catch(() => {})
        }

        // Only now are the sibling products' events marked consumed. Doing it when
        // they were read would mean a failed turn silently swallows a lender's
        // message and the agent never hears their buyer was approved.
        if (assistantText) void consumeEvents(layers, family.consumedEventIds)

        send({ type: 'done' })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong' })
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
