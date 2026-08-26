import 'server-only'

import { createClient } from '@supabase/supabase-js'

const DEDICATED_URL = 'https://144.24.99.155.sslip.io'
const DEDICATED_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'

/** Use only in protected server routes and background jobs. */
export function createSupabaseAdminClient() {
  return createClient(DEDICATED_URL, DEDICATED_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
