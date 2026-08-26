import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Attribution for posted replies.
 *
 * Deliberately NOT a URL shortener. A shortened link in a Reddit comment reads as
 * spam, and getting the account banned costs more than the tracking is worth — so
 * the real destination URL is kept intact and a short `ref` code is appended. The
 * destination is one of Tyler's own sites, so it can report the visit back to
 * /api/attribution/visit; standard analytics on that site will also see the ref.
 */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no look-alikes (0/o, 1/l/i)

function randomSuffix(len = 6): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

/** A short, human-ish code: two letters of the brand, then randomness. */
export function makeRefCode(brandName: string): string {
  const prefix = (brandName.replace(/[^a-zA-Z]/g, '').slice(0, 2) || 'ss').toLowerCase()
  return `${prefix}-${randomSuffix()}`
}

/** Append `ref` to a URL without clobbering an existing query string or hash. */
export function withRef(rawUrl: string, code: string): string {
  try {
    const u = new URL(rawUrl)
    u.searchParams.set('ref', code)
    return u.toString()
  } catch {
    return rawUrl
  }
}

/**
 * Rewrite every occurrence of the brand's URL inside a drafted reply so it carries
 * the ref code. Returns the text unchanged when the draft never mentions the link.
 */
export function tagReplyLinks(replyText: string, brandUrl: string, code: string): { text: string; tagged: boolean } {
  if (!replyText || !brandUrl) return { text: replyText, tagged: false }

  const tracked = withRef(brandUrl, code)
  // Match the brand URL with or without a trailing slash, not already carrying a ref,
  // and stop before sentence punctuation so "…/demo." keeps its full stop.
  const escaped = brandUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/$/, '')
  const re = new RegExp(`${escaped}/?(?![\\w./?=&-])`, 'g')

  let tagged = false
  const text = replyText.replace(re, () => { tagged = true; return tracked })
  return { text, tagged }
}

export type TrackedLinkInput = {
  brandId: string
  opportunityId: string | null
  targetUrl: string
  platform: string
  subreddit?: string | null
}

/** Persist the code so a later visit can be traced back to the exact thread. */
export async function recordTrackedLink(
  supabase: SupabaseClient,
  code: string,
  input: TrackedLinkInput,
): Promise<void> {
  await supabase.from('tracked_links').insert({
    code,
    brand_id: input.brandId,
    opportunity_id: input.opportunityId,
    target_url: input.targetUrl,
    platform: input.platform,
    subreddit: input.subreddit ?? null,
  })
}
