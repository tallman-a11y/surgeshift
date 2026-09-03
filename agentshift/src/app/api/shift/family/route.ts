/**
 * Family health. Reports which layers of the Shift brain are actually live, so the
 * app — and anyone debugging a handoff that went nowhere — can tell the difference
 * between "connected" and "silently no-op".
 */

import { buildLayers } from '@/lib/shift-brain'
import { familyBusIsShared, FAMILY_PRODUCTS, PRODUCT } from '@/lib/shift/family'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const layers = buildLayers()

export function GET() {
  return Response.json({
    product: PRODUCT,
    layers: layers.status,
    bus: {
      configured: layers.status.contextGraph,
      // Product-local means publish and consume work, but siblings cannot read them.
      scope: familyBusIsShared() ? 'shared' : 'product-local',
      siblings: FAMILY_PRODUCTS,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
