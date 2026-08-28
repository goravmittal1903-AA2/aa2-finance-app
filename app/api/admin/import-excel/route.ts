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

    // 1. Process Customers Chunk (Reuse existing permanent customer_id if matched)
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

    // 2. Process Loans Chunk (Reuse existing permanent loan_account_no if matched)
    let loansCreated = 0
    let loansUpdated = 0
    const newlyCreatedLoanIds: string[] = []
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
        else { loansCreated++; newlyCreatedLoanIds.push(item.id) }
      })

      await supabase.from('loans').upsert(loanPayloads)

      // Write per-loan audit_events for NEWLY created loans so audit trail shows import entry
      if (newlyCreatedLoanIds.length > 0) {
        const loanAuditEvents = loans
          .filter((l: any) => newlyCreatedLoanIds.includes(l.loan_account_no))
          .map((l: any) => ({
            actor_id: auth.profile.id,
            actor_email: auth.profile.email,
            action: 'LOAN_CREATED',
            entity_type: 'LOAN',
            entity_id: l.loan_account_no,
            branch_code: l.branch_code || branchName || 'ALL',
            after_data: {
              loan_account_no: l.loan_account_no,
              customer_id: l.customer_id,
              member_name: l.member_name_cache || l.member_name,
              loan_amount: l.loan_amount,
              tenure: l.tenure,
              frequency: l.frequency || 'Weekly',
              installment_amount: l.installment_amount,
              disbursement_date: l.disbursement_date,
              status: l.status,
              source: 'EXCEL_IMPORT',
              batch_id: batchId,
            },
            narration: `Loan Account ${l.loan_account_no} created via Excel Import (Batch: ${batchId}) for ${l.member_name_cache || l.member_name}`,
            event_hash: `HASH-LOAN-${l.loan_account_no}-${batchId}`,
          }))
        // Insert in chunks to avoid payload size limit
        for (let i = 0; i < loanAuditEvents.length; i += 50) {
          await supabase.from('audit_events').insert(loanAuditEvents.slice(i, i + 50))
        }
      }
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

    // 5. Final Batch Log Entry (Write to both audit_log & audit_logs tables)
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
      await supabase.from('audit_log').upsert(batchLog)
      await supabase.from('audit_logs').upsert(batchLog)

      await supabase.from('audit_events').insert({
        actor_id: auth.profile.id,
        actor_email: auth.profile.email,
        action: 'MASTER_EXCEL_IMPORT',
        entity_type: 'IMPORT_BATCH',
        entity_id: batchId,
        branch_code: branchName || 'ALL',
        after_data: batchLog.data,
        narration: `Master Excel Import completed: ${loansCreated} loans created, ${membersCreated} members created from ${fileName || 'Branch_Master.xlsx'}`,
        event_hash: `HASH-${Date.now()}-${batchId}`
      })
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
