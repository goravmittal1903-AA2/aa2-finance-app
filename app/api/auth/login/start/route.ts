import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { accountStatus, recordPasswordFailure } from '@/lib/auth-security'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const schema = z.object({ email: z.email(), password: z.string().min(8).max(256) })

export async function POST(request: NextRequest) {
  const body = schema.safeParse(await request.json())
  if (!body.success) {
    return NextResponse.json({ error: 'Enter a valid email address and password.' }, { status: 400 })
  }
  const email = body.data.email.toLowerCase()

  // Domain, active-status, and lockout checks
  let status
  try {
    status = await accountStatus(email)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login security is unavailable.' },
      { status: 503 },
    )
  }
  if (status === 'invalid_domain') {
    return NextResponse.json({ error: 'Use your approved AA2 work email address.' }, { status: 400 })
  }
  if (status === 'unknown_email') {
    return NextResponse.json({ error: 'This email address is not registered.' }, { status: 401 })
  }
  if (status === 'inactive') {
    return NextResponse.json({ error: 'This account is inactive. Contact an administrator.' }, { status: 403 })
  }
  if (status === 'locked') {
    return NextResponse.json(
      { error: 'Account locked after 5 unsuccessful attempts. Use "Forgot password?" to reset and unlock.', locked: true },
      { status: 423 },
    )
  }

  // Attempt sign-in with Supabase using SSR client so the session cookie is set
  const supabase = await createSupabaseServerClient()
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: body.data.password,
  })

  if (signInError || !data.user) {
    // Track failure count; lock after 5
    const result = await recordPasswordFailure(email).catch(() => 'failed' as const)
    if (result === 'locked') {
      return NextResponse.json(
        { error: 'Account locked after 5 unsuccessful attempts. Use "Forgot password?" to reset and unlock.', locked: true },
        { status: 423 },
      )
    }
    return NextResponse.json({ error: 'Incorrect password. Please try again.' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
