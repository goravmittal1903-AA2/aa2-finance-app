import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readGateToken } from '@/lib/session-gate'

export async function POST(request: NextRequest) {
  const pending = await readGateToken(request.cookies.get('aa2_otp_pending')?.value, 'pending')
  if (!pending) return NextResponse.json({ error: 'Your sign-in attempt has expired. Enter your password again.' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 })
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await supabase.auth.signInWithOtp({ email: pending.email, options: { shouldCreateUser: false } })
  if (error) {
    console.error('Supabase email OTP resend failed:', error.message)
    return NextResponse.json({ error: 'Could not resend the code. Check the Supabase Email Auth, SMTP, and rate-limit settings.' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
