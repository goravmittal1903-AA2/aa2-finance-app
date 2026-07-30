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

  const { data: existing } = await admin
    .from('job_runs')
    .select('id, status')
    .eq('job_name', 'nightly-reconciliation')
    .eq('business_date', businessDate)
    .maybeSingle()
  if (existing?.status === 'completed') return NextResponse.json({ status: 'already_completed', businessDate })

  const { error: startedError } = await admin.from('job_runs').upsert({
    job_name: 'nightly-reconciliation', business_date: businessDate, status: 'running', started_at: new Date().toISOString(), completed_at: null, details: {},
  }, { onConflict: 'job_name,business_date' })
  if (startedError) return NextResponse.json({ error: startedError.message }, { status: 500 })

  try {
    const { data: schedules, error } = await admin.from('repayment_schedule').select('id, data')
    if (error) throw error
    let updated = 0
    const today = new Date(`${businessDate}T00:00:00.000Z`)

    for (const record of schedules || []) {
      const row = record.data as { due_date?: string; emi_due?: number; paid_amount?: number; status?: string; dpd?: number }
      if (!row.due_date || ['Paid', 'Waived', 'Restructured'].includes(row.status || '')) continue
      const dueDate = new Date(`${row.due_date}T00:00:00.000Z`)
      const outstanding = Math.max(0, Number(row.emi_due || 0) - Number(row.paid_amount || 0))
      const dpd = outstanding > 0 && dueDate < today ? Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000) : 0
      const status = outstanding <= 0 ? 'Paid' : dpd > 0 ? 'Overdue' : Number(row.paid_amount || 0) > 0 ? 'Partial' : 'Pending'
      if (dpd !== Number(row.dpd || 0) || status !== row.status) {
        await admin.from('repayment_schedule').update({ data: { ...row, dpd, status } }).eq('id', record.id)
        updated++
      }
    }

    await admin.from('job_runs').update({ status: 'completed', completed_at: new Date().toISOString(), details: { schedules_updated: updated } })
      .eq('job_name', 'nightly-reconciliation').eq('business_date', businessDate)
    return NextResponse.json({ status: 'completed', businessDate, schedulesUpdated: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reconciliation failed.'
    await admin.from('job_runs').update({ status: 'failed', completed_at: new Date().toISOString(), details: { error: message } })
      .eq('job_name', 'nightly-reconciliation').eq('business_date', businessDate)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = run
export const GET = run
