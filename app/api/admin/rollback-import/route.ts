import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUser } from '@/lib/authz'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase-config'

function adminClient() {
  const url = SUPABASE_URL!
  const key = SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser()
    if ('error' in auth) return auth.error
    if (auth.profile.role !== 'it' && auth.profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only Admin or IT role users can execute Import Rollbacks.' }, { status: 403 })
    }

    const body = await request.json()
    const batchId = body.batchId || body.batch_id || body.id
    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID is required for rollback.' }, { status: 400 })
    }

    const supabase = adminClient()
    let deletedCount = 0

    const tables = ['transactions', 'repayment_schedule', 'loans', 'customers']
    for (const table of tables) {
      while (true) {
        const { data: matched, error: selErr } = await supabase
          .from(table)
          .select('id')
          .eq('data->>batch_id', String(batchId))
          .limit(500)

        if (selErr || !matched || matched.length === 0) break
        const ids = matched.map((r: any) => r.id)
        const { error: delErr } = await supabase.from(table).delete().in('id', ids)
        if (delErr) {
          console.warn(`Error deleting batch ${batchId} from ${table}:`, delErr.message)
          break
        }
        deletedCount += ids.length
        if (matched.length < 500) break
      }
    }

    // Clean up orphaned transactions and schedules whose loans no longer exist via RPC if available
    try {
      const { data: purgeStats } = await supabase.rpc('purge_orphaned_records')
      if (purgeStats) {
        deletedCount += (purgeStats.deleted_txns || 0) + (purgeStats.deleted_scheds || 0)
      }
    } catch {
      // Gracefully continue if RPC does not exist
    }

    const { count: activeLoanCount } = await supabase.from('loans').select('id', { count: 'exact', head: true })
    if (activeLoanCount === 0) {
      await supabase.from('transactions').delete().filter('id', 'neq', '___none___')
      await supabase.from('repayment_schedule').delete().filter('id', 'neq', '___none___')
    }

    // Update batch log status in both audit_log and audit_logs tables
    const logTables = ['audit_log', 'audit_logs']
    for (const t of logTables) {
      try {
        const { data: batchLog } = await supabase.from(t).select('data').eq('id', batchId).maybeSingle()
        if (batchLog && batchLog.data) {
          const updatedLog = {
            id: batchId,
            data: {
              ...batchLog.data,
              status: 'ROLLED_BACK',
              rolled_back_by: auth.profile.email,
              rolled_back_at: new Date().toISOString(),
            },
          }
          await supabase.from(t).upsert(updatedLog)
        }
      } catch {
        // Continue
      }
    }

    return NextResponse.json({
      ok: true,
      batchId,
      deletedCount,
      message: `Successfully rolled back batch ${batchId}.`,
    })
  } catch (err: any) {
    console.error('Rollback API Error:', err)
    return NextResponse.json({ error: err.message || 'Rollback failed.' }, { status: 500 })
  }
}
