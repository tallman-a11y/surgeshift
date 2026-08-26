import type { SupabaseClient } from '@supabase/supabase-js'
import { makeRefCode, tagReplyLinks, withRef, recordTrackedLink } from '@/lib/attribution'

export type OpportunityForTracking = {
  id: string
  brand_id: string
  platform: string
  subreddit: string | null
  drafted_reply: string
  tracked_code: string | null
}

export type BrandForTracking = { id: string; name: string; url: string }

/**
 * Return the reply text with its link carrying a ref code, creating the code on
 * first use and reusing it afterwards.
 *
 * Both paths that put a reply in front of a human go through here — the Copy
 * button (which is how Reddit replies get posted until API credentials exist) and
 * the one-click Post. If only Post tagged links, every hand-pasted Reddit reply
 * would be invisible to attribution, which is most of them today.
 */
export async function buildTrackedReply(
  supabase: SupabaseClient,
  opp: OpportunityForTracking,
  brand: BrandForTracking,
  replyText: string,
): Promise<{ text: string; code: string | null }> {
  if (!replyText?.trim() || !brand.url) return { text: replyText, code: opp.tracked_code }

  const code = opp.tracked_code ?? makeRefCode(brand.name)
  const { text, tagged } = tagReplyLinks(replyText, brand.url, code)

  // Nothing to tag (the draft never mentioned the link) — don't burn a code.
  if (!tagged) return { text: replyText, code: opp.tracked_code }

  if (!opp.tracked_code) {
    await recordTrackedLink(supabase, code, {
      brandId: brand.id,
      opportunityId: opp.id,
      targetUrl: withRef(brand.url, code),
      platform: opp.platform,
      subreddit: opp.subreddit,
    })
    await supabase.from('opportunities').update({ tracked_code: code }).eq('id', opp.id)
  }

  return { text, code }
}
