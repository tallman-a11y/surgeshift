import { describe, it, expect } from 'vitest'
import { derivePreferences } from './learning-store'

const rows = (spec: Record<'accept' | 'edit' | 'reject', number>) => [
  ...Array.from({ length: spec.accept }, () => ({ signal: 'accept', edited_text: null })),
  ...Array.from({ length: spec.edit }, () => ({ signal: 'edit', edited_text: 'shorter' })),
  ...Array.from({ length: spec.reject }, () => ({ signal: 'reject', edited_text: null })),
]

describe('derivePreferences', () => {
  it('returns null with no signals rather than a neutral default', () => {
    expect(derivePreferences([], 'agentshift')).toBeNull()
  })

  it('reads heavy editing as "too long", not "wrong"', () => {
    const p = derivePreferences(rows({ accept: 4, edit: 6, reject: 0 }), 'agentshift')!
    expect(p.responseStyle).toBe('concise')
  })

  it('keeps detail when the agent accepts most of it', () => {
    const p = derivePreferences(rows({ accept: 8, edit: 1, reject: 1 }), 'agentshift')!
    expect(p.responseStyle).toBe('detailed')
    expect(p.acceptanceRate).toBeCloseTo(0.8, 5)
  })

  it('sits at standard in between', () => {
    const p = derivePreferences(rows({ accept: 5, edit: 3, reject: 2 }), 'agentshift')!
    expect(p.responseStyle).toBe('standard')
  })

  it('lets editing win over a high acceptance rate', () => {
    // 45% edits with 55% accepts: the edits are the louder signal.
    const p = derivePreferences(rows({ accept: 11, edit: 9, reject: 0 }), 'agentshift')!
    expect(p.acceptanceRate).toBeGreaterThan(0.5)
    expect(p.responseStyle).toBe('concise')
  })

  it('flags a high rejection rate as a content problem, not a wording one', () => {
    const p = derivePreferences(rows({ accept: 2, edit: 1, reject: 7 }), 'agentshift')!
    expect(p.avoidNotes.join(' ')).toMatch(/rejects a lot/)
  })

  it('stays quiet about rejection when it is occasional', () => {
    const p = derivePreferences(rows({ accept: 7, edit: 1, reject: 2 }), 'agentshift')!
    expect(p.avoidNotes).toEqual([])
  })

  it('reports the domain it was asked about', () => {
    const p = derivePreferences(rows({ accept: 1, edit: 0, reject: 0 }), 'lendshift')!
    expect(p.topAcceptedDomains).toEqual(['lendshift'])
  })

  it('handles a single signal without dividing by zero', () => {
    const p = derivePreferences(rows({ accept: 0, edit: 1, reject: 0 }), 'agentshift')!
    expect(p.acceptanceRate).toBe(0)
    expect(p.responseStyle).toBe('concise')
  })
})
