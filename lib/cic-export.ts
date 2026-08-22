import type { Customer, Loan, ScheduleRow, Transaction } from './types'
import { dpdBucket, fdate, todayISO } from './utils'

export interface CICBureauRecord {
  member_id: string
  member_name: string
  father_husband_name: string
  dob: string
  gender: string
  mobile: string
  aadhar_last4: string
  pan_no: string
  address: string
  city: string
  district: string
  state: string
  pincode: string
  branch_code: string
  loan_account_no: string
  sanction_date: string
  disbursement_date: string
  sanction_amount: number
  total_loan_amount: number
  installment_amount: number
  tenure: number
  frequency: string
  current_outstanding: number
  overdue_amount: number
  dpd: number
  asset_classification: 'STD' | 'SMA' | 'SUB' | 'DBT' | 'LSS'
  account_status: 'ACTIVE' | 'CLOSED' | 'SETTLED'
  close_date: string | null
  last_payment_date: string | null
  last_payment_amount: number
}

export function generateCICBureauData(
  loans: Loan[],
  customers: Customer[],
  schedule: ScheduleRow[],
  transactions: Transaction[]
): CICBureauRecord[] {
  const customerMap = new Map<string, Customer>()
  customers.forEach(c => customerMap.set(c.customer_id, c))

  const records: CICBureauRecord[] = []

  for (const l of loans) {
    const cust = customerMap.get(l.customer_id)
    const isClosed = (l.status || '').toUpperCase().startsWith('CLOS')
    const dpd = l.dpd || 0
    const out = isClosed ? 0 : (l.ledger_balance || 0)
    const overdueAmt = isClosed ? 0 : (l.arrears_balance || 0)

    // Asset classification according to RBI norms:
    // STD: 0-30 DPD, SMA: 31-89 DPD, SUB: 90-179 DPD, DBT: 180-365 DPD, LSS: >365 DPD
    let asset_classification: 'STD' | 'SMA' | 'SUB' | 'DBT' | 'LSS' = 'STD'
    if (dpd > 365) asset_classification = 'LSS'
    else if (dpd >= 180) asset_classification = 'DBT'
    else if (dpd >= 90) asset_classification = 'SUB'
    else if (dpd >= 31) asset_classification = 'SMA'
    else asset_classification = 'STD'

    let account_status: 'ACTIVE' | 'CLOSED' | 'SETTLED' = 'ACTIVE'
    if (l.closure_type === 'OTS_SETTLEMENT') account_status = 'SETTLED'
    else if (isClosed) account_status = 'CLOSED'

    // Get last payment
    const loanTxns = transactions
      .filter(t => t.loan_account_no === l.loan_account_no && !t.voided && t.txn_type === 'PAYMENT')
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date) || b.txn_id - a.txn_id)

    const lastTxn = loanTxns[0]

    records.push({
      member_id: l.customer_id,
      member_name: cust?.full_name || l.member_name_cache || l.member_name || '',
      father_husband_name: cust?.father_husband_name || '',
      dob: cust?.dob || '',
      gender: cust?.gender || 'Female',
      mobile: cust?.mobile || l.mobile || '',
      aadhar_last4: cust?.aadhar_last4 || l.aadhar_last4 || '',
      pan_no: cust?.pan_no || l.pan_no || '',
      address: cust?.address_current || '',
      city: cust?.village_city || '',
      district: cust?.district || l.district || '',
      state: cust?.state || l.state || '',
      pincode: cust?.pincode || l.pincode || '',
      branch_code: l.branch_code,
      loan_account_no: l.loan_account_no,
      sanction_date: l.disbursement_date,
      disbursement_date: l.disbursement_date,
      sanction_amount: l.loan_amount,
      total_loan_amount: l.total_loan,
      installment_amount: l.installment_amount,
      tenure: l.tenure,
      frequency: l.frequency,
      current_outstanding: out,
      overdue_amount: overdueAmt,
      dpd: isClosed ? 0 : dpd,
      asset_classification: isClosed ? 'STD' : asset_classification,
      account_status,
      close_date: l.close_date || null,
      last_payment_date: lastTxn ? lastTxn.txn_date : null,
      last_payment_amount: lastTxn ? lastTxn.amount : 0,
    })
  }

  return records
}

export function downloadCICBureauCSV(records: CICBureauRecord[], reportDate = todayISO()) {
  const headers = [
    'Member ID',
    'Member Name',
    'Father/Husband Name',
    'DOB',
    'Gender',
    'Mobile',
    'Aadhaar Last 4',
    'PAN No',
    'Address',
    'City/Village',
    'District',
    'State',
    'Pincode',
    'Branch Code',
    'Loan Account No',
    'Disbursement Date',
    'Sanction Amount (INR)',
    'Total Loan (INR)',
    'EMI Amount (INR)',
    'Tenure',
    'Frequency',
    'Current Outstanding (INR)',
    'Overdue Amount (INR)',
    'DPD',
    'Asset Classification',
    'Account Status',
    'Closure Date',
    'Last Payment Date',
    'Last Payment Amount (INR)',
  ]

  const csvRows = [headers.join(',')]

  for (const r of records) {
    const row = [
      `"${r.member_id}"`,
      `"${r.member_name.replace(/"/g, '""')}"`,
      `"${r.father_husband_name.replace(/"/g, '""')}"`,
      `"${r.dob}"`,
      `"${r.gender}"`,
      `"${r.mobile}"`,
      `"${r.aadhar_last4}"`,
      `"${r.pan_no}"`,
      `"${r.address.replace(/"/g, '""')}"`,
      `"${r.city.replace(/"/g, '""')}"`,
      `"${r.district.replace(/"/g, '""')}"`,
      `"${r.state.replace(/"/g, '""')}"`,
      `"${r.pincode}"`,
      `"${r.branch_code}"`,
      `"${r.loan_account_no}"`,
      `"${r.disbursement_date}"`,
      r.sanction_amount,
      r.total_loan_amount,
      r.installment_amount,
      r.tenure,
      `"${r.frequency}"`,
      r.current_outstanding,
      r.overdue_amount,
      r.dpd,
      `"${r.asset_classification}"`,
      `"${r.account_status}"`,
      `"${r.close_date || ''}"`,
      `"${r.last_payment_date || ''}"`,
      r.last_payment_amount,
    ]
    csvRows.push(row.join(','))
  }

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AA2_CIC_CRIF_CIBIL_Bureau_Report_${reportDate}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
