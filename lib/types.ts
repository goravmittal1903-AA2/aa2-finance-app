// TypeScript types for AA2 Finance MFI System

export interface Customer {
  customer_id: string
  full_name: string
  mobile: string
  father_husband_name: string
  aadhar_last4: string
  pan_no?: string
  dob: string
  gender: string
  address_current: string
  village_city: string
  pincode?: string
  district: string
  state: string
  branch_code: string
  bm_name: string
  fo_name: string
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
}

export interface Loan {
  loan_account_no: string
  customer_id: string
  member_name: string
  member_name_cache: string
  status: 'ACTIVE' | 'CLOSE' | 'CLOSED' | 'SANCTIONED'
  loan_amount: number
  total_loan: number
  net_disbursement: number
  total_interest: number
  total_collected: number
  ledger_balance: number
  file_charge: number
  file_charge_pct: number
  interest_rate: number
  installment_amount: number
  per_installment_interest: number
  tenure: number
  frequency: 'Weekly' | 'Monthly' | 'Bi-Monthly' | 'Quarterly'
  product_type: string
  repayment_mode: string
  disbursement_date: string
  installment_start_date: string
  close_date: string | null
  closure_type: string | null
  closure_amount: number | null
  case_id: string
  branch_code: string
  fo_name: string
  bm_name: string
  district: string
  state: string
  penalty_per_day: number
  npa_flag: boolean
  dpd: number
  disbursed: boolean
  imported: boolean
  interest_received?: number
  advance_balance?: number
  arrears_balance?: number
  dpd_bucket?: string
  mobile?: string
  aadhar_last4?: string
  pan_no?: string
  pincode?: string
  broken_interest?: number
  broken_interest_collection_mode?: 'UPFRONT_DEDUCTION' | 'ADD_TO_FIRST_EMI'
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
}

export interface ScheduleRow {
  id: string
  loan_account_no: string
  installment_no: number
  due_date: string
  opening_balance: number
  principal_due: number
  interest_due: number
  emi_due: number
  closing_balance: number
  paid_amount: number
  paid_date: string | null
  status: 'Pending' | 'Paid' | 'Partial' | 'Overdue' | 'Waived' | 'Restructured'
  dpd: number
}

export type PaymentCategory =
  | 'REGULAR'
  | 'SHORT'
  | 'EXCESS'
  | 'ADVANCE'
  | 'OVERDUE_CLEARANCE'
  | 'PART_PREPAYMENT'
  | 'FORECLOSURE'
  | 'ZERO_MISSED'
  | 'REVERSAL'

export interface Transaction {
  txn_id: number
  loan_account_no: string
  txn_date: string
  txn_type: 'PAYMENT' | 'FORECLOSURE' | 'DISBURSEMENT'
  amount: number
  mode: string
  reference_no: string
  classification: string
  installment_no: number | null
  remarks: string
  entered_by: string
  created_at: string
  voided: boolean
  payment_category?: PaymentCategory
  principal_component?: number
  interest_component?: number
  penal_component?: number
  advance_component?: number
  shortage_amount?: number
  advance_balance_after?: number
  arrears_balance_after?: number
  narration?: string
}

export interface AppUser {
  user_id: string
  email: string
  password: string
  name: string
  role: string
  branch: string
  active: boolean
  created_at: string
}

export interface Grievance {
  ticket_id: string
  customer_id: string
  member_name: string
  loan_account_no: string
  category: string
  severity: string
  description: string
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed'
  resolution_notes: string
  resolved_date: string | null
  resolved_by: string | null
  created_at: string
  created_by: string
}

export interface PortfolioRow {
  loan_account_no: string
  customer_id: string
  member_name: string
  branch: string
  fo: string
  loan_amount: number
  net_disbursement: number
  total_interest: number
  total_collected: number
  outstanding: number
  interest_received: number
  status: string
  dpd: number
  dpd_bucket: string
  npa_flag: number
  par_flag: number
  disb_date: string
  frequency: string
  mobile?: string
}

export type UserRole = 'employee' | 'admin' | 'it'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
  branch: string
}

export interface Product {
  product_id: string
  name: string
  description: string
  min_loan: number
  max_loan: number
  interest_rate: number
  file_charge_pct: number
  min_tenure: number
  max_tenure: number
  frequency: string
  repayment_mode: string
  active: boolean
  created_at: string
  updated_at: string
}
