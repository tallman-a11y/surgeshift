import { describe, it, expect } from 'vitest'
import { sanitizeForEmbedding, truncateSafely } from './content-themes'

// The exact failure this guards against: one comment out of 216 contained half
// an emoji, Voyage rejected the entire batch as invalid UTF-8, and a whole
// brand's content roadmap silently produced nothing.
const EMOJI = '\u{1F600}' // 😀 — one code point, two UTF-16 units

describe('truncateSafely', () => {
  it('never cuts an emoji in half', () => {
    const text = `abc${EMOJI}def`
    // Truncating at 4 code points keeps the whole emoji.
    const out = truncateSafely(text, 4)
    expect(out).toBe(`abc${EMOJI}`)
    expect([...out]).toHaveLength(4)
    expect(sanitizeForEmbedding(out)).toBe(out) // nothing left to strip
  })

  it('leaves short text alone', () => {
    expect(truncateSafely('short', 100)).toBe('short')
  })

  it('counts code points, not UTF-16 units', () => {
    const text = EMOJI.repeat(5)
    expect(text.length).toBe(10)
    expect([...truncateSafely(text, 3)]).toHaveLength(3)
  })

  it('a naive slice would have produced the broken input', () => {
    // Demonstrates the original bug rather than merely asserting the fix.
    const broken = `abc${EMOJI}def`.slice(0, 4)
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(broken)).toBe(true)
    expect(sanitizeForEmbedding(broken)).toBe('abc')
  })
})

describe('sanitizeForEmbedding', () => {
  it('strips a leading lone surrogate', () => {
    expect(sanitizeForEmbedding(`\uDE00 tail`)).toBe('tail')
  })

  it('strips a trailing lone surrogate', () => {
    expect(sanitizeForEmbedding(`head \uD83D`)).toBe('head')
  })

  it('keeps well-formed emoji intact', () => {
    expect(sanitizeForEmbedding(`a ${EMOJI} b`)).toBe(`a ${EMOJI} b`)
  })

  it('replaces control characters with a space', () => {
    expect(sanitizeForEmbedding('a\u0000b\u001Fc')).toBe('a b c')
  })

  it('keeps newlines and tabs, which carry structure', () => {
    expect(sanitizeForEmbedding('line\nnext\tcol')).toBe('line\nnext\tcol')
  })

  it('leaves ordinary text untouched', () => {
    const text = 'How do I estimate ARV on a flip?'
    expect(sanitizeForEmbedding(text)).toBe(text)
  })
})
