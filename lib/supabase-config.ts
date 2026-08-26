/**
 * Centralized Supabase Configuration
 * Dedicated High-Capacity Oracle Cloud Always Free Instance (200 GB SSD, 24 GB RAM)
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().startsWith('http')
  ? process.env.NEXT_PUBLIC_SUPABASE_URL.trim()
  : 'https://144.24.99.155.sslip.io'

export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim().startsWith('eyJ') && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim().length > 80)
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'

export const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().startsWith('eyJ') && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 80)
  ? process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
