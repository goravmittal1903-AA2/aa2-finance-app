import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createSupabaseAdminClient()
  const businessDate = new Date().toISOString().slice(0, 10)

  const { data: existing } = await admin.from('job_runs').select('status')
    .eq('job_name', 'daily-interest-accrual').eq('business_date', businessDate).maybeSingle()
  if (existing?.status === 'completed') return NextResponse.json({ status: 'already_completed', businessDate })

  await admin.from('job_runs').upsert({
    job_name: 'daily-interest-accrual', business_date: businessDate, status: 'running', started_at: new Date().toISOString(), completed_at: null, details: {},
  }, { onConflict: 'job_name,business_date' })

  try {
    const { data: records, error } = await admin.from('loans').select('id, data')
    if (error) throw error
    let accrued = 0
    for (const record of records || []) {
      const loan = record.data as { loan_account_no?: string; status?: string; ledger_balance?: number; interest_rate?: number; branch_code?: string }
      if (loan.status !== 'ACTIVE' || !loan.loan_account_no) continue
      const balance = Math.max(0, Number(loan.ledger_balance || 0))
      const amount = Math.round((balance * Number(loan.interest_rate || 0) / 100 / 365) * 100) / 100
      if (amount <= 0) continue
      const { error: accrualError } = await admin.from('daily_interest_accruals').upsert({
        loan_account_no: loan.loan_account_no, business_date: businessDate, branch_code: loan.branch_code || null,
        opening_principal: balance, annual_rate: Number(loan.interest_rate || 0), accrued_interest: amount,
      }, { onConflict: 'loan_account_no,business_date' })
      if (accrualError) throw accrualError
      accrued++
    }
    await admin.from('job_runs').update({ status: 'completed', completed_at: new Date().toISOString(), details: { loans_accrued: accrued } })
      .eq('job_name', 'daily-interest-accrual').eq('business_date', businessDate)
    return NextResponse.json({ status: 'completed', businessDate, loansAccrued: accrued })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Daily accrual failed.'
    await admin.from('job_runs').update({ status: 'failed', completed_at: new Date().toISOString(), details: { error: message } })
      .eq('job_name', 'daily-interest-accrual').eq('business_date', businessDate)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = run
export const GET = run
