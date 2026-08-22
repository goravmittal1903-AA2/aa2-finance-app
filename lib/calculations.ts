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
    total_interest = Math.max(0, total_loan - amount)
  } else {
    total_interest = Math.max(0, amount * (rate / 100) * tenure_years)
    total_loan = amount + total_interest
    final_installment = Math.round(total_loan / term)
    total_loan = final_installment * term
    total_interest = Math.max(0, total_loan - amount)
  }

  const per_installment_interest = Math.max(0, total_interest / term)
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

/** RBI MFI Guidelines: Check if borrower already has 2 active loans */
export async function checkActiveLoanLimit(customer_id: string): Promise<{ allowed: boolean; activeCount: number; activeLoans: Loan[] }> {
  if (!customer_id) return { allowed: true, activeCount: 0, activeLoans: [] }
  const memberLoans = await getFiltered<Loan>('loans', 'customer_id', customer_id)
  const activeLoans = memberLoans.filter(l => (l.status || '').toUpperCase() === 'ACTIVE' || (l.status || '').toUpperCase() === 'SANCTIONED')
  return {
    allowed: activeLoans.length < 2,
    activeCount: activeLoans.length,
    activeLoans,
  }
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
    const interest_received = Math.floor(paidFrac * (l.total_interest || 0))

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

  // Step 2: Filter, sort, and physically purge duplicate payment transactions
  const sortedRaw = rawTxns
    .filter(t => (t.txn_type === 'PAYMENT' || t.txn_type === 'FORECLOSURE') && !t.voided)
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date) || (a.txn_id || 0) - (b.txn_id || 0))

  const txns: Transaction[] = []
  const seenKeys = new Set<string>()

  for (const t of sortedRaw) {
    const key = t.reference_no && t.reference_no.startsWith('EMIPAY-')
      ? `${t.loan_account_no}_REF_${t.reference_no}`
      : `${t.loan_account_no}_${t.amount}_${t.txn_date}_${t.mode}`

    if (seenKeys.has(key)) {
      await delOne('transactions', t.txn_id)
      continue
    }
    seenKeys.add(key)
    txns.push(t)
  }

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

    if (fullyPaid) {
      if (!(loan.status || '').toUpperCase().startsWith('CLOS')) {
        loan.status = 'CLOSE'
        loan.close_date = txns.length ? txns[txns.length - 1].txn_date : today
        loan.closure_type = 'FULL_REPAYMENT'
      }
    } else {
      // If loan was closed from full repayment but a transaction was deleted/voided, revert to ACTIVE
      if (loan.closure_type === 'FULL_REPAYMENT' || (loan.status || '').toUpperCase().startsWith('CLOS')) {
        loan.status = 'ACTIVE'
        loan.close_date = null
        loan.closure_type = null
      }
    }

    const isClosed = (loan.status || '').toUpperCase().startsWith('CLOS')
    const total_collected = rows.reduce((s, r) => s + (r.paid_amount || 0), 0)
    loan.total_collected = isClosed ? (loan.total_loan || 0) : total_collected
    loan.ledger_balance = isClosed ? 0 : Math.max(0, (loan.total_loan || 0) - total_collected)

    // Calculate total arrears (overdue installments as of today)
    let arrearsSum = 0
    for (const r of rows) {
      if (r.due_date < today && r.status !== 'Paid' && r.status !== 'Waived' && r.status !== 'Restructured') {
        arrearsSum += Math.max(0, r.emi_due - (r.paid_amount || 0))
      }
    }
    loan.arrears_balance = isClosed ? 0 : Math.round(arrearsSum)

    // Calculate advance balance (excess collected over total loan or future payments)
    const totalTxnAmount = txns.reduce((s, t) => s + (t.amount || 0), 0)
    const excessCollected = Math.max(0, totalTxnAmount - total_collected)
    loan.advance_balance = isClosed ? 0 : Math.round(excessCollected)

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

export interface PaymentAllocationResult {
  category: import('./types').PaymentCategory
  label: string
  principal_component: number
  interest_component: number
  penal_component: number
  advance_component: number
  shortage_amount: number
  advance_balance_after: number
  arrears_balance_after: number
  narration: string
  covers: {
    installment_no: number
    due_date: string
    pay: number
    principal_paid: number
    interest_paid: number
    full: boolean
    overdue: boolean
    advance: boolean
  }[]
  overdueCleared: number
  advanceCount: number
  next_due_date: string | null
  next_due_amount: number
}

export async function classifyAndAllocatePayment(
  loan_account_no: string,
  amount: number,
  txn_date: string
): Promise<PaymentAllocationResult> {
  const [loan, rawRows] = await Promise.all([
    getOne<Loan>('loans', loan_account_no),
    getFiltered<ScheduleRow>('schedule', 'loan_account_no', loan_account_no),
  ])

  const rows = rawRows
    .filter(r => r.status !== 'Paid' && r.status !== 'Waived' && r.status !== 'Restructured')
    .sort((a, b) => a.installment_no - b.installment_no)

  const amtNum = Math.max(0, Number(amount) || 0)
  const currentAdvance = loan?.advance_balance || 0

  if (!rows.length) {
    return {
      category: 'EXCESS',
      label: 'Advance / Unallocated Credit',
      principal_component: 0,
      interest_component: 0,
      penal_component: 0,
      advance_component: amtNum,
      shortage_amount: 0,
      advance_balance_after: currentAdvance + amtNum,
      arrears_balance_after: 0,
      narration: `All regular installments are fully paid. Amount of ₹${amtNum.toLocaleString('en-IN')} deposited into Advance Balance Wallet.`,
      covers: [],
      overdueCleared: 0,
      advanceCount: 0,
      next_due_date: null,
      next_due_amount: 0,
    }
  }

  let remaining = amtNum
  let totalPrincipal = 0
  let totalInterest = 0
  let totalPenal = 0
  let shortage = 0
  const covers: PaymentAllocationResult['covers'] = []

  // Check if any overdue installments exist
  const overdueRows = rows.filter(r => r.due_date < txn_date && (r.paid_amount || 0) < r.emi_due)
  const isOverduePresent = overdueRows.length > 0

  for (const r of rows) {
    if (remaining <= 0) break
    const due = Math.max(0, r.emi_due - (r.paid_amount || 0))
    if (due <= 0) continue

    const pay = Math.min(due, remaining)
    const isOverdue = r.due_date < txn_date && (r.paid_amount || 0) < r.emi_due
    const isAdvance = r.due_date > txn_date

    // Proportional breakdown of principal and interest on this installment
    const totalRowEmi = r.emi_due || 1
    const frac = pay / totalRowEmi
    const rowInterest = Math.min(r.interest_due, Math.round(r.interest_due * frac))
    const rowPrincipal = pay - rowInterest

    totalPrincipal += rowPrincipal
    totalInterest += rowInterest

    covers.push({
      installment_no: r.installment_no,
      due_date: r.due_date,
      pay,
      principal_paid: rowPrincipal,
      interest_paid: rowInterest,
      full: (r.paid_amount || 0) + pay >= r.emi_due - 0.5,
      overdue: isOverdue,
      advance: isAdvance,
    })

    remaining -= pay
  }

  const overdueCleared = covers.filter(c => c.overdue && c.full).length
  const advanceCount = covers.filter(c => c.advance).length
  const firstCover = covers[0]
  const isFirstPartial = firstCover && !firstCover.full

  // Determine category & label
  let category: import('./types').PaymentCategory = 'REGULAR'
  let label = 'Regular EMI Payment'

  const firstPendingRow = rows[0]
  const firstPendingDue = firstPendingRow ? firstPendingRow.emi_due - (firstPendingRow.paid_amount || 0) : 0

  if (isFirstPartial && amtNum < firstPendingDue) {
    category = 'SHORT'
    shortage = Math.round(firstPendingDue - amtNum)
    label = `Short Payment (Balance ₹${shortage.toLocaleString('en-IN')})`
  } else if (remaining > 0.5) {
    category = 'EXCESS'
    label = `Excess / Advance Deposit (+₹${Math.round(remaining).toLocaleString('en-IN')})`
  } else if (advanceCount >= 2) {
    category = 'ADVANCE'
    label = `Multi-Month Advance (${advanceCount} Installments)`
  } else if (isOverduePresent && overdueCleared > 0) {
    category = 'OVERDUE_CLEARANCE'
    label = 'Overdue / Arrears Catch-Up'
  } else if (covers.length === 1 && firstCover?.full && !firstCover.overdue && !firstCover.advance) {
    category = 'REGULAR'
    label = 'On-Time Regular EMI'
  }

  const excessAdvance = remaining > 0.5 ? Math.round(remaining) : 0
  const advanceBalanceAfter = currentAdvance + excessAdvance

  // Calculate next remaining due row
  const remainingRows = rows.filter(r => {
    const covered = covers.find(c => c.installment_no === r.installment_no)
    if (!covered) return true
    return !covered.full
  })

  const nextDueRow = remainingRows[0]
  const nextDueDate = nextDueRow ? nextDueRow.due_date : null
  const nextDueAmount = nextDueRow ? Math.max(0, nextDueRow.emi_due - (nextDueRow.paid_amount || 0) - advanceBalanceAfter) : 0

  // Calculate total arrears balance after this payment
  let arrearsBalanceAfter = 0
  for (const r of remainingRows) {
    if (r.due_date < txn_date) {
      arrearsBalanceAfter += Math.max(0, r.emi_due - (r.paid_amount || 0))
    }
  }

  // Generate automated intelligent narration
  let narration = ''
  if (category === 'SHORT') {
    narration = `Partial collection of ₹${amtNum.toLocaleString('en-IN')} received towards Installment #${firstPendingRow.installment_no} (Due ₹${firstPendingDue.toLocaleString('en-IN')}). Allocated to Interest ₹${totalInterest.toLocaleString('en-IN')} and Principal ₹${totalPrincipal.toLocaleString('en-IN')}. Shortage of ₹${shortage.toLocaleString('en-IN')} remains outstanding as overdue arrears.`
  } else if (category === 'EXCESS') {
    narration = `Collection of ₹${amtNum.toLocaleString('en-IN')} received. Fully cleared Installment #${firstCover.installment_no} (₹${firstCover.pay.toLocaleString('en-IN')}). Excess buffer of ₹${excessAdvance.toLocaleString('en-IN')} credited into Advance Balance Wallet (Total Advance: ₹${advanceBalanceAfter.toLocaleString('en-IN')}). Next installment net payable is ₹${nextDueAmount.toLocaleString('en-IN')}.`
  } else if (category === 'ADVANCE') {
    const instList = covers.map(c => `#${c.installment_no}`).join(', ')
    narration = `Advance payment of ₹${amtNum.toLocaleString('en-IN')} received, clearing ${covers.length} future installments (${instList}). Total Principal ₹${totalPrincipal.toLocaleString('en-IN')} & Interest ₹${totalInterest.toLocaleString('en-IN')} cleared in advance. Next due date advanced to ${nextDueDate || 'Maturity'}.`
  } else if (category === 'OVERDUE_CLEARANCE') {
    narration = `Arrears catch-up payment of ₹${amtNum.toLocaleString('en-IN')} received. Cleared ${overdueCleared} past overdue installment(s). Principal ₹${totalPrincipal.toLocaleString('en-IN')} and Interest ₹${totalInterest.toLocaleString('en-IN')} allocated. Overdue DPD reduced/cleared.`
  } else {
    narration = `On-time regular EMI payment of ₹${amtNum.toLocaleString('en-IN')} received for Installment #${firstCover?.installment_no || 1}. Principal ₹${totalPrincipal.toLocaleString('en-IN')} and Interest ₹${totalInterest.toLocaleString('en-IN')} cleared in full. Account is active and up to date.`
  }

  return {
    category,
    label,
    principal_component: totalPrincipal,
    interest_component: totalInterest,
    penal_component: totalPenal,
    advance_component: excessAdvance,
    shortage_amount: shortage,
    advance_balance_after: advanceBalanceAfter,
    arrears_balance_after: arrearsBalanceAfter,
    narration,
    covers,
    overdueCleared,
    advanceCount,
    next_due_date: nextDueDate,
    next_due_amount: nextDueAmount,
  }
}

export async function classifyPayment(loan_account_no: string, amount: number, txn_date: string) {
  const res = await classifyAndAllocatePayment(loan_account_no, amount, txn_date)
  return {
    label: res.label,
    covers: res.covers,
    overdueCleared: res.overdueCleared,
    advanceCount: res.advanceCount,
    leftover: res.advance_component,
  }
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

  const alloc = await classifyAndAllocatePayment(loan_account_no, amount, txn_date)
  const lastInstNo = alloc.covers.length ? alloc.covers[alloc.covers.length - 1].installment_no : null

  // Unique transaction ID using timestamp + random to avoid collisions
  const nextTxId = Date.now() + Math.floor(Math.random() * 1000)

  const newTxn: Transaction = {
    txn_id: nextTxId,
    loan_account_no,
    amount: Number(amount),
    txn_date,
    mode,
    reference_no,
    remarks: remarks || alloc.narration,
    installment_no: lastInstNo,
    txn_type: 'PAYMENT',
    classification: alloc.label,
    payment_category: alloc.category,
    principal_component: alloc.principal_component,
    interest_component: alloc.interest_component,
    penal_component: alloc.penal_component,
    advance_component: alloc.advance_component,
    shortage_amount: alloc.shortage_amount,
    advance_balance_after: alloc.advance_balance_after,
    arrears_balance_after: alloc.arrears_balance_after,
    narration: alloc.narration,
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

/** Scans all payment transactions and physically purges duplicates across all loan accounts */
export async function cleanupAllDuplicateTransactions(): Promise<{ cleaned: number; loansAffected: number }> {
  const allTxns = await getAll<Transaction>('transactions')
  const paymentTxns = allTxns
    .filter(t => (t.txn_type === 'PAYMENT' || t.txn_type === 'FORECLOSURE') && !t.voided)
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date) || (a.txn_id || 0) - (b.txn_id || 0))

  const seenKeys = new Set<string>()
  const affectedLoans = new Set<string>()
  let cleanedCount = 0

  for (const t of paymentTxns) {
    const key = t.reference_no && t.reference_no.startsWith('EMIPAY-')
      ? `${t.loan_account_no}_REF_${t.reference_no}`
      : `${t.loan_account_no}_${t.amount}_${t.txn_date}_${t.mode}`

    if (seenKeys.has(key)) {
      await delOne('transactions', t.txn_id)
      affectedLoans.add(t.loan_account_no)
      cleanedCount++
    } else {
      seenKeys.add(key)
    }
  }

  // Recalculate ledgers for all affected loans
  for (const loanNo of Array.from(affectedLoans)) {
    await recalcLoanLedger(loanNo)
  }

  return { cleaned: cleanedCount, loansAffected: affectedLoans.size }
}

/**
 * Broken Period Interest calculation for odd days between disbursement and 1st installment
 */
export function computeBrokenPeriodInterest({
  loan_amount,
  interest_rate,
  disbursement_date,
  installment_start_date,
  frequency = 'Monthly',
}: {
  loan_amount: number
  interest_rate: number
  disbursement_date: string
  installment_start_date: string
  frequency?: string
}) {
  const amount = Number(loan_amount) || 0
  const rate = Number(interest_rate) || 0
  if (!disbursement_date || !installment_start_date || amount <= 0 || rate <= 0) {
    return { actual_days: 0, standard_days: 30, broken_days: 0, broken_interest: 0 }
  }

  const actual_days = Math.max(0, daysBetween(disbursement_date, installment_start_date))
  const standard_days = FREQ_DAYS[frequency] || 30
  const broken_days = Math.max(0, actual_days - standard_days)
  const daily_rate = (rate / 100) / 365
  const broken_interest = Math.round(amount * daily_rate * broken_days)

  return { actual_days, standard_days, broken_days, broken_interest }
}

/**
 * RBI NBFC Prudential ECL (Expected Credit Loss) NPA Provisioning Summary
 */
export interface ECLProvisionSummary {
  stage1_standard: { count: number; totalOutstanding: number; ratePct: number; provisionAmount: number }
  stage2_sma: { count: number; totalOutstanding: number; ratePct: number; provisionAmount: number }
  stage3_substandard: { count: number; totalOutstanding: number; ratePct: number; provisionAmount: number }
  stage3_doubtful: { count: number; totalOutstanding: number; ratePct: number; provisionAmount: number }
  stage3_loss: { count: number; totalOutstanding: number; ratePct: number; provisionAmount: number }
  totalPortfolioOutstanding: number
  totalProvisionRequired: number
  netPortfolioValue: number
  npaGrossRatio: number
  provisionCoverageRatio: number
  branchBreakdown: Record<string, { totalOutstanding: number; provisionAmount: number; count: number; npaCount: number }>
}

export function computeECLProvisioning(portfolio: PortfolioRow[]): ECLProvisionSummary {
  const activeLoans = portfolio.filter(p => !p.status?.toUpperCase().startsWith('CLOS'))

  let s1_out = 0, s1_count = 0
  let s2_out = 0, s2_count = 0
  let s3_sub_out = 0, s3_sub_count = 0
  let s3_dbt_out = 0, s3_dbt_count = 0
  let s3_los_out = 0, s3_los_count = 0

  const branchMap: Record<string, { totalOutstanding: number; provisionAmount: number; count: number; npaCount: number }> = {}

  for (const l of activeLoans) {
    const out = l.outstanding || 0
    const dpd = l.dpd || 0
    const branch = l.branch || 'Head Office'

    if (!branchMap[branch]) {
      branchMap[branch] = { totalOutstanding: 0, provisionAmount: 0, count: 0, npaCount: 0 }
    }
    branchMap[branch].count++
    branchMap[branch].totalOutstanding += out

    let loanProvision = 0
    if (dpd <= 30) {
      // Stage 1: Standard Assets (0.40%)
      s1_out += out
      s1_count++
      loanProvision = out * 0.004
    } else if (dpd <= 89) {
      // Stage 2: SMA-1 & SMA-2 Assets (10.0%)
      s2_out += out
      s2_count++
      loanProvision = out * 0.10
    } else if (dpd <= 179) {
      // Stage 3: Sub-Standard NPA (25.0%)
      s3_sub_out += out
      s3_sub_count++
      branchMap[branch].npaCount++
      loanProvision = out * 0.25
    } else if (dpd <= 365) {
      // Stage 3: Doubtful NPA (50.0%)
      s3_dbt_out += out
      s3_dbt_count++
      branchMap[branch].npaCount++
      loanProvision = out * 0.50
    } else {
      // Stage 3: Loss Assets (100.0%)
      s3_los_out += out
      s3_los_count++
      branchMap[branch].npaCount++
      loanProvision = out * 1.00
    }

    branchMap[branch].provisionAmount += loanProvision
  }

  const s1_prov = Math.round(s1_out * 0.004)
  const s2_prov = Math.round(s2_out * 0.10)
  const s3_sub_prov = Math.round(s3_sub_out * 0.25)
  const s3_dbt_prov = Math.round(s3_dbt_out * 0.50)
  const s3_los_prov = Math.round(s3_los_out * 1.00)

  const totalOutstanding = s1_out + s2_out + s3_sub_out + s3_dbt_out + s3_los_out
  const totalProvision = s1_prov + s2_prov + s3_sub_prov + s3_dbt_prov + s3_los_prov
  const npaOutstanding = s3_sub_out + s3_dbt_out + s3_los_out

  return {
    stage1_standard: { count: s1_count, totalOutstanding: s1_out, ratePct: 0.4, provisionAmount: s1_prov },
    stage2_sma: { count: s2_count, totalOutstanding: s2_out, ratePct: 10.0, provisionAmount: s2_prov },
    stage3_substandard: { count: s3_sub_count, totalOutstanding: s3_sub_out, ratePct: 25.0, provisionAmount: s3_sub_prov },
    stage3_doubtful: { count: s3_dbt_count, totalOutstanding: s3_dbt_out, ratePct: 50.0, provisionAmount: s3_dbt_prov },
    stage3_loss: { count: s3_los_count, totalOutstanding: s3_los_out, ratePct: 100.0, provisionAmount: s3_los_prov },
    totalPortfolioOutstanding: totalOutstanding,
    totalProvisionRequired: totalProvision,
    netPortfolioValue: Math.max(0, totalOutstanding - totalProvision),
    npaGrossRatio: totalOutstanding > 0 ? (npaOutstanding / totalOutstanding) * 100 : 0,
    provisionCoverageRatio: npaOutstanding > 0 ? (totalProvision / npaOutstanding) * 100 : 100,
    branchBreakdown: branchMap,
  }
}

/**
 * One-Time Settlement (OTS) and Loan Waiver processing
 */
export async function processOTSSettlement(
  loan_account_no: string,
  settlement_amount: number,
  interest_waived: number,
  penal_waived: number,
  settlement_date: string,
  remarks: string,
  approved_by: string
): Promise<number> {
  const loan = await getOne<Loan>('loans', loan_account_no)
  if (!loan) throw new Error('Loan account not found')

  const nextTxId = Date.now() + Math.floor(Math.random() * 1000)
  const narration = `One-Time Settlement (OTS) processed for ₹${Number(settlement_amount).toLocaleString('en-IN')}. Interest Waived: ₹${Number(interest_waived).toLocaleString('en-IN')}, Penal Waived: ₹${Number(penal_waived).toLocaleString('en-IN')}. Account closed under OTS approved by ${approved_by}.`

  const newTxn: Transaction = {
    txn_id: nextTxId,
    loan_account_no,
    amount: Number(settlement_amount),
    txn_date: settlement_date,
    mode: 'Settlement / OTS',
    reference_no: 'OTS-' + Date.now(),
    remarks: remarks || narration,
    installment_no: null,
    txn_type: 'PAYMENT',
    classification: 'One-Time Settlement (OTS)',
    payment_category: 'FORECLOSURE',
    principal_component: Number(settlement_amount),
    interest_component: 0,
    penal_component: 0,
    advance_component: 0,
    shortage_amount: 0,
    narration,
    created_at: new Date().toISOString(),
    entered_by: approved_by,
    voided: false,
  }

  await putOne('transactions', newTxn, 'txn_id')

  // Mark loan as closed under OTS
  loan.status = 'CLOSE'
  loan.close_date = settlement_date
  loan.closure_type = 'OTS_SETTLEMENT'
  loan.closure_amount = Number(settlement_amount)
  loan.ledger_balance = 0
  loan.dpd = 0
  loan.dpd_bucket = '0 DPD (Current)'
  loan.npa_flag = false

  await putOne('loans', loan, 'loan_account_no')
  await recalcLoanLedger(loan_account_no)

  return nextTxId
}
