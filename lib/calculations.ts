import { getAll, getOne, getFiltered, putOne, putMany, delOne, tbl, supabase } from './supabase'
import type { Loan, ScheduleRow, PortfolioRow, Transaction } from './types'
import { dpdBucket, todayISO } from './utils'

export const FREQ_DAYS: Record<string, number> = {
  Weekly: 7,
  Monthly: 30,
  'Bi-Monthly': 15,
  Quarterly: 90,
}

export const FREQ_PER_YEAR: Record<string, number> = {
  Weekly: 52,
  Monthly: 12,
  'Bi-Monthly': 24,
  Quarterly: 4,
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function addMonthsLike(dateStr: string, frequency: string): string {
  const m = frequency === 'Monthly' ? 1 : frequency === 'Bi-Monthly' ? 2 : 3
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + m)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export function computeLoanEconomics({
  loan_amount,
  file_charge,
  file_charge_pct,
  interest_rate,
  tenure,
  frequency,
  installment_amount,
}: {
  loan_amount: number
  file_charge?: number | null
  file_charge_pct?: number | null
  interest_rate: number
  tenure: number
  frequency: string
  installment_amount?: number | null
}) {
  const amount = Number(loan_amount) || 0
  const rate = Number(interest_rate) || 0
  const term = Number(tenure) || 1

  let file_charge_val = 0
  if (file_charge !== undefined && file_charge !== null && file_charge !== 0) {
    file_charge_val = Number(file_charge) || 0
  } else {
    const pct = Number(file_charge_pct) || 0
    file_charge_val = Math.round(amount * (pct / 100))
  }

  const net_disbursement = amount - file_charge_val
  const periods_per_year = FREQ_PER_YEAR[frequency] || 12
  const tenure_years = term / periods_per_year

  let total_interest = 0
  let total_loan = 0
  let final_installment = 0

  if (installment_amount !== undefined && installment_amount !== null && Number(installment_amount) > 0) {
    final_installment = Number(installment_amount)
    total_loan = final_installment * term
    total_interest = total_loan - amount
  } else {
    total_interest = amount * (rate / 100) * tenure_years
    total_loan = amount + total_interest
    final_installment = Math.round(total_loan / term)
    total_loan = final_installment * term
    total_interest = total_loan - amount
  }

  const per_installment_interest = total_interest / term
  return {
    file_charge: file_charge_val,
    net_disbursement,
    total_interest,
    total_loan,
    installment_amount: final_installment,
    per_installment_interest,
  }
}

export function generateSchedule(loan: any): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  const stepDays = FREQ_DAYS[loan.frequency] || 30
  let opening = loan.total_loan
  let due = loan.installment_start_date

  for (let i = 1; i <= loan.tenure; i++) {
    const interest_due = Math.round(loan.per_installment_interest * 100) / 100
    const emi_due = loan.installment_amount
    const principal_due = emi_due - interest_due
    const closing = Math.max(0, Math.round((opening - emi_due) * 100) / 100)
    
    rows.push({
      id: loan.loan_account_no + '_' + i,
      loan_account_no: loan.loan_account_no,
      installment_no: i,
      due_date: due,
      opening_balance: opening,
      principal_due,
      interest_due,
      emi_due,
      closing_balance: closing,
      paid_amount: 0,
      paid_date: null,
      status: 'Pending',
      dpd: 0,
    })
    
    opening = closing
    due = (loan.frequency === 'Monthly' || loan.frequency === 'Bi-Monthly' || loan.frequency === 'Quarterly')
      ? addMonthsLike(due, loan.frequency)
      : addDays(due, stepDays)
  }
  return rows
}

export async function generateUniqueLoanAccountNo(): Promise<string> {
  // Use point lookups instead of loading all loans — much faster
  for (let attempt = 0; attempt < 20; attempt++) {
    const num = String(1000000000 + Math.floor(Math.random() * 9000000000))
    const existing = await getOne<Loan>('loans', num)
    if (!existing) return num
  }
  // Fallback: timestamp-based guaranteed unique
  return String(Date.now()).slice(-10)
}

export function computeOutstanding(loan: Loan, rows: ScheduleRow[]): number {
  const isClosed = (loan.status || '').toUpperCase().startsWith('CLOS')
  if (isClosed) return 0
  const collected = rows.reduce((s, r) => s + (r.paid_amount || 0), 0)
  return Math.max(0, (loan.total_loan || 0) - collected)
}

export function computeTotalCollected(loan: Loan, rows: ScheduleRow[]): number {
  const isClosed = (loan.status || '').toUpperCase().startsWith('CLOS')
  if (isClosed) return loan.total_collected || loan.total_loan || 0
  return rows.reduce((s, r) => s + (r.paid_amount || 0), 0)
}

export async function getPortfolio(): Promise<PortfolioRow[]> {
  const loans = await getAll<Loan>('loans')

  return loans.map(l => {
    const isClosed = (l.status || '').toUpperCase().startsWith('CLOS')
    const total_collected = l.total_collected || 0
    const outstanding = isClosed ? 0 : (l.ledger_balance || 0)
    const maxDpd = l.dpd || 0
    const paidFrac = l.total_loan ? total_collected / l.total_loan : 0
    const interest_received = Math.round(paidFrac * (l.total_interest || 0))

    return {
      loan_account_no: l.loan_account_no,
      customer_id: l.customer_id,
      member_name: l.member_name_cache || l.member_name || '',
      branch: l.branch_code,
      fo: l.fo_name,
      loan_amount: l.loan_amount,
      net_disbursement: l.net_disbursement,
      total_interest: l.total_interest,
      total_collected,
      outstanding,
      interest_received,
      status: l.status,
      dpd: maxDpd,
      dpd_bucket: l.dpd_bucket || dpdBucket(maxDpd),
      npa_flag: maxDpd >= 90 ? 1 : 0,
      par_flag: maxDpd >= 30 ? 1 : 0,
      disb_date: l.disbursement_date,
      frequency: l.frequency,
    }
  })
}

/**
 * Full ledger recalculation:
 * 1. Reset all non-waived/non-restructured rows to Pending, paid_amount=0
 * 2. Re-apply all non-voided PAYMENT transactions chronologically
 * 3. Recompute DPD for every row based on today's date
 * 4. Update loan summary (total_collected, ledger_balance, dpd, status)
 */
export async function recalcLoanLedger(loan_account_no: string): Promise<void> {
  const today = todayISO()

  // PERF: Parallel fetch — schedule, transactions, and loan in ONE round-trip
  const [rawRows, rawTxns, loan] = await Promise.all([
    getFiltered<ScheduleRow>('schedule', 'loan_account_no', loan_account_no),
    getFiltered<Transaction>('transactions', 'loan_account_no', loan_account_no),
    getOne<Loan>('loans', loan_account_no),
  ])

  // Step 1: Sort and reset non-fixed rows
  const rows = rawRows.sort((a, b) => a.installment_no - b.installment_no)

  for (const r of rows) {
    if (r.status !== 'Restructured' && r.status !== 'Waived') {
      r.paid_amount = 0
      r.status = 'Pending'
      r.paid_date = null
      r.dpd = 0
    }
  }

  // Step 2: Filter and sort payment transactions chronologically
  const txns = rawTxns
    .filter(t => (t.txn_type === 'PAYMENT' || t.txn_type === 'FORECLOSURE') && !t.voided)
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date) || (a.txn_id || 0) - (b.txn_id || 0))

  // Step 3: Re-apply payments — oldest payment fills oldest installment first
  for (const t of txns) {
    let remaining = Number(t.amount) || 0
    for (const r of rows) {
      if (remaining <= 0) break
      if (r.status === 'Restructured' || r.status === 'Waived') continue
      const due = r.emi_due - r.paid_amount
      if (due <= 0) continue
      const pay = Math.min(due, remaining)
      r.paid_amount = Math.round((r.paid_amount + pay) * 100) / 100
      remaining -= pay
      if (r.paid_amount >= r.emi_due - 0.5) {
        r.status = 'Paid'
        r.paid_date = t.txn_date
      } else {
        r.status = 'Partial'
      }
    }
  }

  // Step 4: Recompute DPD for all non-paid rows
  for (const r of rows) {
    if (r.status === 'Paid' || r.status === 'Waived' || r.status === 'Restructured') {
      r.dpd = 0
    } else {
      // DPD = days the installment is overdue (only if due_date < today)
      const dpd = r.due_date < today ? daysBetween(r.due_date, today) : 0
      r.dpd = dpd
      // Mark as Overdue if has dpd and not yet Partial
      if (dpd > 0 && r.status === 'Pending') r.status = 'Overdue'
    }
  }

  // Step 5: Bulk save schedule rows + update loan in parallel where possible
  if (loan) {
    const activeRows = rows.filter(r => r.status !== 'Restructured')
    const fullyPaid = activeRows.length > 0 &&
      activeRows.every(r => r.status === 'Paid' || r.status === 'Waived')

    if (fullyPaid && !(loan.status || '').toUpperCase().startsWith('CLOS')) {
      loan.status = 'CLOSE'
      loan.close_date = txns.length ? txns[txns.length - 1].txn_date : today
      loan.closure_type = 'FULL_REPAYMENT'
    }

    const isClosed = (loan.status || '').toUpperCase().startsWith('CLOS')
    const total_collected = rows.reduce((s, r) => s + (r.paid_amount || 0), 0)
    loan.total_collected = isClosed ? (loan.total_loan || 0) : total_collected
    loan.ledger_balance = isClosed ? 0 : Math.max(0, (loan.total_loan || 0) - total_collected)

    // DPD = max DPD across all non-paid rows
    const dpdValues = rows
      .filter(r => r.status !== 'Paid' && r.status !== 'Waived' && r.status !== 'Restructured')
      .map(r => r.dpd || 0)
    const maxDpd = dpdValues.length > 0 ? Math.max(0, ...dpdValues) : 0
    loan.dpd = maxDpd
    loan.dpd_bucket = dpdBucket(maxDpd)
    loan.npa_flag = maxDpd >= 90

    if (isClosed && !loan.close_date) {
      loan.close_date = txns.length ? txns[txns.length - 1].txn_date : today
    }

    // PERF: Write schedule and loan in parallel — both are independent
    await Promise.all([
      putMany('schedule', rows, 'id'),
      putOne('loans', loan, 'loan_account_no'),
    ])
  } else {
    await putMany('schedule', rows, 'id')
  }
}

export async function classifyPayment(loan_account_no: string, amount: number, txn_date: string) {
  const rows = (await getFiltered<ScheduleRow>('schedule', 'loan_account_no', loan_account_no))
    .filter(r => r.status !== 'Paid')
    .sort((a, b) => a.installment_no - b.installment_no)
  
  const amtNum = Number(amount) || 0
  if (!rows.length) {
    return {
      label: 'No installments pending',
      covers: [] as any[],
      overdueCleared: 0,
      advanceCount: 0,
      leftover: amtNum,
    }
  }

  let remaining = amtNum
  const covers = []
  for (const r of rows) {
    if (remaining <= 0) break
    const due = r.emi_due - (r.paid_amount || 0)
    if (due <= 0) continue
    const pay = Math.min(due, remaining)
    const isOverdue = r.due_date < txn_date && (r.paid_amount || 0) < r.emi_due
    const isAdvance = r.due_date > txn_date
    covers.push({
      installment_no: r.installment_no,
      due_date: r.due_date,
      pay,
      full: pay >= due - 0.5,
      overdue: isOverdue,
      advance: isAdvance,
    })
    remaining -= pay
  }

  const overdueCleared = covers.filter(c => c.overdue).length
  const advanceCount = covers.filter(c => c.advance).length
  const onTimeCount = covers.filter(c => !c.overdue && !c.advance).length

  let label = 'EMI Payment'
  if (overdueCleared && !advanceCount) label = 'Overdue / Arrears Payment'
  else if (advanceCount && !overdueCleared) label = 'Advance Payment'
  else if (overdueCleared && advanceCount) label = 'Overdue + Advance Payment'
  else if (onTimeCount) label = 'On-time EMI Payment'

  const leftover = remaining > 0.5 ? remaining : 0

  return { label, covers, overdueCleared, advanceCount, leftover }
}

export async function applyPayment(
  loan_account_no: string,
  amount: number,
  txn_date: string,
  mode: string,
  reference_no: string,
  remarks: string,
  enteredBy = 'system'
): Promise<number> {
  if (!loan_account_no || !amount || amount <= 0) {
    throw new Error('Invalid payment: loan account or amount is missing.')
  }

  const cls = await classifyPayment(loan_account_no, amount, txn_date)
  const lastInstNo = cls.covers.length ? cls.covers[cls.covers.length - 1].installment_no : null
  
  // Unique transaction ID using timestamp + random to avoid collisions
  const nextTxId = Date.now() + Math.floor(Math.random() * 1000)

  const newTxn: Transaction = {
    txn_id: nextTxId,
    loan_account_no,
    amount: Number(amount),
    txn_date,
    mode,
    reference_no,
    remarks,
    installment_no: lastInstNo,
    txn_type: 'PAYMENT',
    classification: cls.label,
    created_at: new Date().toISOString(),
    entered_by: enteredBy,
    voided: false,
  }

  // Save transaction first
  await putOne('transactions', newTxn, 'txn_id')
  // Then recalculate entire ledger from all transactions (ensures consistency)
  await recalcLoanLedger(loan_account_no)

  return nextTxId
}

export async function computeForeclosure(loan_account_no: string, asOfDate: string) {
  const pending = (await getFiltered<ScheduleRow>('schedule', 'loan_account_no', loan_account_no))
    .filter(r => r.status !== 'Paid')
    .sort((a, b) => a.installment_no - b.installment_no)

  let principalRemaining = 0
  let interestOnOverdue = 0
  let overdueCount = 0

  for (const r of pending) {
    const remainingOnRow = r.emi_due - (r.paid_amount || 0)
    const rowPrincipalDue = r.principal_due
    const rowInterestDue = r.interest_due
    const frac = remainingOnRow / (r.emi_due || 1)

    principalRemaining += rowPrincipalDue * frac
    if (r.due_date < asOfDate) {
      interestOnOverdue += rowInterestDue * frac
      overdueCount++
    }
  }

  principalRemaining = Math.round(principalRemaining)
  interestOnOverdue = Math.round(interestOnOverdue)
  const payoff = principalRemaining + interestOnOverdue

  return {
    principalRemaining,
    interestOnOverdue,
    overdueCount,
    payoff,
    pendingCount: pending.length,
  }
}
