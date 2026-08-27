/**
 * Centralized Supabase Configuration
 * Dedicated Oracle Cloud Always Free Instance (200 GB SSD, 24 GB RAM)
 *
 * JWT keys are signed with JWT_SECRET = aa2finance_jwt_secret_token_at_least_32_chars_long_2026
 * These MUST match what is in ~/supabase/docker/.env on the Oracle VM.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://144.24.99.155.sslip.io'

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.AfRC3aXbHgpk2zziemysIrFmwVVCF9SvQD4673bWMMg'

const FALLBACK_SERVICE_KEY = Buffer.from(
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnliMnhsSWpvaWMyVnlkbWxqWlY5eWIyeGxJaXdpYVhOeklqb2ljM1Z3WVdKaGMyVWlMQ0pwWVhRaU9qRTJOREUzTmpreU1EQXNJbVY0Y0NJNk1UYzVPVFV6TlRZd01IMC5pUlFOakhpNUp3NzZGa3V6MDlOMFZjaENVU3hzNkpMRVJ0MWpxb1JMWktZ',
  'base64'
).toString('utf-8')

export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_KEY
