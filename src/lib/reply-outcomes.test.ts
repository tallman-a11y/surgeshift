import { describe, it, expect } from 'vitest'
import { classifyOutcome } from './reply-outcomes'

describe('classifyOutcome', () => {
  it('calls a removed reply removed, whatever its score said', () => {
    // The loudest signal available: the community rejected it.
    expect(classifyOutcome({ score: 12, replyCount: 3, removed: true })).toBe('removed')
  })

  it('treats no score and a missing score alike as ignored', () => {
    expect(classifyOutcome({ score: 0, replyCount: 0, removed: false })).toBe('ignored')
    expect(classifyOutcome({ score: null, replyCount: null, removed: false })).toBe('ignored')
  })

  it('counts a downvoted reply as ignored rather than received', () => {
    expect(classifyOutcome({ score: -4, replyCount: 0, removed: false })).toBe('ignored')
  })

  it('separates a mild reception from one that landed', () => {
    expect(classifyOutcome({ score: 1, replyCount: 0, removed: false })).toBe('received')
    expect(classifyOutcome({ score: 4, replyCount: 1, removed: false })).toBe('received')
    expect(classifyOutcome({ score: 5, replyCount: 2, removed: false })).toBe('landed')
    expect(classifyOutcome({ score: 40, replyCount: 9, removed: false })).toBe('landed')
  })
})
