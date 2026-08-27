'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getAll, putOne, putMany } from '@/lib/supabase'
import {
  computeLoanEconomics, generateSchedule, generateUniqueLoanAccountNo,
  checkActiveLoanLimit, addDays
} from '@/lib/calculations'
import type { Customer, Loan, ScheduleRow, Transaction } from '@/lib/types'
import { inr, todayISO, fdate } from '@/lib/utils'
import {
  ArrowLeft, ArrowRight, Save, Search, Check, AlertTriangle,
  UserCheck, ShieldCheck, Landmark, DollarSign, Calendar, Calculator, CheckCircle2
} from 'lucide-react'
import { logAuditEvent } from '@/lib/audit'
import { useAuth } from '@/lib/auth-context'
import { toast } from '@/lib/toast'

const STEPS = [
  { id: 1, label: 'Borrower', desc: 'Pre-check' },
  { id: 2, label: 'Product & Terms', desc: 'Financials' },
  { id: 3, label: 'Schedule', desc: 'Repayments' },
  { id: 4, label: 'Disbursal & FO', desc: 'Assignment' },
  { id: 5, label: 'Review & Sanction', desc: '1-Click Sanction' },
]

export default function NewLoanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500 text-sm">Loading loan wizard…</div>}>
      <NewLoanWizard />
    </Suspense>
  )
}

function NewLoanWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preSelectedCustomerId = searchParams.get('customer_id') || ''
  const { user } = useAuth()

  const [currentStep, setCurrentStep] = useState(1)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Member search in Step 1
  const [sfdcQuery, setSfdcQuery] = useState('')

  // Form State (strictly existing fields)
  const [formData, setFormData] = useState({
    customer_id: preSelectedCustomerId,
    case_id: '',
    product_type: 'Microfinance Personal Loan',
    frequency: 'Weekly',
    loan_amount: '15000',
    interest_rate: '18',
    emi_amount: '820',
    tenure: '25',
    file_charge: '300',
    file_charge_pct: '2',
    insurance_fee: '0',
    repayment_mode: 'Cash Collection',
    disbursal_mode: 'Cash',
    disbursement_date: todayISO(),
    cash_db_date: todayISO(),
    installment_start_date: addDays(todayISO(), 7),
    penalty_per_day: '0',
    broken_interest_collection_mode: 'UPFRONT_DEDUCTION' as 'UPFRONT_DEDUCTION' | 'ADD_TO_FIRST_EMI',
    branch_code: '',
    bm_name: '',
    fo_name: '',
    am_name: '',
    rm_name: '',
    center_no: '',
    cluster_no: '',
  })

  useEffect(() => {
    Promise.all([
      getAll<Customer>('customers'),
      getAll<Loan>('loans'),
    ]).then(([custs, lns]) => {
      setCustomers(custs.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')))
      setLoans(lns)
      setLoading(false)

      if (preSelectedCustomerId) {
        const found = custs.find(c => c.customer_id === preSelectedCustomerId)
        if (found) {
          setFormData(prev => ({
            ...prev,
            customer_id: found.customer_id,
            branch_code: found.branch_code || '',
            bm_name: found.bm_name || '',
            fo_name: found.fo_name || '',
          }))
          setCurrentStep(2)
        }
      }
    })
  }, [preSelectedCustomerId])

  // Selected Borrower details
  const selectedMember = useMemo(() => {
    return customers.find(c => c.customer_id === formData.customer_id) || null
  }, [customers, formData.customer_id])

  // Selected Borrower loan history
  const memberLoanHistory = useMemo(() => {
    if (!formData.customer_id) return { active: [], closed: [], totalOutstanding: 0 }
    const memberLoans = loans.filter(l => l.customer_id === formData.customer_id)
    const active = memberLoans.filter(l => l.status === 'ACTIVE' || l.status === 'SANCTIONED')
    const closed = memberLoans.filter(l => (l.status || '').startsWith('CLOS'))
    const totalOutstanding = active.reduce((s, l) => s + (l.ledger_balance || 0), 0)
    return { active, closed, totalOutstanding }
  }, [loans, formData.customer_id])

  // Auto preset first EMI date when Disbursed Date changes for weekly frequency
  const handleDisbursementDateChange = (newDisbDate: string) => {
    if (formData.frequency === 'Weekly') {
      const nextWeekDate = addDays(newDisbDate, 7)
      setFormData(prev => ({
        ...prev,
        disbursement_date: newDisbDate,
        installment_start_date: nextWeekDate,
      }))
    } else if (formData.frequency === 'Monthly') {
      const nextMonthDate = addDays(newDisbDate, 30)
      setFormData(prev => ({
        ...prev,
        disbursement_date: newDisbDate,
        installment_start_date: nextMonthDate,
      }))
    } else {
      setFormData(prev => ({ ...prev, disbursement_date: newDisbDate }))
    }
  }



  // Loan Financial Economics Preview
  const economics = useMemo(() => {
    const amount = Number(formData.loan_amount) || 0
    const rate = Number(formData.interest_rate) || 0
    const term = Number(formData.tenure) || 1
    const frequency = formData.frequency
    const file_charge = Number(formData.file_charge) || 0
    const insurance_fee = Number(formData.insurance_fee) || 0

    const calc = computeLoanEconomics({
      loan_amount: amount,
      file_charge,
      interest_rate: rate,
      tenure: term,
      frequency,
    })

    const netPayout = Math.max(0, amount - file_charge - insurance_fee)

    return {
      ...calc,
      insurance_fee,
      netPayout,
      totalBrokenInterest: 0,
    }
  }, [formData.loan_amount, formData.interest_rate, formData.tenure, formData.frequency, formData.file_charge, formData.insurance_fee])

  // Live Repayment Schedule Preview Rows
  const schedulePreview = useMemo(() => {
    if (!formData.customer_id || Number(formData.loan_amount) <= 0) return []
    const dummyLoan: Loan = {
      loan_account_no: 'PREVIEW-LN',
      customer_id: formData.customer_id,
      member_name: selectedMember?.full_name || 'Member',
      member_name_cache: selectedMember?.full_name || 'Member',
      loan_amount: Number(formData.loan_amount),
      total_loan: economics.total_loan,
      interest_rate: Number(formData.interest_rate),
      tenure: Number(formData.tenure),
      frequency: formData.frequency as any,
      installment_amount: economics.installment_amount,
      total_interest: economics.total_interest,
      per_installment_interest: economics.per_installment_interest,
      disbursement_date: formData.disbursement_date,
      installment_start_date: formData.installment_start_date,
      status: 'ACTIVE',
      branch_code: formData.branch_code,
      fo_name: formData.fo_name,
      bm_name: formData.bm_name,
      repayment_mode: formData.repayment_mode,
      created_at: todayISO(),
      created_by: 'system',
      updated_at: todayISO(),
      updated_by: 'system',
      ledger_balance: economics.total_loan,
      total_collected: 0,
      net_disbursement: economics.netPayout,
      file_charge: economics.file_charge,
      file_charge_pct: Number(formData.file_charge_pct),
      penalty_per_day: 0,
      npa_flag: false,
      dpd: 0,
      disbursed: true,
      imported: false,
      close_date: null,
      closure_amount: null,
      closure_type: null,
      case_id: formData.case_id,
      district: selectedMember?.district || '',
      state: selectedMember?.state || '',
      product_type: formData.product_type,
    }
    return generateSchedule(dummyLoan)
  }, [formData, economics, selectedMember])

  const PRODUCT_DEFAULTS: Record<string, { frequency: string, loan_amount: string, interest_rate: string, tenure: string, file_charge: string }> = {
    'Microfinance Personal Loan': { frequency: 'Weekly', loan_amount: '15000', interest_rate: '18', tenure: '25', file_charge: '300' },
    'Individual Loan (IL)': { frequency: 'Weekly', loan_amount: '30000', interest_rate: '24', tenure: '50', file_charge: '600' },
    'Joint Liability Group (JLG)': { frequency: 'Weekly', loan_amount: '20000', interest_rate: '24', tenure: '25', file_charge: '400' },
    'Micro Business Loan': { frequency: 'Monthly', loan_amount: '50000', interest_rate: '22', tenure: '12', file_charge: '1000' },
    'Emergency Loan': { frequency: 'Weekly', loan_amount: '10000', interest_rate: '18', tenure: '10', file_charge: '200' },
  }

  const handleSelectMember = (c: Customer) => {
    setFormData(prev => ({
      ...prev,
      customer_id: c.customer_id,
      branch_code: c.branch_code || prev.branch_code,
      bm_name: c.bm_name || prev.bm_name,
      fo_name: c.fo_name || prev.fo_name,
    }))
    setCurrentStep(2)
  }

  // Step Validation
  const validateStep = (step: number): boolean => {
    setError('')
    if (step === 1) {
      if (!formData.customer_id) { setError('Please select a member before continuing.'); return false }
      if (memberLoanHistory.active.length >= 2) {
        setError('RBI MFI Compliance: This borrower already has 2 active loans.');
        return false
      }
    }
    if (step === 2) {
      if (Number(formData.loan_amount) <= 0) { setError('Please enter a valid loan sanction amount.'); return false }
      if (Number(formData.interest_rate) <= 0) { setError('Please enter a valid interest rate.'); return false }
      if (Number(formData.tenure) <= 0) { setError('Please enter a valid tenure/number of installments.'); return false }
    }
    if (step === 3) {
      if (!formData.disbursement_date) { setError('Disbursement date is required.'); return false }
      if (!formData.installment_start_date) { setError('First installment start date is required.'); return false }
    }
    return true
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(5, prev + 1))
    }
  }

  const handlePrev = () => {
    setError('')
    setCurrentStep(prev => Math.max(1, prev - 1))
  }

  // 1-Click Sanction & Disbursal Submit
  const handleSanctionSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return
    if (!selectedMember) { setError('Selected member record is missing.'); return }

    setSubmitting(true)
    setError('')

    try {
      // 1. Generate unique Loan Account No
      const loan_account_no = await generateUniqueLoanAccountNo()
      const pct = Number(formData.loan_amount) ? (Number(formData.file_charge) / Number(formData.loan_amount) * 100) : 0

      const calcCloseDate = addDays(formData.installment_start_date, Math.max(0, Number(formData.tenure) - 1) * 7)
      const monthStr = new Date(formData.disbursement_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      // 2. Build Loan Record
      const newLoan: Loan = {
        loan_account_no,
        customer_id: formData.customer_id,
        member_name_cache: selectedMember.full_name,
        member_name: selectedMember.full_name,
        branch_code: formData.branch_code || selectedMember.branch_code || 'Head Office',
        fo_name: formData.fo_name || selectedMember.fo_name || '',
        bm_name: formData.bm_name || selectedMember.bm_name || '',
        am_name: formData.am_name || selectedMember.am_name || '',
        rm_name: formData.rm_name || selectedMember.rm_name || '',
        center_no: formData.center_no || selectedMember.center_no || '',
        cluster_no: formData.cluster_no || selectedMember.cluster_no || '',
        month: monthStr,
        state: selectedMember.state || 'UTTARAKHAND',
        district: selectedMember.district || '',
        case_id: formData.case_id || '',
        product_type: formData.product_type,
        frequency: formData.frequency as any,
        loan_amount: Number(formData.loan_amount),
        file_charge_pct: Number(pct.toFixed(2)),
        file_charge: economics.file_charge,
        net_disbursement: economics.netPayout,
        interest_rate: Number(formData.interest_rate),
        tenure: Number(formData.tenure),
        installment_amount: economics.installment_amount,
        total_interest: economics.total_interest,
        total_loan: economics.total_loan,
        per_installment_interest: economics.per_installment_interest,
        per_emi_interest: Math.round(economics.total_interest / Number(formData.tenure)),
        disbursement_date: formData.disbursement_date,
        cash_db_date: formData.cash_db_date || formData.disbursement_date,
        installment_start_date: formData.installment_start_date,
        penalty_per_day: Number(formData.penalty_per_day) || 0,
        repayment_mode: formData.repayment_mode,
        status: 'ACTIVE',
        disbursed: true,
        close_date: calcCloseDate,
        closure_amount: null,
        closure_type: null,
        imported: false,
        total_collected: 0,
        ledger_balance: economics.total_loan,
        npa_flag: false,
        dpd: 0,
        created_at: new Date().toISOString(),
        created_by: user?.email || 'system',
        updated_at: new Date().toISOString(),
        updated_by: user?.email || 'system',
      }

      // 3. Generate Repayment Schedule rows
      const scheduleRows = generateSchedule(newLoan)

      // 4. Save Loan and Schedule
      await putOne('loans', newLoan, 'loan_account_no')
      await putMany('schedule', scheduleRows, 'id')

      // 5. Create Disbursement Transaction
      const disbTxn: Transaction = {
        txn_id: Date.now(),
        loan_account_no,
        txn_date: newLoan.disbursement_date,
        txn_type: 'DISBURSEMENT',
        amount: newLoan.loan_amount,
        mode: formData.disbursal_mode || 'Cash',
        reference_no: `DISB-${loan_account_no}`,
        classification: 'Disbursement',
        installment_no: null,
        remarks: `Loan Disbursed — Net Payout: ${inr(economics.netPayout)}`,
        entered_by: user?.email || 'system',
        created_at: new Date().toISOString(),
        voided: false,
      }
      await putOne('transactions', disbTxn, 'txn_id')

      // 6. Record Audit Log
      await logAuditEvent({
        event_type: 'LOAN_SANCTIONED',
        entity_type: 'LOAN',
        entity_id: loan_account_no,
        actor_email: user?.email || 'system',
        actor_name: user?.name || 'Staff',
        actor_role: user?.role || 'staff',
        branch_code: newLoan.branch_code,
        narration: `Loan ${loan_account_no} sanctioned for ${inr(newLoan.loan_amount)} (${newLoan.tenure} ${newLoan.frequency} EMIs of ${inr(newLoan.installment_amount)}) to member ${newLoan.member_name} (${newLoan.customer_id})`,
        new_values: newLoan,
      })

      toast.success('Loan Sanctioned', `Facility ${loan_account_no} sanctioned and disbursed successfully.`)
      window.dispatchEvent(new Event('aa2_data_changed'))
      router.push(`/loans/${loan_account_no}`)
    } catch (err: any) {
      setError(err.message || 'Failed to sanction loan.')
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered members for Step 1
  const matchingMembers = useMemo(() => {
    const q = sfdcQuery.trim().toLowerCase()
    if (!q) return customers.slice(0, 8)
    return customers.filter(c =>
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.customer_id || '').toLowerCase().includes(q) ||
      (c.mobile || '').includes(q) ||
      (c.aadhar_last4 || '').includes(q)
    ).slice(0, 8)
  }, [customers, sfdcQuery])

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link href="/loans" className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Loans
        </Link>
        <span className="text-xs font-mono text-slate-400">AA2 Loan Sanction &amp; Disbursal Wizard</span>
      </div>

      {/* Stepper Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs">
        <div className="grid grid-cols-5 gap-2">
          {STEPS.map((s) => {
            const isCompleted = currentStep > s.id
            const isActive = currentStep === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id < currentStep || validateStep(currentStep)) {
                    setCurrentStep(s.id)
                  }
                }}
                className={`flex flex-col items-center text-center p-2 rounded-xl transition ${
                  isActive ? 'bg-blue-50 border border-blue-200' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1 transition ${
                    isCompleted
                      ? 'bg-emerald-600 text-white'
                      : isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span className={`text-[11px] font-bold block truncate max-w-full ${isActive ? 'text-blue-700' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                  {s.label}
                </span>
                <span className="text-[9.5px] text-slate-400 hidden sm:block">{s.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 tab-transition">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Wizard Form Body with .tab-transition */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs">
        
        {/* STEP 1: Borrower Selection & Credit History */}
        {currentStep === 1 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600" /> Step 1: Borrower Selection &amp; Credit Pre-Check
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Search and select registered member to verify loan eligibility.</p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={sfdcQuery}
                  onChange={e => setSfdcQuery(e.target.value)}
                  placeholder="Search borrower by name, Member ID (MEM-XXXXX), mobile, or Aadhaar…"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {selectedMember && (
                <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800 text-sm">{selectedMember.full_name}</span>
                      <span className="font-mono text-blue-600 font-bold ml-2">({selectedMember.customer_id})</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      Selected Borrower
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-blue-200/60 text-[11px]">
                    <div><span className="text-slate-500 block">Mobile</span><strong>{selectedMember.mobile || '—'}</strong></div>
                    <div><span className="text-slate-500 block">Branch</span><strong>{selectedMember.branch_code || 'Head Office'}</strong></div>
                    <div><span className="text-slate-500 block">Active Loans</span><strong className={memberLoanHistory.active.length > 0 ? 'text-amber-700 font-bold' : 'text-slate-700'}>{memberLoanHistory.active.length} active</strong></div>
                    <div><span className="text-slate-500 block">Existing Outstanding</span><strong className="text-amber-700 font-mono font-bold">{inr(memberLoanHistory.totalOutstanding)}</strong></div>
                  </div>

                  {memberLoanHistory.active.length > 0 && (
                    <div className="bg-amber-50 border border-amber-300 text-amber-900 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>
                          <strong>CONCURRENT ACTIVE LOAN WARNING:</strong> Borrower {selectedMember.full_name} already has {memberLoanHistory.active.length} active loan(s) with an existing outstanding of <strong>{inr(memberLoanHistory.totalOutstanding)}</strong>.
                        </span>
                      </div>
                      <span className="text-[10px] font-bold uppercase bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300 flex-shrink-0">
                        Risk Alert
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Matching Members:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {matchingMembers.map(c => {
                    const isSelected = c.customer_id === formData.customer_id
                    return (
                      <button
                        key={c.customer_id}
                        type="button"
                        onClick={() => handleSelectMember(c)}
                        className={`p-3 rounded-xl border text-left transition flex items-center justify-between text-xs ${
                          isSelected ? 'bg-blue-50 border-blue-500 shadow-xs' : 'bg-slate-50/50 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-slate-800">{c.full_name}</p>
                          <p className="text-[10.5px] text-slate-500 font-mono mt-0.5">{c.customer_id} · {c.mobile || 'No Mobile'}</p>
                        </div>
                        {isSelected ? <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" /> : <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

                {/* STEP 2: Product & Financial Parameters */}
        {currentStep === 2 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" /> Step 2: Loan Product &amp; Financial Parameters
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Configure sanction amount, tenure, flat interest rate, EMI, and deduction charges.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* 1. Loan Product Scheme */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Loan Product Scheme *</label>
                <select
                  value={formData.product_type}
                  onChange={e => {
                    const val = e.target.value
                    if (PRODUCT_DEFAULTS[val]) {
                      const def = PRODUCT_DEFAULTS[val]
                      const amt = Number(def.loan_amount) || 0
                      const term = Number(def.tenure) || 1
                      const rate = Number(def.interest_rate) || 0
                      const freq = def.frequency
                      const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
                      const tenureYears = term / periodsPerYear
                      const totalInterest = amt * (rate / 100) * tenureYears
                      const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0
                      const pct = amt > 0 ? ((Number(def.file_charge) / amt) * 100).toFixed(2) : '2.00'

                      setFormData(prev => ({
                        ...prev,
                        product_type: val,
                        frequency: def.frequency,
                        loan_amount: def.loan_amount,
                        interest_rate: def.interest_rate,
                        emi_amount: String(emi),
                        tenure: def.tenure,
                        file_charge: def.file_charge,
                        file_charge_pct: pct,
                      }))
                    } else {
                      setFormData(prev => ({ ...prev, product_type: val }))
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Microfinance Personal Loan">Microfinance Personal Loan</option>
                  <option value="Individual Loan (IL)">Individual Loan (IL)</option>
                  <option value="Joint Liability Group (JLG)">Joint Liability Group (JLG)</option>
                  <option value="Micro Business Loan">Micro Business Loan</option>
                  <option value="Emergency Loan">Emergency Loan</option>
                </select>
              </div>

              {/* 2. Repayment Frequency */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Repayment Frequency *</label>
                <select
                  value={formData.frequency}
                  onChange={e => {
                    const freq = e.target.value
                    const amt = Number(formData.loan_amount) || 0
                    const term = Number(formData.tenure) || 1
                    const rate = Number(formData.interest_rate) || 0
                    const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
                    const tenureYears = term / periodsPerYear
                    const totalInterest = amt * (rate / 100) * tenureYears
                    const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0

                    setFormData(prev => ({ ...prev, frequency: freq, emi_amount: String(emi) }))
                    handleDisbursementDateChange(formData.disbursement_date)
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Weekly">Weekly (52 periods/yr)</option>
                  <option value="Bi-Monthly">Bi-Monthly (24 periods/yr)</option>
                  <option value="Monthly">Monthly (12 periods/yr)</option>
                  <option value="Quarterly">Quarterly (4 periods/yr)</option>
                </select>
              </div>

              {/* 3. Tenure (Number of Installments) */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tenure (Number of Installments) *</label>
                <input
                  type="number"
                  value={formData.tenure}
                  onChange={e => {
                    const term = Number(e.target.value) || 0
                    const amt = Number(formData.loan_amount) || 0
                    const rate = Number(formData.interest_rate) || 0
                    const freq = formData.frequency
                    const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
                    const tenureYears = term > 0 ? term / periodsPerYear : 0
                    const totalInterest = amt * (rate / 100) * tenureYears
                    const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0

                    setFormData(prev => ({ ...prev, tenure: e.target.value, emi_amount: String(emi) }))
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 4. Sanction Loan Amount */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Sanction Loan Amount (₹) *</label>
                <input
                  type="number"
                  value={formData.loan_amount}
                  onChange={e => {
                    const amt = Number(e.target.value) || 0
                    const term = Number(formData.tenure) || 1
                    const rate = Number(formData.interest_rate) || 0
                    const freq = formData.frequency
                    const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
                    const tenureYears = term > 0 ? term / periodsPerYear : 0
                    const totalInterest = amt * (rate / 100) * tenureYears
                    const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0

                    // Also recalculate file charge based on current percentage
                    const pct = Number(formData.file_charge_pct) || 0
                    const fileFee = Math.round((amt * pct) / 100)

                    setFormData(prev => ({
                      ...prev,
                      loan_amount: e.target.value,
                      emi_amount: String(emi),
                      file_charge: String(fileFee),
                    }))
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 5. Annual Interest Rate (% p.a. flat) <-> Installment Amount (Two-Way Auto-Calculated) */}
              <div className="bg-blue-50/40 border border-blue-200/80 rounded-2xl p-3.5 space-y-2">
                <label className="font-bold text-blue-900 block text-[11px] uppercase tracking-wider">
                  Annual Interest Rate (% p.a. flat)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.interest_rate}
                  onChange={e => {
                    const rate = Number(e.target.value) || 0
                    const amt = Number(formData.loan_amount) || 0
                    const term = Number(formData.tenure) || 1
                    const freq = formData.frequency
                    const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
                    const tenureYears = term / periodsPerYear
                    const totalInterest = amt * (rate / 100) * tenureYears
                    const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0

                    setFormData(prev => ({
                      ...prev,
                      interest_rate: e.target.value,
                      emi_amount: String(emi),
                    }))
                  }}
                  className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-blue-600 font-medium block">
                  Entering Rate auto-calculates Instalment EMI
                </span>
              </div>

              <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-2xl p-3.5 space-y-2">
                <label className="font-bold text-emerald-900 block text-[11px] uppercase tracking-wider">
                  Instalment / EMI Amount (₹)
                </label>
                <input
                  type="number"
                  value={formData.emi_amount}
                  onChange={e => {
                    const emi = Number(e.target.value) || 0
                    const amt = Number(formData.loan_amount) || 0
                    const term = Number(formData.tenure) || 1
                    const freq = formData.frequency
                    const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
                    const tenureYears = term / periodsPerYear
                    const totalRepayable = emi * term
                    const totalInterest = totalRepayable - amt
                    const flatRate = (amt > 0 && tenureYears > 0 && totalInterest >= 0)
                      ? ((totalInterest / (amt * tenureYears)) * 100).toFixed(2)
                      : '0.00'

                    setFormData(prev => ({
                      ...prev,
                      emi_amount: e.target.value,
                      interest_rate: flatRate,
                    }))
                  }}
                  className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl font-mono text-sm font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-emerald-700 font-medium block">
                  Entering EMI auto-calculates Interest Rate (% p.a.)
                </span>
              </div>

              {/* 6. Processing / File Fee (%) <-> Processing / File Fee (₹) (Two-Way Auto-Calculated) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                <label className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                  Processing Fee (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.file_charge_pct}
                  onChange={e => {
                    const pct = Number(e.target.value) || 0
                    const amt = Number(formData.loan_amount) || 0
                    const fee = Math.round((amt * pct) / 100)

                    setFormData(prev => ({
                      ...prev,
                      file_charge_pct: e.target.value,
                      file_charge: String(fee),
                    }))
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-500 font-medium block">
                  Entering Fee % auto-calculates Fee Amount (₹)
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                <label className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                  Processing Fee (₹)
                </label>
                <input
                  type="number"
                  value={formData.file_charge}
                  onChange={e => {
                    const fee = Number(e.target.value) || 0
                    const amt = Number(formData.loan_amount) || 0
                    const pct = amt > 0 ? ((fee / amt) * 100).toFixed(2) : '0.00'

                    setFormData(prev => ({
                      ...prev,
                      file_charge: e.target.value,
                      file_charge_pct: pct,
                    }))
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-500 font-medium block">
                  Entering Fee Amount auto-calculates Fee %
                </span>
              </div>
            </div>

            {/* Live Financial Economics Card */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
              <h4 className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Computed Financial Terms</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><span className="text-slate-400 text-[10.5px] block">EMI per Installment</span><strong className="text-emerald-700 text-sm font-mono">{inr(economics.installment_amount)}</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">Total Interest</span><strong className="font-mono">{inr(economics.total_interest)}</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">Total Repayable</span><strong className="font-mono">{inr(economics.total_loan)}</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">Net Disbursal Payout</span><strong className="text-blue-700 text-sm font-mono">{inr(economics.netPayout)}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Repayment Schedule & Date Calculation */}
        {currentStep === 3 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" /> Step 3: Repayment Schedule &amp; Frequency Calculation
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Company weekly rule: 1st installment starts next week on the same day as disbursement.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Disbursement Date *</label>
                <input
                  type="date"
                  value={formData.disbursement_date}
                  onChange={e => handleDisbursementDateChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">First Installment Start Date *</label>
                <input
                  type="date"
                  value={formData.installment_start_date}
                  onChange={e => setFormData(prev => ({ ...prev, installment_start_date: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>



            {/* Interactive Schedule Preview Table */}
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Amortization Schedule Preview ({schedulePreview.length} installments):
              </span>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Due Date</th>
                      <th className="px-3 py-2 text-right">Principal</th>
                      <th className="px-3 py-2 text-right">Interest</th>
                      <th className="px-3 py-2 text-right">EMI Due</th>
                      <th className="px-3 py-2 text-right">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {schedulePreview.map((s) => (
                      <tr key={s.installment_no} className="hover:bg-slate-50/50">
                        <td className="px-3 py-1.5 font-bold text-slate-600">{s.installment_no}</td>
                        <td className="px-3 py-1.5 font-mono">{fdate(s.due_date)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-600">{inr(s.principal_due)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-600">{inr(s.interest_due)}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-600">{inr(s.emi_due)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700">{inr(s.closing_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Bank Disbursal & Assignment */}
        {currentStep === 4 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Landmark className="w-4 h-4 text-blue-600" /> Step 4: Disbursal Channel &amp; Operating Assignment
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Specify payment disbursement method and branch officer assignment.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Disbursal Channel / Mode *</label>
                <select
                  value={formData.disbursal_mode}
                  onChange={e => setFormData(prev => ({ ...prev, disbursal_mode: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Cash">Cash Handover</option>
                  <option value="Bank Transfer / NEFT">Bank Transfer / NEFT / IMPS</option>
                  <option value="UPI">UPI Direct Payout</option>
                  <option value="Cheque">Account Payee Cheque</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Repayment Collection Mode</label>
                <input
                  type="text"
                  value={formData.repayment_mode}
                  onChange={e => setFormData(prev => ({ ...prev, repayment_mode: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Cash DB Date (Disbursement Date)</label>
                <input
                  type="date"
                  value={formData.cash_db_date}
                  onChange={e => setFormData(prev => ({ ...prev, cash_db_date: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Branch Name</label>
                <input
                  type="text"
                  value={formData.branch_code}
                  onChange={e => setFormData(prev => ({ ...prev, branch_code: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Field Officer Name (FO)</label>
                <input
                  type="text"
                  value={formData.fo_name}
                  onChange={e => setFormData(prev => ({ ...prev, fo_name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Branch Manager (BM)</label>
                <input
                  type="text"
                  value={formData.bm_name}
                  onChange={e => setFormData(prev => ({ ...prev, bm_name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Area Manager (AM)</label>
                <input
                  type="text"
                  value={formData.am_name}
                  onChange={e => setFormData(prev => ({ ...prev, am_name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Regional Manager (RM)</label>
                <input
                  type="text"
                  value={formData.rm_name}
                  onChange={e => setFormData(prev => ({ ...prev, rm_name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Center Number</label>
                <input
                  type="text"
                  value={formData.center_no}
                  onChange={e => setFormData(prev => ({ ...prev, center_no: e.target.value }))}
                  placeholder="e.g. Center 12"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Cluster Number</label>
                <input
                  type="text"
                  value={formData.cluster_no}
                  onChange={e => setFormData(prev => ({ ...prev, cluster_no: e.target.value }))}
                  placeholder="e.g. Cluster 04"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Final Review & 1-Click Sanction */}
        {currentStep === 5 && (
          <div className="space-y-5 tab-transition">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Step 5: Loan Summary &amp; 1-Click Sanction
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Verify all sanction parameters before executing disbursement.</p>
            </div>

            <div className="border border-slate-200 bg-slate-50/70 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Sanctioning Borrower</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedMember?.full_name} ({formData.customer_id})</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Product</span>
                  <span className="font-semibold text-slate-700">{formData.product_type}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200 text-xs">
                <div><span className="text-slate-400 text-[10.5px] block">Sanction Amount</span><strong className="font-mono text-slate-800">{inr(Number(formData.loan_amount))}</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">Processing Fee</span><strong className="font-mono text-slate-800">{inr(economics.file_charge)}</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">Net Disbursed Payout</span><strong className="font-mono text-blue-700 text-sm">{inr(economics.netPayout)}</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">EMI per Installment</span><strong className="font-mono text-emerald-700 text-sm">{inr(economics.installment_amount)}</strong></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 text-xs">
                <div><span className="text-slate-400 text-[10.5px] block">Disbursement Date</span><strong>{fdate(formData.disbursement_date)}</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">1st EMI Date</span><strong>{fdate(formData.installment_start_date)}</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">Tenure</span><strong>{formData.tenure} {formData.frequency} EMIs</strong></div>
                <div><span className="text-slate-400 text-[10.5px] block">Branch &amp; FO</span><strong>{formData.branch_code || 'HO'} / {formData.fo_name || '—'}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Navigation Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-slate-100 mt-6">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold rounded-xl text-xs transition"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition shadow-sm"
              >
                Next Step <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSanctionSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-md"
              >
                <Save className="w-4 h-4" />
                {submitting ? 'Sanctioning & Disbursing…' : 'Confirm & Sanction Loan'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
