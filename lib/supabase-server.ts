import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const DEFAULT_URL = 'https://eslqcwvaulnuewglptyx.supabase.co'
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbHFjd3ZhdWxudWV3Z2xwdHl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjkwNTY0OSwiZXhwIjoyMDk4NDgxNjQ5fQ.UwFyWcb9OZtv_TnpTN4DT-geo7vIJKgmxzNIG4uxjQI'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_KEY

  return createServerClient(url, key, {
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
