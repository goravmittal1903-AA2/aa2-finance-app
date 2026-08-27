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
    if (auth.profile.role !== 'it') {
      return NextResponse.json({ error: 'Only IT role users can execute Import Rollbacks.' }, { status: 403 })
    }

    const { batchId } = await request.json()
    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID is required for rollback.' }, { status: 400 })
    }

    const supabase = adminClient()
    let deletedCount = 0

    const tables = ['transactions', 'repayment_schedule', 'loans', 'customers']
    for (const table of tables) {
      const { data: matched } = await supabase.from(table).select('id').eq('data->>batch_id', batchId)
      if (matched && matched.length > 0) {
        const ids = matched.map((r: any) => r.id)
        const { error } = await supabase.from(table).delete().in('id', ids)
        if (!error) deletedCount += ids.length
      }
    }

    // Clean up orphaned transactions and schedules whose loans no longer exist via RPC
    const { data: purgeStats } = await supabase.rpc('purge_orphaned_records')
    if (purgeStats) {
      deletedCount += (purgeStats.deleted_txns || 0) + (purgeStats.deleted_scheds || 0)
    }

    const { count: activeLoanCount } = await supabase.from('loans').select('id', { count: 'exact', head: true })
    if (activeLoanCount === 0) {
      await supabase.from('transactions').delete().filter('id', 'neq', '___none___')
      await supabase.from('repayment_schedule').delete().filter('id', 'neq', '___none___')
    }

    // Update batch log status in both audit_log and audit_logs tables
    const logTables = ['audit_log', 'audit_logs']
    for (const t of logTables) {
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
