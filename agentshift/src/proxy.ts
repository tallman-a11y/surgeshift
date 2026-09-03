import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Next 16 renamed the `middleware` convention to `proxy` and dropped edge-runtime
 * support for it; the Supabase session refresh runs fine on node, so this is a
 * straight rename.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
