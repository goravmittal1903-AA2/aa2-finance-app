/**
 * Centralized Supabase Configuration
 * Dedicated Oracle Cloud Always Free Instance (200 GB SSD, 24 GB RAM)
 *
 * JWT keys are signed with JWT_SECRET = aa2finance_jwt_secret_token_at_least_32_chars_long_2026
 * These MUST match what is in ~/supabase/docker/.env on the Oracle VM.
 */

export const SUPABASE_URL = 'https://144.24.99.155.sslip.io'

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.AfRC3aXbHgpk2zziemysIrFmwVVCF9SvQD4673bWMMg'

export const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.iRQNjHi5Jw76Fkuz09N0VchCUSxs6JLERt1jqoRLZKY'
