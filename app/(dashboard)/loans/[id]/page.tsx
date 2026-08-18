'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getOne, getFiltered, putOne, delOne, getAll, supabase } from '@/lib/supabase'
import { recalcLoanLedger, applyPayment, computeForeclosure, addDays, addMonthsLike, computeLoanEconomics, generateSchedule } from '@/lib/calculations'
import type { Loan, ScheduleRow, Transaction, Customer } from '@/lib/types'
import { inr, fdate, fdatetime, todayISO, statusColor, username } from '@/lib/utils'
import { generateSanctionLetter, generatePaymentReceipt, generateForeclosureNoc, generateRepaymentSchedule, generateSOA, generateTopUpLetter, generateRestructureAgreement } from '@/lib/document-generator'
import { useAuth } from '@/lib/auth-context'
import { confirmAction } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import {
  ArrowLeft, Landmark, Calendar, Clock, DollarSign, Tag, Save, AlertTriangle,
  ShieldCheck, CheckCircle, Printer, FileText, Edit2, RefreshCw, TrendingUp,
  Upload, Paperclip, Trash2, RotateCcw, PlusCircle, Eye, Download
} from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

type TabType = 'schedule' | 'transactions' | 'foreclose' | 'edit' | 'restructure' | 'topup' | 'documents' | 'soa'

interface LoanDocument {
  doc_id: string
  loan_account_no: string
  doc_type: string
  file_name: string
  file_url: string
  uploaded_at: string
  uploaded_by: string
}

export default function LoanDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { user } = useAuth()
  const [loan, setLoan] = useState<Loan | null>(null)
  const [member, setMember] = useState<Customer | null>(null)
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [documents, setDocuments] = useState<LoanDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('schedule')

  // Payment Form State
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [payMode, setPayMode] = useState('Cash')
  const [payRef, setPayRef] = useState('')
  const [payRemarks, setPayRemarks] = useState('')
  const [postLoading, setPostLoading] = useState(false)
  const [postMessage, setPostMessage] = useState('')

  // Foreclosure State
  const [fcDate, setFcDate] = useState('')
  const [fcCalculation, setFcCalculation] = useState<any>(null)
  const [fcLoading, setFcLoading] = useState(false)

  // Edit Loan State
  const [editForm, setEditForm] = useState<Partial<Loan>>({})
  const [editSaving, setEditSaving] = useState(false)

  // Restructure State
  const [rstNewAmount, setRstNewAmount] = useState('')
  const [rstNewTenure, setRstNewTenure] = useState('')
  const [rstNewRate, setRstNewRate] = useState('')
  const [rstNewEmi, setRstNewEmi] = useState('')
  const [rstStartDate, setRstStartDate] = useState('')
  const [rstLoading, setRstLoading] = useState(false)
  const [rstPreview, setRstPreview] = useState<any>(null)

  // TopUp State
  const [topupAmount, setTopupAmount] = useState('')
  const [topupDate, setTopupDate] = useState('')
  const [topupLoading, setTopupLoading] = useState(false)

  // Document Upload State
  const [docType, setDocType] = useState('KYC')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docUploading, setDocUploading] = useState(false)

  const router = useRouter()

  useEffect(() => {
    setPayDate(todayISO())
    setFcDate(todayISO())
    setRstStartDate(todayISO())
    setTopupDate(todayISO())
    loadLoanDetails()
  }, [id])

  async function loadLoanDetails() {
    try {
      const l = await getOne<Loan>('loans', id)
      if (!l) { setLoading(false); return }
      setLoan(l)
      setEditForm({
        fo_name: l.fo_name,
        bm_name: l.bm_name,
        branch_code: l.branch_code,
        product_type: l.product_type,
        repayment_mode: l.repayment_mode,
        penalty_per_day: l.penalty_per_day,
      })
      setRstNewAmount(String(l.ledger_balance || l.loan_amount))
      setRstNewTenure(String(l.tenure))
      setRstNewRate(String(l.interest_rate))
      setRstNewEmi(String(l.installment_amount))

      const [m, sched, txs, docs] = await Promise.all([
        getOne<Customer>('customers', l.customer_id),
        getFiltered<ScheduleRow>('schedule', 'loan_account_no', id),
        getFiltered<Transaction>('transactions', 'loan_account_no', id),
        getFiltered<LoanDocument>('loan_documents', 'loan_account_no', id),
      ])

      setMember(m)
      setSchedule(sched.sort((a, b) => a.installment_no - b.installment_no))
      setTransactions(txs.sort((a, b) => (b.txn_date || '').localeCompare(a.txn_date || '') || (b.txn_id || 0) - (a.txn_id || 0)))
      setDocuments(docs)
      if (l.installment_amount) setPayAmount(String(l.installment_amount))
    } catch (err) {
      console.error('Error fetching loan detail:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle Foreclosure calculation
  useEffect(() => {
    if (loan && activeTab === 'foreclose' && fcDate) {
      computeForeclosure(id, fcDate).then(setFcCalculation)
    }
  }, [fcDate, activeTab, loan, id])

  // Restructure preview
  useEffect(() => {
    if (activeTab !== 'restructure') return
    const amt = Number(rstNewAmount) || 0
    const tenure = Number(rstNewTenure) || 0
    const rate = Number(rstNewRate) || 0
    const emi = Number(rstNewEmi) || 0
    if (amt > 0 && tenure > 0 && (rate > 0 || emi > 0)) {
      const econ = computeLoanEconomics({ loan_amount: amt, interest_rate: rate, tenure, frequency: loan?.frequency || 'Monthly', installment_amount: emi > 0 ? emi : undefined })
      setRstPreview(econ)
    } else {
      setRstPreview(null)
    }
  }, [rstNewAmount, rstNewTenure, rstNewRate, rstNewEmi, activeTab])

  const handlePostPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payAmount || Number(payAmount) <= 0) return
    setPostLoading(true)
    setPostMessage('')
    try {
      const refNo = payRef || 'TXN-' + Date.now()
      await applyPayment(id, Number(payAmount), payDate, payMode, refNo, payRemarks)
      setPayRef('')
      setPayRemarks('')
      setPostMessage('Payment applied successfully!')
      setTimeout(() => setPostMessage(''), 4000)
      await loadLoanDetails()
    } catch (err: any) {
      toast.error('Payment Failed', err.message || 'Payment failed')
    } finally {
      setPostLoading(false)
    }
  }

  const handleProcessForeclosure = async () => {
    if (!loan || !fcCalculation || fcCalculation.payoff <= 0) return
    const ok = await confirmAction({
      title: 'Confirm Foreclosure',
      message: `Confirm early foreclosure payoff of ${inr(fcCalculation.payoff)}?`,
      confirmText: 'Foreclose Loan',
      variant: 'warning',
    })
    if (!ok) return
    setFcLoading(true)
    try {
      const refNo = 'FCR-' + Date.now()
      const newTxn: Transaction = {
        txn_id: Date.now(), loan_account_no: id, amount: fcCalculation.payoff,
        txn_date: fcDate, mode: 'Cash', reference_no: refNo,
        remarks: 'Foreclosure early settlement', installment_no: null,
        txn_type: 'FORECLOSURE', classification: 'Foreclosure Settlement',
        created_at: new Date().toISOString(), entered_by: user?.email || 'system', voided: false,
      }
      await putOne('transactions', newTxn, 'txn_id')
      const pendingRows = schedule.filter(r => r.status === 'Pending' || r.status === 'Overdue' || r.status === 'Partial')
      for (const row of pendingRows) {
        row.status = 'Waived'; row.paid_date = fcDate
        await putOne('schedule', row, 'id')
      }
      loan.status = 'CLOSED'; loan.close_date = fcDate
      loan.closure_type = 'FORECLOSURE'; loan.closure_amount = fcCalculation.payoff
      loan.updated_at = new Date().toISOString()
      await putOne('loans', loan, 'loan_account_no')
      await recalcLoanLedger(id)
      toast.success('Loan Foreclosed', 'Loan foreclosed successfully!')
      setActiveTab('schedule')
      await loadLoanDetails()
    } catch (err: any) {
      toast.error('Foreclosure Failed', err.message || 'Foreclosure failed')
    } finally {
      setFcLoading(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!loan) return
    setEditSaving(true)
    try {
      const updated = { ...loan, ...editForm, updated_at: new Date().toISOString() }
      await putOne('loans', updated, 'loan_account_no')
      setLoan(updated as Loan)
      toast.success('Loan Updated', 'Loan details updated.')
    } catch (err: any) {
      toast.error('Save Failed', err.message || 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  const handleRestructure = async () => {
    if (!loan || !rstPreview) return
    const ok = await confirmAction({
      title: 'Confirm Restructure',
      message: `Restructure this loan with new EMI of ${inr(rstPreview.installment_amount)} for ${rstNewTenure} installments starting ${rstStartDate}?`,
      confirmText: 'Restructure Loan',
      variant: 'warning',
    })
    if (!ok) return
    setRstLoading(true)
    try {
      // Mark pending schedule rows as Restructured
      for (const row of schedule.filter(r => r.status === 'Pending' || r.status === 'Overdue')) {
        row.status = 'Restructured'
        await putOne('schedule', row, 'id')
      }
      // Generate new schedule rows
      const rstLoan = {
        ...loan,
        loan_account_no: id,
        loan_amount: Number(rstNewAmount),
        interest_rate: Number(rstNewRate),
        tenure: Number(rstNewTenure),
        installment_amount: rstPreview.installment_amount,
        per_installment_interest: rstPreview.per_installment_interest,
        total_loan: rstPreview.total_loan,
        total_interest: rstPreview.total_interest,
        installment_start_date: rstStartDate,
        frequency: loan.frequency,
      }
      const newRows = generateSchedule(rstLoan).map((r, i) => ({
        ...r, id: id + '_RST_' + (schedule.length + i + 1),
        installment_no: schedule.length + i + 1,
      }))
      for (const r of newRows) await putOne('schedule', r, 'id')
      // Update loan record
      const updatedLoan = {
        ...loan,
        loan_amount: Number(rstNewAmount),
        interest_rate: Number(rstNewRate),
        tenure: schedule.length + Number(rstNewTenure),
        installment_amount: rstPreview.installment_amount,
        per_installment_interest: rstPreview.per_installment_interest,
        updated_at: new Date().toISOString(),
      }
      await putOne('loans', updatedLoan, 'loan_account_no')
      await recalcLoanLedger(id)
      toast.success('Loan Restructured', 'Loan restructured successfully! New schedule generated.')
      setActiveTab('schedule')
      await loadLoanDetails()
    } catch (err: any) {
      toast.error('Restructure Failed', err.message || 'Restructure failed')
    } finally {
      setRstLoading(false)
    }
  }

  const handleTopUp = async () => {
    if (!loan || !topupAmount || Number(topupAmount) <= 0) return
    const ok = await confirmAction({
      title: 'Confirm Top-Up Loan',
      message: `Issue Top-Up loan of ${inr(Number(topupAmount))} to this borrower?`,
      confirmText: 'Issue Top-Up',
      variant: 'warning',
    })
    if (!ok) return
    setTopupLoading(true)
    try {
      // Record top-up as a disbursement transaction on this loan
      const topupTxn: Transaction = {
        txn_id: Date.now(), loan_account_no: id,
        amount: Number(topupAmount), txn_date: topupDate,
        mode: 'Cash', reference_no: 'TOP-' + Date.now(),
        remarks: 'Top-Up Disbursement',
        installment_no: null, txn_type: 'DISBURSEMENT',
        classification: 'Top-Up Disbursement',
        created_at: new Date().toISOString(), entered_by: user?.email || 'system', voided: false,
      }
      await putOne('transactions', topupTxn, 'txn_id')
      toast.success('Top-Up Recorded', 'Top-Up disbursement recorded. Please create a new loan account for the new top-up amount or restructure this one.')
      setTopupAmount('')
      await loadLoanDetails()
    } catch (err: any) {
      toast.error('Top-Up Failed', err.message || 'Top-Up failed')
    } finally {
      setTopupLoading(false)
    }
  }

  const handleDocUpload = async () => {
    if (!loan || !docFile) return
    setDocUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', docFile)
      formData.append('loanAccountNo', id)
      formData.append('docType', docType)

      const uploadRes = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      })

      const uploadData = await uploadRes.json() as { ok?: boolean; path?: string; error?: string }
      if (!uploadRes.ok || !uploadData.path) {
        throw new Error(uploadData.error || 'Upload failed.')
      }

      // Fetch signed URL for viewing
      const signedRes = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(uploadData.path)}`)
      const signedData = await signedRes.json() as { url?: string }

      const docRecord: LoanDocument = {
        doc_id: 'DOC-' + Date.now(),
        loan_account_no: id,
        doc_type: docType,
        file_name: docFile.name,
        file_url: signedData.url || uploadData.path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user?.email || 'system',
      }
      await putOne('loan_documents', docRecord, 'doc_id')
      setDocFile(null)
      setDocuments(prev => [...prev, docRecord])
      toast.success('Document Uploaded', 'Document uploaded successfully!')
    } catch (err: any) {
      toast.error('Upload Error', `Upload error: ${err.message || 'Failed'}`)
    } finally {
      setDocUploading(false)
    }
  }

  const handleDeleteDoc = async (doc: LoanDocument) => {
    const ok = await confirmAction({
      title: 'Confirm Delete',
      message: `Delete document "${doc.file_name}"?`,
      confirmText: 'Delete Document',
      variant: 'danger',
    })
    if (!ok) return
    const { moveToTrash } = await import('@/lib/trash')
    await moveToTrash('loan_documents', doc.doc_id, doc, doc.file_name || doc.doc_id, user?.email || 'system')
    setDocuments(prev => prev.filter(d => d.doc_id !== doc.doc_id))
    toast.success('Document Deleted', `Document "${doc.file_name}" has been moved to Trash Can.`)
  }

  const handleDeleteLoan = async () => {
    const ok = await confirmAction({
      title: 'Confirm Delete',
      message: 'Are you sure you want to delete this loan account?',
      confirmText: 'Delete Loan Account',
      variant: 'danger',
    })
    if (!ok) return
    try {
      setLoading(true)
      const { moveToTrash } = await import('@/lib/trash')
      await moveToTrash('loans', id, loan, `${loan?.member_name_cache || loan?.member_name || ''} (${id})`, user?.email || 'system')
      toast.success('Loan Account Deleted', 'Loan account deleted successfully.')
      router.push('/loans')
    } catch (err: any) {
      toast.error('Deletion Failed', err.message || 'Could not delete loan account.')
      setLoading(false)
    }
  }

  const handleDeleteTxn = async (txn: Transaction) => {
    const ok = await confirmAction({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete transaction "${txn.reference_no || txn.txn_id}" of ${inr(txn.amount)}? The loan schedule and balances will be recalculated.`,
      confirmText: 'Delete Transaction',
      variant: 'danger',
    })
    if (!ok) return
    try {
      setLoading(true)
      const { moveToTrash } = await import('@/lib/trash')
      const { recalcLoanLedger } = await import('@/lib/calculations')

      await moveToTrash('transactions', txn.txn_id, txn, `Transaction ${txn.reference_no || txn.txn_id} (${inr(txn.amount)})`, user?.email || 'system')
      await recalcLoanLedger(id)
      toast.success('Transaction Deleted', 'Transaction deleted and loan ledger recalculated successfully.')
      await loadLoanDetails()
    } catch (err: any) {
      toast.error('Deletion Failed', err.message || 'Could not delete transaction.')
    } finally {
      setLoading(false)
    }
  }

  // Generate SOA - Statement of Account
  const handleGenerateSOA = () => {
    if (!loan) return
    generateSOA({
      loan_account_no: loan.loan_account_no,
      member_name: loan.member_name_cache || loan.member_name || '',
      customer_id: loan.customer_id,
      father_husband_name: member?.father_husband_name || '',
      mobile: member?.mobile || '',
      address: member?.address_current || member?.village_city || '',
      branch_code: loan.branch_code || '',
      loan_amount: loan.loan_amount,
      interest_rate: loan.interest_rate,
      tenure: loan.tenure,
      frequency: loan.frequency,
      installment_amount: loan.installment_amount,
      disbursement_date: loan.disbursement_date,
      file_charge: loan.file_charge || 0,
      total_loan: loan.total_loan,
      total_collected: loan.total_collected,
      ledger_balance: loan.ledger_balance,
      status: loan.status,
      product_type: loan.product_type || '',
      schedule: schedule.map(r => ({
        installment_no: r.installment_no,
        due_date: r.due_date,
        emi_due: r.emi_due,
        paid_amount: r.paid_amount,
        status: r.status,
        dpd: r.dpd || 0,
      })),
      transactions: transactions.filter(t => !t.voided).map(t => ({
        txn_id: t.txn_id,
        txn_date: t.txn_date,
        amount: t.amount,
        mode: t.mode || 'Cash',
        reference_no: t.reference_no || '',
      })),
    })
  }

  const handleGenerateRepaymentSchedule = () => {
    if (!loan) return
    generateRepaymentSchedule({
      loan_account_no: loan.loan_account_no,
      member_name: loan.member_name_cache || loan.member_name || '',
      customer_id: loan.customer_id,
      branch_code: loan.branch_code || '',
      loan_amount: loan.loan_amount,
      interest_rate: loan.interest_rate,
      tenure: loan.tenure,
      frequency: loan.frequency,
      installment_amount: loan.installment_amount,
      disbursement_date: loan.disbursement_date,
      installment_start_date: loan.installment_start_date || loan.disbursement_date,
      product_type: loan.product_type || '',
      schedule: schedule.map(r => ({
        installment_no: r.installment_no,
        due_date: r.due_date,
        opening_balance: r.opening_balance,
        principal_due: r.principal_due,
        interest_due: r.interest_due,
        emi_due: r.emi_due,
        closing_balance: r.closing_balance,
        paid_amount: r.paid_amount,
        status: r.status,
      })),
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading loan details…</p>
        </div>
      </div>
    )
  }

  if (!loan) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center text-slate-400">
          <p className="text-lg font-semibold">Loan not found</p>
          <p className="text-sm">The Loan account number does not exist in our database.</p>
        </div>
      </div>
    )
  }

  const totalCollected = loan.total_collected || 0
  const outstanding = loan.ledger_balance || 0
  const maxDpd = loan.dpd || 0
  const isClosed = (loan.status || '').toUpperCase().startsWith('CLOS')

  const tabs: { key: TabType; label: string; icon: any }[] = [
    { key: 'schedule', label: `Schedule (${schedule.length})`, icon: Calendar },
    { key: 'transactions', label: `Transactions (${transactions.length})`, icon: Receipt },
    { key: 'soa', label: 'SOA / NOC', icon: FileText },
    { key: 'edit', label: 'Edit Details', icon: Edit2 },
    ...(!isClosed ? [
      { key: 'restructure' as TabType, label: 'Restructure', icon: RefreshCw },
      { key: 'topup' as TabType, label: 'Top-Up', icon: TrendingUp },
      { key: 'foreclose' as TabType, label: '🔒 Foreclose', icon: ShieldCheck },
    ] : []),
    { key: 'documents', label: `Docs (${documents.length})`, icon: Paperclip },
  ]

  function Receipt({ className }: { className?: string }) {
    return <DollarSign className={className} />
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Loans
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => generateSanctionLetter({
              loan_account_no: loan.loan_account_no,
              member_name: loan.member_name_cache || loan.member_name,
              customer_id: loan.customer_id,
              mobile: member?.mobile || '',
              father_husband_name: member?.father_husband_name || '',
              address: member ? `${member.address_current || ''}, ${member.village_city || ''}` : '',
              branch_code: loan.branch_code, loan_amount: loan.loan_amount,
              net_disbursement: loan.net_disbursement, file_charge: loan.file_charge,
              interest_rate: loan.interest_rate, tenure: loan.tenure, frequency: loan.frequency,
              installment_amount: loan.installment_amount, disbursement_date: loan.disbursement_date,
              installment_start_date: loan.installment_start_date, product_type: loan.product_type
            })}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold rounded-xl transition border border-blue-200"
          >
            <Printer className="w-3.5 h-3.5" /> Sanction Letter
          </button>

          <button
            onClick={handleGenerateRepaymentSchedule}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-xl transition border border-indigo-200"
          >
            <Printer className="w-3.5 h-3.5" /> Repayment Schedule
          </button>

          {isClosed && (
            <button
              onClick={() => generateForeclosureNoc({
                certificate_no: 'NOC-' + loan.loan_account_no,
                issue_date: loan.close_date || todayISO(),
                loan_account_no: loan.loan_account_no,
                member_name: loan.member_name_cache || loan.member_name,
                customer_id: loan.customer_id,
                father_husband_name: member?.father_husband_name || '',
                address: member?.village_city || '',
                branch_code: loan.branch_code, loan_amount: loan.loan_amount,
                disbursement_date: loan.disbursement_date, close_date: loan.close_date || todayISO(),
                total_paid: loan.total_collected || loan.total_loan, status: loan.status
              })}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold rounded-xl transition border border-emerald-200"
            >
              <FileText className="w-3.5 h-3.5" /> Closure NOC
            </button>
          )}

          <button onClick={handleDeleteLoan} className="px-3 py-2 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 text-xs font-bold rounded-xl transition">
            Delete Loan
          </button>
        </div>
      </div>

      {/* Header Info Profile Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex flex-col lg:flex-row gap-6 justify-between items-start">
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-800">{loan.member_name_cache || loan.member_name}</h1>
                <span className={`badge text-[10px] ${statusColor(loan.status)}`}>{loan.status}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Loan Account: <span className="font-mono text-slate-600 font-semibold">{loan.loan_account_no}</span></p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 pt-4 border-t border-slate-100 text-xs">
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Member ID</span><Link href={`/members/${loan.customer_id}`} className="mono text-blue-600 font-bold hover:underline">{loan.customer_id}</Link></div>
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Mobile No.</span><span className="text-slate-700 font-medium">{member?.mobile || '—'}</span></div>
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Father / Husband</span><span className="text-slate-700 font-medium">{member?.father_husband_name || '—'}</span></div>
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Aadhaar (last 4)</span><span className="text-slate-700 font-medium font-mono">{member?.aadhar_last4 || '—'}</span></div>
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Product</span><span className="text-slate-700 font-medium">{loan.product_type || '—'}</span></div>
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Frequency</span><span className="text-slate-700 font-medium">{loan.frequency} · {loan.tenure} EMIs</span></div>
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Disbursed Date</span><span className="text-slate-700 font-medium">{fdate(loan.disbursement_date)}</span></div>
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Branch / FO</span><span className="text-slate-700 font-medium">{loan.branch_code} / {loan.fo_name}</span></div>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button onClick={handleGenerateSOA} className="px-3.5 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition">
              <Printer className="w-3.5 h-3.5" /> SOA
            </button>
            {isClosed && (
              <button
                onClick={() => generateForeclosureNoc({
                  certificate_no: 'NOC-' + loan.loan_account_no, issue_date: loan.close_date || todayISO(),
                  loan_account_no: loan.loan_account_no, member_name: loan.member_name_cache || loan.member_name,
                  customer_id: loan.customer_id, father_husband_name: member?.father_husband_name || '',
                  address: member?.village_city || '', branch_code: loan.branch_code,
                  loan_amount: loan.loan_amount, disbursement_date: loan.disbursement_date,
                  close_date: loan.close_date || todayISO(), total_paid: loan.total_collected || loan.total_loan, status: loan.status
                })}
                className="px-3.5 py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <FileText className="w-3.5 h-3.5" /> NOC
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tiles Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Loan Amount</span>
          <span className="text-2xl font-bold text-slate-800 leading-tight block mt-1.5">{inr(loan.loan_amount)}</span>
          <span className="text-xs text-slate-400 block mt-1">Disbursed: {inr(loan.net_disbursement)}</span>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Repayable</span>
          <span className="text-2xl font-bold text-slate-800 leading-tight block mt-1.5">{inr(loan.total_loan)}</span>
          <span className="text-xs text-slate-400 block mt-1">Interest: {inr(loan.total_interest)}</span>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Collected</span>
          <span className="text-2xl font-bold text-emerald-600 leading-tight block mt-1.5">{inr(totalCollected)}</span>
          <span className="text-xs text-slate-400 block mt-1">EMI: {inr(loan.installment_amount)} × {loan.tenure}</span>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Outstanding Balance</span>
          <span className={`text-2xl font-bold leading-tight block mt-1.5 ${outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{inr(outstanding)}</span>
          <span className="text-xs text-slate-400 block mt-1">DPD: {maxDpd} days ({maxDpd > 0 ? 'Overdue' : 'Current'})</span>
        </div>
      </div>

      {/* Main Content Layout Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Payment Form */}
        <div className="xl:col-span-1 space-y-6">
          {!isClosed && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" /> Apply Repayment Collection
              </h3>
              <form onSubmit={handlePostPayment} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount (₹) *</label>
                    <input type="number" required value={payAmount} onChange={e => setPayAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Date *</label>
                    <input type="date" required value={payDate} onChange={e => setPayDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Mode</label>
                    <select value={payMode} onChange={e => setPayMode(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Mandate">Bank Mandate</option>
                      <option value="Cheque">Cheque</option>
                      <option value="NEFT/RTGS">NEFT/RTGS</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reference No.</label>
                    <input type="text" placeholder="e.g. TXN-102934" value={payRef} onChange={e => setPayRef(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Remarks</label>
                  <input type="text" placeholder="Regular payment collect" value={payRemarks} onChange={e => setPayRemarks(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                {postMessage && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> {postMessage}
                  </div>
                )}
                <button type="submit" disabled={postLoading}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-emerald-500/10">
                  {postLoading ? 'Processing…' : 'Confirm Repayment Payment'}
                </button>
              </form>
            </div>
          )}

          {isClosed && (
            <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl text-blue-900 space-y-2">
              <div className="flex gap-2 items-center">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h4 className="font-bold text-sm">Closed Account Summary</h4>
              </div>
              <p className="text-xs text-blue-700 leading-relaxed">This loan account has been fully closed.</p>
              <div className="bg-blue-100/50 p-3 border border-blue-200/50 rounded-xl text-xs font-semibold space-y-1 mt-2">
                <div>Closure Date: {fdate(loan.close_date)}</div>
                <div>Closure Mode: {loan.closure_type || 'Full Settlement'}</div>
                {loan.closure_amount && <div>Settlement Payoff: {inr(loan.closure_amount)}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Tabbed Lists */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Tabs Header */}
            <div className="flex flex-wrap border-b border-slate-100 bg-slate-50/50 px-2">
              {tabs.map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            <div className="p-4">

              {/* TAB: Repayment Schedule */}
              {activeTab === 'schedule' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                        <th className="text-left px-3 py-2 font-semibold">No</th>
                        <th className="text-left px-3 py-2 font-semibold">Due Date</th>
                        <th className="text-right px-3 py-2 font-semibold">Principal</th>
                        <th className="text-right px-3 py-2 font-semibold">Interest</th>
                        <th className="text-right px-3 py-2 font-semibold">EMI</th>
                        <th className="text-right px-3 py-2 font-semibold">Collected</th>
                        <th className="text-center px-3 py-2 font-semibold">DPD</th>
                        <th className="text-center px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {schedule.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 text-slate-500">{r.installment_no}</td>
                          <td className="px-3 py-2 text-slate-700 font-semibold">{fdate(r.due_date)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{inr(r.principal_due)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{inr(r.interest_due)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700">{inr(r.emi_due)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-600">{inr(r.paid_amount)}</td>
                          <td className="px-3 py-2 text-center text-slate-500">{r.dpd || 0}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`badge text-[9px] ${
                              r.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' :
                              r.status === 'Partial' ? 'bg-amber-50 text-amber-700' :
                              r.status === 'Overdue' ? 'bg-red-50 text-red-700' :
                              r.status === 'Waived' ? 'bg-slate-100 text-slate-500' :
                              r.status === 'Restructured' ? 'bg-purple-50 text-purple-700' : 'bg-slate-50 text-slate-600'
                            }`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                      {schedule.length === 0 && (
                        <tr><td colSpan={8} className="text-center py-8 text-slate-400">No schedule rows found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB: Transactions */}
              {activeTab === 'transactions' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                        <th className="text-left px-3 py-2 font-semibold">Date</th>
                        <th className="text-left px-3 py-2 font-semibold">Type</th>
                        <th className="text-left px-3 py-2 font-semibold">Classification</th>
                        <th className="text-right px-3 py-2 font-semibold">Amount</th>
                        <th className="text-left px-3 py-2 font-semibold">Mode</th>
                        <th className="text-left px-3 py-2 font-semibold">Ref No</th>
                        <th className="text-left px-3 py-2 font-semibold">Remarks</th>
                        <th className="text-center px-3 py-2 font-semibold">Receipt</th>
                        <th className="text-center px-3 py-2 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.map(t => (
                        <tr key={t.txn_id} className={`hover:bg-slate-50/50 ${t.voided ? 'line-through opacity-50' : ''}`}>
                          <td className="px-3 py-2.5 text-slate-700 font-semibold">{fdate(t.txn_date)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{t.txn_type}</td>
                          <td className="px-3 py-2.5 text-slate-600 font-medium">{t.classification || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-800">{inr(t.amount)}</td>
                          <td className="px-3 py-2.5 text-slate-500">{t.mode || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 font-mono text-[10px]">{t.reference_no || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-400">{t.remarks || '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => generatePaymentReceipt({
                                receipt_no: 'REC-' + t.txn_id, txn_date: fdate(t.txn_date),
                                loan_account_no: loan.loan_account_no, member_name: loan.member_name_cache || loan.member_name,
                                customer_id: loan.customer_id, branch_code: loan.branch_code,
                                amount: t.amount, mode: t.mode || 'Cash', reference_no: t.reference_no || '',
                                remaining_outstanding: loan.ledger_balance, entered_by: t.entered_by || 'Staff'
                              })}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded flex items-center gap-1 transition mx-auto"
                            >
                              <Printer className="w-3 h-3" /> Print
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => handleDeleteTxn(t)}
                              title="Delete Transaction"
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr><td colSpan={9} className="text-center py-8 text-slate-400">No transactions recorded yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB: SOA / NOC */}
              {activeTab === 'soa' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-slate-100 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <h4 className="font-bold text-sm text-slate-800">Statement of Account (SOA)</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Print or download a complete account statement showing all installments, payments made, outstanding balances, and DPD status.</p>
                      <button onClick={handleGenerateSOA} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2">
                        <Printer className="w-4 h-4" /> Generate SOA
                      </button>
                    </div>

                    <div className="border border-slate-100 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        <h4 className="font-bold text-sm text-slate-800">No Objection Certificate (NOC)</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Generate a NOC / Loan Clearance Certificate confirming full repayment and closure of this loan account.</p>
                      {isClosed ? (
                        <button
                          onClick={() => generateForeclosureNoc({
                            certificate_no: 'NOC-' + loan.loan_account_no, issue_date: loan.close_date || todayISO(),
                            loan_account_no: loan.loan_account_no, member_name: loan.member_name_cache || loan.member_name,
                            customer_id: loan.customer_id, father_husband_name: member?.father_husband_name || '',
                            address: member?.village_city || '', branch_code: loan.branch_code,
                            loan_amount: loan.loan_amount, disbursement_date: loan.disbursement_date,
                            close_date: loan.close_date || todayISO(), total_paid: loan.total_collected || loan.total_loan, status: loan.status
                          })}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
                        >
                          <FileText className="w-4 h-4" /> Generate NOC
                        </button>
                      ) : (
                        <div className="py-2.5 border border-amber-200 bg-amber-50 text-amber-700 text-xs text-center rounded-xl font-semibold">
                          NOC available only after loan closure
                        </div>
                      )}
                    </div>

                    <div className="border border-slate-100 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Printer className="w-5 h-5 text-purple-500" />
                        <h4 className="font-bold text-sm text-slate-800">Sanction Letter</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">Print the original sanction letter and credit agreement document for this loan.</p>
                      <button
                        onClick={() => generateSanctionLetter({
                          loan_account_no: loan.loan_account_no, member_name: loan.member_name_cache || loan.member_name,
                          customer_id: loan.customer_id, mobile: member?.mobile || '',
                          father_husband_name: member?.father_husband_name || '',
                          address: member ? `${member.address_current || ''}, ${member.village_city || ''}` : '',
                          branch_code: loan.branch_code, loan_amount: loan.loan_amount,
                          net_disbursement: loan.net_disbursement, file_charge: loan.file_charge,
                          interest_rate: loan.interest_rate, tenure: loan.tenure, frequency: loan.frequency,
                          installment_amount: loan.installment_amount, disbursement_date: loan.disbursement_date,
                          installment_start_date: loan.installment_start_date, product_type: loan.product_type
                        })}
                        className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
                      >
                        <Printer className="w-4 h-4" /> Print Sanction Letter
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: Edit Loan Details */}
              {activeTab === 'edit' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Edit2 className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-800">Edit Loan Details</h3>
                    <span className="text-xs text-slate-400">(Core financial terms require restructure/new loan)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Field Officer Name</label>
                      <input type="text" value={editForm.fo_name || ''} onChange={e => setEditForm(p => ({ ...p, fo_name: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Branch Manager Name</label>
                      <input type="text" value={editForm.bm_name || ''} onChange={e => setEditForm(p => ({ ...p, bm_name: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Branch Code</label>
                      <input type="text" value={editForm.branch_code || ''} onChange={e => setEditForm(p => ({ ...p, branch_code: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Type</label>
                      <input type="text" value={editForm.product_type || ''} onChange={e => setEditForm(p => ({ ...p, product_type: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Repayment Mode</label>
                      <select value={editForm.repayment_mode || ''} onChange={e => setEditForm(p => ({ ...p, repayment_mode: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">Select mode</option>
                        <option value="Cash">Cash</option>
                        <option value="Bank Mandate">Bank Mandate</option>
                        <option value="UPI">UPI</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Penalty Per Day (₹)</label>
                      <input type="number" value={editForm.penalty_per_day || ''} onChange={e => setEditForm(p => ({ ...p, penalty_per_day: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-700">
                    <strong>Note:</strong> To change core loan terms (amount, rate, tenure, EMI), use the <strong>Restructure</strong> tab. This tab only updates administrative fields.
                  </div>
                  <button onClick={handleSaveEdit} disabled={editSaving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition">
                    <Save className="w-4 h-4" /> {editSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              )}

              {/* TAB: Restructure */}
              {activeTab === 'restructure' && !isClosed && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <RefreshCw className="w-4 h-4 text-purple-500" />
                    <h3 className="text-sm font-bold text-slate-800">Loan Restructuring</h3>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-800 space-y-1">
                    <p><strong>⚠️ How Restructuring Works:</strong></p>
                    <p>All pending/overdue schedule rows will be marked as <em>Restructured</em>. New installment rows will be generated from the restructure date, effectively creating a fresh repayment plan on the outstanding balance.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outstanding / New Principal (₹)</label>
                      <input type="number" value={rstNewAmount} onChange={e => setRstNewAmount(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Tenure (Installments)</label>
                      <input type="number" value={rstNewTenure} onChange={e => setRstNewTenure(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Interest Rate (% p.a.)</label>
                      <input type="number" step="0.01" value={rstNewRate} onChange={e => setRstNewRate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fixed EMI (₹) — leave blank to auto-calculate</label>
                      <input type="number" value={rstNewEmi} onChange={e => setRstNewEmi(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Start Date</label>
                      <input type="date" value={rstStartDate} onChange={e => setRstStartDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                  {rstPreview && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                      <p className="font-bold text-slate-700">Restructure Preview:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex justify-between"><span className="text-slate-500">New EMI</span><span className="font-bold text-blue-600">{inr(rstPreview.installment_amount)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Total Repayable</span><span className="font-bold">{inr(rstPreview.total_loan)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Total Interest</span><span className="font-bold">{inr(rstPreview.total_interest)}</span></div>
                      </div>
                    </div>
                  )}
                  <button onClick={handleRestructure} disabled={rstLoading || !rstPreview}
                    className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition">
                    <RefreshCw className="w-4 h-4" /> {rstLoading ? 'Processing…' : 'Confirm Restructure'}
                  </button>
                </div>
              )}

              {/* TAB: Top-Up */}
              {activeTab === 'topup' && !isClosed && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-slate-800">Top-Up Loan</h3>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-xs text-blue-800 space-y-1">
                    <p><strong>ℹ️ How Top-Up Works:</strong></p>
                    <p>A top-up records an additional disbursement against this loan. For full top-up with a fresh schedule, please create a new loan account for the top-up amount and reference this account number.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top-Up Amount (₹) *</label>
                      <input type="number" placeholder="Enter top-up amount" value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Disbursement Date *</label>
                      <input type="date" value={topupDate} onChange={e => setTopupDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                  {topupAmount && Number(topupAmount) > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-700">
                      Top-Up Amount: <strong>{inr(Number(topupAmount))}</strong> — will be recorded as a disbursement transaction.
                    </div>
                  )}
                  <button onClick={handleTopUp} disabled={topupLoading || !topupAmount || Number(topupAmount) <= 0}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition">
                    <PlusCircle className="w-4 h-4" /> {topupLoading ? 'Processing…' : 'Record Top-Up Disbursement'}
                  </button>
                </div>
              )}

              {/* TAB: Foreclose Payoff */}
              {activeTab === 'foreclose' && !isClosed && (
                <div className="space-y-5">
                  <div className="flex flex-col md:flex-row gap-4 items-end bg-slate-50 p-4 border border-slate-200/50 rounded-xl">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Calculate Payoff As-Of Date</label>
                      <input type="date" value={fcDate} onChange={e => setFcDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none" />
                    </div>
                    <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                      Interest on future (not-yet-due) installments is completely waived on early foreclosure. You only pay outstanding principal.
                    </p>
                  </div>

                  {fcCalculation ? (
                    <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 text-xs">
                      <div className="flex justify-between p-3.5"><span className="text-slate-500">Unpaid Installments count</span><span className="font-semibold">{fcCalculation.pendingCount} ({fcCalculation.overdueCount} overdue)</span></div>
                      <div className="flex justify-between p-3.5"><span className="text-slate-500">Principal Outstanding</span><span className="font-semibold text-slate-800">{inr(fcCalculation.principalRemaining)}</span></div>
                      <div className="flex justify-between p-3.5"><span className="text-slate-500">Overdue Interest Outstanding</span><span className="font-semibold text-slate-800">{inr(fcCalculation.interestOnOverdue)}</span></div>
                      <div className="flex justify-between p-3.5 bg-blue-50/50"><span className="text-slate-700 font-bold">Total Foreclosure Payoff Amount</span><span className="font-bold text-blue-700 text-sm">{inr(fcCalculation.payoff)}</span></div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400">Computing payoff…</div>
                  )}

                  {fcCalculation && fcCalculation.payoff > 0 && (
                    <button onClick={handleProcessForeclosure} disabled={fcLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition shadow-md shadow-red-500/10">
                      <ShieldCheck className="w-4 h-4" /> {fcLoading ? 'Processing early closure…' : 'Process Early Foreclosure Settlement'}
                    </button>
                  )}
                </div>
              )}

              {/* TAB: Documents */}
              {activeTab === 'documents' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Paperclip className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-800">Loan Documents</h3>
                  </div>

                  {/* Upload Form */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-600">Upload New Document</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Document Type</label>
                        <select value={docType} onChange={e => setDocType(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="KYC">KYC</option>
                          <option value="Aadhaar">Aadhaar Card</option>
                          <option value="PAN">PAN Card</option>
                          <option value="Photo">Photograph</option>
                          <option value="Sanction Letter">Sanction Letter</option>
                          <option value="Agreement">Loan Agreement</option>
                          <option value="Insurance">Insurance</option>
                          <option value="Income Proof">Income Proof</option>
                          <option value="Address Proof">Address Proof</option>
                          <option value="Bank Statement">Bank Statement</option>
                          <option value="Guarantor KYC">Guarantor KYC</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select File</label>
                        <input type="file" accept="image/*,.pdf,.doc,.docx,.xlsx"
                          onChange={e => setDocFile(e.target.files?.[0] || null)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none" />
                      </div>
                    </div>
                    <button onClick={handleDocUpload} disabled={docUploading || !docFile}
                      className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition">
                      <Upload className="w-3.5 h-3.5" /> {docUploading ? 'Uploading…' : 'Upload Document'}
                    </button>
                  </div>

                  {/* Documents List */}
                  {documents.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                      <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No documents uploaded yet</p>
                      <p className="text-xs mt-1">Upload KYC, agreements, and other documents</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {documents.map(doc => (
                        <div key={doc.doc_id} className="flex items-center justify-between p-3.5 border border-slate-100 rounded-xl hover:bg-slate-50 transition">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                              <FileText className="w-4 h-4 text-blue-500" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-800">{doc.file_name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{doc.doc_type} · {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.file_url && (
                              <a href={doc.file_url} target="_blank" rel="noreferrer"
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded flex items-center gap-1 transition">
                                <Eye className="w-3 h-3" /> View
                              </a>
                            )}
                            <button onClick={() => handleDeleteDoc(doc)}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold rounded flex items-center gap-1 transition">
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
