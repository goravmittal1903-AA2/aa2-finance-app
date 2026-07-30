import { createClient } from '@supabase/supabase-js'

export type AccountStatus = 'ok' | 'invalid_domain' | 'unknown_email' | 'inactive' | 'locked'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase configuration is missing.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

export async function accountStatus(email: string): Promise<AccountStatus> {
  const { data, error } = await client().rpc('login_account_status', { p_email: email })
  if (error || !data) throw new Error('Login security configuration is unavailable. Apply migration 202607140004_login_security.sql.')
  return data as AccountStatus
}

export async function recordPasswordFailure(email: string) {
  const { data, error } = await client().rpc('record_login_failure', { p_email: email })
  if (error) throw new Error('Unable to record the sign-in attempt.')
  return data as 'failed' | 'locked'
}

export async function clearLoginLock(email: string) {
  const { error } = await client().rpc('clear_login_lock', { p_email: email })
  if (error) throw new Error('Unable to unlock this account.')
}
