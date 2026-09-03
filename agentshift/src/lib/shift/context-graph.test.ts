import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseContextGraph } from './context-graph'

type Row = Record<string, unknown>

/**
 * A fake Supabase client that records what the graph tried to do.
 *
 * Only the surface the graph actually touches: `.from().insert().select().single()`,
 * `.from().update().in()`, and `.rpc()`. Anything else is a deliberate gap — if the
 * graph starts using more of the client, these tests should fail loudly rather than
 * silently pass against a permissive mock.
 */
function fakeClient(opts: {
  identity?: Row | null
  insertFails?: boolean
} = {}) {
  const inserted: Row[] = []
  const updated: { patch: Row; ids: string[] }[] = []
  const rpcCalls: { fn: string; args: Row }[] = []
  let identity = opts.identity ?? null

  const client = {
    from() {
      return {
        insert(row: Row) {
          inserted.push(row)
          return {
            select() {
              return {
                single: async () =>
                  opts.insertFails
                    ? { data: null, error: { message: 'nope' } }
                    : { data: { id: 'evt_1' }, error: null },
              }
            },
          }
        },
        update(patch: Row) {
          return {
            in: async (_col: string, ids: string[]) => {
              updated.push({ patch, ids })
              return { error: null }
            },
          }
        },
      }
    },
    async rpc(fn: string, args: Row) {
      rpcCalls.push({ fn, args })
      if (fn === 'resolve_shift_identity') return { data: identity ? [identity] : [], error: null }
      if (fn === 'link_shift_identity') {
        // Linking creates the identity the next resolve will find.
        identity = {
          global_user_id: 'global_1',
          product_accounts: { agentshift: args.p_local_id },
          consented_products: args.p_consented ?? [],
        }
        return { data: 'global_1', error: null }
      }
      return { data: null, error: null }
    },
  } as unknown as SupabaseClient

  return { client, inserted, updated, rpcCalls, setIdentity: (i: Row | null) => { identity = i } }
}

const IDENTITY_WITH = (consented: string[]) => ({
  global_user_id: 'global_1',
  product_accounts: { agentshift: 'local_1', lendshift: 'lend_1' },
  consented_products: consented,
})

describe('publishFor — consent', () => {
  it('refuses a handoff to a product the user has not connected', async () => {
    const f = fakeClient({ identity: IDENTITY_WITH(['agentshift']) })
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    const result = await g.publishFor({
      localUserId: 'local_1', eventType: 'lender_referral', targetProduct: 'lendshift',
    })

    expect('refused' in result).toBe(true)
    expect((result as { refused: string }).refused).toMatch(/not connected/)
    // The critical assertion: nothing was written.
    expect(f.inserted).toHaveLength(0)
  })

  it('publishes once the product is connected', async () => {
    const f = fakeClient({ identity: IDENTITY_WITH(['agentshift', 'lendshift']) })
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    const result = await g.publishFor({
      localUserId: 'local_1', eventType: 'lender_referral', targetProduct: 'lendshift',
      payload: { contactName: 'Dana Reyes' },
    })

    expect(result).toEqual({ id: 'evt_1' })
    expect(f.inserted).toHaveLength(1)
    expect(f.inserted[0]).toMatchObject({
      source_product: 'agentshift',
      target_product: 'lendshift',
      event_type: 'lender_referral',
      // Addressed to the GLOBAL id, not the product-local one.
      user_id: 'global_1',
    })
  })

  it('allows an unaddressed broadcast without a consent check', async () => {
    const f = fakeClient({ identity: IDENTITY_WITH(['agentshift']) })
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    const result = await g.publishFor({ localUserId: 'local_1', eventType: 'listing_live' })

    expect('id' in result).toBe(true)
    expect(f.inserted[0].target_product).toBeNull()
  })

  it('reports a refusal rather than throwing when the write fails', async () => {
    const f = fakeClient({ identity: IDENTITY_WITH(['agentshift', 'lendshift']), insertFails: true })
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    const result = await g.publishFor({
      localUserId: 'local_1', eventType: 'lender_referral', targetProduct: 'lendshift',
    })

    expect((result as { refused: string }).refused).toMatch(/not reachable/)
  })
})

describe('publish — target lifting', () => {
  it('lifts targetProduct out of the payload into its own column', async () => {
    const f = fakeClient()
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    await g.publish({
      sourceProduct: 'agentshift', eventType: 'client_closed', userId: 'global_1',
      payload: { targetProduct: 'lendshift', note: 'funded' },
    })

    expect(f.inserted[0].target_product).toBe('lendshift')
  })

  it('defaults the source to this product when none is given', async () => {
    const f = fakeClient()
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    await g.publish({ sourceProduct: '', eventType: 'x', userId: 'g', payload: {} })

    expect(f.inserted[0].source_product).toBe('agentshift')
  })
})

describe('ensureIdentity', () => {
  it('returns an existing identity without creating another', async () => {
    const f = fakeClient({ identity: IDENTITY_WITH(['agentshift', 'lendshift']) })
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    const id = await g.ensureIdentity('local_1')

    expect(id.globalUserId).toBe('global_1')
    expect(f.rpcCalls.filter(c => c.fn === 'link_shift_identity')).toHaveLength(0)
  })

  it('creates one on first sight, consented to this product', async () => {
    const f = fakeClient({ identity: null })
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    const id = await g.ensureIdentity('local_1')

    expect(f.rpcCalls.some(c => c.fn === 'link_shift_identity')).toBe(true)
    expect(id.consentedProducts).toEqual(['agentshift'])
  })

  it('falls back to the local id rather than throwing when linking cannot round-trip', async () => {
    // A client whose rpc never returns an identity — what an unconfigured shared
    // project looks like. The bus must degrade, not explode.
    const client = { async rpc() { return { data: [], error: null } } } as unknown as SupabaseClient
    const g = new SupabaseContextGraph(client, 'agentshift')

    const id = await g.ensureIdentity('local_1')

    expect(id.globalUserId).toBe('local_1')
    expect(id.productAccounts).toEqual({ agentshift: 'local_1' })
  })
})

describe('markConsumed', () => {
  it('does nothing on an empty list rather than issuing an unbounded update', async () => {
    const f = fakeClient()
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    await g.markConsumed([])

    expect(f.updated).toHaveLength(0)
  })

  it('stamps consumed_at alongside the flag', async () => {
    const f = fakeClient()
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    await g.markConsumed(['evt_1', 'evt_2'])

    expect(f.updated).toHaveLength(1)
    expect(f.updated[0].ids).toEqual(['evt_1', 'evt_2'])
    expect(f.updated[0].patch.consumed).toBe(true)
    expect(f.updated[0].patch.consumed_at).toBeTruthy()
  })
})

describe('pendingFor', () => {
  it('returns nothing for a user with no identity yet', async () => {
    const f = fakeClient({ identity: null })
    const g = new SupabaseContextGraph(f.client, 'agentshift')

    expect(await g.pendingFor('local_1')).toEqual([])
  })
})
