'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAll, putOne, putMany } from '@/lib/supabase'
import { computeLoanEconomics, generateSchedule, generateUniqueLoanAccountNo, checkActiveLoanLimit } from '@/lib/calculations'
import type { Customer, Loan } from '@/lib/types'
import { inr, todayISO } from '@/lib/utils'
import { ArrowLeft, Calculator, Save, Search, CheckCircle2, UserCheck, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export default function NewLoanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500 text-sm">Loading form…</div>}>
      <NewLoanForm />
    </Suspense>
  )
}

function NewLoanForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preSelectedCustomerId = searchParams.get('customer_id') || ''
  const { user } = useAuth()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Quick Member Lookup state
  const [sfdcQuery, setSfdcQuery] = useState('')
  const [sfdcResults, setSfdcResults] = useState<Customer[]>([])
  const [sfdcSearched, setSfdcSearched] = useState(false)

  const handleSfdcSearch = (q: string) => {
    setSfdcQuery(q)
    const trimmed = q.trim().toLowerCase()
    if (!trimmed) {
      setSfdcResults([])
      setSfdcSearched(false)
      return
    }
    setSfdcSearched(true)
    const matches = customers.filter(c => {
      const nameMatch = (c.full_name || '').toLowerCase().includes(trimmed)
      const mobileMatch = (c.mobile || '').includes(trimmed)
      const panMatch = (c.pan_no || '').toLowerCase().includes(trimmed)
      const aadharMatch = (c.aadhar_last4 || '').includes(trimmed)
      const idMatch = (c.customer_id || '').toLowerCase().includes(trimmed)
      return nameMatch || mobileMatch || panMatch || aadharMatch || idMatch
    })
    setSfdcResults(matches)
  }

  // Form State
  const [formData, setFormData] = useState({
    customer_id: preSelectedCustomerId,
    case_id: '',
    product_type: 'Individual Loan (IL)',
    frequency: 'Monthly',
    loan_amount: '30000',
    interest_rate: '24',
    emi_amount: '3100',
    tenure: '12',
    file_charge: '600',
    file_charge_pct: '2',
    repayment_mode: 'Cash Collection',
    disbursement_date: todayISO(),
    installment_start_date: todayISO(),
    penalty_per_day: '0',
  })

  // Economics Preview State
  const [preview, setPreview] = useState<any>(null)

  useEffect(() => {
    getAll<Customer>('customers').then(data => {
      setCustomers(data.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')))
      setLoading(false)
    })
  }, [])

  // Auto economics calculation on form state change
  useEffect(() => {
    const amount = Number(formData.loan_amount) || 0
    const rate = Number(formData.interest_rate) || 0
    const term = Number(formData.tenure) || 1
    const frequency = formData.frequency

    if (amount > 0 && term > 0) {
      const calc = computeLoanEconomics({
        loan_amount: amount,
        file_charge: Number(formData.file_charge),
        interest_rate: rate,
        tenure: term,
        frequency,
      })
      setPreview(calc)
    }
  }, [formData.loan_amount, formData.interest_rate, formData.tenure, formData.frequency, formData.file_charge])

  const PRODUCT_DEFAULTS: Record<string, { frequency: string, loan_amount: string, interest_rate: string, tenure: string, file_charge: string }> = {
    'Individual Loan (IL)': { frequency: 'Monthly', loan_amount: '30000', interest_rate: '24', tenure: '12', file_charge: '600' },
    'Joint Liability Group (JLG)': { frequency: 'Weekly', loan_amount: '15000', interest_rate: '76.2', tenure: '25', file_charge: '999' },
    'Business Loan': { frequency: 'Monthly', loan_amount: '50000', interest_rate: '22', tenure: '24', file_charge: '1500' },
    'Emergency Loan': { frequency: 'Weekly', loan_amount: '5000', interest_rate: '18', tenure: '10', file_charge: '150' },
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (name === 'product_type' && PRODUCT_DEFAULTS[value]) {
      const defaults = PRODUCT_DEFAULTS[value]
      const pct = Number(defaults.loan_amount) ? ((Number(defaults.file_charge) / Number(defaults.loan_amount)) * 100).toFixed(2) : '0'
      setFormData(prev => ({
        ...prev,
        product_type: value,
        frequency: defaults.frequency,
        loan_amount: defaults.loan_amount,
        interest_rate: defaults.interest_rate,
        tenure: defaults.tenure,
        file_charge: defaults.file_charge,
        file_charge_pct: pct,
      }))
    } else if (name === 'interest_rate') {
      // When Interest Rate changes → auto-calc EMI
      const rate = Number(value) || 0
      const amount = Number(formData.loan_amount) || 0
      const term = Number(formData.tenure) || 1
      const freq = formData.frequency
      const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
      const tenureYears = term / periodsPerYear
      const totalInterest = amount * (rate / 100) * tenureYears
      const emi = term > 0 ? Math.round((amount + totalInterest) / term) : 0
      setFormData(prev => ({ ...prev, interest_rate: value, emi_amount: emi.toString() }))
    } else if (name === 'emi_amount') {
      // When EMI Amount changes → auto-calc Interest Rate (% p.a. flat)
      const emi = Number(value) || 0
      const amount = Number(formData.loan_amount) || 0
      const term = Number(formData.tenure) || 1
      const freq = formData.frequency
      const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
      const tenureYears = term / periodsPerYear
      const totalRepayable = emi * term
      const totalInterest = totalRepayable - amount
      // Never allow negative rate: if EMI is less than principal recovery per term, rate is 0.00%
      const flatRate = (amount > 0 && tenureYears > 0 && totalInterest >= 0)
        ? ((totalInterest / (amount * tenureYears)) * 100).toFixed(2)
        : '0.00'
      setFormData(prev => ({ ...prev, emi_amount: value, interest_rate: flatRate }))
    } else if (name === 'file_charge') {
      // When ₹ amount changes → auto-calc %
      const loanAmt = Number(formData.loan_amount) || 0
      const pct = loanAmt > 0 ? ((Number(value) / loanAmt) * 100).toFixed(2) : '0'
      setFormData(prev => ({ ...prev, file_charge: value, file_charge_pct: pct }))
    } else if (name === 'file_charge_pct') {
      // When % changes → auto-calc ₹
      const loanAmt = Number(formData.loan_amount) || 0
      const charge = loanAmt > 0 ? Math.round((Number(value) / 100) * loanAmt).toString() : '0'
      setFormData(prev => ({ ...prev, file_charge_pct: value, file_charge: charge }))
    } else if (name === 'loan_amount') {
      // Recompute file_charge from pct when loan amount changes
      const loanAmt = Number(value) || 0
      const charge = loanAmt > 0 ? Math.round((Number(formData.file_charge_pct) / 100) * loanAmt).toString() : formData.file_charge
      const rate = Number(formData.interest_rate) || 0
      const term = Number(formData.tenure) || 1
      const freq = formData.frequency
      const periodsPerYear = freq === 'Weekly' ? 52 : freq === 'Bi-Monthly' ? 24 : freq === 'Quarterly' ? 4 : 12
      const tenureYears = term / periodsPerYear
      const totalInterest = loanAmt * (rate / 100) * tenureYears
      const emi = term > 0 ? Math.round((loanAmt + totalInterest) / term) : 0
      setFormData(prev => ({ ...prev, loan_amount: value, file_charge: charge, emi_amount: emi.toString() }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleFrequencyChange = (freq: string) => {
    let tenure = '25'
    let amount = '15000'
    let rate = '76.2'
    let fileCharge = '999'

    if (freq === 'Monthly') {
      tenure = '12'
      rate = '24'
      fileCharge = '500'
    } else if (freq === 'Weekly') {
      tenure = '25'
      rate = '76.2'
      fileCharge = '999'
    }
    const loanAmt = Number(formData.loan_amount) || 0
    const pct = loanAmt > 0 ? ((Number(fileCharge) / loanAmt) * 100).toFixed(2) : '0'

    setFormData(prev => ({
      ...prev,
      frequency: freq,
      tenure,
      interest_rate: rate,
      file_charge: fileCharge,
      file_charge_pct: pct,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.customer_id) {
      setError('Please select a member.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // RBI Compliance Check: Max 2 active loans per member
      const activeCheck = await checkActiveLoanLimit(formData.customer_id)
      if (!activeCheck.allowed) {
        throw new Error(`RBI MFI Compliance Error: This member already has ${activeCheck.activeCount} active loans (Limit is max 2 active loans). Cannot sanction additional loan.`)
      }

      const customer = customers.find(c => c.customer_id === formData.customer_id)
      if (!customer) throw new Error('Member not found.')

      const loan_account_no = await generateUniqueLoanAccountNo()
      const pct = Number(formData.loan_amount) ? (Number(formData.file_charge) / Number(formData.loan_amount) * 100) : 0

      const loan: Loan = {
        loan_account_no,
        customer_id: formData.customer_id,
        member_name_cache: customer.full_name,
        member_name: customer.full_name,
        branch_code: customer.branch_code || '',
        fo_name: customer.fo_name || '',
        bm_name: customer.bm_name || '',
        state: customer.state || '',
        district: customer.district || '',
        case_id: formData.case_id,
        product_type: formData.product_type,
        frequency: formData.frequency as any,
        loan_amount: Number(formData.loan_amount),
        file_charge_pct: Number(pct.toFixed(4)),
        file_charge: preview.file_charge,
        net_disbursement: preview.net_disbursement,
        interest_rate: Number(formData.interest_rate),
        tenure: Number(formData.tenure),
        installment_amount: preview.installment_amount,
        total_interest: preview.total_interest,
        total_loan: preview.total_loan,
        per_installment_interest: preview.per_installment_interest,
        disbursement_date: formData.disbursement_date,
        installment_start_date: formData.installment_start_date,
        penalty_per_day: Number(formData.penalty_per_day) || 0,
        repayment_mode: formData.repayment_mode,
        status: 'ACTIVE',
        disbursed: true,
        close_date: null,
        closure_amount: null,
        closure_type: null,
        imported: false,
        total_collected: 0,
        ledger_balance: preview.total_loan,
        npa_flag: false,
        dpd: 0,
        created_at: new Date().toISOString(),
        created_by: user?.email || 'system',
        updated_at: new Date().toISOString(),
        updated_by: user?.email || 'system',
      }

      // Generate the schedule rows
      const schedule = generateSchedule(loan)

      // Save loan — single request
      await putOne('loans', loan, 'loan_account_no')
      
      // Save schedule in ONE bulk request (much faster)
      await putMany('schedule', schedule, 'id')

      router.push(`/loans/${loan_account_no}`)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to sanction loan.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading members list…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">New Loan Sanction</h1>
          <p className="text-slate-500 text-sm mt-0.5">Sanction a new loan account and auto-generate its repayment schedule.</p>
        </div>
      </div>

      {/* Quick Member Lookup Box */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 rounded-2xl p-5 text-white shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Search className="w-4 h-4 text-blue-400" />
            <span>Quick Member Lookup (PAN / Aadhaar / Mobile / Member ID)</span>
          </div>
          <span className="text-[10px] bg-blue-500/20 text-blue-300 font-semibold px-2 py-0.5 rounded">Smart Search</span>
        </div>
        <p className="text-xs text-slate-300">Search existing registered members before sanctioning a loan.</p>

        <div className="relative">
          <input
            type="text"
            value={sfdcQuery}
            onChange={e => handleSfdcSearch(e.target.value)}
            placeholder="Type Mobile (10 digits), Aadhaar (4/12 digits), PAN (e.g. ABCDE1234F), or Name…"
            className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {sfdcSearched && (
          <div className="mt-3 bg-slate-800/95 border border-slate-700/80 rounded-xl p-3 space-y-2">
            {sfdcResults.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Registered Member Found ({sfdcResults.length}):
                </div>
                {sfdcResults.map(m => (
                  <div key={m.customer_id} className="flex items-center justify-between bg-slate-900/90 p-2.5 rounded-lg border border-slate-700/60 text-xs">
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        {m.full_name} <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-mono">{m.customer_id}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Mobile: {m.mobile || '—'} | Aadhaar: {m.aadhar_last4 || '—'} | PAN: {m.pan_no || '—'} | Branch: {m.branch_code || 'ALL'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, customer_id: m.customer_id }))
                        setSfdcQuery('')
                        setSfdcSearched(false)
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 transition"
                    >
                      <UserCheck className="w-3 h-3" /> Select Member
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-300 flex items-center justify-between">
                <span>✓ No existing member found with query &quot;<strong>{sfdcQuery}</strong>&quot;.</span>
                <button
                  type="button"
                  onClick={() => router.push('/members/new')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 transition"
                >
                  <UserPlus className="w-3 h-3" /> Onboard New Member
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Column */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Member Dropdown */}
            <div className="md:col-span-2 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Member *</label>
              <select
                name="customer_id"
                value={formData.customer_id}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">-- Choose Member --</option>
                {customers.map(c => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.full_name} ({c.customer_id}) — Branch Name: {c.branch_code || '—'}
                  </option>
                ))}
              </select>
            </div>

            {/* Case ID */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Case ID / File No.</label>
              <input
                type="text"
                name="case_id"
                value={formData.case_id}
                onChange={handleChange}
                placeholder="e.g. PL-09"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
              />
            </div>

            {/* Product Type */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Type</label>
              <select
                name="product_type"
                value={formData.product_type}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
              >
                <option value="Individual Loan (IL)">Individual Loan (IL)</option>
                <option value="Joint Liability Group (JLG)">Joint Liability Group (JLG)</option>
                <option value="Business Loan">Business Loan</option>
                <option value="Emergency Loan">Emergency Loan</option>
              </select>
            </div>

            {/* Repayment Frequency */}
            <div className="md:col-span-2 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Repayment Frequency</label>
              <div className="flex gap-2">
                {['Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly'].map(freq => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => handleFrequencyChange(freq)}
                    className={`flex-1 py-2.5 text-xs font-semibold border rounded-xl transition ${
                      formData.frequency === freq
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            {/* Loan Amount */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Amount (₹) *</label>
              <input
                type="number"
                name="loan_amount"
                value={formData.loan_amount}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
              />
            </div>

            {/* Tenure */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tenure (Installments) *</label>
              <input
                type="number"
                name="tenure"
                value={formData.tenure}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
              />
            </div>

            {/* File Charge ₹ and % side-by-side with auto-calc */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Processing Fee / File Charge (₹)</label>
              <input
                type="number"
                name="file_charge"
                value={formData.file_charge}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Auto: {formData.file_charge_pct}% of loan amount</p>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">File Charge (%)</label>
              <input
                type="number"
                step="0.01"
                name="file_charge_pct"
                value={formData.file_charge_pct}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>

            {/* Interest Rate & Installment Amount (₹) Editable — Placed LAST for correct calculations */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/70 p-4 rounded-xl border border-blue-200 shadow-sm">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider">Flat Interest Rate (% p.a.) *</label>
                  <span className="text-[9px] text-blue-600 font-medium">Auto-calcs Installment</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  name="interest_rate"
                  value={formData.interest_rate}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="24"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider">Installment Amount (₹) Editable *</label>
                  <span className="text-[9px] text-blue-600 font-medium">Auto-calcs Rate</span>
                </div>
                <input
                  type="number"
                  name="emi_amount"
                  value={formData.emi_amount}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-xl text-sm font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  placeholder="3100"
                />
                {Number(formData.emi_amount) > 0 &&
                  (Number(formData.emi_amount) * Number(formData.tenure) < Number(formData.loan_amount)) && (
                    <p className="text-[10px] text-amber-700 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-1">
                      ⚠️ Installment of ₹{formData.emi_amount} is less than principal recovery (min ₹{Math.ceil((Number(formData.loan_amount) || 0) / (Number(formData.tenure) || 1))}/installment). Interest rate is 0.00%.
                    </p>
                  )}
              </div>
            </div>

            {/* Disbursement Date */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Disbursement Date</label>
              <input
                type="date"
                name="disbursement_date"
                value={formData.disbursement_date}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
              />
            </div>

            {/* First Installment Date */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">First EMI Start Date</label>
              <input
                type="date"
                name="installment_start_date"
                value={formData.installment_start_date}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
              />
            </div>

            {/* Repayment Mode */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Repayment Mode</label>
              <select
                name="repayment_mode"
                value={formData.repayment_mode}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
              >
                <option value="Cash Collection">Cash Collection</option>
                <option value="Online (UPI/Netbanking)">Online (UPI/Netbanking)</option>
                <option value="Bank Mandate (NACH)">Bank Mandate (NACH)</option>
              </select>
            </div>

            {/* Penalty per day */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Penalty per Overdue Day (₹)</label>
              <input
                type="number"
                name="penalty_per_day"
                value={formData.penalty_per_day}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
              />
            </div>

          </div>

          <div className="flex gap-4 pt-4 border-t border-slate-100 justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition shadow-md shadow-blue-500/20"
            >
              <Save className="w-4 h-4" /> {submitting ? 'Sanctioning…' : 'Sanction & Issue Loan'}
            </button>
          </div>
        </form>

        {/* Live Economics Sidebar Preview Card */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg space-y-4 border border-slate-800">
            <h3 className="text-sm font-bold text-slate-200 pb-2 border-b border-slate-800 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-blue-400" /> Economics Preview
            </h3>
            
            {preview ? (
              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between text-slate-400"><span>Principal Loan Amount</span><span className="font-semibold text-slate-200">{inr(Number(formData.loan_amount))}</span></div>
                <div className="flex justify-between text-slate-400"><span>Processing Fee</span><span className="font-semibold text-slate-200">{inr(preview.file_charge)}</span></div>
                <div className="flex justify-between text-slate-400"><span>Net Disbursed Amount</span><span className="font-bold text-blue-400">{inr(preview.net_disbursement)}</span></div>
                <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-3"><span>Flat Interest (Total)</span><span className="font-semibold text-slate-200">{inr(preview.total_interest)}</span></div>
                <div className="flex justify-between text-slate-400"><span>Total Repayable Amount</span><span className="font-bold text-slate-200">{inr(preview.total_loan)}</span></div>
                <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-3"><span>Installment (EMI)</span><span className="font-bold text-emerald-400 text-sm">{inr(preview.installment_amount)}</span></div>
                <div className="flex justify-between text-slate-400"><span>Interest component / EMI</span><span className="font-semibold text-slate-200">{inr(preview.per_installment_interest)}</span></div>
              </div>
            ) : (
              <p className="text-slate-500 text-xs text-center py-6">Enter loan details to view economics.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
