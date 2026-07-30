'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser client backed by secure Supabase Auth cookies. It intentionally uses
 * the publishable/anon key only; privileged operations stay on the server.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase browser configuration is missing.')
  }

  return createBrowserClient(url, key)
}
