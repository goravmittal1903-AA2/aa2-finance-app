import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { z } from 'zod'
import { createGateToken, readGateToken } from '@/lib/session-gate'

const schema = z.object({ code: z.string().regex(/^\d{6,8}$/) })

export async function POST(request: NextRequest) {
  const pending = await readGateToken(request.cookies.get('aa2_otp_pending')?.value, 'pending')
  if (!pending) return NextResponse.json({ error: 'Your sign-in attempt has expired. Enter your password again.' }, { status: 401 })
  const body = schema.safeParse(await request.json())
  if (!body.success) return NextResponse.json({ error: 'Enter the one-time code from your email.' }, { status: 400 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 })

  const response = NextResponse.json({ ok: true })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  })
  const { data, error } = await supabase.auth.verifyOtp({ email: pending.email, token: body.data.code, type: 'email' })
  if (error || !data.user) return NextResponse.json({ error: error?.message || 'The code is invalid or expired.' }, { status: 401 })

  response.cookies.set('aa2_otp_pending', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  response.cookies.set('aa2_verified_session', await createGateToken('verified', pending.email, data.user.id, 900), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 900,
  })
  return response
}
