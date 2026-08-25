'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { getAll } from '@/lib/supabase'
import { applyPayment } from '@/lib/calculations'
import { toast } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import type { Loan, ScheduleRow } from '@/lib/types'
import { inr, todayISO, fdate } from '@/lib/utils'
import { generatePaymentReceipt, generateThermalPaymentReceipt } from '@/lib/document-generator'
import {
  Calendar, Search, Save, CheckCircle, AlertCircle, Sparkles,
  Upload, Download, Printer, FileText, Table2, RefreshCw, Smartphone
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

function getMeetingDay(dateStr?: string): string {
  if (!dateStr) return '—'
  const parts = dateStr.slice(0, 10).split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return '—'
  const [y, m, d] = parts
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

interface CollectionEntry {
  loan: Loan
  meetingDay: string
  frequency: string
  totalTenure: number
  paidEmis: number
  pendingEmis: number
  todayEmi: number
  totalOverdue: number
  totalDue: number
  collectedAmount: string
  mode: string
  referenceNo: string
}

type Tab = 'sheet' | 'individual' | 'csv_upload' | 'field_printout'

interface EmiEntry {
  loan: Loan
  rows: ScheduleRow[]           // grouped EMI rows for this loan
  totalBalance: number          // sum of balances across all due EMIs
  emiCount: number              // how many EMIs are due
  firstDueDate: string
  lastEmiNo: number
  collectAmt: string
  mode: string
  ref: string
  status: 'pending' | 'saving' | 'success' | 'error'
  lastTxnId?: number
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
interface CSVRow {
  loan_account_no: string
  amount: string
  txn_date: string
  mode: string
  reference_no: string
  remarks: string
  status?: 'pending' | 'success' | 'error'
  error?: string
}

function parseCSV(text: string): CSVRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim())
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = vals[i] || '' })
    return {
      loan_account_no: row['loan_account_no'] || row['loanaccountno'] || '',
      amount: row['amount'] || '',
      txn_date: row['txn_date'] || row['txndate'] || row['date'] || todayISO(),
      mode: row['mode'] || 'Cash',
      reference_no: row['reference_no'] || row['referenceno'] || row['ref'] || '',
      remarks: row['remarks'] || '',
      status: 'pending' as const
    }
  }).filter(r => r.loan_account_no && r.amount)
}

function downloadSampleCSV() {
  const csv = `loan_account_no,amount,txn_date,mode,reference_no,remarks
1234567890,2500,${todayISO()},Cash,REC001,Weekly EMI
9876543210,3000,${todayISO()},UPI,UPI20240721,Weekly EMI`
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'collection_sample.csv'
  a.click()
}

// ─── Field Sheet Printout ─────────────────────────────────────────────────────
function printFieldSheet(entries: CollectionEntry[], date: string, branch: string, foName: string) {
  const pw = window.open('', '_blank', 'width=1000,height=1000')
  if (!pw) { toast.error('Popup Blocked', 'Please allow popups.'); return }
  const rows = entries.map(e => `
    <tr>
      <td>${e.loan.loan_account_no}</td>
      <td>${e.loan.member_name_cache || e.loan.member_name}</td>
      <td>${e.loan.branch_code} / ${e.loan.fo_name || '—'}</td>
      <td>${e.meetingDay}</td>
      <td>${e.frequency}</td>
      <td>${e.paidEmis} / ${e.totalTenure}</td>
      <td>${e.pendingEmis}</td>
      <td>${inr(e.totalDue || e.todayEmi)}</td>
      <td style="width:80px; border-bottom: 1px solid #ccc;"></td>
      <td style="width:90px; border-bottom: 1px solid #ccc;"></td>
      <td style="width:70px; border-bottom: 1px solid #ccc;"></td>
    </tr>`).join('')
  pw.document.write(`
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Field Collection Sheet - ${date}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 15px; }
      h2 { font-size: 15px; margin: 0 0 4px 0; }
      .info { font-size: 11px; color: #555; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0f0f0; border: 1px solid #bbb; padding: 6px 8px; text-align: left; font-size: 10px; }
      td { border: 1px solid #ddd; padding: 6px 8px; }
      .footer { margin-top: 30px; display: flex; justify-content: space-between; }
      .sig { width: 200px; border-top: 1px solid #888; padding-top: 5px; text-align: center; font-size: 11px; color: #555; }
    </style></head><body>
    <h2>AA2 MICRO FINANCE — Field Collection Sheet</h2>
    <div class="info">
      Date: <strong>${date}</strong> (${getMeetingDay(date)}) &nbsp;|&nbsp; 
      Branch: <strong>${branch || 'ALL'}</strong> &nbsp;|&nbsp;
      Field Officer: <strong>${foName || 'ALL'}</strong> &nbsp;|&nbsp;
      Total Due: <strong>${inr(entries.reduce((s, e) => s + (e.totalDue || e.todayEmi), 0))}</strong>
    </div>
    <table>
      <thead><tr>
        <th>Loan A/C</th><th>Member Name</th><th>Branch / FO</th><th>Meeting Day</th><th>Frequency</th><th>Paid / Tenor</th><th>Pending</th>
        <th>Amount Due (₹)</th><th>Collected (₹)</th><th>Mode / Ref</th><th>Sign</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      <div class="sig">Field Officer Signature</div>
      <div class="sig">Branch Manager Signature</div>
    </div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
    </body></html>`)
  pw.document.close()
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CollectionsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('sheet')
  const [date, setDate] = useState(todayISO())
  const [branch, setBranch] = useState('')
  const [foName, setFoName] = useState('')
  const [dueFilter, setDueFilter] = useState<'' | 'due' | 'overdue'>('')
  const [entries, setEntries] = useState<CollectionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  // Individual EMI tab state
  const [emiEntries, setEmiEntries] = useState<EmiEntry[]>([])
  const [emiLoading, setEmiLoading] = useState(false)

  // CSV Upload State
  const [csvRows, setCsvRows] = useState<CSVRow[]>([])
  const [csvProcessing, setCsvProcessing] = useState(false)
  const [csvDone, setCsvDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadCollectionSheet()
    const handler = () => loadCollectionSheet()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [date])



  async function loadEmiEntries() {
    setEmiLoading(true)
    try {
      const [loans, schedule] = await Promise.all([
        getAll<Loan>('loans'),
        getAll<ScheduleRow>('schedule')
      ])
      const activeLoans = loans.filter(l => l.status === 'ACTIVE' || l.status === 'SANCTIONED')
      const today = todayISO()
      const entries: EmiEntry[] = []
      for (const loan of activeLoans) {
        const bMatch = !branch || (loan.branch_code || '').toLowerCase().includes(branch.toLowerCase())
        const fMatch = !foName || (loan.fo_name || '').toLowerCase().includes(foName.toLowerCase())
        if (!bMatch || !fMatch) continue
        // Only show installments due ON OR BEFORE today
        const dueRows = schedule
          .filter(r =>
            r.loan_account_no === loan.loan_account_no &&
            (r.status === 'Pending' || r.status === 'Overdue' || r.status === 'Partial') &&
            r.due_date <= today
          )
          .sort((a, b) => a.installment_no - b.installment_no)
        if (dueRows.length === 0) continue
        // Group ALL due EMIs for this loan into ONE entry
        const totalBalance = dueRows.reduce((s, r) => s + Math.max(0, (r.emi_due || 0) - (r.paid_amount || 0)), 0)
        if (totalBalance <= 0) continue
        entries.push({
          loan,
          rows: dueRows,
          totalBalance,
          emiCount: dueRows.length,
          firstDueDate: dueRows[0].due_date,
          lastEmiNo: dueRows[dueRows.length - 1].installment_no,
          collectAmt: String(Math.round(totalBalance)),
          mode: 'Cash',
          ref: '',
          status: 'pending'
        })
      }
      setEmiEntries(entries)
    } catch (err) { console.error(err) }
    finally { setEmiLoading(false) }
  }

  useEffect(() => { if (activeTab === 'individual') loadEmiEntries() }, [activeTab, branch, foName])

  async function loadCollectionSheet() {
    setLoading(true)
    setErrorMessage('')
    try {
      const [loans, schedule] = await Promise.all([
        getAll<Loan>('loans'),
        getAll<ScheduleRow>('schedule')
      ])
      const activeLoans = loans.filter(l => l.status === 'ACTIVE')
      const newEntries: CollectionEntry[] = []

      for (const loan of activeLoans) {
        const lSched = schedule
          .filter(r => r.loan_account_no === loan.loan_account_no)
          .sort((a, b) => a.installment_no - b.installment_no)

        const todayRow = lSched.find(r => r.due_date === date)
        const overdueRows = lSched.filter(r => r.due_date < date && (r.status === 'Pending' || r.status === 'Overdue'))

        const todayEmi = (todayRow && todayRow.status !== 'Paid') ? (todayRow.emi_due || loan.installment_amount || 0) : 0
        const totalOverdue = overdueRows.reduce((s, r) => s + Math.max(0, (r.emi_due || 0) - (r.paid_amount || 0)), 0)
        const totalDue = todayEmi + totalOverdue

        if ((todayRow && todayRow.status !== 'Paid') || totalOverdue > 0) {
          const firstEmiDate = loan.installment_start_date || (loan as any).first_installment_date || loan.disbursement_date
          const meetingDay = getMeetingDay(firstEmiDate)
          const freq = loan.frequency || (loan as any).repayment_frequency || 'Weekly'
          const totalTenure = loan.tenure || lSched.length || 26
          const paidEmis = lSched.filter(r => r.status === 'Paid').length || Number((loan as any).paid_emi || (loan as any).data?.paid_emi || 0)
          const pendingEmis = Math.max(0, totalTenure - paidEmis)

          newEntries.push({
            loan,
            meetingDay,
            frequency: freq,
            totalTenure,
            paidEmis,
            pendingEmis,
            todayEmi,
            totalOverdue,
            totalDue,
            collectedAmount: '',
            mode: 'Cash',
            referenceNo: '',
          })
        }
      }
      setEntries(newEntries)
    } catch (err) {
      console.error(err)
      setErrorMessage('Failed to load collections from database.')
    } finally {
      setLoading(false)
    }
  }

  const filteredEntries = entries.filter(e => {
    const bMatch = !branch || (e.loan.branch_code || '').toLowerCase().includes(branch.toLowerCase())
    const fMatch = !foName || (e.loan.fo_name || '').toLowerCase().includes(foName.toLowerCase())
    const dMatch = !dueFilter ||
      (dueFilter === 'overdue' && e.totalOverdue > 0) ||
      (dueFilter === 'due' && e.todayEmi > 0)
    return bMatch && fMatch && dMatch
  })

  const setField = (loanNo: string, field: keyof CollectionEntry, val: string) => {
    setEntries(prev => prev.map(e =>
      e.loan.loan_account_no === loanNo ? { ...e, [field]: val } : e
    ))
  }

  const fillAllDue = () => setEntries(prev => prev.map(e => ({ ...e, collectedAmount: String(e.totalDue || e.todayEmi) })))
  const totalCollectedSum = entries.reduce((s, e) => s + (Number(e.collectedAmount) || 0), 0)

  async function handleSaveAll() {
    const toProcess = entries.filter(e => Number(e.collectedAmount) > 0)
    if (toProcess.length === 0) { setErrorMessage('No collection amounts entered.'); return }
    const ok = await confirmAction({
      title: 'Post Collections',
      message: `Post ${toProcess.length} collections (${inr(totalCollectedSum)}) to the database?`,
      confirmText: 'Post Collections',
      variant: 'warning',
    })
    if (!ok) return
    setSaving(true); setErrorMessage(''); setMessage('')
    try {
      // Process payments in parallel batch for instant completion
      await Promise.all(
        toProcess.map(item =>
          applyPayment(
            item.loan.loan_account_no,
            Number(item.collectedAmount),
            date,
            item.mode,
            item.referenceNo || 'BULK-' + Date.now(),
            'Bulk collections sheet entry',
            user?.email || 'system'
          )
        )
      )
      toast.success('Collections Posted', `Successfully posted ${toProcess.length} payments!`)
      setMessage(`Successfully posted ${toProcess.length} payments!`)
      await loadCollectionSheet()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed.')
      toast.error('Posting Failed', err.message || 'Could not post payments.')
    } finally { setSaving(false) }
  }

  // ── CSV Upload Handler ─────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      setCsvRows(rows)
      setCsvDone(false)
    }
    reader.readAsText(file)
  }

  async function processCsvRows() {
    if (csvRows.length === 0) return
    const ok = await confirmAction({
      title: 'Process CSV Payments',
      message: `Process ${csvRows.length} CSV payment rows?`,
      confirmText: 'Process Payments',
      variant: 'warning',
    })
    if (!ok) return
    setCsvProcessing(true)
    const updated = [...csvRows]
    for (let i = 0; i < updated.length; i++) {
      const row = updated[i]
      try {
        await applyPayment(row.loan_account_no, Number(row.amount), row.txn_date, row.mode, row.reference_no || 'CSV-' + Date.now(), row.remarks || 'CSV Upload', user?.email || 'system')
        updated[i] = { ...row, status: 'success' }
      } catch (err: any) {
        updated[i] = { ...row, status: 'error', error: err.message || 'Failed' }
      }
      setCsvRows([...updated])
    }
    setCsvProcessing(false)
    setCsvDone(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Collections</h1>
        <p className="text-slate-500 text-sm mt-0.5">Bulk collection sheet, CSV upload, and field officer printout.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-1">
        {([
          { id: 'sheet', label: 'Collection Worksheet', icon: Table2 },
          { id: 'individual', label: 'Individual EMI', icon: FileText },
          { id: 'csv_upload', label: 'CSV Bulk Upload', icon: Upload },
          { id: 'field_printout', label: 'Field Sheet Printout', icon: Printer },
        ] as { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <tab.icon className="w-3.5 h-3.5" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Collection Worksheet ── */}
      {activeTab === 'sheet' && (
        <>
          {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {message}</div>}
          {errorMessage && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {errorMessage}</div>}

          {/* Branch Breakdown KPI Summary Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-4 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block">Total Due Accounts ({date})</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-black">{filteredEntries.length}</span>
                <span className="text-xs bg-blue-500/30 px-2 py-0.5 rounded-full font-semibold">{getMeetingDay(date)}</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Pataudi Branch</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-black text-slate-800">
                  {filteredEntries.filter(e => (e.loan.branch_code || '').toUpperCase() === 'PATAUDI').length}
                </span>
                <span className="text-[11px] text-slate-500 font-semibold">Accounts</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">Khatauli Branch</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-black text-slate-800">
                  {filteredEntries.filter(e => (e.loan.branch_code || '').toUpperCase() === 'KHATAULI').length}
                </span>
                <span className="text-[11px] text-slate-500 font-semibold">Accounts</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 block">Haridwar Branch</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-black text-slate-800">
                  {filteredEntries.filter(e => (e.loan.branch_code || '').toUpperCase() === 'HARIDWAR').length}
                </span>
                <span className="text-[11px] text-slate-500 font-semibold">Accounts</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Due Date</label>
              <div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branch</label>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Filter by branch" value={branch} onChange={e => setBranch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Field Officer</label>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Filter by FO name" value={foName} onChange={e => setFoName(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Filter</label>
              <select value={dueFilter} onChange={e => setDueFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none">
                <option value="">All Due</option>
                <option value="overdue">Overdue Only</option>
                <option value="due">With Amount Due</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button onClick={fillAllDue} className="w-full py-2 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 text-xs font-bold rounded-xl transition">Fill All</button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">{filteredEntries.length} loans shown</span>
              <button onClick={handleSaveAll} disabled={saving || loading || totalCollectedSum === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : `Save All (${inr(totalCollectedSum)})`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                  <th className="text-left px-3 py-3">Member</th>
                  <th className="text-left px-3 py-3">Loan A/C</th>
                  <th className="text-left px-3 py-3">Branch / FO</th>
                  <th className="text-left px-3 py-3">Meeting Day</th>
                  <th className="text-left px-3 py-3">Frequency</th>
                  <th className="text-center px-3 py-3">Tenor</th>
                  <th className="text-center px-3 py-3">Paid</th>
                  <th className="text-center px-3 py-3">Pending</th>
                  <th className="text-right px-3 py-3">Today EMI</th>
                  <th className="text-right px-3 py-3">Overdue</th>
                  <th className="text-right px-3 py-3">Total Due</th>
                  <th className="text-left px-3 py-3 w-32">Collected (₹)</th>
                  <th className="text-left px-3 py-3 w-28">Mode</th>
                  <th className="text-left px-3 py-3 w-32">Ref No</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && <tr><td colSpan={14} className="py-10 text-center text-slate-400">Loading…</td></tr>}
                  {!loading && filteredEntries.length === 0 && <tr><td colSpan={14} className="py-10 text-center text-slate-400">No pending dues for selected filters.</td></tr>}
                  {!loading && filteredEntries.map(e => (
                    <tr key={e.loan.loan_account_no} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
                        <Link href={`/members/${e.loan.customer_id}`} className="text-blue-600 hover:underline">
                          {e.loan.member_name_cache || e.loan.member_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-blue-600 font-bold text-[11px]">
                        <Link href={`/loans/${e.loan.loan_account_no}`} className="hover:underline">
                          {e.loan.loan_account_no}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-[11px] whitespace-nowrap">{e.loan.branch_code} / {e.loan.fo_name || '—'}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-700 text-[11px]">{e.meetingDay}</td>
                      <td className="px-3 py-2.5 text-slate-600 text-[11px]">{e.frequency}</td>
                      <td className="px-3 py-2.5 text-center font-medium text-slate-700">{e.totalTenure}</td>
                      <td className="px-3 py-2.5 text-center font-semibold text-emerald-600 bg-emerald-50/50 rounded">{e.paidEmis}</td>
                      <td className="px-3 py-2.5 text-center font-semibold text-amber-600 bg-amber-50/50 rounded">{e.pendingEmis}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{inr(e.todayEmi)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-600">{inr(e.totalOverdue)}</td>
                      <td className="px-3 py-2.5 text-right font-black text-slate-800">{inr(e.totalDue)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <input type="number" placeholder="0" value={e.collectedAmount}
                            onChange={el => setField(e.loan.loan_account_no, 'collectedAmount', el.target.value)}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-400" />
                          <button type="button" onClick={() => setField(e.loan.loan_account_no, 'collectedAmount', String(e.totalDue))}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg" title="Fill total due"><Sparkles className="w-3 h-3 text-slate-600" /></button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select value={e.mode} onChange={el => setField(e.loan.loan_account_no, 'mode', el.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none">
                          <option>Cash</option><option>UPI</option><option>NACH / Bank</option><option>Cheque</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" placeholder="Receipt / UTR" value={e.referenceNo}
                          onChange={el => setField(e.loan.loan_account_no, 'referenceNo', el.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredEntries.length > 0 && (
              <div className="px-5 py-3.5 bg-slate-900 text-white flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Collected Today</span>
                <span className="text-lg font-black text-emerald-400">{inr(totalCollectedSum)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TAB: Individual EMI Collection ── */}
      {activeTab === 'individual' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Individual EMI Collection</h3>
                <p className="text-xs text-slate-500 mt-1">Collect individual installments one by one. Each installment row can be collected separately.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Filter by branch" value={branch} onChange={e => setBranch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
              </div>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Filter by FO name" value={foName} onChange={e => setFoName(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">{emiEntries.filter(e => e.status === 'pending').length} loans with pending EMIs</span>
              <span className="text-xs text-slate-500">{emiEntries.filter(e => e.status === 'success').length} collected this session</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Member</th>
                  <th className="text-left px-4 py-3">Loan A/C</th>
                  <th className="text-left px-4 py-3">Branch / FO</th>
                  <th className="text-center px-4 py-3">EMIs Due</th>
                  <th className="text-left px-4 py-3">First Due Date</th>
                  <th className="text-right px-4 py-3">Single EMI (₹)</th>
                  <th className="text-right px-4 py-3">Total Balance</th>
                  <th className="text-center px-4 py-3">DPD</th>
                  <th className="text-left px-4 py-3 w-32">Collect (₹)</th>
                  <th className="text-left px-4 py-3 w-28">Mode</th>
                  <th className="text-left px-4 py-3 w-32">Ref / UTR</th>
                  <th className="text-center px-4 py-3">Action</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {emiLoading && <tr><td colSpan={12} className="py-10 text-center text-slate-400">Loading due installments…</td></tr>}
                  {!emiLoading && emiEntries.length === 0 && (
                    <tr><td colSpan={12} className="py-10 text-center text-emerald-500 font-semibold">No pending dues as of today.</td></tr>
                  )}
                  {!emiLoading && emiEntries.map((e, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50/50 transition ${e.status === 'success' ? 'bg-emerald-50/50' : e.status === 'error' ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3 font-semibold text-slate-800">{e.loan.member_name_cache || e.loan.member_name}</td>
                      <td className="px-4 py-3 font-mono text-blue-600 font-bold text-[11px]">{e.loan.loan_account_no}</td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">{e.loan.branch_code} / {e.loan.fo_name || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 font-black text-xs">{e.emiCount}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-semibold">{fdate(e.firstDueDate)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700">{inr(e.loan.installment_amount || 0)}</td>
                      <td className="px-4 py-3 text-right font-black text-red-600 text-sm">{inr(e.totalBalance)}</td>
                      <td className="px-4 py-3 text-center font-bold text-red-600">{e.loan.dpd || 0}</td>
                      <td className="px-4 py-2">
                        <input type="number" value={e.collectAmt} disabled={e.status === 'success' || e.status === 'saving'}
                          onChange={ev => setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, collectAmt: ev.target.value } : x))}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-400 disabled:opacity-50" />
                      </td>
                      <td className="px-4 py-2">
                        <select value={e.mode} disabled={e.status === 'success' || e.status === 'saving'}
                          onChange={ev => setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, mode: ev.target.value } : x))}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none disabled:opacity-50">
                          <option>Cash</option><option>UPI</option><option>NACH / Bank</option><option>Cheque</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="text" value={e.ref} disabled={e.status === 'success' || e.status === 'saving'} placeholder="Receipt / UTR"
                          onChange={ev => setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, ref: ev.target.value } : x))}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none disabled:opacity-50" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        {e.status === 'success' ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-emerald-600 font-bold text-xs flex items-center gap-1 mr-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Done
                            </span>
                            <button
                              onClick={() => generatePaymentReceipt({
                                receipt_no: 'REC-' + (e.lastTxnId || Date.now()),
                                txn_date: fdate(todayISO()),
                                loan_account_no: e.loan.loan_account_no,
                                member_name: e.loan.member_name_cache || e.loan.member_name,
                                customer_id: e.loan.customer_id,
                                branch_code: e.loan.branch_code,
                                amount: Number(e.collectAmt),
                                mode: e.mode || 'Cash',
                                reference_no: e.ref || '',
                                remaining_outstanding: Math.max(0, (e.loan.ledger_balance || 0) - Number(e.collectAmt)),
                                entered_by: user?.name || user?.email || 'Field Staff',
                              })}
                              title="Print A4 Receipt"
                              className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded flex items-center gap-0.5 transition"
                            >
                              <Printer className="w-3 h-3" /> A4
                            </button>
                            <button
                              onClick={() => generateThermalPaymentReceipt({
                                receipt_no: 'REC-' + (e.lastTxnId || Date.now()),
                                txn_date: fdate(todayISO()),
                                loan_account_no: e.loan.loan_account_no,
                                member_name: e.loan.member_name_cache || e.loan.member_name,
                                customer_id: e.loan.customer_id,
                                branch_code: e.loan.branch_code,
                                amount: Number(e.collectAmt),
                                mode: e.mode || 'Cash',
                                reference_no: e.ref || '',
                                remaining_outstanding: Math.max(0, (e.loan.ledger_balance || 0) - Number(e.collectAmt)),
                                entered_by: user?.name || user?.email || 'Field Staff',
                              })}
                              title="Print 80mm Thermal Receipt"
                              className="px-1.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold rounded flex items-center gap-0.5 transition border border-blue-200"
                            >
                              <Smartphone className="w-3 h-3" /> POS
                            </button>
                          </div>
                        ) : e.status === 'saving' ? (
                          <span className="text-blue-600 text-xs flex items-center justify-center gap-1">
                            <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" /> Saving…
                          </span>
                        ) : (
                          <button
                            onClick={async () => {
                              const amt = Number(e.collectAmt)
                              if (!amt || amt <= 0) { toast.warning('Invalid Amount', 'Enter a valid collection amount'); return }
                              setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, status: 'saving' as const } : x))
                              try {
                                const newTxId = await applyPayment(
                                  e.loan.loan_account_no, amt, todayISO(),
                                  e.mode, e.ref || 'EMI-' + Date.now(),
                                  `${e.emiCount} EMI(s) collected — EMI #${e.rows[0].installment_no}${e.emiCount > 1 ? ` to #${e.lastEmiNo}` : ''}`,
                                  user?.email || 'system'
                                )
                                setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, status: 'success' as const, lastTxnId: newTxId } : x))
                              } catch (err: any) {
                                setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, status: 'error' as const } : x))
                                toast.error('Collection Failed', err.message || 'Unknown error')
                              }
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition">
                            Collect
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CSV Bulk Upload ── */}
      {activeTab === 'csv_upload' && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-bold mb-1">CSV Bulk Payment Upload</p>
            <p className="text-xs">Upload a CSV file from your field officer collection sheet. Required columns (header required):
              <code className="bg-blue-100 px-1.5 py-0.5 rounded mx-1 font-mono text-xs">loan_account_no, amount, txn_date, mode, reference_no, remarks</code>
              Dates must be in <code className="bg-blue-100 px-1 rounded font-mono">YYYY-MM-DD</code> format.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={downloadSampleCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition border border-slate-200">
              <Download className="w-3.5 h-3.5" /> Download Sample CSV
            </button>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Choose CSV File
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            </label>
          </div>

          {csvRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">{csvRows.length} rows parsed from CSV</span>
                {!csvDone && (
                  <button onClick={processCsvRows} disabled={csvProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition">
                    {csvProcessing ? 'Processing…' : `Post ${csvRows.length} Payments`}
                  </button>
                )}
                {csvDone && <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> All rows processed</span>}
              </div>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                  <th className="px-4 py-2 text-left">Loan A/C</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Mode</th>
                  <th className="px-4 py-2 text-left">Reference</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {csvRows.map((row, i) => (
                    <tr key={i} className={row.status === 'error' ? 'bg-red-50' : row.status === 'success' ? 'bg-emerald-50/40' : ''}>
                      <td className="px-4 py-2 font-mono font-bold text-blue-600">{row.loan_account_no}</td>
                      <td className="px-4 py-2 text-right font-bold">{inr(Number(row.amount))}</td>
                      <td className="px-4 py-2">{fdate(row.txn_date)}</td>
                      <td className="px-4 py-2">{row.mode}</td>
                      <td className="px-4 py-2 font-mono text-[10px]">{row.reference_no || '—'}</td>
                      <td className="px-4 py-2">
                        {row.status === 'pending' && <span className="badge bg-slate-100 text-slate-500 text-[9px]">Pending</span>}
                        {row.status === 'success' && <span className="badge bg-emerald-50 text-emerald-700 text-[9px]">✓ Posted</span>}
                        {row.status === 'error' && <span className="badge bg-red-50 text-red-600 text-[9px]" title={row.error}>✗ Error</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: Field Sheet Printout ── */}
      {activeTab === 'field_printout' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Field Officer Day Collection Sheet</h3>
            <p className="text-xs text-slate-500">Configure filters below and print a formatted sheet for your field officers to carry during collections.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Collection Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
              </div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Branch Code</label>
                <input type="text" placeholder="e.g. HARIDWAR" value={branch} onChange={e => setBranch(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
              </div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Field Officer Name</label>
                <input type="text" placeholder="e.g. SACHIN KUMAR" value={foName} onChange={e => setFoName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => printFieldSheet(filteredEntries, date, branch, foName)}
                disabled={filteredEntries.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-md shadow-blue-500/10">
                <Printer className="w-4 h-4" /> Print Field Collection Sheet ({filteredEntries.length} loans)
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                  <th className="px-4 py-3 text-left">Loan A/C</th>
                  <th className="px-4 py-3 text-left">Member Name</th>
                  <th className="px-4 py-3 text-left">Mobile</th>
                  <th className="px-4 py-3 text-left">Branch / FO</th>
                  <th className="px-4 py-3 text-right">Amount Due</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Loading…</td></tr>}
                  {!loading && filteredEntries.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No dues for selected filters.</td></tr>}
                  {!loading && filteredEntries.map(e => (
                    <tr key={e.loan.loan_account_no} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-mono text-blue-600 font-bold">{e.loan.loan_account_no}</td>
                      <td className="px-4 py-2.5 font-semibold">{e.loan.member_name_cache || e.loan.member_name}</td>
                      <td className="px-4 py-2.5">{e.loan.mobile || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{e.loan.branch_code} / {e.loan.fo_name || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-red-600">{inr(e.totalDue || e.todayEmi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredEntries.length > 0 && (
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-700">
                <span>{filteredEntries.length} entries</span>
                <span>Total Due: {inr(filteredEntries.reduce((s, e) => s + (e.totalDue || e.todayEmi), 0))}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
