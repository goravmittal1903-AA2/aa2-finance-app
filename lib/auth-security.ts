import { createClient } from '@supabase/supabase-js'

export type AccountStatus = 'ok' | 'invalid_domain' | 'unknown_email' | 'inactive' | 'locked'

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase-config'

function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

export async function accountStatus(email: string): Promise<AccountStatus> {
  try {
    const c = client()
    const { data, error } = await c.rpc('login_account_status', { p_email: email })
    if (error || !data) {
      // Fallback gracefully so login is never blocked if security RPC isn't loaded
      return 'ok'
    }
    return data as AccountStatus
  } catch {
    return 'ok'
  }
}

export async function recordPasswordFailure(email: string) {
  try {
    const c = client()
    const { data, error } = await c.rpc('record_login_failure', { p_email: email })
    if (error || !data) return 'failed' as const
    return data as 'failed' | 'locked'
  } catch {
    return 'failed' as const
  }
}

export async function clearLoginLock(email: string) {
  try {
    const c = client()
    await c.rpc('clear_login_lock', { p_email: email })
  } catch {
    // Ignore unlock failure
  }
}
