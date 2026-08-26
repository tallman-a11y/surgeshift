import type { SupabaseClient } from '@supabase/supabase-js'
import { makeRefCode, tagReplyLinks, withRef } from '@/lib/attribution'
import { createServiceClient } from '@/lib/supabase/service'

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
 *
 * The tracked_links row is written with the service client: it is a system record,
 * and RLS grants the signed-in user SELECT but not INSERT. Writing it with the
 * caller's client failed silently and left an opportunity carrying a code whose
 * link row did not exist, so visits could never be joined back to their thread.
 * The caller must have already verified the user owns this brand.
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
    const admin = createServiceClient()
    const { error } = await admin.from('tracked_links').insert({
      code,
      brand_id: brand.id,
      opportunity_id: opp.id,
      target_url: withRef(brand.url, code),
      platform: opp.platform,
      subreddit: opp.subreddit,
    })

    // Only claim the code once its link row exists. A code without a row is worse
    // than no code: the reply looks tracked and reports nowhere.
    if (error) {
      console.error('[attribution] could not record tracked link:', error.message)
      return { text: replyText, code: null }
    }

    await supabase.from('opportunities').update({ tracked_code: code }).eq('id', opp.id)
  }

  return { text, code }
}
