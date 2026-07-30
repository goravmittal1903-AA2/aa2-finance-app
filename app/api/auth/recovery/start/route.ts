import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { accountStatus } from '@/lib/auth-security'

const schema = z.object({ email: z.email() })

export async function POST(request: NextRequest) {
  const body = schema.safeParse(await request.json())
  if (!body.success) {
    return NextResponse.json({ error: 'Enter a valid work email address.' }, { status: 400 })
  }
  const email = body.data.email.toLowerCase()

  // Validate domain and account existence
  let status
  try {
    status = await accountStatus(email)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Recovery is unavailable.' },
      { status: 503 },
    )
  }
  if (status === 'invalid_domain') {
    return NextResponse.json({ error: 'Use your approved AA2 work email address.' }, { status: 400 })
  }
  if (status === 'unknown_email') {
    return NextResponse.json({ error: 'This email address is not registered.' }, { status: 404 })
  }
  if (status === 'inactive') {
    return NextResponse.json({ error: 'This account is inactive. Contact an IT administrator.' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 })
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Supabase sends a password-reset link to the user's email.
  // The link redirects to /login?type=recovery with a token that Supabase handles automatically.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/recovery/callback`,
  })

  if (error) {
    console.error('Password reset email failed:', error.message)
    return NextResponse.json(
      { error: 'Could not send the password reset email. Check Supabase SMTP settings.' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true, locked: status === 'locked' })
}
