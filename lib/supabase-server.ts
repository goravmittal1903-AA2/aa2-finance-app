import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const DEDICATED_URL = 'http://144.24.99.155:8000'
const DEDICATED_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(DEDICATED_URL, DEDICATED_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot set cookies. Proxy and route handlers refresh them.
        }
      },
    },
  })
}
