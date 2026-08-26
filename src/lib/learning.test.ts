import { describe, it, expect } from 'vitest'
import { classify } from './learning'

describe('classify', () => {
  const draft = 'For CWI Part B, practice defect ID on real coupons.'

  it('is an accept when nothing was posted separately', () => {
    expect(classify(draft)).toBe('accept')
    expect(classify(draft, null)).toBe('accept')
  })

  it('is an accept when the posted text is identical', () => {
    expect(classify(draft, draft)).toBe('accept')
  })

  it('ignores whitespace and case differences', () => {
    // A reformatted paste is not a judgement about the content, and counting it
    // as an edit would poison the training signal with noise.
    expect(classify(draft, `  For CWI Part B,   practice defect ID on real coupons.  `)).toBe('accept')
    expect(classify(draft, draft.toUpperCase())).toBe('accept')
    expect(classify(draft, draft.replace(' ', '\n'))).toBe('accept')
  })

  it('is an edit when the operator changed the words', () => {
    expect(classify(draft, 'For CWI Part B, practice on real coupons — diagrams will not cut it.')).toBe('edit')
  })

  it('is an edit when the operator cut the draft down', () => {
    expect(classify(draft, 'Practice defect ID on real coupons.')).toBe('edit')
  })
})
