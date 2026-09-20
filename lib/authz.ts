import 'server-only'

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export type AppRole = 'employee' | 'admin' | 'it'

export interface UserProfile {
  id: string
  email: string
  display_name: string
  role: AppRole
  branch_code: string | null
  active: boolean
}

/** Returns true when the given role is included in the allowed list. */
export function requireRole(role: AppRole, allowed: AppRole[]): boolean {
  return allowed.includes(role)
}

/** Checks whether a user profile is authorized to access data for a given branch code. */
export function canAccessBranch(profile: { role: string; branch_code: string | null }, branchCode?: string | null): boolean {
  if (profile.role === 'it' || profile.role === 'admin') return true
  if (!profile.branch_code || profile.branch_code === 'ALL') return true
  if (!branchCode) return true
  return profile.branch_code.trim().toUpperCase() === branchCode.trim().toUpperCase()
}

/** Resolves the authenticated Supabase user and their application profile.
 *  Returns an error response object if the request is unauthenticated or the
 *  profile is inactive, otherwise returns { supabase, user, profile }. */
export async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) }
  }

  // Fetch profile from user_profiles table
  try {
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, display_name, role, branch_code, active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profileError && profile) {
      if (profile.active === false) {
        return { error: NextResponse.json({ error: 'User account is deactivated. Contact IT administrator.' }, { status: 403 }) }
      }
      return {
        supabase,
        user,
        profile: profile as UserProfile
      }
    }
  } catch {
    // user_profiles table may not exist or query failed
  }

  // Secure fallback: strictly default to unprivileged employee role (NEVER admin)
  const fallbackProfile: UserProfile = {
    id: user.id,
    email: user.email || 'unknown@aa2finance.com',
    display_name: user.email?.split('@')[0] || 'User',
    role: 'employee',
    branch_code: null,
    active: true,
  }

  return { supabase, user, profile: fallbackProfile }
}

