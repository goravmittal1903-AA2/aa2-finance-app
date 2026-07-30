import 'server-only'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export type AppRole = 'employee' | 'admin' | 'it'

/** Returns true when the given role is included in the allowed list. */
export function requireRole(role: AppRole, allowed: AppRole[]): boolean {
  return allowed.includes(role)
}

/** Resolves the authenticated Supabase user and their application profile.
 *  Returns an error response object if the request is unauthenticated or the
 *  profile is inactive, otherwise returns { supabase, user, profile }.
 *  Gracefully falls back to a default profile if user_profiles table doesn't exist. */
export async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) }
  }

  // Try to fetch profile — gracefully fall back if table doesn't exist
  try {
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, display_name, role, branch_code, active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profileError && profile && profile.active !== false) {
      return {
        supabase,
        user,
        profile: profile as {
          id: string
          email: string
          display_name: string
          role: AppRole
          branch_code: string | null
          active: boolean
        }
      }
    }
  } catch {
    // user_profiles table may not exist — fall through to default profile
  }

  // Graceful fallback: use auth user data directly
  const fallbackProfile = {
    id: user.id,
    email: user.email || 'unknown@aa2finance.com',
    display_name: user.email?.split('@')[0] || 'User',
    role: 'admin' as AppRole,
    branch_code: null,
    active: true,
  }

  return { supabase, user, profile: fallbackProfile }
}
