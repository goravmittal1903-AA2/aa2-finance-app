/**
 * Centralized Supabase Configuration
 * Dedicated Oracle Cloud Always Free Instance (200 GB SSD, 24 GB RAM)
 *
 * JWT keys are signed with JWT_SECRET = aa2finance_jwt_secret_token_at_least_32_chars_long_2026
 * These MUST match what is in ~/supabase/docker/.env on the Oracle VM.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://144.24.99.155:8000'

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbHFjd3ZhdWxudWV3Z2xwdHl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjkwNTY0OSwiZXhwIjoyMDk4NDgxNjQ5fQ.UwFyWcb9OZtv_TnpTN4DT-geo7vIJKgmxzNIG4uxjQI'

export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbHFjd3ZhdWxudWV3Z2xwdHl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjkwNTY0OSwiZXhwIjoyMDk4NDgxNjQ5fQ.UwFyWcb9OZtv_TnpTN4DT-geo7vIJKgmxzNIG4uxjQI'
