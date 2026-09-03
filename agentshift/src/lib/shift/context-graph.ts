import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextGraph, CrossProductEvent, CrossProductIdentity } from '@allshift/core'

/**
 * SupabaseContextGraph — the cross-product bus for the Shift family.
 *
 * `@allshift/core` has defined the `ContextGraph` interface since 0.4, but no product
 * had implemented it, so every product was constructing `NoOpContextGraph` and every
 * handoff silently went nowhere. This is the real one.
 *
 * What it carries: a buyer in AgentShift who needs financing becomes a
 * `lender_referral` event addressed to LendShift; a listing going live becomes a
 * `listing_live` event SurgeShift can build a campaign around. The receiving product
 * picks the event up on that user's next turn, acts on it, and marks it consumed.
 *
 * Two things it is careful about:
 *
 * 1. **Identity.** The same person has a different row id in every product, so events
 *    are addressed to a *global* id resolved through `shift_identities`. Publishing
 *    with a product-local id would produce events nobody can read.
 *
 * 2. **Consent.** Nothing is published to a product the user has not consented to.
 *    That check lives in `publishFor()` below rather than in the caller, because a
 *    consent check the caller has to remember is a consent check that gets forgotten.
 */
export class SupabaseContextGraph implements ContextGraph {
  constructor(
    private readonly supabase: SupabaseClient,
    /** This product's name, used as the source on everything published. */
    private readonly product: string,
  ) {}

  async publish(
    event: Omit<CrossProductEvent, 'id' | 'createdAt' | 'consumed'>,
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('shift_cross_product_events')
      .insert({
        source_product: event.sourceProduct || this.product,
        // The interface has no target field, so it travels in the payload and is
        // lifted out here. A missing target is a broadcast.
        target_product: (event.payload?.targetProduct as string) ?? null,
        event_type: event.eventType,
        user_id: event.userId,
        payload: event.payload ?? {},
      })
      .select('id')
      .single()

    if (error || !data) return ''
    return (data as { id: string }).id
  }

  async getPendingEvents(targetProduct: string, userId: string): Promise<CrossProductEvent[]> {
    const { data } = await this.supabase
      .from('shift_cross_product_events')
      .select('*')
      .eq('user_id', userId)
      .eq('consumed', false)
      // Broadcasts (null target) are for everyone; addressed events are for one product.
      .or(`target_product.eq.${targetProduct},target_product.is.null`)
      // Never hand a product back its own event.
      .neq('source_product', targetProduct)
      .order('created_at', { ascending: true })
      .limit(20)

    return ((data as Record<string, unknown>[]) ?? []).map(row => ({
      id: row.id as string,
      sourceProduct: row.source_product as string,
      eventType: row.event_type as string,
      userId: row.user_id as string,
      payload: (row.payload as Record<string, unknown>) ?? {},
      consumed: row.consumed as boolean,
      createdAt: row.created_at as string,
    }))
  }

  async markConsumed(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return
    await this.supabase
      .from('shift_cross_product_events')
      .update({ consumed: true, consumed_at: new Date().toISOString() })
      .in('id', eventIds)
  }

  async resolveIdentity(product: string, localUserId: string): Promise<CrossProductIdentity | null> {
    const { data } = await this.supabase.rpc('resolve_shift_identity', {
      p_product: product,
      p_local_id: localUserId,
    })

    const row = (data as Record<string, unknown>[] | null)?.[0]
    if (!row) return null

    return {
      globalUserId: row.global_user_id as string,
      productAccounts: (row.product_accounts as Record<string, string>) ?? {},
      consentedProducts: (row.consented_products as string[]) ?? [],
    }
  }

  async linkIdentity(
    globalUserId: string,
    product: string,
    localUserId: string,
    consentedProducts: string[],
  ): Promise<void> {
    await this.supabase.rpc('link_shift_identity', {
      p_global_user_id: globalUserId || null,
      p_product: product,
      p_local_id: localUserId,
      p_consented: consentedProducts,
    })
  }

  // ── Convenience layer on top of the interface ─────────────────────────────────

  /**
   * Resolve this product's local user to their global identity, creating one on
   * first sight. Every cross-product call goes through here, so a user who has only
   * ever used AgentShift still gets an identity — it simply has one account in it.
   */
  async ensureIdentity(localUserId: string): Promise<CrossProductIdentity> {
    const existing = await this.resolveIdentity(this.product, localUserId)
    if (existing) return existing

    await this.linkIdentity('', this.product, localUserId, [this.product])
    const created = await this.resolveIdentity(this.product, localUserId)

    // If the link round-trip failed (no shared project configured, say), fall back to
    // treating the local id as global. The bus then works product-locally instead of
    // throwing, which is the right failure mode for an optional integration.
    return created ?? {
      globalUserId: localUserId,
      productAccounts: { [this.product]: localUserId },
      consentedProducts: [this.product],
    }
  }

  /**
   * Publish on behalf of a product-local user, resolving identity and enforcing
   * consent first. This is what callers should use; `publish()` is the raw interface
   * method the brain calls.
   *
   * Returns a refusal rather than throwing when the handoff is not allowed — the
   * caller needs to tell the user "they haven't connected LendShift" rather than
   * silently doing nothing.
   */
  async publishFor(opts: {
    localUserId: string
    eventType: string
    targetProduct?: string
    payload?: Record<string, unknown>
  }): Promise<{ id: string } | { refused: string }> {
    const identity = await this.ensureIdentity(opts.localUserId)

    if (opts.targetProduct && !identity.consentedProducts.includes(opts.targetProduct)) {
      return {
        refused: `${opts.targetProduct} is not connected for this user, so nothing was sent. ` +
          'They can link it in their Shift family settings, and the handoff will go through then.',
      }
    }

    const id = await this.publish({
      sourceProduct: this.product,
      eventType: opts.eventType,
      userId: identity.globalUserId,
      payload: { ...(opts.payload ?? {}), targetProduct: opts.targetProduct ?? null },
    })

    return id ? { id } : { refused: 'The family bus is not reachable, so nothing was sent.' }
  }

  /** Pending events for this product, addressed to a product-local user. */
  async pendingFor(localUserId: string): Promise<CrossProductEvent[]> {
    const identity = await this.resolveIdentity(this.product, localUserId)
    if (!identity) return []
    return this.getPendingEvents(this.product, identity.globalUserId)
  }
}
