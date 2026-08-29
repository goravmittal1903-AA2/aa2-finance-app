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
      cumulativeMembersCreated = 0,
      cumulativeMembersUpdated = 0,
      cumulativeLoansCreated = 0,
      cumulativeLoansUpdated = 0,
    } = body

    const supabase = adminClient()
    const batchId = clientBatchId || `BATCH-${Date.now()}`

    // 1. Process Customers
    let membersCreated = 0
    let membersUpdated = 0
    let customerPromise: Promise<any> = Promise.resolve()
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

      customerPromise = supabase.from('customers').upsert(customerPayloads).then(({ error }) => {
        if (error) throw new Error(`Customers upsert error: ${error.message}`)
      })
    }

    // 2. Process Loans
    let loansCreated = 0
    let loansUpdated = 0
    const newlyCreatedLoanIds: string[] = []
    let loanPromise: Promise<any> = Promise.resolve()
    let auditEventsPromise: Promise<any> = Promise.resolve()

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

      loanPromise = supabase.from('loans').upsert(loanPayloads).then(({ error }) => {
        if (error) throw new Error(`Loans upsert error: ${error.message}`)
      })

      if (newlyCreatedLoanIds.length > 0) {
        const actorUuid = auth.profile?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auth.profile.id)
          ? auth.profile.id
          : null

        const loanAuditEvents = loans
          .filter((l: any) => newlyCreatedLoanIds.includes(l.loan_account_no))
          .map((l: any) => ({
            actor_id: actorUuid,
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
              narration: `Loan Account ${l.loan_account_no} created via Excel Import (Batch: ${batchId}) for ${l.member_name_cache || l.member_name}`,
            },
            event_hash: `HASH-LOAN-${l.loan_account_no}-${batchId}`,
          }))

        auditEventsPromise = supabase.from('audit_events').insert(loanAuditEvents).then(({ error }) => {
          if (error) console.warn('Audit event insert warning:', error.message)
        })
      }
    }

    // 3. Process Repayment Schedules (Parallel 75-item subchunks)
    const schedulePromises: Promise<any>[] = []
    if (schedules.length > 0) {
      const schedulePayloads = schedules.map((s: any) => ({
        id: `${s.loan_account_no}-${s.installment_no}`,
        data: { ...s, batch_id: batchId },
      }))

      const SCHED_CHUNK = 75
      for (let i = 0; i < schedulePayloads.length; i += SCHED_CHUNK) {
        const sub = schedulePayloads.slice(i, i + SCHED_CHUNK)
        schedulePromises.push(
          supabase.from('repayment_schedule').upsert(sub).then(({ error }) => {
            if (error) throw new Error(`Schedules upsert error: ${error.message}`)
          })
        )
      }
    }

    // 4. Process Transactions
    let transactionPromise: Promise<any> = Promise.resolve()
    if (transactions.length > 0) {
      const transactionPayloads = transactions.map((t: any) => ({
        id: String(t.txn_id),
        data: { ...t, batch_id: batchId },
      }))
      transactionPromise = supabase.from('transactions').upsert(transactionPayloads).then(({ error }) => {
        if (error) throw new Error(`Transactions upsert error: ${error.message}`)
      })
    }

    // Execute all table writes concurrently in parallel
    await Promise.all([
      customerPromise,
      loanPromise,
      auditEventsPromise,
      transactionPromise,
      ...schedulePromises,
    ])

    // 5. Final Batch Log Entry with cumulative stats
    if (isLastChunk) {
      const finalMembersCreated = (cumulativeMembersCreated || 0) + membersCreated
      const finalMembersUpdated = (cumulativeMembersUpdated || 0) + membersUpdated
      const finalLoansCreated = (cumulativeLoansCreated || 0) + loansCreated
      const finalLoansUpdated = (cumulativeLoansUpdated || 0) + loansUpdated

      const batchLog = {
        id: batchId,
        data: {
          batch_id: batchId,
          file_name: fileName || 'Branch_Master.xlsx',
          branch_name: branchName || 'ALL',
          uploaded_by: auth.profile.email,
          uploaded_at: new Date().toISOString(),
          members_created: finalMembersCreated,
          members_updated: finalMembersUpdated,
          loans_created: finalLoansCreated,
          loans_updated: finalLoansUpdated,
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
        narration: `Master Excel Import completed: ${finalLoansCreated} loans created, ${finalMembersCreated} members created from ${fileName || 'Branch_Master.xlsx'}`,
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
