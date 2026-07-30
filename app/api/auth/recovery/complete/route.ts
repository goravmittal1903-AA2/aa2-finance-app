import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { clearLoginLock } from '@/lib/auth-security'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const schema = z.object({ password: z.string().min(12, 'Use at least 12 characters.').max(256) })

export async function POST(request: NextRequest) {
  const body = schema.safeParse(await request.json())
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message || 'Enter a valid new password.' }, { status: 400 })
  }

  // The user has a live Supabase session from the recovery callback
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Your recovery session has expired. Start again.' }, { status: 401 })
  }

  const { error } = await supabase.auth.updateUser({ password: body.data.password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Clear the lockout record so the user can sign in normally
  await clearLoginLock(user.email!)
  await supabase.auth.signOut()

  return NextResponse.json({ ok: true })
}
