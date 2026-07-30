import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { requireAuthenticatedUser } from '@/lib/authz'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase configuration is missing.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── GET /api/admin/users ── List all profiles ─────────────────────────────────
export async function GET() {
  try {
    const auth = await requireAuthenticatedUser()
    if ('error' in auth) return auth.error
    if (auth.profile.role !== 'it') {
      return NextResponse.json({ error: 'Only IT users can manage accounts.' }, { status: 403 })
    }

    const supabase = adminClient()
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, display_name, role, branch_code, active, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('user_profiles select warning:', error.message)
      return NextResponse.json({ users: [] })
    }

    return NextResponse.json({
      users: (data || []).map(u => ({
        email: u.email,
        name: u.display_name,
        role: u.role,
        branch: u.branch_code || 'ALL',
        active: u.active,
        created_at: u.created_at,
      }))
    })
  } catch (err) {
    console.error('GET /api/admin/users error:', err)
    return NextResponse.json({ users: [], error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// ── POST /api/admin/users ── Create user ─────────────────────────────────────
const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(128),
  role: z.enum(['it', 'admin', 'employee']),
  branchCode: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser()
    if ('error' in auth) return auth.error
    if (auth.profile.role !== 'it') {
      return NextResponse.json({ error: 'Only IT users can create accounts.' }, { status: 403 })
    }

    const body = createSchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) {
      return NextResponse.json({ error: body.error.issues[0]?.message || 'Invalid input.' }, { status: 400 })
    }
    const { email, password, displayName, role, branchCode } = body.data

    if (!email.toLowerCase().endsWith('@aa2finance.com')) {
      return NextResponse.json({ error: 'Email must be an @aa2finance.com address.' }, { status: 400 })
    }

    const supabase = adminClient()

    // Create auth user using service role or signUp fallback
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    // Update the profile record
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({ display_name: displayName, role, branch_code: branchCode || null, active: true })
      .eq('id', authData.user.id)

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {})
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/admin/users error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// ── PATCH /api/admin/users ── Update role or active status ────────────────────
const patchSchema = z.object({
  userId: z.string().email(),
  role: z.enum(['it', 'admin', 'employee']).optional(),
  active: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser()
    if ('error' in auth) return auth.error
    if (auth.profile.role !== 'it') {
      return NextResponse.json({ error: 'Only IT users can modify accounts.' }, { status: 403 })
    }

    const body = patchSchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) {
      return NextResponse.json({ error: body.error.issues[0]?.message || 'Invalid input.' }, { status: 400 })
    }
    const { userId: email, role, active } = body.data

    const supabase = adminClient()
    const updates: Record<string, unknown> = {}
    if (role !== undefined) updates.role = role
    if (active !== undefined) updates.active = active

    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('email', email.toLowerCase())

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/admin/users error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// ── DELETE /api/admin/users ── Delete user ────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser()
    if ('error' in auth) return auth.error
    if (auth.profile.role !== 'it') {
      return NextResponse.json({ error: 'Only IT users can delete accounts.' }, { status: 403 })
    }

    const { searchParams } = request.nextUrl
    const email = searchParams.get('userId')?.toLowerCase()
    if (!email) return NextResponse.json({ error: 'userId is required.' }, { status: 400 })

    const supabase = adminClient()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (!profile) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

    const { error } = await supabase.auth.admin.deleteUser(profile.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/admin/users error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
