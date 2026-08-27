'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser client backed by secure Supabase Auth cookies. It intentionally uses
 * the publishable/anon key only; privileged operations stay on the server.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase-config'

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
