import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase-config'

/** Use only in protected server routes and background jobs. */
export function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
