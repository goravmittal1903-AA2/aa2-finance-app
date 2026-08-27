'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser client backed by secure Supabase Auth cookies. It intentionally uses
 * the publishable/anon key only; privileged operations stay on the server.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase-config'

export function createSupabaseBrowserClient() {
  let url = SUPABASE_URL
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    url = `${window.location.origin}/api/supabase-proxy`
  }
  return createBrowserClient(url, SUPABASE_ANON_KEY)
}
