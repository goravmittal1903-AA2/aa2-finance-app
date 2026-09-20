/**
 * Centralized Supabase Configuration
 * All Supabase keys must be provided strictly via environment variables.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (typeof window === 'undefined') {
  if (!SUPABASE_URL) console.warn('[Supabase Config] Missing NEXT_PUBLIC_SUPABASE_URL environment variable.')
  if (!SUPABASE_ANON_KEY) console.warn('[Supabase Config] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.')
  if (!SUPABASE_SERVICE_ROLE_KEY) console.warn('[Supabase Config] Missing SUPABASE_SERVICE_ROLE_KEY environment variable.')
}

