import { describe, it, expect } from 'vitest'
import { tagReplyLinks, withRef, makeRefCode } from './attribution'

const BRAND = 'https://weldshiftacademy.com/demo'
const CODE = 'we-abc123'

describe('tagReplyLinks', () => {
  it('tags a link that ends a sentence, keeping the full stop outside the URL', () => {
    // The bug that shipped: drafts routinely end on the link, and a regex
    // lookahead read the full stop as part of the path, so nothing was tagged.
    const draft = 'Worth a look at https://weldshiftacademy.com/demo.'
    const { text, tagged } = tagReplyLinks(draft, BRAND, CODE)
    expect(tagged).toBe(true)
    expect(text).toBe(`Worth a look at https://weldshiftacademy.com/demo?ref=${CODE}.`)
  })

  it('handles other trailing punctuation', () => {
    for (const [punct, name] of [[',', 'comma'], ['!', 'bang'], ['?', 'question'], [':', 'colon']] as const) {
      const { text, tagged } = tagReplyLinks(`See ${BRAND}${punct} more`, BRAND, CODE)
      expect(tagged, name).toBe(true)
      expect(text, name).toContain(`ref=${CODE}${punct}`)
    }
  })

  it('tags a bare link at end of string', () => {
    const { text, tagged } = tagReplyLinks(`Try it: ${BRAND}`, BRAND, CODE)
    expect(tagged).toBe(true)
    expect(text).toBe(`Try it: ${BRAND}?ref=${CODE}`)
  })

  it('treats a trailing slash as the same URL', () => {
    const { tagged, text } = tagReplyLinks(`Go to ${BRAND}/ now`, BRAND, CODE)
    expect(tagged).toBe(true)
    expect(text).toContain(`ref=${CODE}`)
  })

  it('tags every occurrence', () => {
    const { text, tagged } = tagReplyLinks(`${BRAND} and again ${BRAND}.`, BRAND, CODE)
    expect(tagged).toBe(true)
    expect(text.match(/ref=/g)).toHaveLength(2)
  })

  it('does not tag a different page on the same host', () => {
    const draft = 'Pricing is at https://weldshiftacademy.com/pricing.'
    const { text, tagged } = tagReplyLinks(draft, BRAND, CODE)
    expect(tagged).toBe(false)
    expect(text).toBe(draft)
  })

  it('does not tag a different host', () => {
    const draft = 'Unrelated: https://example.com/demo'
    expect(tagReplyLinks(draft, BRAND, CODE).tagged).toBe(false)
  })

  it('does not double-tag a link that already carries a ref', () => {
    const draft = `Already tracked ${BRAND}?ref=we-existing`
    const { text, tagged } = tagReplyLinks(draft, BRAND, CODE)
    expect(tagged).toBe(false)
    expect(text).toBe(draft)
  })

  it('reports untagged when the draft never mentions the link, so no code is burned', () => {
    const draft = 'A helpful answer with no link at all.'
    expect(tagReplyLinks(draft, BRAND, CODE)).toEqual({ text: draft, tagged: false })
  })

  it('leaves surrounding markdown intact', () => {
    const { text } = tagReplyLinks(`[the demo](${BRAND})`, BRAND, CODE)
    expect(text).toBe(`[the demo](${BRAND}?ref=${CODE})`)
  })
})

describe('withRef', () => {
  it('preserves an existing query string', () => {
    expect(withRef('https://x.com/demo?utm_source=reddit', 'c1'))
      .toBe('https://x.com/demo?utm_source=reddit&ref=c1')
  })
  it('returns the input unchanged when it is not a URL', () => {
    expect(withRef('not a url', 'c1')).toBe('not a url')
  })
})

describe('makeRefCode', () => {
  it('prefixes with two letters of the brand and avoids look-alike characters', () => {
    const code = makeRefCode('RealShift')
    expect(code).toMatch(/^re-[a-z2-9]{6}$/)
    expect(code).not.toMatch(/[01lio]/)
  })
  it('falls back for a brand with no letters', () => {
    expect(makeRefCode('123')).toMatch(/^ss-/)
  })
  it('is unique across many draws', () => {
    const codes = new Set(Array.from({ length: 500 }, () => makeRefCode('RealShift')))
    expect(codes.size).toBe(500)
  })
})
