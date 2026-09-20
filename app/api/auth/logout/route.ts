import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()

  const response = NextResponse.json({ ok: true })

  // Clear all session gate cookies
  const cookiesToClear = [
    'aa2_verified_session',
    'aa2_otp_pending',
    'aa2_recovery_pending',
    'aa2_recovery_verified',
  ]

  for (const name of cookiesToClear) {
    response.cookies.set(name, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
  }

  return response
}

