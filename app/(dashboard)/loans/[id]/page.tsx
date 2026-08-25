'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getOne, getFiltered, putOne, putMany, delOne, getAll, supabase } from '@/lib/supabase'
import { recalcLoanLedger, applyPayment, computeForeclosure, addDays, addMonthsLike, daysBetween, computeLoanEconomics, generateSchedule, classifyAndAllocatePayment, computeBrokenPeriodInterest, processOTSSettlement, generateUniqueLoanAccountNo, FREQ_PER_YEAR } from '@/lib/calculations'
import type { Loan, ScheduleRow, Transaction, Customer } from '@/lib/types'
import { inr, fdate, fdatetime, todayISO, statusColor, username } from '@/lib/utils'
import { generateSanctionLetter, generatePaymentReceipt, generateThermalPaymentReceipt, generateForeclosureNoc, generateRepaymentSchedule, generateSOA, generateTopUpLetter, generateRestructureAgreement, generateOTSSettlementLetter } from '@/lib/document-generator'
import { logAuditEvent } from '@/lib/audit'
import { useAuth } from '@/lib/auth-context'
import { confirmAction } from '@/lib/confirm'
import { toast } from '@/lib/toast'
import {
  ArrowLeft, Landmark, Calendar, Clock, DollarSign, Tag, Save, AlertTriangle,
  ShieldCheck, CheckCircle, Printer, FileText, Edit2, RefreshCw, TrendingUp,
  Upload, Paperclip, Trash2, RotateCcw, PlusCircle, Eye, Download, Smartphone,
  Handshake
} from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

type TabType = 'schedule' | 'transactions' | 'foreclose' | 'ots' | 'edit' | 'restructure' | 'topup' | 'documents' | 'soa' | 'audit'

interface LoanDocument {
  doc_id: string
  loan_account_no: string
  doc_type: string
  file_name: string
  file_url?: string
  file_path?: string
  file_data?: string
  mime_type?: string
  file_size_kb?: number
  uploaded_at: string
  uploaded_date?: string
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
  const [auditLogs, setAuditLogs] = useState<any[]>([])
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
  const [allocPreview, setAllocPreview] = useState<any>(null)
  const [lastPostedTxn, setLastPostedTxn] = useState<any>(null)

  // Foreclosure State
  const [fcDate, setFcDate] = useState('')
  const [fcCalculation, setFcCalculation] = useState<any>(null)
  const [fcLoading, setFcLoading] = useState(false)

  // One-Time Settlement (OTS) State
  const [otsPayoff, setOtsPayoff] = useState('')
  const [otsInterestWaived, setOtsInterestWaived] = useState('0')
  const [otsPenalWaived, setOtsPenalWaived] = useState('0')
  const [otsDate, setOtsDate] = useState('')
  const [otsRemarks, setOtsRemarks] = useState('Full and final OTS settlement approved by management')
  const [otsApprovedBy, setOtsApprovedBy] = useState('Credit Committee')
  const [otsLoading, setOtsLoading] = useState(false)

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
  const [topupAmount, setTopupAmount] = useState('30000')
  const [topupRate, setTopupRate] = useState('24')
  const [topupTenure, setTopupTenure] = useState('12')
  const [topupEmi, setTopupEmi] = useState('3100')
  const [topupFee, setTopupFee] = useState('600')
  const [topupFeePct, setTopupFeePct] = useState('2')
  const [topupDate, setTopupDate] = useState('')
  const [topupStartDate, setTopupStartDate] = useState('')
  const [topupMethod, setTopupMethod] = useState<'IN_PLACE' | 'REFINANCE_NEW_LOAN'>('REFINANCE_NEW_LOAN')
  const [topupLoading, setTopupLoading] = useState(false)
  const [topupPreview, setTopupPreview] = useState<any>(null)

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
    setTopupStartDate(todayISO())
    // Run full ledger recalc on first load only (cleans duplicates, syncs schedule)
    import('@/lib/calculations').then(({ recalcLoanLedger }) =>
      recalcLoanLedger(id).then(() => loadLoanDetails())
    )

    const handler = () => loadLoanDetails(true)
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [id])

  async function loadLoanDetails(silent = false) {
    if (!silent) setLoading(true)
    try {
      const l = await getOne<Loan>('loans', id, silent)
      if (!l) { if (!silent) setLoading(false); return }
      setLoan(l)
      setEditForm({
        member_name: l.member_name_cache || l.member_name,
        fo_name: l.fo_name,
        bm_name: l.bm_name,
        branch_code: l.branch_code,
        product_type: l.product_type || 'Individual Loan',
        loan_amount: l.loan_amount,
        net_disbursement: l.net_disbursement,
        file_charge: l.file_charge,
        interest_rate: l.interest_rate,
        tenure: l.tenure,
        installment_amount: l.installment_amount,
        frequency: l.frequency,
        disbursement_date: l.disbursement_date,
        installment_start_date: l.installment_start_date,
        status: l.status,
        repayment_mode: l.repayment_mode,
        penalty_per_day: l.penalty_per_day,
      })
      setRstNewAmount(String(l.ledger_balance || l.loan_amount))
      setRstNewTenure(String(l.tenure))
      setRstNewRate(String(l.interest_rate))
      setRstNewEmi(String(l.installment_amount))

      const [m, sched, txs, lDocs, vDocs] = await Promise.all([
        getOne<Customer>('customers', l.customer_id, silent),
        getFiltered<ScheduleRow>('schedule', 'loan_account_no', id, silent),
        getFiltered<Transaction>('transactions', 'loan_account_no', id, silent),
        getFiltered<LoanDocument>('loan_documents', 'loan_account_no', id, silent),
        getFiltered<LoanDocument>('documents', 'loan_account_no', id, silent),
      ])

      const cleanTxs = txs.filter(t => !t.voided)

      // Merge documents from both loan_documents & documents stores by doc_id
      const mergedMap = new Map<string, LoanDocument>()
      lDocs.forEach(d => mergedMap.set(d.doc_id, d))
      vDocs.forEach(d => {
        if (!mergedMap.has(d.doc_id)) mergedMap.set(d.doc_id, d)
        else {
          const existing = mergedMap.get(d.doc_id)!
          mergedMap.set(d.doc_id, { ...d, ...existing, file_path: existing.file_path || d.file_path })
        }
      })
      const mergedDocs = Array.from(mergedMap.values()).sort((a, b) =>
        (b.uploaded_at || b.uploaded_date || '').localeCompare(a.uploaded_at || a.uploaded_date || '')
      )

      setMember(m)
      setSchedule(sched.sort((a, b) => a.installment_no - b.installment_no))
      setTransactions(cleanTxs.sort((a, b) => (b.txn_date || '').localeCompare(a.txn_date || '') || Number(b.txn_id || 0) - Number(a.txn_id || 0)))
      setDocuments(mergedDocs)
      const { getAuditLogs } = await import('@/lib/audit')
      const allLogs = await getAuditLogs()
      const loanLogs = allLogs.filter(l =>
        l.entity_id === id ||
        (l.narration && l.narration.includes(id)) ||
        (l.entity_type === 'LOAN' && l.entity_id === id)
      )
      setAuditLogs(loanLogs)
      if (l.installment_amount) setPayAmount(String(l.installment_amount))
    } catch (err) {
      console.error('Error fetching loan detail:', err)
    } finally {
      if (!silent) setLoading(false)
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

  // Live Repayment Allocation Preview
  useEffect(() => {
    const amt = Number(payAmount)
    if (loan && amt > 0 && payDate) {
      classifyAndAllocatePayment(id, amt, payDate)
        .then(setAllocPreview)
        .catch(() => setAllocPreview(null))
    } else {
      setAllocPreview(null)
    }
  }, [payAmount, payDate, loan, id])

  const handlePostPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payAmount || Number(payAmount) <= 0 || postLoading) return
    setPostLoading(true)
    setPostMessage('')
    try {
      const refNo = payRef || 'TXN-' + Date.now()
      const newTxId = await applyPayment(id, Number(payAmount), payDate, payMode, refNo, payRemarks, user?.email || 'system')
      setLastPostedTxn({
        receipt_no: 'REC-' + newTxId,
        txn_date: payDate,
        amount: Number(payAmount),
        mode: payMode,
        reference_no: refNo,
        alloc: allocPreview,
      })
      setPayRef('')
      setPayRemarks('')
      setPostMessage('Payment applied & ledger updated successfully!')

      await logAuditEvent({
        event_type: 'PAYMENT_COLLECTED',
        entity_type: 'TRANSACTION',
        entity_id: `REC-${newTxId}`,
        actor_email: user?.email || 'system',
        actor_name: user?.name || 'Staff',
        actor_role: user?.role || 'staff',
        branch_code: loan?.branch_code || '',
        narration: allocPreview?.narration || `Payment of ${inr(Number(payAmount))} collected for ${loan?.loan_account_no}`,
      })

      await loadLoanDetails(true)
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

  // Handle One-Time Settlement (OTS)
  const handleProcessOTS = async () => {
    if (!loan || Number(otsPayoff) <= 0 || otsLoading) return
    const ok = await confirmAction({
      title: 'Confirm One-Time Settlement (OTS)',
      message: `Are you sure you want to settle Loan ${loan.loan_account_no} for ${inr(Number(otsPayoff))} (Interest Waived: ${inr(Number(otsInterestWaived))}, Penal Waived: ${inr(Number(otsPenalWaived))})? This will close the loan with 0 balance.`,
      confirmText: 'Approve & Settle Loan',
      variant: 'warning',
    })
    if (!ok) return
    setOtsLoading(true)
    try {
      await processOTSSettlement(
        id,
        Number(otsPayoff),
        Number(otsInterestWaived) || 0,
        Number(otsPenalWaived) || 0,
        otsDate || todayISO(),
        otsRemarks,
        otsApprovedBy || user?.name || 'Credit Committee'
      )

      await logAuditEvent({
        event_type: 'OTS_SETTLED',
        entity_type: 'LOAN',
        entity_id: loan.loan_account_no,
        actor_email: user?.email || 'system',
        actor_name: user?.name || 'Staff',
        actor_role: user?.role || 'staff',
        branch_code: loan.branch_code,
        narration: `OTS Settlement of ${inr(Number(otsPayoff))} approved for ${loan.loan_account_no}. Waived: Interest ${inr(Number(otsInterestWaived))}, Penal ${inr(Number(otsPenalWaived))}.`,
      })

      toast.success('OTS Settlement Approved', 'Loan settled and closed successfully under One-Time Settlement.')

      // Auto-generate OTS Letter
      generateOTSSettlementLetter({
        letter_no: 'OTS-' + Date.now(),
        settlement_date: otsDate || todayISO(),
        loan_account_no: loan.loan_account_no,
        member_name: loan.member_name_cache || loan.member_name,
        customer_id: loan.customer_id,
        father_husband_name: member?.father_husband_name || '',
        address: member?.address_current || member?.village_city || '',
        branch_code: loan.branch_code,
        original_loan_amount: loan.loan_amount,
        outstanding_before_settlement: loan.ledger_balance,
        interest_waived: Number(otsInterestWaived) || 0,
        penal_waived: Number(otsPenalWaived) || 0,
        agreed_settlement_amount: Number(otsPayoff),
        approved_by: otsApprovedBy,
        remarks: otsRemarks,
      })

      await loadLoanDetails(true)
      setActiveTab('schedule')
    } catch (err: any) {
      toast.error('OTS Settlement Failed', err.message || 'Could not process OTS')
    } finally {
      setOtsLoading(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!loan) return
    setEditSaving(true)
    try {
      const loanAmt = Number(editForm.loan_amount ?? loan.loan_amount)
      const tenure = Number(editForm.tenure ?? loan.tenure)
      const intRate = Number(editForm.interest_rate ?? loan.interest_rate)
      const emiAmt = Number(editForm.installment_amount ?? loan.installment_amount)
      const startDateStr = editForm.installment_start_date || loan.installment_start_date || loan.disbursement_date
      const freq = editForm.frequency || loan.frequency || 'Weekly'

      const updated = {
        ...loan,
        ...editForm,
        member_name_cache: editForm.member_name || loan.member_name_cache || loan.member_name,
        loan_amount: loanAmt,
        net_disbursement: Number(editForm.net_disbursement ?? loan.net_disbursement),
        file_charge: Number(editForm.file_charge ?? loan.file_charge),
        interest_rate: intRate,
        tenure: tenure,
        tenure_months: tenure,
        total_installments: tenure,
        installment_amount: emiAmt,
        emi_amount: emiAmt,
        frequency: freq,
        repayment_frequency: freq,
        disbursement_date: editForm.disbursement_date || loan.disbursement_date,
        disb_date: editForm.disbursement_date || loan.disbursement_date,
        installment_start_date: startDateStr,
        first_installment_date: startDateStr,
        product_type: editForm.product_type || loan.product_type || 'Individual Loan',
        status: editForm.status || loan.status,
        penalty_per_day: Number(editForm.penalty_per_day ?? loan.penalty_per_day ?? 0),
        updated_at: new Date().toISOString(),
      }

      // If start date or loan terms changed, regenerate schedule starting from new installment_start_date
      const startDateChanged = editForm.installment_start_date && editForm.installment_start_date !== loan.installment_start_date
      const termsChanged = editForm.loan_amount !== undefined || editForm.tenure !== undefined || editForm.installment_amount !== undefined

      if (startDateChanged || termsChanged) {
        const pPerEmi = loanAmt / tenure
        const totalInt = updated.total_interest || Math.max(0, (emiAmt * tenure) - loanAmt)
        const iPerEmi = totalInt / tenure
        const paidCount = Number((loan as any)?.paid_emi || (loan as any)?.data?.paid_emi || 0)
        const today = todayISO()
        const daysPerInst = freq === 'Weekly' ? 7 : freq === 'Bi-Monthly' ? 15 : freq === 'Monthly' ? 30 : 1

        const newSchedule: ScheduleRow[] = []
        for (let i = 1; i <= tenure; i++) {
          const dueDate = addDays(startDateStr, (i - 1) * daysPerInst)
          const isPaid = i <= paidCount
          const daysLate = !isPaid && dueDate < today ? daysBetween(dueDate, today) : 0
          let status = 'Pending'
          if (isPaid) status = 'Paid'
          else if (daysLate > 0) status = 'Overdue'

          const schedId = id + '_' + i
          newSchedule.push({
            id: schedId,
            loan_account_no: id,
            installment_no: i,
            due_date: dueDate,
            principal_due: Math.round(pPerEmi * 100) / 100,
            interest_due: Math.round(iPerEmi * 100) / 100,
            emi_due: Math.round(emiAmt * 100) / 100,
            paid_amount: isPaid ? emiAmt : 0,
            paid_date: isPaid ? dueDate : null,
            status: status as any,
            dpd: isPaid ? 0 : daysLate,
            data: {
              id: schedId,
              loan_account_no: id,
              installment_no: i,
              due_date: dueDate,
              opening_balance: 0,
              principal_due: Math.round(pPerEmi * 100) / 100,
              interest_due: Math.round(iPerEmi * 100) / 100,
              emi_due: Math.round(emiAmt * 100) / 100,
              closing_balance: 0,
              paid_amount: isPaid ? emiAmt : 0,
              paid_date: isPaid ? dueDate : null,
              status: status,
              dpd: isPaid ? 0 : daysLate,
            }
          } as any)
        }
        await putMany('schedule', newSchedule, 'id')
        setSchedule(newSchedule)
      }

      await putOne('loans', updated, 'loan_account_no')
      await recalcLoanLedger(id)
      setLoan(updated as Loan)
      toast.success('Loan Updated', 'Loan details and repayment schedule saved successfully.')
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
      const updatedLoan: Loan = {
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

      await logAuditEvent({
        event_type: 'LOAN_RESTRUCTURED',
        entity_type: 'LOAN',
        entity_id: loan.loan_account_no,
        actor_email: user?.email || 'system',
        actor_name: user?.name || 'Staff',
        actor_role: user?.role || 'staff',
        branch_code: loan.branch_code,
        narration: `Restructured loan ${loan.loan_account_no}: New Principal ${inr(Number(rstNewAmount))}, New EMI ${inr(rstPreview.installment_amount)} for ${rstNewTenure} terms at ${rstNewRate}% p.a.`,
      })

      // Generate Restructure Agreement Document
      generateRestructureAgreement({
        loan_account_no: loan.loan_account_no,
        member_name: loan.member_name_cache || loan.member_name,
        customer_id: loan.customer_id,
        father_husband_name: member?.father_husband_name || '',
        address: member ? `${member.address_current || ''}, ${member.village_city || ''}` : '',
        branch_code: loan.branch_code,
        original_loan_amount: loan.loan_amount,
        outstanding_at_restructure: Number(rstNewAmount),
        old_tenure: schedule.length,
        new_tenure: Number(rstNewTenure),
        old_installment: loan.installment_amount,
        new_installment: rstPreview.installment_amount,
        frequency: loan.frequency,
        restructure_date: rstStartDate,
        first_emi_date: rstStartDate,
        reason: 'Restructuring and rescheduling of repayment terms upon borrower request',
      })

      toast.success('Loan Restructured', 'Loan restructured successfully and Restructure Agreement generated!')
      setActiveTab('schedule')
      await loadLoanDetails(true)
    } catch (err: any) {
      toast.error('Restructure Failed', err.message || 'Restructure failed')
    } finally {
      setRstLoading(false)
    }
  }

  const handleTopUp = async () => {
    if (!loan || !topupAmount || Number(topupAmount) <= 0 || topupLoading) return
    const topupAmt = Number(topupAmount)
    const currentOutstanding = loan.ledger_balance || 0
    const fee = Number(topupFee) || 0

    if (topupMethod === 'REFINANCE_NEW_LOAN') {
      const netDisbursed = Math.max(0, topupAmt - currentOutstanding - fee)
      const ok = await confirmAction({
        title: 'Confirm Refinance Top-Up (New Loan)',
        message: `Issue Refinance Top-Up of ${inr(topupAmt)} for ${member?.full_name || loan.member_name}? Existing Loan ${loan.loan_account_no} (${inr(currentOutstanding)}) will be closed and settled. Net cash disbursed to borrower: ${inr(netDisbursed)}.`,
        confirmText: 'Issue Top-Up & New Loan',
        variant: 'warning',
      })
      if (!ok) return
      setTopupLoading(true)
      try {
        // 1. Close Existing Loan
        loan.status = 'CLOSED'
        loan.close_date = topupDate
        loan.closure_type = 'TOPUP_REFINANCED'
        loan.closure_amount = currentOutstanding
        loan.ledger_balance = 0
        loan.updated_at = new Date().toISOString()
        await putOne('loans', loan, 'loan_account_no')

        // 2. Generate New Loan Account
        const newLoanAccountNo = await generateUniqueLoanAccountNo()
        const newTotalLoan = topupPreview ? topupPreview.total_loan : (Number(topupEmi) * Number(topupTenure))
        const newTotalInterest = topupPreview ? topupPreview.total_interest : Math.max(0, newTotalLoan - topupAmt)
        const newPerInstallmentInterest = Math.max(0, newTotalInterest / Number(topupTenure))

        const newLoan: Loan = {
          loan_account_no: newLoanAccountNo,
          customer_id: loan.customer_id,
          member_name_cache: loan.member_name_cache || loan.member_name,
          member_name: loan.member_name_cache || loan.member_name,
          branch_code: loan.branch_code,
          fo_name: loan.fo_name,
          bm_name: loan.bm_name,
          state: loan.state || '',
          district: loan.district || '',
          case_id: loan.case_id || '',
          product_type: loan.product_type || 'Individual Loan (IL)',
          frequency: loan.frequency,
          loan_amount: topupAmt,
          file_charge_pct: Number(topupFeePct) || 2,
          file_charge: fee,
          net_disbursement: netDisbursed,
          interest_rate: Number(topupRate),
          tenure: Number(topupTenure),
          installment_amount: Number(topupEmi),
          total_interest: newTotalInterest,
          total_loan: newTotalLoan,
          per_installment_interest: newPerInstallmentInterest,
          disbursement_date: topupDate,
          installment_start_date: topupStartDate || topupDate,
          penalty_per_day: loan.penalty_per_day || 0,
          repayment_mode: loan.repayment_mode || 'Cash Collection',
          status: 'ACTIVE',
          disbursed: true,
          close_date: null,
          closure_amount: null,
          closure_type: null,
          imported: false,
          total_collected: 0,
          ledger_balance: newTotalLoan,
          npa_flag: false,
          dpd: 0,
          created_at: new Date().toISOString(),
          created_by: user?.email || 'system',
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'system',
        }

        const newSchedule = generateSchedule(newLoan)
        await putOne('loans', newLoan, 'loan_account_no')
        await putMany('schedule', newSchedule, 'id')

        await logAuditEvent({
          event_type: 'LOAN_SANCTIONED',
          entity_type: 'LOAN',
          entity_id: newLoanAccountNo,
          actor_email: user?.email || 'system',
          actor_name: user?.name || 'Staff',
          actor_role: user?.role || 'staff',
          branch_code: loan.branch_code,
          narration: `Refinance Top-Up Sanctioned: New Loan ${newLoanAccountNo} issued for ${inr(topupAmt)} (Old Loan ${loan.loan_account_no} settled for ${inr(currentOutstanding)}, Net payout: ${inr(netDisbursed)})`,
        })

        // Generate NOC for old loan and Sanction letter for new loan
        generateForeclosureNoc({
          certificate_no: 'NOC-REF-' + loan.loan_account_no,
          issue_date: topupDate,
          loan_account_no: loan.loan_account_no,
          member_name: loan.member_name_cache || loan.member_name,
          customer_id: loan.customer_id,
          father_husband_name: member?.father_husband_name || '',
          address: member?.village_city || '',
          branch_code: loan.branch_code,
          loan_amount: loan.loan_amount,
          disbursement_date: loan.disbursement_date,
          close_date: topupDate,
          total_paid: loan.total_collected || loan.total_loan,
          status: 'CLOSED (REFINANCED)',
        })

        generateSanctionLetter({
          loan_account_no: newLoan.loan_account_no,
          member_name: newLoan.member_name,
          customer_id: newLoan.customer_id,
          mobile: member?.mobile || '',
          father_husband_name: member?.father_husband_name || '',
          address: member ? `${member.address_current || ''}, ${member.village_city || ''}` : '',
          branch_code: newLoan.branch_code,
          loan_amount: newLoan.loan_amount,
          net_disbursement: newLoan.net_disbursement,
          file_charge: newLoan.file_charge,
          interest_rate: newLoan.interest_rate,
          tenure: newLoan.tenure,
          frequency: newLoan.frequency,
          installment_amount: newLoan.installment_amount,
          disbursement_date: newLoan.disbursement_date,
          installment_start_date: newLoan.installment_start_date,
          product_type: newLoan.product_type,
        })

        toast.success('Top-Up & New Loan Created', `New loan ${newLoanAccountNo} created. Navigating to new loan account…`)
        router.push(`/loans/${newLoanAccountNo}`)
      } catch (err: any) {
        toast.error('Top-Up Failed', err.message || 'Could not process topup')
      } finally {
        setTopupLoading(false)
      }
    } else {
      // In-Place Top-Up
      const ok = await confirmAction({
        title: 'Confirm In-Place Top-Up',
        message: `Issue In-Place Top-Up of ${inr(topupAmt)} to Loan ${loan.loan_account_no}? Total principal balance will increase to ${inr(currentOutstanding + topupAmt)}.`,
        confirmText: 'Confirm Top-Up',
        variant: 'warning',
      })
      if (!ok) return
      setTopupLoading(true)
      try {
        const topupTxn: Transaction = {
          txn_id: Date.now(),
          loan_account_no: id,
          amount: topupAmt,
          txn_date: topupDate,
          mode: 'Cash / Bank Transfer',
          reference_no: 'TOP-' + Date.now(),
          remarks: 'Incremental Top-Up Disbursement',
          installment_no: null,
          txn_type: 'DISBURSEMENT',
          classification: 'Top-Up Disbursement',
          created_at: new Date().toISOString(),
          entered_by: user?.email || 'system',
          voided: false,
        }
        await putOne('transactions', topupTxn, 'txn_id')

        loan.loan_amount = (loan.loan_amount || 0) + topupAmt
        loan.updated_at = new Date().toISOString()
        await putOne('loans', loan, 'loan_account_no')
        await recalcLoanLedger(id)

        await logAuditEvent({
          event_type: 'LOAN_SANCTIONED',
          entity_type: 'LOAN',
          entity_id: loan.loan_account_no,
          actor_email: user?.email || 'system',
          actor_name: user?.name || 'Staff',
          actor_role: user?.role || 'staff',
          branch_code: loan.branch_code,
          narration: `In-Place Top-Up of ${inr(topupAmt)} disbursed on Loan ${loan.loan_account_no}`,
        })

        generateTopUpLetter({
          loan_account_no: loan.loan_account_no,
          member_name: loan.member_name_cache || loan.member_name,
          customer_id: loan.customer_id,
          father_husband_name: member?.father_husband_name || '',
          mobile: member?.mobile || '',
          address: member ? `${member.address_current || ''}, ${member.village_city || ''}` : '',
          branch_code: loan.branch_code,
          original_loan_amount: loan.loan_amount - topupAmt,
          outstanding_before_topup: currentOutstanding,
          topup_amount: topupAmt,
          new_total_outstanding: currentOutstanding + topupAmt,
          interest_rate: Number(topupRate),
          new_tenure: Number(topupTenure),
          frequency: loan.frequency,
          new_installment_amount: Number(topupEmi),
          topup_date: topupDate,
          first_emi_date: topupStartDate || topupDate,
          product_type: loan.product_type || 'Individual Loan',
        })

        toast.success('Top-Up Disbursed', `In-Place Top-Up of ${inr(topupAmt)} disbursed and Top-Up sanction letter generated!`)
        await loadLoanDetails(true)
      } catch (err: any) {
        toast.error('Top-Up Failed', err.message || 'Could not process topup')
      } finally {
        setTopupLoading(false)
      }
    }
  }

  const handleViewDoc = async (doc: LoanDocument) => {
    try {
      const path = doc.file_path || (doc.file_url && !doc.file_url.startsWith('http') ? doc.file_url : null)
      if (path) {
        const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(path)}`)
        const result = await response.json() as { url?: string; error?: string }
        if (response.ok && result.url) {
          window.open(result.url, '_blank', 'noopener,noreferrer')
          return
        }
      }
      if (doc.file_url && doc.file_url.startsWith('http')) {
        window.open(doc.file_url, '_blank', 'noopener,noreferrer')
        return
      }
      if (doc.file_data) {
        const dataUrl = `data:${doc.mime_type || 'application/pdf'};base64,${doc.file_data}`
        const win = window.open('', '_blank')
        if (win) {
          win.document.write(`<html><body style="margin:0;background:#0f172a;display:flex;items-center;justify-content:center;height:100vh;"><iframe src="${dataUrl}" style="width:100%;height:100vh;border:none;"></iframe></body></html>`)
        }
        return
      }
      toast.error('Could Not Open', 'Document file location is not accessible.')
    } catch (err: any) {
      toast.error('View Error', err.message || 'Could not open document.')
    }
  }

  const handleDownloadDoc = async (doc: LoanDocument) => {
    try {
      let downloadUrl = ''
      const path = doc.file_path || (doc.file_url && !doc.file_url.startsWith('http') ? doc.file_url : null)
      if (path) {
        const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(path)}`)
        const result = await response.json() as { url?: string; error?: string }
        if (response.ok && result.url) downloadUrl = result.url
      } else if (doc.file_url && doc.file_url.startsWith('http')) {
        downloadUrl = doc.file_url
      } else if (doc.file_data) {
        downloadUrl = `data:${doc.mime_type || 'application/octet-stream'};base64,${doc.file_data}`
      }

      if (!downloadUrl) throw new Error('File location missing for this document.')

      const res = await fetch(downloadUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = doc.file_name || `document_${doc.doc_id}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      toast.success('File Downloaded', `Successfully downloaded ${doc.file_name}`)
    } catch (err: any) {
      toast.error('Download Error', err.message || 'Could not download document.')
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

      const docRecord: LoanDocument = {
        doc_id: 'DOC-' + Date.now(),
        loan_account_no: id,
        doc_type: docType,
        file_name: docFile.name,
        file_path: uploadData.path,
        file_url: uploadData.path,
        file_size_kb: Math.round(docFile.size / 1024),
        mime_type: docFile.type || 'application/octet-stream',
        uploaded_at: new Date().toISOString(),
        uploaded_date: new Date().toISOString().slice(0, 10),
        uploaded_by: user?.email || 'system',
      }

      await putOne('loan_documents', docRecord, 'doc_id')
      await putOne('documents', docRecord, 'doc_id')

      setDocFile(null)
      setDocuments(prev => [docRecord, ...prev])
      toast.success('Document Uploaded', 'Document uploaded to Vault successfully!')
    } catch (err: any) {
      toast.error('Upload Error', `Upload error: ${err.message || 'Failed'}`)
    } finally {
      setDocUploading(false)
    }
  }

  const handleDeleteDoc = async (doc: LoanDocument) => {
    const ok = await confirmAction({
      title: 'Confirm Delete',
      message: `Delete document "${doc.file_name}"? It will be safely moved to Trash Can where it can be restored anytime.`,
      confirmText: 'Delete Document',
      variant: 'danger',
    })
    if (!ok) return
    const { moveToTrash } = await import('@/lib/trash')
    await moveToTrash('loan_documents', doc.doc_id, doc, doc.file_name || doc.doc_id, user?.email || 'system')
    await delOne('documents', doc.doc_id)
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

      await logAuditEvent({
        event_type: 'PAYMENT_DELETED',
        entity_type: 'TRANSACTION',
        entity_id: `REC-${txn.txn_id}`,
        actor_email: user?.email || 'system',
        actor_name: user?.name || 'Staff',
        actor_role: user?.role || 'staff',
        branch_code: loan?.branch_code || '',
        narration: `Deleted transaction REC-${txn.txn_id} (${inr(txn.amount)}) for ${loan?.loan_account_no}`,
      })

      toast.success('Transaction Deleted', 'Transaction deleted and loan ledger recalculated successfully.')
      await loadLoanDetails(true)
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
      advance_balance: loan.advance_balance || 0,
      arrears_balance: loan.arrears_balance || 0,
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
        classification: t.classification || t.payment_category || 'Payment',
        principal_component: t.principal_component,
        interest_component: t.interest_component,
        advance_component: t.advance_component,
        shortage_amount: t.shortage_amount,
        narration: t.narration || t.remarks || '',
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
      { key: 'foreclose' as TabType, label: 'Foreclose', icon: ShieldCheck },
      { key: 'ots' as TabType, label: 'OTS Settlement', icon: Handshake },
    ] : []),
    { key: 'documents', label: `Docs (${documents.length})`, icon: Paperclip },
    { key: 'audit' as TabType, label: `Audit Trail (${auditLogs.length})`, icon: FileText },
  ]

  function Receipt({ className }: { className?: string }) {
    return <DollarSign className={className} />
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Loans
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => generateSanctionLetter({
              loan_account_no: loan.loan_account_no,
              member_name: loan.member_name_cache || loan.member_name,
              customer_id: loan.customer_id,
              mobile: member?.mobile || '',
              father_husband_name: member?.father_husband_name || '',
              address: member ? `${member.address_current || ''}, ${member.village_city || ''}` : '',
              branch_code: loan.branch_code,
              loan_amount: loan.loan_amount,
              net_disbursement: loan.net_disbursement,
              file_charge: loan.file_charge,
              interest_rate: loan.interest_rate,
              tenure: loan.tenure,
              frequency: loan.frequency,
              installment_amount: loan.installment_amount,
              disbursement_date: loan.disbursement_date,
              installment_start_date: loan.installment_start_date,
              product_type: loan.product_type,
              penalty_per_day: loan.penalty_per_day,
              fo_name: loan.fo_name || member?.fo_name,
              bm_name: loan.bm_name || member?.bm_name,
              district: loan.district || member?.district,
              state: loan.state || member?.state,
              schedule: schedule.map(s => ({
                installment_no: s.installment_no,
                due_date: s.due_date,
                opening_balance: s.opening_balance,
                principal_due: s.principal_due,
                interest_due: s.interest_due,
                emi_due: s.emi_due,
                closing_balance: s.closing_balance,
              })),
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
              <div><span className="text-slate-400 block font-semibold uppercase tracking-wider mb-0.5">Branch Name / FO</span><span className="text-slate-700 font-medium">{loan.branch_code} / {loan.fo_name}</span></div>
              {(() => {
                const bpi = computeBrokenPeriodInterest({
                  loan_amount: loan.loan_amount,
                  interest_rate: loan.interest_rate,
                  disbursement_date: loan.disbursement_date,
                  installment_start_date: loan.installment_start_date || loan.disbursement_date,
                  frequency: loan.frequency,
                })
                if (bpi.broken_days <= 0) return null
                return (
                  <div className="col-span-2 md:col-span-4 bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5 flex items-center justify-between text-xs text-amber-900 mt-1">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span><strong>Broken Period:</strong> {bpi.broken_days} odd days between disbursal ({fdate(loan.disbursement_date)}) and 1st installment ({fdate(loan.installment_start_date)})</span>
                    </div>
                    <span className="font-bold text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-300">
                      Interest: {inr(bpi.broken_interest)}
                    </span>
                  </div>
                )
              })()}
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

                {allocPreview && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Accounting Allocation</span>
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        allocPreview.category === 'SHORT' ? 'bg-amber-100 text-amber-800' :
                        allocPreview.category === 'EXCESS' || allocPreview.category === 'ADVANCE' ? 'bg-blue-100 text-blue-800' :
                        allocPreview.category === 'OVERDUE_CLEARANCE' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {allocPreview.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2 rounded-lg border border-slate-100">
                      <div>Principal: <strong className="text-slate-800">{inr(allocPreview.principal_component)}</strong></div>
                      <div>Interest: <strong className="text-slate-800">{inr(allocPreview.interest_component)}</strong></div>
                      {allocPreview.advance_component > 0 && (
                        <div className="col-span-2 text-blue-600 font-semibold">Advance Wallet: +{inr(allocPreview.advance_component)}</div>
                      )}
                      {allocPreview.shortage_amount > 0 && (
                        <div className="col-span-2 text-red-600 font-semibold">Shortage (Arrears): {inr(allocPreview.shortage_amount)}</div>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-500 italic leading-relaxed">{allocPreview.narration}</p>
                  </div>
                )}

                {postMessage && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl space-y-2">
                    <div className="text-xs font-bold flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle className="w-4 h-4 text-emerald-600" /> {postMessage}
                    </div>
                    {lastPostedTxn && (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => generatePaymentReceipt({
                            receipt_no: lastPostedTxn.receipt_no,
                            txn_date: fdate(lastPostedTxn.txn_date),
                            loan_account_no: loan.loan_account_no,
                            member_name: loan.member_name_cache || loan.member_name,
                            customer_id: loan.customer_id,
                            branch_code: loan.branch_code,
                            amount: lastPostedTxn.amount,
                            mode: lastPostedTxn.mode || 'Cash',
                            reference_no: lastPostedTxn.reference_no || '',
                            remaining_outstanding: loan.ledger_balance,
                            entered_by: user?.name || user?.email || 'Staff',
                            payment_category: lastPostedTxn.alloc?.category,
                            classification: lastPostedTxn.alloc?.label,
                            principal_paid: lastPostedTxn.alloc?.principal_component,
                            interest_paid: lastPostedTxn.alloc?.interest_component,
                            penal_paid: lastPostedTxn.alloc?.penal_component,
                            advance_paid: lastPostedTxn.alloc?.advance_component,
                            shortage_amount: lastPostedTxn.alloc?.shortage_amount,
                            advance_wallet_balance: loan.advance_balance,
                            arrears_balance: loan.arrears_balance,
                            next_due_date: lastPostedTxn.alloc?.next_due_date,
                            next_due_amount: lastPostedTxn.alloc?.next_due_amount,
                            narration: lastPostedTxn.alloc?.narration,
                          })}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 shadow-sm"
                        >
                          <Printer className="w-3.5 h-3.5" /> A4 Receipt
                        </button>
                        <button
                          type="button"
                          onClick={() => generateThermalPaymentReceipt({
                            receipt_no: lastPostedTxn.receipt_no,
                            txn_date: fdate(lastPostedTxn.txn_date),
                            loan_account_no: loan.loan_account_no,
                            member_name: loan.member_name_cache || loan.member_name,
                            customer_id: loan.customer_id,
                            branch_code: loan.branch_code,
                            amount: lastPostedTxn.amount,
                            mode: lastPostedTxn.mode || 'Cash',
                            reference_no: lastPostedTxn.reference_no || '',
                            remaining_outstanding: loan.ledger_balance,
                            entered_by: user?.name || user?.email || 'Staff',
                            payment_category: lastPostedTxn.alloc?.category,
                            classification: lastPostedTxn.alloc?.label,
                            principal_paid: lastPostedTxn.alloc?.principal_component,
                            interest_paid: lastPostedTxn.alloc?.interest_component,
                            penal_paid: lastPostedTxn.alloc?.penal_component,
                            advance_paid: lastPostedTxn.alloc?.advance_component,
                            shortage_amount: lastPostedTxn.alloc?.shortage_amount,
                            advance_wallet_balance: loan.advance_balance,
                            arrears_balance: loan.arrears_balance,
                            next_due_date: lastPostedTxn.alloc?.next_due_date,
                            next_due_amount: lastPostedTxn.alloc?.next_due_amount,
                            narration: lastPostedTxn.alloc?.narration,
                          })}
                          className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 shadow-sm"
                        >
                          <Smartphone className="w-3.5 h-3.5" /> Thermal POS
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button type="submit" disabled={postLoading}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-emerald-500/10">
                  {postLoading ? 'Processing…' : 'Confirm Repayment Collection'}
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
        <div className="xl:col-span-2 space-y-6 tab-transition">
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
                    <Icon className="w-3.5 h-3.5" />
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
                        <th className="text-left px-3 py-2 font-semibold">Category</th>
                        <th className="text-right px-3 py-2 font-semibold">Amount</th>
                        <th className="text-left px-3 py-2 font-semibold">Breakdown (P/I)</th>
                        <th className="text-left px-3 py-2 font-semibold">Mode / Ref</th>
                        <th className="text-left px-3 py-2 font-semibold">Narration</th>
                        <th className="text-center px-3 py-2 font-semibold">Receipts</th>
                        <th className="text-center px-3 py-2 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.map(t => {
                        const isShort = t.payment_category === 'SHORT' || (t.shortage_amount || 0) > 0
                        const isAdvance = t.payment_category === 'ADVANCE' || t.payment_category === 'EXCESS' || (t.advance_component || 0) > 0
                        const isOverdue = t.payment_category === 'OVERDUE_CLEARANCE'
                        
                        return (
                          <tr key={t.txn_id} className={`hover:bg-slate-50/50 ${t.voided ? 'line-through opacity-50' : ''}`}>
                            <td className="px-3 py-2.5 text-slate-700 font-semibold whitespace-nowrap">{fdate(t.txn_date)}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isShort ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                isAdvance ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                isOverdue ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {t.classification || t.payment_category || 'Payment'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">{inr(t.amount)}</td>
                            <td className="px-3 py-2.5 text-slate-600 text-[11px]">
                              {t.principal_component !== undefined ? (
                                <div>
                                  <span>P: {inr(t.principal_component)} | I: {inr(t.interest_component || 0)}</span>
                                  {t.advance_component ? <div className="text-blue-600 font-semibold text-[10px]">Adv: +{inr(t.advance_component)}</div> : null}
                                  {t.shortage_amount ? <div className="text-red-600 font-semibold text-[10px]">Short: {inr(t.shortage_amount)}</div> : null}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 text-[11px]">
                              <div>{t.mode || 'Cash'}</div>
                              {t.reference_no && <div className="text-[10px] text-slate-400 font-mono">{t.reference_no}</div>}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 text-[11px] max-w-[220px]">
                              <p className="line-clamp-2" title={t.narration || t.remarks}>{t.narration || t.remarks || '—'}</p>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => generatePaymentReceipt({
                                    receipt_no: 'REC-' + t.txn_id,
                                    txn_date: fdate(t.txn_date),
                                    loan_account_no: loan.loan_account_no,
                                    member_name: loan.member_name_cache || loan.member_name,
                                    customer_id: loan.customer_id,
                                    branch_code: loan.branch_code,
                                    amount: t.amount,
                                    mode: t.mode || 'Cash',
                                    reference_no: t.reference_no || '',
                                    remaining_outstanding: loan.ledger_balance,
                                    entered_by: t.entered_by || 'Staff',
                                    payment_category: t.payment_category,
                                    classification: t.classification,
                                    principal_paid: t.principal_component,
                                    interest_paid: t.interest_component,
                                    penal_paid: t.penal_component,
                                    advance_paid: t.advance_component,
                                    shortage_amount: t.shortage_amount,
                                    advance_wallet_balance: loan.advance_balance,
                                    arrears_balance: loan.arrears_balance,
                                    narration: t.narration || t.remarks,
                                  })}
                                  title="Print Standard A4 Receipt"
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded flex items-center gap-1 transition"
                                >
                                  <Printer className="w-3 h-3" /> A4
                                </button>
                                <button
                                  onClick={() => generateThermalPaymentReceipt({
                                    receipt_no: 'REC-' + t.txn_id,
                                    txn_date: fdate(t.txn_date),
                                    loan_account_no: loan.loan_account_no,
                                    member_name: loan.member_name_cache || loan.member_name,
                                    customer_id: loan.customer_id,
                                    branch_code: loan.branch_code,
                                    amount: t.amount,
                                    mode: t.mode || 'Cash',
                                    reference_no: t.reference_no || '',
                                    remaining_outstanding: loan.ledger_balance,
                                    entered_by: t.entered_by || 'Staff',
                                    payment_category: t.payment_category,
                                    classification: t.classification,
                                    principal_paid: t.principal_component,
                                    interest_paid: t.interest_component,
                                    penal_paid: t.penal_component,
                                    advance_paid: t.advance_component,
                                    shortage_amount: t.shortage_amount,
                                    advance_wallet_balance: loan.advance_balance,
                                    arrears_balance: loan.arrears_balance,
                                    narration: t.narration || t.remarks,
                                  })}
                                  title="Print 80mm Bluetooth Thermal Slip"
                                  className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold rounded flex items-center gap-1 transition border border-blue-200"
                                >
                                  <Smartphone className="w-3 h-3" /> POS
                                </button>
                              </div>
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
                        )
                      })}
                      {transactions.length === 0 && (
                        <tr><td colSpan={8} className="text-center py-8 text-slate-400">No transactions recorded yet</td></tr>
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
                    <span className="text-xs text-emerald-600 font-semibold">(All fields, financial terms & dates fully editable)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Member Name</label>
                      <input type="text" value={editForm.member_name || ''} onChange={e => setEditForm(p => ({ ...p, member_name: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Type</label>
                      <select value={editForm.product_type || 'Individual Loan'} onChange={e => setEditForm(p => ({ ...p, product_type: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="Individual Loan">Individual Loan</option>
                        <option value="Group Loan">Group Loan</option>
                        <option value="Business Loan">Business Loan</option>
                        <option value="Personal Loan">Personal Loan</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Status</label>
                      <select value={editForm.status || 'ACTIVE'} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold">
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Disbursement Date *</label>
                      <input type="date" value={editForm.disbursement_date || ''} onChange={e => setEditForm(p => ({ ...p, disbursement_date: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">First Installment Date (1st EMI) *</label>
                      <input type="date" value={editForm.installment_start_date || ''} onChange={e => setEditForm(p => ({ ...p, installment_start_date: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-blue-700" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Repayment Frequency</label>
                      <select value={editForm.frequency || 'Weekly'} onChange={e => setEditForm(p => ({ ...p, frequency: e.target.value as any }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="Weekly">Weekly</option>
                        <option value="Bi-Monthly">Bi-Monthly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Daily">Daily</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Amount (₹)</label>
                      <input type="number" value={editForm.loan_amount ?? ''} onChange={e => setEditForm(p => ({ ...p, loan_amount: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-semibold" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Disbursement (₹)</label>
                      <input type="number" value={editForm.net_disbursement ?? ''} onChange={e => setEditForm(p => ({ ...p, net_disbursement: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">File Charge / Processing Fee (₹)</label>
                      <input type="number" value={editForm.file_charge ?? ''} onChange={e => setEditForm(p => ({ ...p, file_charge: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Interest Rate (% p.a.)</label>
                      <input type="number" step="0.01" value={editForm.interest_rate ?? ''} onChange={e => setEditForm(p => ({ ...p, interest_rate: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tenure (Total Installments)</label>
                      <input type="number" value={editForm.tenure ?? ''} onChange={e => setEditForm(p => ({ ...p, tenure: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-semibold" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">EMI Amount (₹)</label>
                      <input type="number" value={editForm.installment_amount ?? ''} onChange={e => setEditForm(p => ({ ...p, installment_amount: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold text-blue-700" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Branch Code</label>
                      <input type="text" value={editForm.branch_code || ''} onChange={e => setEditForm(p => ({ ...p, branch_code: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Branch Manager Name</label>
                      <input type="text" value={editForm.bm_name || ''} onChange={e => setEditForm(p => ({ ...p, bm_name: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Field Officer Name</label>
                      <input type="text" value={editForm.fo_name || ''} onChange={e => setEditForm(p => ({ ...p, fo_name: e.target.value }))}
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
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-800">
                    <strong>Note:</strong> Modifying the <strong>First Installment Date</strong> or financial terms (amount, tenure, EMI) will automatically re-calculate and update all repayment schedule due dates accordingly.
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
                    <p><strong>How Restructuring Works:</strong></p>
                    <p>All pending/overdue schedule rows are marked as <em>Restructured</em>. A new repayment schedule is generated starting from the restructure date. A legal Restructure Addendum & Agreement is automatically generated.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outstanding / New Principal (₹) *</label>
                      <input
                        type="number"
                        value={rstNewAmount}
                        onChange={e => {
                          const val = e.target.value
                          setRstNewAmount(val)
                          const amt = Number(val) || 0
                          const rate = Number(rstNewRate) || 0
                          const term = Number(rstNewTenure) || 1
                          const freq = loan?.frequency || 'Monthly'
                          const periodsPerYear = FREQ_PER_YEAR[freq] || 12
                          const tenureYears = term / periodsPerYear
                          const totalInterest = amt * (rate / 100) * tenureYears
                          const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0
                          if (emi > 0) setRstNewEmi(String(emi))
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Tenure ({loan?.frequency || 'Monthly'} Installments) *</label>
                      <input
                        type="number"
                        value={rstNewTenure}
                        onChange={e => {
                          const val = e.target.value
                          setRstNewTenure(val)
                          const term = Number(val) || 1
                          const amt = Number(rstNewAmount) || 0
                          const rate = Number(rstNewRate) || 0
                          const freq = loan?.frequency || 'Monthly'
                          const periodsPerYear = FREQ_PER_YEAR[freq] || 12
                          const tenureYears = term / periodsPerYear
                          const totalInterest = amt * (rate / 100) * tenureYears
                          const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0
                          if (emi > 0) setRstNewEmi(String(emi))
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Flat Interest Rate (% p.a.)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={rstNewRate}
                        onChange={e => {
                          const val = e.target.value
                          setRstNewRate(val)
                          const rate = Number(val) || 0
                          const amt = Number(rstNewAmount) || 0
                          const term = Number(rstNewTenure) || 1
                          const freq = loan?.frequency || 'Monthly'
                          const periodsPerYear = FREQ_PER_YEAR[freq] || 12
                          const tenureYears = term / periodsPerYear
                          const totalInterest = amt * (rate / 100) * tenureYears
                          const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0
                          setRstNewEmi(emi > 0 ? String(emi) : '')
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Installment / EMI (₹) — 2-way live sync</label>
                      <input
                        type="number"
                        value={rstNewEmi}
                        onChange={e => {
                          const val = e.target.value
                          setRstNewEmi(val)
                          const emi = Number(val) || 0
                          const amt = Number(rstNewAmount) || 0
                          const term = Number(rstNewTenure) || 1
                          const freq = loan?.frequency || 'Monthly'
                          const periodsPerYear = FREQ_PER_YEAR[freq] || 12
                          const tenureYears = term / periodsPerYear
                          const totalLoan = emi * term
                          const totalInterest = Math.max(0, totalLoan - amt)
                          const rate = tenureYears > 0 && amt > 0 ? ((totalInterest / amt) / tenureYears) * 100 : 0
                          setRstNewRate(rate > 0 ? rate.toFixed(2) : '0')
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Restructure / 1st EMI Date *</label>
                      <input
                        type="date"
                        value={rstStartDate}
                        onChange={e => setRstStartDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  {rstPreview && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2 text-xs text-purple-900">
                      <p className="font-bold">Restructure Preview:</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white p-2.5 rounded-lg border border-purple-100"><span className="text-[10px] text-slate-400 block font-bold uppercase">New EMI</span><span className="font-bold text-sm text-purple-700">{inr(rstPreview.installment_amount)}</span></div>
                        <div className="bg-white p-2.5 rounded-lg border border-purple-100"><span className="text-[10px] text-slate-400 block font-bold uppercase">Total Repayable</span><span className="font-bold text-sm text-slate-800">{inr(rstPreview.total_loan)}</span></div>
                        <div className="bg-white p-2.5 rounded-lg border border-purple-100"><span className="text-[10px] text-slate-400 block font-bold uppercase">Total Interest</span><span className="font-bold text-sm text-slate-800">{inr(rstPreview.total_interest)}</span></div>
                        <div className="bg-white p-2.5 rounded-lg border border-purple-100"><span className="text-[10px] text-slate-400 block font-bold uppercase">Interest Rate</span><span className="font-bold text-sm text-purple-700">{rstNewRate}% p.a.</span></div>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleRestructure}
                    disabled={rstLoading || !rstPreview}
                    className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition"
                  >
                    <RefreshCw className="w-4 h-4" /> {rstLoading ? 'Processing…' : 'Confirm Restructure & Generate Addendum'}
                  </button>
                </div>
              )}

              {/* TAB: Top-Up */}
              {activeTab === 'topup' && !isClosed && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-slate-800">Top-Up Loan Facility</h3>
                  </div>

                  {/* Top-up Method Switcher */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTopupMethod('REFINANCE_NEW_LOAN')}
                      className={`p-3.5 rounded-xl border text-left transition ${
                        topupMethod === 'REFINANCE_NEW_LOAN'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold text-xs">Refinance & New Loan (Recommended)</div>
                      <div className="text-[11px] text-slate-500 mt-1">Closes current loan (deducts old balance) and creates a fresh Top-Up loan account with Sanction Letter & NOC.</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTopupMethod('IN_PLACE')}
                      className={`p-3.5 rounded-xl border text-left transition ${
                        topupMethod === 'IN_PLACE'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold text-xs">In-Place Supplemental Top-Up</div>
                      <div className="text-[11px] text-slate-500 mt-1">Keeps the same loan account number and disburses incremental capital directly into the active ledger.</div>
                    </button>
                  </div>

                  {/* Top-up 2-way Form */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {topupMethod === 'REFINANCE_NEW_LOAN' ? 'New Total Sanction (₹) *' : 'Incremental Top-Up Amount (₹) *'}
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 40000"
                        value={topupAmount}
                        onChange={e => {
                          const val = e.target.value
                          setTopupAmount(val)
                          const amt = Number(val) || 0
                          const pct = Number(topupFeePct) || 0
                          setTopupFee(String(Math.round(amt * (pct / 100))))
                          const rate = Number(topupRate) || 0
                          const term = Number(topupTenure) || 1
                          const freq = loan?.frequency || 'Monthly'
                          const periodsPerYear = FREQ_PER_YEAR[freq] || 12
                          const tenureYears = term / periodsPerYear
                          const totalInterest = amt * (rate / 100) * tenureYears
                          const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0
                          if (emi > 0) setTopupEmi(String(emi))
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tenure ({loan?.frequency || 'Monthly'} Installments) *</label>
                      <input
                        type="number"
                        value={topupTenure}
                        onChange={e => {
                          const val = e.target.value
                          setTopupTenure(val)
                          const term = Number(val) || 1
                          const amt = Number(topupAmount) || 0
                          const rate = Number(topupRate) || 0
                          const freq = loan?.frequency || 'Monthly'
                          const periodsPerYear = FREQ_PER_YEAR[freq] || 12
                          const tenureYears = term / periodsPerYear
                          const totalInterest = amt * (rate / 100) * tenureYears
                          const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0
                          if (emi > 0) setTopupEmi(String(emi))
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Flat Interest Rate (% p.a.)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={topupRate}
                        onChange={e => {
                          const val = e.target.value
                          setTopupRate(val)
                          const rate = Number(val) || 0
                          const amt = Number(topupAmount) || 0
                          const term = Number(topupTenure) || 1
                          const freq = loan?.frequency || 'Monthly'
                          const periodsPerYear = FREQ_PER_YEAR[freq] || 12
                          const tenureYears = term / periodsPerYear
                          const totalInterest = amt * (rate / 100) * tenureYears
                          const emi = term > 0 ? Math.round((amt + totalInterest) / term) : 0
                          setTopupEmi(emi > 0 ? String(emi) : '')
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Installment / EMI (₹) — 2-way sync</label>
                      <input
                        type="number"
                        value={topupEmi}
                        onChange={e => {
                          const val = e.target.value
                          setTopupEmi(val)
                          const emi = Number(val) || 0
                          const amt = Number(topupAmount) || 0
                          const term = Number(topupTenure) || 1
                          const freq = loan?.frequency || 'Monthly'
                          const periodsPerYear = FREQ_PER_YEAR[freq] || 12
                          const tenureYears = term / periodsPerYear
                          const totalLoan = emi * term
                          const totalInterest = Math.max(0, totalLoan - amt)
                          const rate = tenureYears > 0 && amt > 0 ? ((totalInterest / amt) / tenureYears) * 100 : 0
                          setTopupRate(rate > 0 ? rate.toFixed(2) : '0')
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Processing Fee (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={topupFeePct}
                        onChange={e => {
                          const val = e.target.value
                          setTopupFeePct(val)
                          const pct = Number(val) || 0
                          const amt = Number(topupAmount) || 0
                          setTopupFee(String(Math.round(amt * (pct / 100))))
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Processing Fee (₹) — 2-way sync</label>
                      <input
                        type="number"
                        value={topupFee}
                        onChange={e => {
                          const val = e.target.value
                          setTopupFee(val)
                          const fee = Number(val) || 0
                          const amt = Number(topupAmount) || 0
                          const pct = amt > 0 ? ((fee / amt) * 100).toFixed(2) : '0'
                          setTopupFeePct(pct)
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top-Up Disbursal Date *</label>
                      <input
                        type="date"
                        value={topupDate}
                        onChange={e => setTopupDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">1st Installment Date *</label>
                      <input
                        type="date"
                        value={topupStartDate}
                        onChange={e => setTopupStartDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Top-up Financial Summary & Net Cash Breakdown */}
                  {topupAmount && Number(topupAmount) > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-3 text-xs text-emerald-950">
                      <div className="font-bold flex items-center justify-between">
                        <span>Top-Up Economics Breakdown</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-200/60 rounded text-emerald-800">
                          {topupMethod === 'REFINANCE_NEW_LOAN' ? 'Refinance Mode' : 'In-Place Mode'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                        <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                          <span className="text-[10px] text-slate-400 block font-bold uppercase font-sans">Sanction Amount</span>
                          <span className="font-bold text-sm text-slate-800">{inr(Number(topupAmount))}</span>
                        </div>

                        {topupMethod === 'REFINANCE_NEW_LOAN' && (
                          <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase font-sans">Old Loan Payoff</span>
                            <span className="font-bold text-sm text-red-600">- {inr(loan.ledger_balance || 0)}</span>
                          </div>
                        )}

                        <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                          <span className="text-[10px] text-slate-400 block font-bold uppercase font-sans">Processing Fee</span>
                          <span className="font-bold text-sm text-slate-600">- {inr(Number(topupFee))}</span>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-emerald-200 bg-emerald-100/50">
                          <span className="text-[10px] text-emerald-700 block font-bold uppercase font-sans">Net Cash to Borrower</span>
                          <span className="font-bold text-sm text-emerald-700">
                            {inr(
                              topupMethod === 'REFINANCE_NEW_LOAN'
                                ? Math.max(0, Number(topupAmount) - (loan.ledger_balance || 0) - Number(topupFee))
                                : Math.max(0, Number(topupAmount) - Number(topupFee))
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-[11px] pt-1 text-emerald-800 border-t border-emerald-200/50">
                        <span>New EMI: <strong>{inr(Number(topupEmi))}</strong> × {topupTenure} {loan?.frequency || 'Monthly'} installments</span>
                        <span>Rate: <strong>{topupRate}% p.a.</strong></span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleTopUp}
                    disabled={topupLoading || !topupAmount || Number(topupAmount) <= 0}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition"
                  >
                    <TrendingUp className="w-4 h-4" /> {topupLoading ? 'Processing…' : topupMethod === 'REFINANCE_NEW_LOAN' ? 'Confirm Refinance Top-Up & Sanction New Loan' : 'Disburse In-Place Top-Up'}
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

              {/* TAB: One-Time Settlement (OTS) */}
              {activeTab === 'ots' && !isClosed && (
                <div className="space-y-5">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 mb-1">
                      <Handshake className="w-4 h-4 text-emerald-700" />
                      One-Time Settlement (OTS) & Loan Waiver Module
                    </div>
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      For distressed or non-performing accounts, specify the approved concessions/waivers on interest and penal charges. Approving the settlement will permanently close the account with zero remaining dues and generate an official OTS Sanction Letter & No Dues Certificate.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 border border-slate-200/60 rounded-xl text-xs">
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase mb-1">Total Outstanding</span>
                      <span className="text-lg font-bold text-slate-800">{inr(loan.ledger_balance || 0)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase mb-1">Overdue Arrears</span>
                      <span className="text-lg font-bold text-red-600">{inr(loan.arrears_balance || 0)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase mb-1">Advance Wallet</span>
                      <span className="text-lg font-bold text-blue-600">{inr(loan.advance_balance || 0)}</span>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Settlement & Concession Terms</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Agreed Settlement Amount (₹) *</label>
                        <input
                          type="number"
                          value={otsPayoff}
                          onChange={e => setOtsPayoff(e.target.value)}
                          placeholder="e.g. 15000"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Interest Waived (₹)</label>
                        <input
                          type="number"
                          value={otsInterestWaived}
                          onChange={e => setOtsInterestWaived(e.target.value)}
                          placeholder="e.g. 2000"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-red-700 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Penal Charges Waived (₹)</label>
                        <input
                          type="number"
                          value={otsPenalWaived}
                          onChange={e => setOtsPenalWaived(e.target.value)}
                          placeholder="e.g. 500"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-red-700 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Settlement Date</label>
                        <input
                          type="date"
                          value={otsDate}
                          onChange={e => setOtsDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Approved By / Sanctioning Authority</label>
                        <input
                          type="text"
                          value={otsApprovedBy}
                          onChange={e => setOtsApprovedBy(e.target.value)}
                          placeholder="e.g. Credit Committee / Managing Director"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Management Approval Remarks</label>
                      <textarea
                        value={otsRemarks}
                        onChange={e => setOtsRemarks(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={handleProcessOTS}
                      disabled={otsLoading || !otsPayoff || Number(otsPayoff) <= 0}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-600/10"
                    >
                      <Handshake className="w-4 h-4" />
                      {otsLoading ? 'Processing OTS Settlement…' : `Approve OTS Settlement (${inr(Number(otsPayoff) || 0)}) & Issue NOC`}
                    </button>
                  </div>
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
                          <option value="Excel Spreadsheet">Excel / CSV Spreadsheet (.xlsx, .xls, .csv)</option>
                          <option value="Insurance">Insurance</option>
                          <option value="Income Proof">Income Proof</option>
                          <option value="Address Proof">Address Proof</option>
                          <option value="Bank Statement">Bank Statement</option>
                          <option value="Guarantor KYC">Guarantor KYC</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select File (PDF, Excel, Word, Image)</label>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.csv,.doc,.docx,.txt,.zip"
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
                      <p className="text-xs mt-1">Upload KYC, agreements, excel spreadsheets, and other documents</p>
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
                              <p className="text-[10px] text-slate-400 mt-0.5">{doc.doc_type} · {new Date(doc.uploaded_at || doc.uploaded_date || Date.now()).toLocaleDateString('en-IN')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleViewDoc(doc)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-bold rounded-lg flex items-center gap-1 transition">
                              <Eye className="w-3 h-3" /> View
                            </button>
                            <button onClick={() => handleDownloadDoc(doc)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[10px] font-bold rounded-lg flex items-center gap-1 transition">
                              <Download className="w-3 h-3" /> Download
                            </button>
                            <button onClick={() => handleDeleteDoc(doc)}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold rounded-lg flex items-center gap-1 transition">
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
