import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Session refresh for the proxy layer — keeps the Supabase cookie fresh on every
 * navigation, and sends signed-out visitors to the login page.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Without Supabase configured there is no session to refresh and no way to
  // authenticate anyone. Fall through rather than throwing: a missing env var
  // should not take the public marketing site down with it, and the app routes
  // still fail closed because their own queries have no client either.
  if (!url || !key) return NextResponse.next({ request })

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')
  const isPublic = isAuthPage || isApiRoute || pathname === '/'

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/login'
    return NextResponse.redirect(redirect)
  }

  if (user && isAuthPage) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/shift'
    return NextResponse.redirect(redirect)
  }

  return supabaseResponse
}
