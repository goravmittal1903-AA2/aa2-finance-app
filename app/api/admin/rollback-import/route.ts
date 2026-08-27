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

    // Clean up orphaned transactions and schedules whose loans no longer exist
    const { count: activeLoanCount } = await supabase.from('loans').select('id', { count: 'exact', head: true })
    if (activeLoanCount === 0) {
      // System has 0 active loans -> purge all leftover transactions & schedules
      await supabase.from('transactions').delete().neq('id', '___none___')
      await supabase.from('repayment_schedule').delete().neq('id', '___none___')
    } else {
      // Fetch active loan account numbers
      const { data: activeLoans } = await supabase.from('loans').select('id')
      if (activeLoans && activeLoans.length > 0) {
        const validLoanNos = new Set(activeLoans.map((l: any) => l.id))
        const { data: allTxns } = await supabase.from('transactions').select('id, data')
        if (allTxns && allTxns.length > 0) {
          const orphanTxnIds = allTxns
            .filter((t: any) => !t.data?.loan_account_no || !validLoanNos.has(String(t.data.loan_account_no)))
            .map((t: any) => t.id)
          if (orphanTxnIds.length > 0) {
            await supabase.from('transactions').delete().in('id', orphanTxnIds)
          }
        }
      }
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
