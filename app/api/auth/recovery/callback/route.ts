import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Supabase redirects here after the user clicks the password-reset link in email.
// The URL contains a `code` query parameter which we exchange for a session,
// then redirect the user to the new-password screen.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=invalid_reset_link', request.url))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Recovery callback failed:', error.message)
    return NextResponse.redirect(new URL('/login?error=reset_link_expired', request.url))
  }

  // Redirect to the new-password form inside the login page
  return NextResponse.redirect(new URL('/login?screen=new-password', request.url))
}
