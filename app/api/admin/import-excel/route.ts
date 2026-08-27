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
      return NextResponse.json({ error: 'Only IT role users can execute Master Excel Imports.' }, { status: 403 })
    }

    const body = await request.json()
    const {
      batchId: clientBatchId,
      fileName,
      branchName,
      customers = [],
      loans = [],
      schedules = [],
      transactions = [],
      isLastChunk = false,
      totalMembers = 0,
    } = body

    const supabase = adminClient()
    const batchId = clientBatchId || `BATCH-${Date.now()}`

    // 1. Process Customers Chunk
    let membersCreated = 0
    let membersUpdated = 0
    if (customers.length > 0) {
      const customerPayloads = customers.map((c: any) => ({
        id: c.customer_id,
        data: { ...c, batch_id: batchId },
      }))

      const ids = customerPayloads.map((item: any) => item.id)
      const { data: existing } = await supabase.from('customers').select('id').in('id', ids)
      const existingSet = new Set((existing || []).map((e: any) => e.id))

      customerPayloads.forEach((item: any) => {
        if (existingSet.has(item.id)) membersUpdated++
        else membersCreated++
      })

      await supabase.from('customers').upsert(customerPayloads)
    }

    // 2. Process Loans Chunk
    let loansCreated = 0
    let loansUpdated = 0
    if (loans.length > 0) {
      const loanPayloads = loans.map((l: any) => ({
        id: l.loan_account_no,
        data: { ...l, batch_id: batchId },
      }))

      const ids = loanPayloads.map((item: any) => item.id)
      const { data: existing } = await supabase.from('loans').select('id').in('id', ids)
      const existingSet = new Set((existing || []).map((e: any) => e.id))

      loanPayloads.forEach((item: any) => {
        if (existingSet.has(item.id)) loansUpdated++
        else loansCreated++
      })

      await supabase.from('loans').upsert(loanPayloads)
    }

    // 3. Process Repayment Schedules Chunk
    if (schedules.length > 0) {
      const schedulePayloads = schedules.map((s: any) => ({
        id: `${s.loan_account_no}-${s.installment_no}`,
        data: { ...s, batch_id: batchId },
      }))
      await supabase.from('repayment_schedule').upsert(schedulePayloads)
    }

    // 4. Process Transactions Chunk
    if (transactions.length > 0) {
      const transactionPayloads = transactions.map((t: any) => ({
        id: String(t.txn_id),
        data: { ...t, batch_id: batchId },
      }))
      await supabase.from('transactions').upsert(transactionPayloads)
    }

    // 5. Final Batch Log Entry
    if (isLastChunk) {
      const batchLog = {
        id: batchId,
        data: {
          batch_id: batchId,
          file_name: fileName || 'Branch_Master.xlsx',
          branch_name: branchName || 'ALL',
          uploaded_by: auth.profile.email,
          uploaded_at: new Date().toISOString(),
          members_created: membersCreated,
          members_updated: membersUpdated,
          loans_created: loansCreated,
          loans_updated: loansUpdated,
          total_records: totalMembers || customers.length,
          status: 'COMPLETED',
        },
      }
      await supabase.from('audit_logs').upsert(batchLog)
    }

    return NextResponse.json({
      ok: true,
      batchId,
      fileName,
      branchName,
      membersCreated,
      membersUpdated,
      loansCreated,
      loansUpdated,
      schedulesGenerated: schedules.length,
      transactionsGenerated: transactions.length,
    })
  } catch (err: any) {
    console.error('Import Excel API Error:', err)
    return NextResponse.json({ error: err.message || 'Excel Master Import failed.' }, { status: 500 })
  }
}
