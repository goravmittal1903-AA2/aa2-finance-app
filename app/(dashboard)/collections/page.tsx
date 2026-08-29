'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { getAll } from '@/lib/supabase'
import { applyPayment, generateSchedule } from '@/lib/calculations'
import { toast } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import type { Loan, ScheduleRow } from '@/lib/types'
import { inr, todayISO, fdate } from '@/lib/utils'
import { generatePaymentReceipt, generateThermalPaymentReceipt } from '@/lib/document-generator'
import {
  Calendar, Search, Save, CheckCircle, AlertCircle, Sparkles,
  Upload, Download, Printer, FileText, Table2, Smartphone
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface CollectionEntry {
  loan: Loan
  emiAmt: number
  dueCount: number
  totalOverdue: number
  collectedAmount: string
  mode: string
  referenceNo: string
}

interface OverdueEntry {
  loan: Loan
  unpaidCount: number
  totalOverdueAmt: number
  dpd: number
  dpdBucket: string
  firstOverdueDate: string
  lastPaidDate: string | null
  collectedAmount: string
  mode: string
  referenceNo: string
  status: 'pending' | 'saving' | 'success' | 'error'
}

type Tab = 'sheet' | 'overdue' | 'individual' | 'csv_upload' | 'field_printout'

interface EmiEntry {
  loan: Loan
  rows: ScheduleRow[]
  totalBalance: number
  emiCount: number
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

// ─── Excel Exporter ───────────────────────────────────────────────────────────
function downloadExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') || filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Field Sheet Printouts ────────────────────────────────────────────────────
function printFieldSheet(entries: CollectionEntry[], date: string, branch: string, foName: string) {
  const pw = window.open('', '_blank', 'width=900,height=1000')
  if (!pw) { toast.error('Popup Blocked', 'Please allow popups.'); return }
  const rows = entries.map(e => `
    <tr>
      <td>${e.loan.loan_account_no}</td>
      <td>${e.loan.member_name_cache || e.loan.member_name}</td>
      <td>${e.loan.mobile || '—'}</td>
      <td style="text-align:center;">${e.dueCount} EMI(s)</td>
      <td style="text-align:right;">${inr(e.emiAmt)}</td>
      <td style="text-align:right; font-weight:bold;">${inr(e.totalOverdue)}</td>
      <td style="width:90px; border-bottom: 1px solid #ccc;"></td>
      <td style="width:100px; border-bottom: 1px solid #ccc;"></td>
      <td style="width:80px; border-bottom: 1px solid #ccc;"></td>
    </tr>`).join('')
  pw.document.write(`
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Daily Field Collection Sheet - ${date}</title>
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
    <h2>AA2 MICRO FINANCE — Daily Field Collection Sheet</h2>
    <div class="info">
      Due Date: <strong>${date}</strong> &nbsp;|&nbsp; 
      Branch: <strong>${branch || 'ALL'}</strong> &nbsp;|&nbsp;
      Field Officer: <strong>${foName || 'ALL'}</strong> &nbsp;|&nbsp;
      Total Daily Scheduled Demand: <strong>${inr(entries.reduce((s, e) => s + e.totalOverdue, 0))}</strong> (${entries.length} Loans)
    </div>
    <table>
      <thead><tr>
        <th>Loan A/C</th><th>Member Name</th><th>Mobile</th><th>No. of EMIs</th>
        <th>Single EMI (₹)</th><th>Net Total Due (₹)</th><th>Collected (₹)</th><th>Mode / Ref</th><th>Sign</th>
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

function printOverdueSheet(entries: OverdueEntry[], date: string, branch: string, foName: string) {
  const pw = window.open('', '_blank', 'width=950,height=1000')
  if (!pw) { toast.error('Popup Blocked', 'Please allow popups.'); return }
  const rows = entries.map(e => `
    <tr>
      <td>${e.loan.loan_account_no}</td>
      <td>${e.loan.member_name_cache || e.loan.member_name}</td>
      <td>${e.loan.mobile || '—'}</td>
      <td style="text-align:center;">${e.unpaidCount} EMI(s)</td>
      <td style="text-align:center; font-weight:bold; color:#b45309;">${e.dpd} d (${e.dpdBucket})</td>
      <td style="text-align:right; font-weight:bold;">${inr(e.totalOverdueAmt)}</td>
      <td style="width:90px; border-bottom: 1px solid #ccc;"></td>
      <td style="width:90px; border-bottom: 1px solid #ccc;"></td>
      <td style="width:70px; border-bottom: 1px solid #ccc;"></td>
    </tr>`).join('')
  pw.document.write(`
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Overdue Recovery Sheet - ${date}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 15px; }
      h2 { font-size: 15px; margin: 0 0 4px 0; color: #b91c1c; }
      .info { font-size: 11px; color: #555; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #fee2e2; border: 1px solid #fca5a5; padding: 6px 8px; text-align: left; font-size: 10px; color: #991b1b; }
      td { border: 1px solid #ddd; padding: 6px 8px; }
      .footer { margin-top: 30px; display: flex; justify-content: space-between; }
      .sig { width: 200px; border-top: 1px solid #888; padding-top: 5px; text-align: center; font-size: 11px; color: #555; }
    </style></head><body>
    <h2>AA2 MICRO FINANCE — Overdue & Arrears Recovery Sheet</h2>
    <div class="info">
      As of Date: <strong>${date}</strong> &nbsp;|&nbsp; 
      Branch: <strong>${branch || 'ALL'}</strong> &nbsp;|&nbsp;
      Field Officer: <strong>${foName || 'ALL'}</strong> &nbsp;|&nbsp;
      Total Overdue Arrears: <strong>${inr(entries.reduce((s, e) => s + e.totalOverdueAmt, 0))}</strong> (${entries.length} Defaulters)
    </div>
    <table>
      <thead><tr>
        <th>Loan A/C</th><th>Member Name</th><th>Mobile</th>
        <th>Missed EMIs</th><th>DPD / Bucket</th><th>Total Overdue Due (₹)</th><th>Recovered (₹)</th><th>Mode / Ref</th><th>Sign</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      <div class="sig">Field Recovery Officer Signature</div>
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
  const [entries, setEntries] = useState<CollectionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // Dynamic Filter Dropdowns State
  const [branchesList, setBranchesList] = useState<string[]>([])
  const [foList, setFoList] = useState<string[]>([])

  // Overdue & Arrears tab state
  const [overdueEntries, setOverdueEntries] = useState<OverdueEntry[]>([])
  const [overdueLoading, setOverdueLoading] = useState(false)
  const [dpdFilter, setDpdFilter] = useState('')
  const [overdueSaving, setOverdueSaving] = useState(false)

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
    if (activeTab === 'overdue') loadOverdueEntries()
    if (activeTab === 'individual') loadEmiEntries()
    const handler = () => {
      loadCollectionSheet()
      if (activeTab === 'overdue') loadOverdueEntries()
      if (activeTab === 'individual') loadEmiEntries()
    }
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [date, activeTab, branch, foName])

  async function loadCollectionSheet() {
    setLoading(true)
    setErrorMessage('')
    try {
      const [loans, rawSchedule] = await Promise.all([
        getAll<Loan>('loans'),
        getAll<ScheduleRow>('schedule')
      ])

      // Populate dynamic branch & FO dropdown lists
      const uniqueBranches = Array.from(new Set(loans.map(l => l.branch_code).filter(Boolean))).sort()
      const uniqueFos = Array.from(new Set(loans.map(l => l.fo_name).filter(Boolean))).sort()
      setBranchesList(uniqueBranches)
      setFoList(uniqueFos)

      const scheduleMap = new Map<string, ScheduleRow[]>()
      rawSchedule.forEach(r => {
        if (!scheduleMap.has(r.loan_account_no)) scheduleMap.set(r.loan_account_no, [])
        scheduleMap.get(r.loan_account_no)!.push(r)
      })

      const activeLoans = loans.filter(l => l.status === 'ACTIVE' || l.status === 'SANCTIONED')
      const newEntries: CollectionEntry[] = []

      // Use UTC day to avoid IST timezone shift (date string '2026-08-24' must stay as Mon in UTC)
      const selectedDateObj = new Date(date + 'T00:00:00Z')
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dayName = daysOfWeek[selectedDateObj.getUTCDay()] || 'Monday'
      const dayShort = dayName.slice(0, 3).toLowerCase()

      for (const loan of activeLoans) {
        const meetingDayStr = (loan.meeting_day || '').toLowerCase()
        const isWeekly = loan.frequency === 'Weekly' || !loan.frequency
        const isDayMatch = isWeekly && (meetingDayStr.includes(dayShort) || meetingDayStr === dayName.toLowerCase())

        const loanSched = scheduleMap.get(loan.loan_account_no) || generateSchedule(loan)

        // Unpaid installments up to selected date
        const unpaidRows = loanSched.filter(r =>
          (r.status === 'Pending' || r.status === 'Overdue' || r.status === 'Partial') &&
          r.due_date <= date
        )
        const netDueSum = unpaidRows.reduce((s, r) => s + Math.max(0, (r.emi_due || 0) - (r.paid_amount || 0)), 0)

        // Exact day row on selected date
        const exactDayRow = loanSched.find(r => r.due_date === date)
        const rowIsUnpaid = exactDayRow && (exactDayRow.status === 'Pending' || exactDayRow.status === 'Overdue' || exactDayRow.status === 'Partial')
        const exactDueAmt = exactDayRow ? Math.max(0, (exactDayRow.emi_due || 0) - (exactDayRow.paid_amount || 0)) : 0

        // STRICT MATCH FOR DAILY WORKSHEET:
        // Only include accounts whose meeting day matches selected date OR whose installment is due on this exact date
        if (isDayMatch || rowIsUnpaid) {
          let dueAmt = netDueSum > 0 ? netDueSum : exactDueAmt
          if (dueAmt <= 0) {
            // Find next pending installment if exact is paid
            const nextPending = loanSched.find(r =>
              (r.status === 'Pending' || r.status === 'Overdue' || r.status === 'Partial') &&
              Math.max(0, (r.emi_due || 0) - (r.paid_amount || 0)) > 0
            )
            if (!nextPending) continue
            dueAmt = Math.max(0, (nextPending.emi_due || 0) - (nextPending.paid_amount || 0))
          }
          if (dueAmt <= 0) continue // Skip if fully paid

          newEntries.push({
            loan,
            emiAmt: Number(loan.installment_amount) || dueAmt,
            dueCount: unpaidRows.length || 1,
            totalOverdue: dueAmt,
            collectedAmount: '',
            mode: 'Cash',
            referenceNo: ''
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

  async function loadOverdueEntries() {
    setOverdueLoading(true)
    try {
      const [loans, rawSchedule] = await Promise.all([
        getAll<Loan>('loans'),
        getAll<ScheduleRow>('schedule')
      ])

      const scheduleMap = new Map<string, ScheduleRow[]>()
      rawSchedule.forEach(r => {
        if (!scheduleMap.has(r.loan_account_no)) scheduleMap.set(r.loan_account_no, [])
        scheduleMap.get(r.loan_account_no)!.push(r)
      })

      const activeLoans = loans.filter(l => l.status === 'ACTIVE' || l.status === 'SANCTIONED')
      const newOverdues: OverdueEntry[] = []

      for (const loan of activeLoans) {
        const loanSched = scheduleMap.get(loan.loan_account_no) || generateSchedule(loan)

        // Find all installments due STRICTLY BEFORE or ON date that are unpaid/overdue
        const pastDueRows = loanSched.filter(r =>
          (r.status === 'Overdue' || r.status === 'Pending' || r.status === 'Partial') &&
          r.due_date <= date
        )

        if (pastDueRows.length === 0) continue

        const totalOverdueAmt = pastDueRows.reduce((s, r) => s + Math.max(0, (r.emi_due || 0) - (r.paid_amount || 0)), 0)
        if (totalOverdueAmt <= 0) continue

        const firstDue = pastDueRows[0].due_date
        // Use UTC dates to avoid IST timezone offset (date strings are YYYY-MM-DD UTC)
        const dateTs = new Date(date + 'T00:00:00Z').getTime()
        const firstDueTs = new Date(firstDue + 'T00:00:00Z').getTime()
        const daysPast = Math.max(0, Math.floor((dateTs - firstDueTs) / (1000 * 60 * 60 * 24)))
        const dpd = Math.max(Number(loan.dpd || 0), daysPast)
        const dpdBucket = dpd > 90 ? '90+ NPA' : dpd > 60 ? '61-90' : dpd > 30 ? '31-60' : '1-30'

        newOverdues.push({
          loan,
          unpaidCount: pastDueRows.length,
          totalOverdueAmt,
          dpd,
          dpdBucket,
          firstOverdueDate: firstDue,
          lastPaidDate: loan.installment_start_date || null,
          collectedAmount: '',
          mode: 'Cash',
          referenceNo: '',
          status: 'pending'
        })
      }
      setOverdueEntries(newOverdues)
    } catch (err) {
      console.error(err)
    } finally {
      setOverdueLoading(false)
    }
  }

  async function loadEmiEntries() {
    setEmiLoading(true)
    try {
      const [loans, rawSchedule] = await Promise.all([
        getAll<Loan>('loans'),
        getAll<ScheduleRow>('schedule')
      ])

      const scheduleMap = new Map<string, ScheduleRow[]>()
      rawSchedule.forEach(r => {
        if (!scheduleMap.has(r.loan_account_no)) scheduleMap.set(r.loan_account_no, [])
        scheduleMap.get(r.loan_account_no)!.push(r)
      })

      const activeLoans = loans.filter(l => l.status === 'ACTIVE' || l.status === 'SANCTIONED')
      const entries: EmiEntry[] = []

      for (const loan of activeLoans) {
        const bMatch = !branch || (loan.branch_code || '').toLowerCase().includes(branch.toLowerCase())
        const fMatch = !foName || (loan.fo_name || '').toLowerCase().includes(foName.toLowerCase())
        if (!bMatch || !fMatch) continue

        const loanSched = scheduleMap.get(loan.loan_account_no) || generateSchedule(loan)

        const dueRows = loanSched
          .filter(r =>
            (r.status === 'Pending' || r.status === 'Overdue' || r.status === 'Partial') &&
            r.due_date <= date
          )
          .sort((a, b) => a.installment_no - b.installment_no)

        if (dueRows.length === 0) continue

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
    } catch (err) {
      console.error(err)
    } finally {
      setEmiLoading(false)
    }
  }

  const filteredEntries = entries.filter(e => {
    const bMatch = !branch || (e.loan.branch_code || '').toLowerCase().includes(branch.toLowerCase())
    const fMatch = !foName || (e.loan.fo_name || '').toLowerCase().includes(foName.toLowerCase())
    return bMatch && fMatch
  })

  const filteredOverdues = overdueEntries.filter(e => {
    const bMatch = !branch || (e.loan.branch_code || '').toLowerCase().includes(branch.toLowerCase())
    const fMatch = !foName || (e.loan.fo_name || '').toLowerCase().includes(foName.toLowerCase())
    const dMatch = !dpdFilter || e.dpdBucket === dpdFilter
    return bMatch && fMatch && dMatch
  })

  const setField = (loanNo: string, field: keyof CollectionEntry, val: string) => {
    setEntries(prev => prev.map(e =>
      e.loan.loan_account_no === loanNo ? { ...e, [field]: val } : e
    ))
  }

  const setOverdueField = (loanNo: string, field: keyof OverdueEntry, val: string) => {
    setOverdueEntries(prev => prev.map(e =>
      e.loan.loan_account_no === loanNo ? { ...e, [field]: val } : e
    ))
  }

  const fillAllDue = () => setEntries(prev => prev.map(e => ({ ...e, collectedAmount: String(e.emiAmt) })))
  const totalCollectedSum = entries.reduce((s, e) => s + (Number(e.collectedAmount) || 0), 0)

  const fillAllOverdues = () => setOverdueEntries(prev => prev.map(e => ({ ...e, collectedAmount: String(e.totalOverdueAmt) })))
  const totalOverdueCollectedSum = overdueEntries.reduce((s, e) => s + (Number(e.collectedAmount) || 0), 0)

  async function handleSaveAll() {
    const toProcess = entries.filter(e => Number(e.collectedAmount) > 0)
    if (toProcess.length === 0) { setErrorMessage('No collection amounts entered.'); return }
    const ok = await confirmAction({
      title: 'Post Collections',
      message: `Post ${toProcess.length} daily collections (${inr(totalCollectedSum)}) to the database?`,
      confirmText: 'Post Collections',
      variant: 'info',
    })
    if (!ok) return
    setSaving(true); setErrorMessage(''); setMessage('')
    try {
      await Promise.all(
        toProcess.map(item =>
          applyPayment(
            item.loan.loan_account_no,
            Number(item.collectedAmount),
            date,
            item.mode,
            item.referenceNo || 'BULK-' + Date.now(),
            'Daily collections worksheet entry',
            user?.email || 'system'
          )
        )
      )
      toast.success('Collections Posted', `Successfully posted ${toProcess.length} payments!`)
      setMessage(`Successfully posted ${toProcess.length} payments!`)
      window.dispatchEvent(new Event('aa2_data_changed'))
      await loadCollectionSheet()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed.')
      toast.error('Posting Failed', err.message || 'Could not post payments.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveOverdueAll() {
    const toProcess = overdueEntries.filter(e => Number(e.collectedAmount) > 0)
    if (toProcess.length === 0) { setErrorMessage('No overdue recovery amounts entered.'); return }
    const ok = await confirmAction({
      title: 'Post Overdue Recoveries',
      message: `Post ${toProcess.length} overdue recoveries (${inr(totalOverdueCollectedSum)}) to the database?`,
      confirmText: 'Post Recoveries',
      variant: 'info',
    })
    if (!ok) return
    setOverdueSaving(true); setErrorMessage(''); setMessage('')
    try {
      await Promise.all(
        toProcess.map(item =>
          applyPayment(
            item.loan.loan_account_no,
            Number(item.collectedAmount),
            date,
            item.mode,
            item.referenceNo || 'OVERDUE-' + Date.now(),
            'Overdue arrears recovery entry',
            user?.email || 'system'
          )
        )
      )
      toast.success('Recoveries Posted', `Successfully posted ${toProcess.length} overdue recoveries!`)
      setMessage(`Successfully posted ${toProcess.length} overdue recoveries!`)
      window.dispatchEvent(new Event('aa2_data_changed'))
      await loadOverdueEntries()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed.')
      toast.error('Posting Failed', err.message || 'Could not post recoveries.')
    } finally {
      setOverdueSaving(false)
    }
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
      variant: 'info',
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
    window.dispatchEvent(new Event('aa2_data_changed'))
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Collections Hub</h1>
        <p className="text-slate-500 text-xs mt-0.5">Daily collection worksheet, overdue & arrears recovery, individual receipts, CSV bulk upload, and field officer printouts.</p>
      </div>

      {/* Live Collection Target & Efficiency Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-5 rounded-2xl text-white shadow-xs">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scheduled Target Demand</p>
          <p className="text-xl font-extrabold font-mono text-white mt-1">{inr(filteredEntries.reduce((s, e) => s + e.totalOverdue, 0))}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{filteredEntries.length} Borrowing Accounts</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Total Collected Today</p>
          <p className="text-xl font-extrabold font-mono text-emerald-400 mt-1">{inr(totalCollectedSum)}</p>
          <p className="text-[11px] text-emerald-300/80 mt-0.5">{entries.filter(e => Number(e.collectedAmount) > 0).length} Payments Entered</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pending Shortfall</p>
          <p className="text-xl font-extrabold font-mono text-amber-400 mt-1">{inr(Math.max(0, filteredEntries.reduce((s, e) => s + e.totalOverdue, 0) - totalCollectedSum))}</p>
          <p className="text-[11px] text-amber-300/80 mt-0.5">Remaining to Collect</p>
        </div>
        <div>
          {(() => {
            const demand = filteredEntries.reduce((s, e) => s + e.totalOverdue, 0)
            const eff = demand > 0 ? (totalCollectedSum / demand) * 100 : 0
            return (
              <>
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Collection Efficiency</p>
                  <span className="text-sm font-extrabold font-mono text-blue-300">{eff.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 mt-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-emerald-400 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, eff)}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Real-time Field Collection Rate</p>
              </>
            )
          })()}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-1 text-xs">
        {([
          { id: 'sheet', label: 'Daily Collection Worksheet', icon: Table2 },
          { id: 'overdue', label: 'Overdue & Arrears Recovery', icon: AlertCircle },
          { id: 'individual', label: 'Individual EMI Collection', icon: FileText },
          { id: 'csv_upload', label: 'CSV Bulk Upload', icon: Upload },
          { id: 'field_printout', label: 'Field Sheet Printout', icon: Printer },
        ] as { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <tab.icon className="w-3.5 h-3.5" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Daily Collection Worksheet (Strict Target Date Dues) ── */}
      {activeTab === 'sheet' && (
        <div className="space-y-4 tab-transition">
          {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {message}</div>}
          {errorMessage && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {errorMessage}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Due Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branch Select</label>
              <select value={branch} onChange={e => setBranch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Branches</option>
                {branchesList.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Field Officer Select</label>
              <select value={foName} onChange={e => setFoName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Field Officers</option>
                {foList.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className="flex items-end gap-1.5">
              <button onClick={fillAllDue} className="w-full py-2 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 text-xs font-bold rounded-xl transition">
                Auto-Fill All Dues
              </button>
            </div>

            <div className="flex items-end gap-1.5">
              <button
                onClick={() => downloadExcel(`daily_collection_${date}.xlsx`, ['Loan A/C', 'Member Name', 'Branch', 'Field Officer', 'Meeting Day', 'No. of EMIs Due', 'Single EMI (Rs)', 'Net Total Due (Rs)', 'Collected Amount (Rs)', 'Mode', 'Ref No'], filteredEntries.map(e => [
                  e.loan.loan_account_no,
                  e.loan.member_name_cache || e.loan.member_name,
                  e.loan.branch_code,
                  e.loan.fo_name || '',
                  e.loan.meeting_day || '',
                  e.dueCount,
                  e.emiAmt,
                  e.totalOverdue,
                  e.collectedAmount || 0,
                  e.mode,
                  e.referenceNo
                ]))}
                className="w-full py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1">
                <Download className="w-3.5 h-3.5" /> Excel Export (.xlsx)
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700">{filteredEntries.length} loan accounts scheduled for {fdate(date)}</span>
                <span className="text-[11px] text-slate-400 ml-2">Total Demand: <strong className="text-slate-800 font-mono">{inr(filteredEntries.reduce((s, e) => s + e.totalOverdue, 0))}</strong></span>
              </div>
              <button onClick={handleSaveAll} disabled={saving || loading || totalCollectedSum === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Posting Payments…' : `Post Selected (${inr(totalCollectedSum)})`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-semibold">Member</th>
                    <th className="text-left px-4 py-3 font-semibold">Loan A/C</th>
                    <th className="text-left px-4 py-3 font-semibold">Branch / FO</th>
                    <th className="text-center px-4 py-3 font-semibold">Meeting Day</th>
                    <th className="text-center px-4 py-3 font-semibold">No. of EMIs Due</th>
                    <th className="text-right px-4 py-3 font-semibold">Single EMI (₹)</th>
                    <th className="text-right px-4 py-3 font-semibold">Net Total Due (₹)</th>
                    <th className="text-left px-4 py-3 w-40 font-semibold">Collected (₹)</th>
                    <th className="text-left px-4 py-3 w-32 font-semibold">Mode</th>
                    <th className="text-left px-4 py-3 w-36 font-semibold">Ref No</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading && <tr><td colSpan={10} className="py-10 text-center text-slate-400">Loading daily collection worksheet…</td></tr>}
                  {!loading && filteredEntries.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-slate-400">No scheduled dues for {fdate(date)}.</td></tr>}
                  {!loading && filteredEntries.map(e => (
                    <tr key={e.loan.loan_account_no} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-2.5 font-bold text-slate-800">
                        <Link href={`/members/${e.loan.customer_id}`} className="hover:underline">
                          {e.loan.member_name_cache || e.loan.member_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-blue-600 font-bold">
                        <Link href={`/loans/${e.loan.loan_account_no}`} className="hover:underline">
                          {e.loan.loan_account_no}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-[11px]">{e.loan.branch_code} / {e.loan.fo_name || '—'}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{e.loan.meeting_day || '—'}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">
                        <span className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${e.dueCount > 1 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700'}`}>
                          {e.dueCount} EMI(s)
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-600">{inr(e.emiAmt)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">{inr(e.totalOverdue)}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <input type="number" placeholder="0" value={e.collectedAmount}
                            onChange={el => setField(e.loan.loan_account_no, 'collectedAmount', el.target.value)}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold font-mono focus:bg-white focus:outline-none focus:border-blue-400" />
                          <button type="button" onClick={() => setField(e.loan.loan_account_no, 'collectedAmount', String(e.totalOverdue))}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition" title="Fill net due"><Sparkles className="w-3 h-3 text-slate-600" /></button>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select value={e.mode} onChange={el => setField(e.loan.loan_account_no, 'mode', el.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none">
                          <option>Cash</option><option>UPI</option><option>Bank Transfer / NEFT</option><option>Cheque</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="text" placeholder="Ref/UTR" value={e.referenceNo}
                          onChange={el => setField(e.loan.loan_account_no, 'referenceNo', el.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:bg-white focus:outline-none" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Overdue & Arrears Recovery (Dedicated Past Dues Tab) ── */}
      {activeTab === 'overdue' && (
        <div className="space-y-4 tab-transition">
          {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {message}</div>}
          {errorMessage && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {errorMessage}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">As of Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branch Select</label>
              <select value={branch} onChange={e => setBranch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="">All Branches</option>
                {branchesList.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Field Officer Select</label>
              <select value={foName} onChange={e => setFoName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="">All Field Officers</option>
                {foList.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DPD Bucket</label>
              <select value={dpdFilter} onChange={e => setDpdFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="">All Overdue Buckets</option>
                <option value="1-30">1-30 Days Overdue</option>
                <option value="31-60">31-60 Days Overdue</option>
                <option value="61-90">61-90 Days Overdue</option>
                <option value="90+ NPA">90+ Days NPA</option>
              </select>
            </div>

            <div className="flex items-end gap-1.5">
              <button onClick={fillAllOverdues} className="w-full py-2 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 text-xs font-bold rounded-xl transition">
                Auto-Fill Overdues
              </button>
            </div>

            <div className="flex items-end gap-1.5">
              <button
                onClick={() => downloadExcel(`overdue_recovery_${date}.xlsx`, ['Loan A/C', 'Member Name', 'Branch', 'Field Officer', 'Missed EMIs', 'DPD', 'Bucket', 'Total Overdue (Rs)', 'Recovered (Rs)', 'Mode', 'Ref No'], filteredOverdues.map(e => [
                  e.loan.loan_account_no,
                  e.loan.member_name_cache || e.loan.member_name,
                  e.loan.branch_code,
                  e.loan.fo_name || '',
                  e.unpaidCount,
                  e.dpd,
                  e.dpdBucket,
                  e.totalOverdueAmt,
                  e.collectedAmount || 0,
                  e.mode,
                  e.referenceNo
                ]))}
                className="w-full py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1">
                <Download className="w-3.5 h-3.5" /> Excel (.xlsx)
              </button>
              <button onClick={() => printOverdueSheet(filteredOverdues, date, branch, foName)} className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl transition" title="Print Overdue Recovery Sheet">
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-red-50/40">
              <div>
                <span className="text-xs font-bold text-red-800">{filteredOverdues.length} overdue accounts needing recovery</span>
                <span className="text-[11px] text-red-600 ml-2">Total Arrears: <strong className="font-mono">{inr(filteredOverdues.reduce((s, e) => s + e.totalOverdueAmt, 0))}</strong></span>
              </div>
              <button onClick={handleSaveOverdueAll} disabled={overdueSaving || overdueLoading || totalOverdueCollectedSum === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs">
                <Save className="w-3.5 h-3.5" /> {overdueSaving ? 'Posting Recoveries…' : `Post Recoveries (${inr(totalOverdueCollectedSum)})`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-semibold">Member</th>
                    <th className="text-left px-4 py-3 font-semibold">Loan A/C</th>
                    <th className="text-left px-4 py-3 font-semibold">Branch / FO</th>
                    <th className="text-center px-4 py-3 font-semibold">Missed EMIs</th>
                    <th className="text-center px-4 py-3 font-semibold">DPD / Bucket</th>
                    <th className="text-right px-4 py-3 font-semibold">Total Overdue (₹)</th>
                    <th className="text-left px-4 py-3 w-40 font-semibold">Recovered (₹)</th>
                    <th className="text-left px-4 py-3 w-32 font-semibold">Mode</th>
                    <th className="text-left px-4 py-3 w-36 font-semibold">Ref No</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {overdueLoading && <tr><td colSpan={9} className="py-10 text-center text-slate-400">Loading overdue accounts…</td></tr>}
                  {!overdueLoading && filteredOverdues.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-400">No overdue accounts found as of {fdate(date)}! 🎉</td></tr>}
                  {!overdueLoading && filteredOverdues.map(e => (
                    <tr key={e.loan.loan_account_no} className="hover:bg-red-50/20 transition">
                      <td className="px-4 py-2.5 font-bold text-slate-800">
                        <Link href={`/members/${e.loan.customer_id}`} className="hover:underline">
                          {e.loan.member_name_cache || e.loan.member_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-blue-600 font-bold">
                        <Link href={`/loans/${e.loan.loan_account_no}`} className="hover:underline">
                          {e.loan.loan_account_no}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-[11px]">{e.loan.branch_code} / {e.loan.fo_name || '—'}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-mono text-[11px]">
                          {e.unpaidCount} EMI(s)
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${e.dpd > 90 ? 'bg-red-100 text-red-800 border border-red-200' : e.dpd > 30 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700'}`}>
                          {e.dpd} d ({e.dpdBucket})
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-red-700">{inr(e.totalOverdueAmt)}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <input type="number" placeholder="0" value={e.collectedAmount}
                            onChange={el => setOverdueField(e.loan.loan_account_no, 'collectedAmount', el.target.value)}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold font-mono focus:bg-white focus:outline-none focus:border-red-400" />
                          <button type="button" onClick={() => setOverdueField(e.loan.loan_account_no, 'collectedAmount', String(e.totalOverdueAmt))}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition" title="Fill full overdue"><Sparkles className="w-3 h-3 text-slate-600" /></button>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select value={e.mode} onChange={el => setOverdueField(e.loan.loan_account_no, 'mode', el.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none">
                          <option>Cash</option><option>UPI</option><option>Bank Transfer / NEFT</option><option>Cheque</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="text" placeholder="Ref/UTR" value={e.referenceNo}
                          onChange={el => setOverdueField(e.loan.loan_account_no, 'referenceNo', el.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:bg-white focus:outline-none" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Individual EMI Collection with Instant Receipts ── */}
      {activeTab === 'individual' && (
        <div className="space-y-4 tab-transition">
          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Single Installment Collection & Instant Receipts ({emiEntries.length} due loans)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold">Borrower</th>
                    <th className="px-4 py-3 text-left font-semibold">Loan A/C</th>
                    <th className="px-4 py-3 text-left font-semibold">Installments Due</th>
                    <th className="px-4 py-3 text-right font-semibold">Net Balance Due</th>
                    <th className="px-4 py-3 text-left w-36 font-semibold">Collect (₹)</th>
                    <th className="px-4 py-3 text-left w-28 font-semibold">Mode</th>
                    <th className="px-4 py-3 text-right font-semibold">Action & Print</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {emiLoading && <tr><td colSpan={7} className="py-8 text-center text-slate-400">Loading dues…</td></tr>}
                  {!emiLoading && emiEntries.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">No overdue installments found as of date.</td></tr>}
                  {!emiLoading && emiEntries.map((e, idx) => (
                    <tr key={e.loan.loan_account_no} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-2.5 font-bold text-slate-800">
                        <Link href={`/members/${e.loan.customer_id}`} className="hover:underline">
                          {e.loan.member_name_cache || e.loan.member_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-blue-600 font-bold">
                        <Link href={`/loans/${e.loan.loan_account_no}`} className="hover:underline">
                          {e.loan.loan_account_no}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        <span className="font-semibold text-slate-800">{e.emiCount} EMI(s)</span>
                        <p className="text-[10px] text-slate-400">Due from {fdate(e.firstDueDate)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">{inr(e.totalBalance)}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={e.collectAmt}
                          onChange={el => setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, collectAmt: el.target.value } : x))}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={e.mode}
                          onChange={el => setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, mode: el.target.value } : x))}
                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                        >
                          <option>Cash</option><option>UPI</option><option>Bank Transfer / NEFT</option><option>Cheque</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {e.status === 'success' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-emerald-600 font-bold text-[10.5px] flex items-center gap-1">
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
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10.5px] font-bold transition flex items-center gap-1"
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
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10.5px] font-bold transition flex items-center gap-1"
                              title="Thermal POS 58mm Receipt"
                            >
                              <Smartphone className="w-3 h-3" /> POS
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={async () => {
                              const amt = Number(e.collectAmt)
                              if (!amt || amt <= 0) return
                              setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, status: 'saving' } : x))
                              try {
                                const txnId = await applyPayment(
                                  e.loan.loan_account_no,
                                  amt,
                                  date,
                                  e.mode || 'Cash',
                                  e.ref || `MANUAL-${Date.now()}`,
                                  `Single EMI receipt collection (Loan ${e.loan.loan_account_no})`,
                                  user?.name || user?.email || 'Field Staff'
                                )
                                setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, status: 'success', lastTxnId: Number(txnId) || Date.now() } : x))
                                toast.success('Payment Collected', `₹${amt.toLocaleString()} recorded for ${e.loan.member_name_cache || e.loan.member_name}`)
                                window.dispatchEvent(new Event('aa2_data_changed'))
                              } catch (err: any) {
                                setEmiEntries(prev => prev.map((x, i) => i === idx ? { ...x, status: 'error' } : x))
                                toast.error('Payment Failed', err.message || 'Could not record collection.')
                              }
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-xl transition shadow-xs">
                            Collect &amp; Issue Receipt
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

      {/* ── TAB 3: CSV Bulk Upload ── */}
      {activeTab === 'csv_upload' && (
        <div className="space-y-4 tab-transition">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900">
            <p className="font-bold mb-1">CSV Bulk Payment Upload</p>
            <p className="text-slate-600 leading-relaxed">Upload a CSV file exported from offline field sheets or banking statements. Required columns (headers required):
              <code className="bg-blue-100 px-1.5 py-0.5 rounded mx-1 font-mono text-[11px]">loan_account_no, amount, txn_date, mode, reference_no, remarks</code>
              Dates must follow standard <code className="bg-blue-100 px-1 rounded font-mono text-[11px]">YYYY-MM-DD</code> format.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={downloadSampleCSV}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition border border-slate-200">
              <Download className="w-3.5 h-3.5 text-slate-600" /> Download Sample CSV
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs">
              <Upload className="w-3.5 h-3.5" /> Choose CSV File
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            </label>
          </div>

          {csvRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">{csvRows.length} rows parsed from CSV</span>
                {!csvDone && (
                  <button onClick={processCsvRows} disabled={csvProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs">
                    {csvProcessing ? 'Processing…' : `Post ${csvRows.length} Payments`}
                  </button>
                )}
                {csvDone && <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> All rows processed</span>}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
                    <th className="px-4 py-2 text-left font-semibold">Loan A/C</th>
                    <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                    <th className="px-4 py-2 text-left font-semibold">Mode</th>
                    <th className="px-4 py-2 text-left font-semibold">Reference</th>
                    <th className="px-4 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {csvRows.map((row, i) => (
                    <tr key={i} className={row.status === 'error' ? 'bg-red-50' : row.status === 'success' ? 'bg-emerald-50/40' : ''}>
                      <td className="px-4 py-2 font-mono font-bold text-blue-600">{row.loan_account_no}</td>
                      <td className="px-4 py-2 text-right font-mono font-bold">{inr(Number(row.amount))}</td>
                      <td className="px-4 py-2">{fdate(row.txn_date)}</td>
                      <td className="px-4 py-2">{row.mode}</td>
                      <td className="px-4 py-2 font-mono text-[10px]">{row.reference_no || '—'}</td>
                      <td className="px-4 py-2">
                        {row.status === 'pending' && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold text-[9px]">Pending</span>}
                        {row.status === 'success' && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[9px]">✓ Posted</span>}
                        {row.status === 'error' && <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 font-bold text-[9px]" title={row.error}>✗ Error</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: Field Sheet Printout ── */}
      {activeTab === 'field_printout' && (
        <div className="space-y-4 tab-transition">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800">Field Officer Day Collection Sheet</h3>
            <p className="text-xs text-slate-400">Configure date &amp; branch filters below and print a formatted sheet for field officers to carry during collection routes.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Collection Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Branch Code</label>
                <input type="text" placeholder="e.g. HARIDWAR" value={branch} onChange={e => setBranch(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Field Officer Name</label>
                <input type="text" placeholder="e.g. SACHIN KUMAR" value={foName} onChange={e => setFoName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => printFieldSheet(filteredEntries, date, branch, foName)}
                disabled={filteredEntries.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-sm">
                <Printer className="w-3.5 h-3.5" /> Print Field Collection Sheet ({filteredEntries.length} loans)
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold">Loan A/C</th>
                    <th className="px-4 py-3 text-left font-semibold">Member Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Mobile</th>
                    <th className="px-4 py-3 text-left font-semibold">Branch / FO</th>
                    <th className="px-4 py-3 text-right font-semibold">Net Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Loading dues…</td></tr>}
                  {!loading && filteredEntries.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No dues for selected filters.</td></tr>}
                  {!loading && filteredEntries.map(e => (
                    <tr key={e.loan.loan_account_no} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-2.5 font-mono text-blue-600 font-bold">{e.loan.loan_account_no}</td>
                      <td className="px-4 py-2.5 font-bold text-slate-800">{e.loan.member_name_cache || e.loan.member_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{e.loan.mobile || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{e.loan.branch_code} / {e.loan.fo_name || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">{inr(e.totalOverdue || e.emiAmt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredEntries.length > 0 && (
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-700">
                <span>{filteredEntries.length} accounts</span>
                <span>Total Due: <strong className="font-mono">{inr(filteredEntries.reduce((s, e) => s + (e.totalOverdue || e.emiAmt), 0))}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
