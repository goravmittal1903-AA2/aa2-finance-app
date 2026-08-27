import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase-config'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return NextResponse.json({ user: null, session: null })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data: profile, error: profErr } = await admin
      .from('user_profiles')
      .select('id, email, display_name, role, branch_code')
      .eq('id', user.id)
      .maybeSingle()

    if (profErr || !profile) {
      return NextResponse.json({ user: null, session: null })
    }

    const sessionUser = {
      id: profile.id,
      email: profile.email,
      name: profile.display_name,
      role: profile.role,
      branch: profile.branch_code || 'ALL',
    }

    return NextResponse.json({ user: sessionUser, session: { user } })
  } catch (err) {
    return NextResponse.json({ user: null, session: null })
  }
}
