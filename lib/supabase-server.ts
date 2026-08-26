import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const DEFAULT_URL = 'https://eslqcwvaulnuewglptyx.supabase.co'
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbHFjd3ZhdWxudWV3Z2xwdHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDU2NDksImV4cCI6MjA5ODQ4MTY0OX0.xDsIyRYAfkVXThqfD57ignN1CORMnQiKRWp0KB3LmGU'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http'))
    ? process.env.NEXT_PUBLIC_SUPABASE_URL.trim()
    : DEFAULT_URL

  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const key = (envKey && envKey.trim().startsWith('eyJ') && envKey.trim().length > 80)
    ? envKey.trim()
    : DEFAULT_KEY

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
