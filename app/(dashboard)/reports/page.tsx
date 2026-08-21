'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getPortfolio, generateSchedule, daysBetween } from '@/lib/calculations'
import { getAll } from '@/lib/supabase'
import type { PortfolioRow, ScheduleRow, Loan, Transaction, Customer } from '@/lib/types'
import { inr, fdate, todayISO, dpdBucket } from '@/lib/utils'
import {
  FileText, Download, BarChart2, ShieldAlert, Building2, TrendingUp,
  Filter, Calendar, Search, RefreshCw, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, ArrowUpRight
} from 'lucide-react'

import { exportToExcel } from '@/lib/utils'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────
type TabType = 'loan_register' | 'collection_register' | 'dpd_npa' | 'monthly' | 'branch_fo' | 'rbi' | 'aging' | 'fo_efficiency' | 'dnbs_returns' | 'tally_export' | 'analytics'

const TABS: { key: TabType; label: string; icon: any }[] = [
  { key: 'loan_register', label: 'Loan Register', icon: FileText },
  { key: 'collection_register', label: 'Collection Register', icon: CheckCircle },
  { key: 'dpd_npa', label: 'DPD / NPA Report', icon: AlertTriangle },
  { key: 'aging', label: 'Portfolio Aging', icon: BarChart2 },
  { key: 'fo_efficiency', label: 'FO Efficiency', icon: TrendingUp },
  { key: 'rbi', label: 'RBI Summary', icon: ShieldAlert },
  { key: 'dnbs_returns', label: 'DNBS Returns', icon: FileText },
  { key: 'tally_export', label: 'Tally Export', icon: Download },
  { key: 'analytics', label: 'Visual Analytics', icon: BarChart2 },
]

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('loan_register')
  const [loading, setLoading] = useState(true)

  // Raw data
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])

  // Global filters
  const [filterBranch, setFilterBranch] = useState('')
  const [filterFo, setFilterFo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterDpdBucket, setFilterDpdBucket] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState('')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    loadData()
    const handler = () => loadData()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [port, ls, txs, sched, custs] = await Promise.all([
        getPortfolio(),
        getAll<Loan>('loans'),
        getAll<Transaction>('transactions'),
        getAll<ScheduleRow>('schedule'),
        getAll<Customer>('customers'),
      ])
      setPortfolio(port)
      setLoans(ls)
      setTransactions(txs)
      setSchedule(sched)
      setCustomers(custs)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // ─── Derived filter options ───────────────────────────────────────────────
  const branches = useMemo(() => [...new Set(portfolio.map(p => p.branch).filter(Boolean))].sort(), [portfolio])
  const fos = useMemo(() => [...new Set(portfolio.map(p => p.fo).filter(Boolean))].sort(), [portfolio])

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(a => !a)
    else { setSortField(field); setSortAsc(true) }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return null
    return sortAsc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
  }

  // ─── Filtered loan-level data ─────────────────────────────────────────────
  const filteredPortfolio = useMemo(() => {
    let rows = portfolio.filter(p => {
      if (filterBranch && p.branch !== filterBranch) return false
      if (filterFo && p.fo !== filterFo) return false
      if (filterStatus && p.status !== filterStatus) return false
      if (filterDpdBucket && (p.dpd_bucket || dpdBucket(p.dpd)) !== filterDpdBucket) return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        return p.loan_account_no.toLowerCase().includes(q) || p.member_name.toLowerCase().includes(q)
      }
      return true
    })
    if (sortField) {
      rows = [...rows].sort((a, b) => {
        const av = (a as any)[sortField] ?? ''
        const bv = (b as any)[sortField] ?? ''
        const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return sortAsc ? cmp : -cmp
      })
    }
    return rows
  }, [portfolio, filterBranch, filterFo, filterStatus, filterDpdBucket, searchTerm, sortField, sortAsc])

  // ─── 33-Column Loan Register Rows ──────────────────────────────────────────
  const loanRegisterRows = useMemo(() => {
    const custMap = new Map(customers.map(c => [c.customer_id, c]))
    const loanMap = new Map(loans.map(l => [l.loan_account_no, l]))
    const schedByLoan = new Map<string, ScheduleRow[]>()
    schedule.forEach(s => {
      const arr = schedByLoan.get(s.loan_account_no) || []
      arr.push(s)
      schedByLoan.set(s.loan_account_no, arr)
    })

    const today = todayISO()

    return filteredPortfolio.map((p, index) => {
      const l = loanMap.get(p.loan_account_no)
      const cust = custMap.get(p.customer_id || (l ? l.customer_id : ''))
      let lSched = (schedByLoan.get(p.loan_account_no) || []).sort((a, b) => a.installment_no - b.installment_no)
      if (lSched.length === 0 && l) {
        const generated = generateSchedule(l)
        let remPay = p.total_collected || 0
        lSched = generated.map((r: ScheduleRow) => {
          let paid = 0
          if (remPay > 0) {
            paid = Math.min(r.emi_due, remPay)
            remPay -= paid
          }
          const isPaid = paid >= r.emi_due - 0.5
          const dpd = !isPaid && r.due_date < today ? daysBetween(r.due_date, today) : 0
          const status = isPaid ? 'Paid' : (paid > 0 ? 'Partial' : (dpd > 0 ? 'Overdue' : 'Pending'))
          return {
            ...r,
            paid_amount: paid,
            status,
            dpd,
          }
        })
      }

      const sno = index + 1
      const loanAcc = p.loan_account_no
      const branchName = p.branch || l?.branch_code || 'Head Office'
      const bmName = l?.bm_name || cust?.bm_name || '—'
      const foName = p.fo || l?.fo_name || cust?.fo_name || '—'
      const memberName = p.member_name || l?.member_name_cache || cust?.full_name || '—'
      const fatherHusband = cust?.father_husband_name || '—'

      const addressParts = [
        cust?.address_current,
        cust?.village_city,
        cust?.district || l?.district,
        cust?.state || l?.state,
        cust?.pincode || l?.pincode
      ].filter(Boolean)
      const address = addressParts.length > 0 ? addressParts.join(', ') : (l?.district ? `${l.district}, ${l.state}` : '—')

      const aadharLast4 = l?.aadhar_last4 || cust?.aadhar_last4 || '—'
      const panNo = l?.pan_no || cust?.pan_no || '—'
      const mobileNo = l?.mobile || cust?.mobile || '—'
      const disbDate = p.disb_date || l?.disbursement_date || ''
      const formattedDisbDate = disbDate ? fdate(disbDate) : '—'
      const loanAmt = p.loan_amount || l?.loan_amount || 0
      const fileCharge = l?.file_charge || 0
      const netDisb = p.net_disbursement || (loanAmt - fileCharge)
      const instAmt = l?.installment_amount || 0
      const repFreq = p.frequency || l?.frequency || 'Monthly'
      const tenure = l?.tenure || lSched.length || 0

      let instDay = '—'
      if (l?.installment_start_date) {
        try {
          const d = new Date(l.installment_start_date)
          instDay = d.toLocaleDateString('en-US', { weekday: 'long' })
        } catch (e) {}
      }
      const instStartDate = l?.installment_start_date ? fdate(l.installment_start_date) : '—'

      const paidRowsCount = lSched.filter(s => s.status === 'Paid').length
      const totalPaidInst = paidRowsCount > 0 ? paidRowsCount : (instAmt > 0 ? Math.floor((p.total_collected || 0) / instAmt) : 0)
      const dueInstNo = lSched.filter(s => s.due_date <= today && s.status !== 'Paid').length
      const balInstTenure = Math.max(0, tenure - totalPaidInst)

      let pendingInstAmt = 0
      let shortInstAmt = 0
      let totalDueInstAmtToDate = 0
      lSched.forEach(s => {
        if (s.due_date <= today) {
          totalDueInstAmtToDate += s.emi_due
          if (s.status !== 'Paid') {
            pendingInstAmt += Math.max(0, s.emi_due - s.paid_amount)
          }
        }
        if (s.status === 'Partial' || (s.paid_amount > 0 && s.paid_amount < s.emi_due)) {
          shortInstAmt += Math.max(0, s.emi_due - s.paid_amount)
        }
      })

      const totalCollected = p.total_collected || 0
      const advanceInstAmt = Math.max(0, totalCollected - totalDueInstAmtToDate)
      const totalRepaymentAmt = l?.total_loan || (instAmt * tenure) || (loanAmt + p.total_interest)

      const totalInterest = p.total_interest || l?.total_interest || Math.max(0, totalRepaymentAmt - loanAmt)
      const interestRatio = totalRepaymentAmt > 0 ? (totalInterest / totalRepaymentAmt) : 0
      const totalInterestPaid = Math.floor(totalCollected * interestRatio)
      const totalPrinciplePaid = Math.max(0, totalCollected - totalInterestPaid)

      const totalInstalmentPaid = totalCollected
      const ledgerBal = p.status?.startsWith('CLOS') ? 0 : Math.max(0, totalRepaymentAmt - totalInstalmentPaid)
      const penaltyDays = p.dpd || l?.dpd || 0
      const penaltyRate = l?.penalty_per_day || 0
      const penaltyAmt = penaltyDays * penaltyRate
      const instDpd = p.dpd || l?.dpd || 0

      return {
        sno,
        loanAcc,
        customerId: p.customer_id || l?.customer_id || '',
        branchName,
        bmName,
        foName,
        memberName,
        fatherHusband,
        address,
        aadharLast4,
        panNo,
        mobileNo,
        disbDate: formattedDisbDate,
        loanAmt,
        fileCharge,
        netDisb,
        instAmt,
        repFreq,
        tenure,
        instDay,
        instStartDate,
        totalPaidInst,
        dueInstNo,
        balInstTenure,
        pendingInstAmt,
        shortInstAmt,
        advanceInstAmt,
        totalRepaymentAmt,
        totalPrinciplePaid,
        totalInterestPaid,
        totalInstalmentPaid,
        ledgerBal,
        penaltyDays,
        penaltyAmt,
        instDpd
      }
    })
  }, [filteredPortfolio, customers, loans, schedule])

  // ─── Filtered transactions ────────────────────────────────────────────────
  const filteredTxns = useMemo(() => {
    const loanMap = new Map(loans.map(l => [l.loan_account_no, l]))
    return transactions.filter(t => {
      if (t.txn_type !== 'PAYMENT' || t.voided) return false
      const loan = loanMap.get(t.loan_account_no)
      if (filterBranch && loan?.branch_code !== filterBranch) return false
      if (filterFo && loan?.fo_name !== filterFo) return false
      if (filterDateFrom && t.txn_date < filterDateFrom) return false
      if (filterDateTo && t.txn_date > filterDateTo) return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        return t.loan_account_no.toLowerCase().includes(q) ||
          (loan?.member_name_cache || '').toLowerCase().includes(q) ||
          (t.reference_no || '').toLowerCase().includes(q)
      }
      return true
    }).sort((a, b) => b.txn_date.localeCompare(a.txn_date) || (b.txn_id || 0) - (a.txn_id || 0))
  }, [transactions, loans, filterBranch, filterFo, filterDateFrom, filterDateTo, searchTerm])

  // ─── DPD/NPA rows ────────────────────────────────────────────────────────
  const dpdRows = useMemo(() => filteredPortfolio
    .filter(p => p.status === 'ACTIVE' && (p.dpd || 0) > 0)
    .sort((a, b) => (b.dpd || 0) - (a.dpd || 0)),
    [filteredPortfolio])

  // ─── Monthly summary ─────────────────────────────────────────────────────
  const monthlySummary = useMemo(() => {
    const map: Record<string, { disbursed: number; collected: number; accounts: Set<string>; npa: number }> = {}
    filteredPortfolio.forEach(p => {
      const m = (p.disb_date || '').slice(0, 7)
      if (!m) return
      if (filterMonth && m !== filterMonth) return
      map[m] = map[m] || { disbursed: 0, collected: 0, accounts: new Set(), npa: 0 }
      map[m].disbursed += p.loan_amount || 0
      map[m].collected += p.total_collected || 0
      map[m].accounts.add(p.loan_account_no)
      if (p.npa_flag) map[m].npa++
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({
      month, disbursed: v.disbursed, collected: v.collected, accounts: v.accounts.size, npa: v.npa,
      outstanding: Math.max(0, v.disbursed - v.collected),
    }))
  }, [filteredPortfolio, filterMonth])

  // ─── Branch/FO summary ───────────────────────────────────────────────────
  const branchFoSummary = useMemo(() => {
    const map: Record<string, { branch: string; fo: string; count: number; disbursed: number; outstanding: number; collected: number; npa: number; par: number }> = {}
    filteredPortfolio.forEach(p => {
      const key = `${p.branch || 'Head Office'}||${p.fo || 'Unassigned'}`
      map[key] = map[key] || { branch: p.branch || 'Head Office', fo: p.fo || 'Unassigned', count: 0, disbursed: 0, outstanding: 0, collected: 0, npa: 0, par: 0 }
      map[key].count++
      map[key].disbursed += p.loan_amount || 0
      map[key].outstanding += p.outstanding || 0
      map[key].collected += p.total_collected || 0
      if (p.npa_flag) map[key].npa++
      if (p.par_flag) map[key].par++
    })
    return Object.values(map).sort((a, b) => b.disbursed - a.disbursed)
  }, [filteredPortfolio])

  // ─── RBI Compliance ──────────────────────────────────────────────────────
  const activePortfolio = useMemo(() => portfolio.filter(p => p.status === 'ACTIVE'), [portfolio])
  const glp = activePortfolio.reduce((s, p) => s + (p.outstanding || 0), 0)
  const npaAmt = activePortfolio.filter(p => p.npa_flag).reduce((s, p) => s + (p.outstanding || 0), 0)
  const par30Amt = activePortfolio.filter(p => (p.dpd || 0) >= 30).reduce((s, p) => s + (p.outstanding || 0), 0)

  // ─── Aging ──────────────────────────────────────────────────────────────
  const agingData = useMemo(() => {
    const buckets: Record<string, { count: number; amount: number }> = {
      'Current': { count: 0, amount: 0 }, '1–30 DPD': { count: 0, amount: 0 },
      '31–60 DPD': { count: 0, amount: 0 }, '61–90 DPD': { count: 0, amount: 0 },
      '90+ (NPA)': { count: 0, amount: 0 }, '180+ (Write-off risk)': { count: 0, amount: 0 }
    }
    filteredPortfolio.filter(p => p.status === 'ACTIVE').forEach(p => {
      const b = p.dpd_bucket || dpdBucket(p.dpd || 0)
      if (buckets[b]) { buckets[b].count++; buckets[b].amount += p.outstanding || 0 }
    })
    const total = Object.values(buckets).reduce((s, v) => s + v.count, 0) || 1
    const totalAmt = Object.values(buckets).reduce((s, v) => s + v.amount, 0) || 1
    return Object.entries(buckets).map(([bucket, v]) => ({
      bucket, ...v, pctCount: ((v.count / total) * 100).toFixed(1), pctAmount: ((v.amount / totalAmt) * 100).toFixed(1)
    }))
  }, [filteredPortfolio])

  function clearFilters() {
    setFilterBranch(''); setFilterFo(''); setFilterStatus(''); setFilterDateFrom('')
    setFilterDateTo(''); setFilterMonth(''); setFilterDpdBucket(''); setSearchTerm('')
  }

  const hasFilters = filterBranch || filterFo || filterStatus || filterDateFrom || filterDateTo || filterMonth || filterDpdBucket || searchTerm

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Generating reports…</p>
        </div>
      </div>
    )
  }

  // ─── Global filter bar ────────────────────────────────────────────────────
  const FilterBar = () => (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
        <Filter className="w-3.5 h-3.5" /> Filters
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All Branches</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filterFo} onChange={e => setFilterFo(e.target.value)}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All FOs</option>
          {fos.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {(activeTab === 'loan_register') && (
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none">
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="CLOSE">Closed</option>
            <option value="SANCTIONED">Sanctioned</option>
          </select>
        )}
        {(activeTab === 'dpd_npa') && (
          <select value={filterDpdBucket} onChange={e => setFilterDpdBucket(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none">
            <option value="">All DPD Buckets</option>
            <option value="1–30 DPD">1–30 DPD</option>
            <option value="31–60 DPD">31–60 DPD</option>
            <option value="61–90 DPD">61–90 DPD</option>
            <option value="90+ (NPA)">90+ (NPA)</option>
          </select>
        )}
        {(activeTab === 'collection_register') && (
          <>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs" />
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs" />
          </>
        )}
        {(activeTab === 'monthly') && (
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs" />
        )}
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search loan / member…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-44" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters}
            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition">
            Clear All
          </button>
        )}
      </div>
    </div>
  )

  const th = (label: string, field?: string) => (
    <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
      onClick={() => field && handleSort(field)}>
      {label}{field && <SortIcon field={field} />}
    </th>
  )
  const thr = (label: string, field?: string) => (
    <th className="text-right px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-700 whitespace-nowrap"
      onClick={() => field && handleSort(field)}>
      {label}{field && <SortIcon field={field} />}
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">MIS & Operational Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Individual loan-level data with all filters · {filteredPortfolio.length} loans in view</p>
        </div>
      </div>

      {/* Quick KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Active Borrowers', value: activePortfolio.length, color: 'text-slate-800' },
          { label: 'GLP (Outstanding)', value: inr(glp), color: 'text-blue-700' },
          { label: 'Total Disbursed', value: inr(portfolio.reduce((s, p) => s + p.loan_amount, 0)), color: 'text-slate-800' },
          { label: 'Gross NPA %', value: (glp ? ((npaAmt / glp) * 100).toFixed(2) : '0.00') + '%', color: 'text-red-600' },
          { label: 'PAR 30+ %', value: (glp ? ((par30Amt / glp) * 100).toFixed(2) : '0.00') + '%', color: 'text-amber-600' },
        ].map((k, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{k.label}</p>
            <p className={`text-xl font-black mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-0 border-b border-slate-200">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-6">

        {/* ── TAB: LOAN REGISTER ── */}
        {activeTab === 'loan_register' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">MIS Loan Register — 34-Column Detailed Format ({loanRegisterRows.length})</h2>
              <button onClick={() => {
                let csv = 'S.NO.,LOAN ACCOUNT NUMBER,Branch Name,BM Name,FO Name,Member Name,Father/Husband Name,ADDRESS,Aadhar No. (last 4 Digits),PAN No.,Mobile No.,Disbursement DATE (DD-MM-YYYY),Loan Amount,File Charge,Net Disbursement,Installment Amount,Repayment Frequency,Loan Tenure,Installment Day,Installment start date (DD-MM-YYYY),Total No. of Paid Installment,Due Installment No.,Balance Installment Tenure,Pending Installment amount,Short Installment Amount,Advance Installment amount,Total Repayment amount,TOTAL PRINCIPLE PAID,TOTAL INTEREST PAID,TOTAL INSTALMENT PAID,Ledger Balance (OUTSTANDING PRINCIPLE + INT),Total Penality days,Total Penality amount,Installment DPD\n'
                loanRegisterRows.forEach(r => {
                  const safeAddr = `"${r.address.replace(/"/g, '""')}"`
                  csv += `${r.sno},${r.loanAcc},"${r.branchName}","${r.bmName}","${r.foName}","${r.memberName}","${r.fatherHusband}",${safeAddr},${r.aadharLast4},${r.panNo},${r.mobileNo},${r.disbDate},${r.loanAmt},${r.fileCharge},${r.netDisb},${r.instAmt},${r.repFreq},${r.tenure},"${r.instDay}",${r.instStartDate},${r.totalPaidInst},${r.dueInstNo},${r.balInstTenure},${r.pendingInstAmt},${r.shortInstAmt},${r.advanceInstAmt},${r.totalRepaymentAmt},${r.totalPrinciplePaid},${r.totalInterestPaid},${r.totalInstalmentPaid},${r.ledgerBal},${r.penaltyDays},${r.penaltyAmt},${r.instDpd}\n`
                })
                downloadCSV(csv, `Loan_Register_34Cols_${todayISO()}.csv`)
              }} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 text-xs shadow-sm transition">
                <Download className="w-3.5 h-3.5" /> Export 34-Col CSV
              </button>
            </div>
            <FilterBar />
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs min-w-[3400px]">
                <thead>
                  <tr className="bg-slate-800 text-white text-[10px] uppercase tracking-wide">
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">S.NO.</th>
                    <th className="px-3 py-2.5 text-left font-bold border-r border-slate-700">LOAN ACCOUNT NUMBER</th>
                    <th className="px-3 py-2.5 text-left font-bold border-r border-slate-700">Branch Name</th>
                    <th className="px-3 py-2.5 text-left font-bold border-r border-slate-700">BM Name</th>
                    <th className="px-3 py-2.5 text-left font-bold border-r border-slate-700">FO Name</th>
                    <th className="px-3 py-2.5 text-left font-bold border-r border-slate-700">Member Name</th>
                    <th className="px-3 py-2.5 text-left font-bold border-r border-slate-700">Father/Husband Name</th>
                    <th className="px-3 py-2.5 text-left font-bold border-r border-slate-700 min-w-[250px]">ADDRESS</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Aadhar No. (last 4)</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">PAN No.</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Mobile No.</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Disbursement DATE</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Loan Amount</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">File Charge</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Net Disbursement</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Installment Amount</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Repayment Frequency</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Loan Tenure</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Installment Day</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Installment start date</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Total Paid Inst</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Due Inst No</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Bal Inst Tenure</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Pending Inst Amt</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Short Inst Amt</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Advance Inst Amt</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Total Repayment Amt</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">TOTAL PRINCIPLE PAID</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700 text-blue-300">TOTAL INTEREST PAID</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">TOTAL INSTALMENT PAID</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Ledger Balance</th>
                    <th className="px-3 py-2.5 text-center font-bold border-r border-slate-700">Penalty Days</th>
                    <th className="px-3 py-2.5 text-right font-bold border-r border-slate-700">Penalty Amount</th>
                    <th className="px-3 py-2.5 text-center font-bold">Installment DPD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loanRegisterRows.map((r) => (
                    <tr key={r.sno} className="hover:bg-blue-50/40 transition">
                      <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">{r.sno}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-blue-600 font-bold border-r border-slate-100">
                        <Link href={`/loans/${r.loanAcc}`} className="hover:underline">
                          {r.loanAcc}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-700 border-r border-slate-100">{r.branchName}</td>
                      <td className="px-3 py-2 text-slate-600 border-r border-slate-100">{r.bmName}</td>
                      <td className="px-3 py-2 text-slate-600 border-r border-slate-100">{r.foName}</td>
                      <td className="px-3 py-2 font-bold text-slate-800 border-r border-slate-100">
                        <Link href={r.customerId ? `/members/${r.customerId}` : '#'} className="text-blue-600 hover:underline">
                          {r.memberName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-600 border-r border-slate-100">{r.fatherHusband}</td>
                      <td className="px-3 py-2 text-slate-500 text-[11px] border-r border-slate-100">{r.address}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600 border-r border-slate-100">{r.aadharLast4}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-700 font-medium border-r border-slate-100">{r.panNo}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600 border-r border-slate-100">{r.mobileNo}</td>
                      <td className="px-3 py-2 text-center text-slate-600 border-r border-slate-100">{r.disbDate}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-800 border-r border-slate-100">{inr(r.loanAmt)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500 border-r border-slate-100">{inr(r.fileCharge)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 border-r border-slate-100">{inr(r.netDisb)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-700 border-r border-slate-100">{inr(r.instAmt)}</td>
                      <td className="px-3 py-2 text-center text-slate-600 border-r border-slate-100">{r.repFreq}</td>
                      <td className="px-3 py-2 text-center text-slate-700 font-medium border-r border-slate-100">{r.tenure}</td>
                      <td className="px-3 py-2 text-center text-slate-600 border-r border-slate-100">{r.instDay}</td>
                      <td className="px-3 py-2 text-center text-slate-600 border-r border-slate-100">{r.instStartDate}</td>
                      <td className="px-3 py-2 text-center font-bold text-emerald-600 border-r border-slate-100">{r.totalPaidInst}</td>
                      <td className="px-3 py-2 text-center font-bold text-amber-600 border-r border-slate-100">{r.dueInstNo}</td>
                      <td className="px-3 py-2 text-center text-slate-600 border-r border-slate-100">{r.balInstTenure}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-700 border-r border-slate-100">{inr(r.pendingInstAmt)}</td>
                      <td className="px-3 py-2 text-right font-mono text-orange-600 border-r border-slate-100">{inr(r.shortInstAmt)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400 border-r border-slate-100">{inr(r.advanceInstAmt)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 border-r border-slate-100">{inr(r.totalRepaymentAmt)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 border-r border-slate-100">{inr(r.totalPrinciplePaid)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-700 border-r border-slate-100">{inr(r.totalInterestPaid)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600 border-r border-slate-100">{inr(r.totalInstalmentPaid)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-amber-700 border-r border-slate-100">{inr(r.ledgerBal)}</td>
                      <td className="px-3 py-2 text-center font-bold text-red-600 border-r border-slate-100">{r.penaltyDays}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-600 border-r border-slate-100">{inr(r.penaltyAmt)}</td>
                      <td className="px-3 py-2 text-center font-bold text-red-600">{r.instDpd}</td>
                    </tr>
                  ))}
                  {loanRegisterRows.length === 0 && (
                    <tr>
                      <td colSpan={34} className="py-12 text-center text-slate-400 text-sm">
                        No loans found matching the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: COLLECTION REGISTER ── */}
        {activeTab === 'collection_register' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Collection Receipt Register ({filteredTxns.length} receipts)</h2>
                <p className="text-xs text-slate-500 mt-0.5">Total collected: <strong className="text-emerald-600">{inr(filteredTxns.reduce((s, t) => s + t.amount, 0))}</strong></p>
              </div>
              <button onClick={() => {
                let csv = 'Txn ID,Date,Loan Account,Member,Branch,FO,Amount,Mode,Reference,Classification\n'
                filteredTxns.forEach(t => {
                  const loan = loans.find(l => l.loan_account_no === t.loan_account_no)
                  csv += `${t.txn_id},${t.txn_date},${t.loan_account_no},"${loan?.member_name_cache || loan?.member_name || ''}",${loan?.branch_code || ''},${loan?.fo_name || ''},${t.amount},${t.mode},${t.reference_no || ''},${t.classification || ''}\n`
                })
                downloadCSV(csv, `Collection_Register_${todayISO()}.csv`)
              }} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <FilterBar />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Loan Account</th>
                    <th className="text-left px-4 py-3 font-semibold">Member</th>
                    <th className="text-left px-4 py-3 font-semibold">Branch</th>
                    <th className="text-left px-4 py-3 font-semibold">FO</th>
                    <th className="text-right px-4 py-3 font-semibold">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold">Mode</th>
                    <th className="text-left px-4 py-3 font-semibold">Reference</th>
                    <th className="text-left px-4 py-3 font-semibold">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTxns.slice(0, 300).map((t, i) => {
                    const loan = loans.find(l => l.loan_account_no === t.loan_account_no)
                    return (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-semibold text-slate-700">{fdate(t.txn_date)}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-blue-600 font-bold">{t.loan_account_no}</td>
                        <td className="px-4 py-2.5 text-slate-800 font-medium">{loan?.member_name_cache || loan?.member_name || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500">{loan?.branch_code || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500">{loan?.fo_name || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700 font-mono">{inr(t.amount)}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[9px] font-semibold text-slate-600">{t.mode || 'Cash'}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400">{t.reference_no || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-[10px]">{t.classification || 'EMI Payment'}</td>
                      </tr>
                    )
                  })}
                  {filteredTxns.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-400">No payments found for selected filters</td></tr>}
                  {filteredTxns.length > 300 && <tr><td colSpan={9} className="py-3 text-center text-xs text-slate-400">Showing 300 of {filteredTxns.length}. Export CSV for full data.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: DPD / NPA ── */}
        {activeTab === 'dpd_npa' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">DPD / NPA Report — Individual Accounts ({dpdRows.length})</h2>
                <p className="text-xs text-slate-500 mt-0.5">At-risk outstanding: <strong className="text-red-600">{inr(dpdRows.reduce((s, p) => s + p.outstanding, 0))}</strong></p>
              </div>
              <button onClick={() => {
                let csv = 'Loan Account,Member,Branch,FO,Loan Amount,Outstanding,DPD,Bucket,NPA\n'
                dpdRows.forEach(p => { csv += `${p.loan_account_no},"${p.member_name}",${p.branch},${p.fo},${p.loan_amount},${p.outstanding},${p.dpd || 0},${p.dpd_bucket || 'Current'},${p.npa_flag ? 'Yes' : 'No'}\n` })
                downloadCSV(csv, `DPD_NPA_${todayISO()}.csv`)
              }} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <FilterBar />
            {/* Bucket summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[['1–30 DPD', 'bg-yellow-50 border-yellow-200 text-yellow-700'], ['31–60 DPD', 'bg-orange-50 border-orange-200 text-orange-700'], ['61–90 DPD', 'bg-red-50 border-red-200 text-red-700'], ['90+ (NPA)', 'bg-red-100 border-red-300 text-red-800']].map(([bucket, cls]) => {
                const rows = dpdRows.filter(p => (p.dpd_bucket || dpdBucket(p.dpd || 0)) === bucket)
                return (
                  <div key={bucket} className={`p-4 rounded-xl border ${cls}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider">{bucket}</p>
                    <p className="text-xl font-black mt-1">{rows.length} accts</p>
                    <p className="text-xs font-semibold mt-0.5">{inr(rows.reduce((s, p) => s + p.outstanding, 0))}</p>
                  </div>
                )
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-semibold">Loan Account</th>
                    <th className="text-left px-4 py-3 font-semibold">Member</th>
                    <th className="text-left px-4 py-3 font-semibold">Branch</th>
                    <th className="text-left px-4 py-3 font-semibold">Field Officer</th>
                    <th className="text-right px-4 py-3 font-semibold">Loan Amt</th>
                    <th className="text-right px-4 py-3 font-semibold">Outstanding</th>
                    <th className="text-right px-4 py-3 font-semibold">DPD</th>
                    <th className="text-center px-4 py-3 font-semibold">Bucket</th>
                    <th className="text-center px-4 py-3 font-semibold">NPA</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dpdRows.map((p, i) => (
                    <tr key={i} className={`hover:bg-slate-50/50 ${p.npa_flag ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-blue-600 font-bold">{p.loan_account_no}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{p.member_name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.branch || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.fo || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">{inr(p.loan_amount)}</td>
                      <td className="px-4 py-2.5 text-right font-bold font-mono text-amber-700">{inr(p.outstanding)}</td>
                      <td className="px-4 py-2.5 text-right font-black text-red-600">{p.dpd}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${p.npa_flag ? 'bg-red-100 text-red-700' : (p.dpd || 0) > 60 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {p.dpd_bucket || dpdBucket(p.dpd || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">{p.npa_flag ? <span className="text-red-600 font-bold text-xs">NPA</span> : '—'}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/loans/${p.loan_account_no}`} className="text-blue-500 hover:text-blue-700"><ArrowUpRight className="w-3.5 h-3.5" /></Link>
                      </td>
                    </tr>
                  ))}
                  {dpdRows.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-emerald-500 font-medium">🎉 No overdue accounts found!</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: MONTHLY SUMMARY ── */}
        {activeTab === 'monthly' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Monthly Disbursement & Collection Summary</h2>
              <button onClick={() => {
                let csv = 'Month,Accounts,Disbursed,Collected,Outstanding,NPA Accounts\n'
                monthlySummary.forEach(r => { csv += `${r.month},${r.accounts},${r.disbursed},${r.collected},${r.outstanding},${r.npa}\n` })
                downloadCSV(csv, `Monthly_Summary_${todayISO()}.csv`)
              }} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <FilterBar />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-semibold">Month</th>
                    <th className="text-right px-5 py-3 font-semibold">Accounts</th>
                    <th className="text-right px-5 py-3 font-semibold">Disbursed</th>
                    <th className="text-right px-5 py-3 font-semibold">Collected</th>
                    <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                    <th className="text-right px-5 py-3 font-semibold">NPA Accounts</th>
                    <th className="text-right px-5 py-3 font-semibold">Coll. Eff. %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlySummary.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-bold text-slate-700">{r.month}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{r.accounts}</td>
                      <td className="px-5 py-3 text-right font-mono text-blue-700 font-semibold">{inr(r.disbursed)}</td>
                      <td className="px-5 py-3 text-right font-mono text-emerald-700 font-semibold">{inr(r.collected)}</td>
                      <td className="px-5 py-3 text-right font-mono text-amber-600">{inr(r.outstanding)}</td>
                      <td className="px-5 py-3 text-right text-red-600 font-semibold">{r.npa || 0}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-700">
                        {r.disbursed > 0 ? ((r.collected / r.disbursed) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                  ))}
                  {monthlySummary.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No data for selected filters</td></tr>}
                </tbody>
                {monthlySummary.length > 1 && (
                  <tfoot>
                    <tr className="bg-slate-900 text-white text-xs font-bold">
                      <td className="px-5 py-3">TOTAL</td>
                      <td className="px-5 py-3 text-right">{monthlySummary.reduce((s, r) => s + r.accounts, 0)}</td>
                      <td className="px-5 py-3 text-right font-mono">{inr(monthlySummary.reduce((s, r) => s + r.disbursed, 0))}</td>
                      <td className="px-5 py-3 text-right font-mono text-emerald-400">{inr(monthlySummary.reduce((s, r) => s + r.collected, 0))}</td>
                      <td className="px-5 py-3 text-right font-mono text-amber-400">{inr(monthlySummary.reduce((s, r) => s + r.outstanding, 0))}</td>
                      <td className="px-5 py-3 text-right">{monthlySummary.reduce((s, r) => s + (r.npa || 0), 0)}</td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: BRANCH / FO SUMMARY ── */}
        {activeTab === 'branch_fo' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Branch & Field Officer Summary</h2>
              <button onClick={() => {
                let csv = 'Branch,Field Officer,Loans,Disbursed,Collected,Outstanding,PAR,NPA\n'
                branchFoSummary.forEach(r => { csv += `${r.branch},${r.fo},${r.count},${r.disbursed},${r.collected},${r.outstanding},${r.par},${r.npa}\n` })
                downloadCSV(csv, `Branch_FO_Summary_${todayISO()}.csv`)
              }} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <FilterBar />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-semibold">Branch</th>
                    <th className="text-left px-5 py-3 font-semibold">Field Officer</th>
                    <th className="text-right px-5 py-3 font-semibold">Loans</th>
                    <th className="text-right px-5 py-3 font-semibold">Disbursed</th>
                    <th className="text-right px-5 py-3 font-semibold">Collected</th>
                    <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                    <th className="text-right px-5 py-3 font-semibold">PAR</th>
                    <th className="text-right px-5 py-3 font-semibold">NPA</th>
                    <th className="text-right px-5 py-3 font-semibold">Coll. Eff.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branchFoSummary.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-bold text-slate-800">{r.branch}</td>
                      <td className="px-5 py-3 text-slate-600">{r.fo}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{r.count}</td>
                      <td className="px-5 py-3 text-right font-mono text-blue-700">{inr(r.disbursed)}</td>
                      <td className="px-5 py-3 text-right font-mono text-emerald-700 font-semibold">{inr(r.collected)}</td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-amber-700">{inr(r.outstanding)}</td>
                      <td className="px-5 py-3 text-right text-orange-600 font-semibold">{r.par}</td>
                      <td className="px-5 py-3 text-right text-red-600 font-bold">{r.npa || '—'}</td>
                      <td className="px-5 py-3 text-right font-bold">
                        <span className={r.disbursed > 0 && (r.collected / r.disbursed) >= 0.9 ? 'text-emerald-600' : 'text-amber-600'}>
                          {r.disbursed > 0 ? ((r.collected / r.disbursed) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {branchFoSummary.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-slate-400">No data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: AGING ── */}
        {activeTab === 'aging' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Portfolio Aging — DPD Bucket Breakdown</h2>
              <button onClick={() => {
                let csv = 'Bucket,Accounts,Count%,Outstanding,Outstanding%\n'
                agingData.forEach(r => { csv += `${r.bucket},${r.count},${r.pctCount}%,${r.amount},${r.pctAmount}%\n` })
                downloadCSV(csv, `Portfolio_Aging_${todayISO()}.csv`)
              }} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <FilterBar />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-semibold">DPD Bucket</th>
                    <th className="text-right px-5 py-3 font-semibold">Accounts</th>
                    <th className="text-right px-5 py-3 font-semibold">Count %</th>
                    <th className="text-right px-5 py-3 font-semibold">Outstanding (₹)</th>
                    <th className="text-right px-5 py-3 font-semibold">Portfolio %</th>
                    <th className="px-5 py-3 font-semibold">Visual Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agingData.map((r, i) => (
                    <tr key={i} className={`hover:bg-slate-50/50 ${r.bucket.includes('NPA') ? 'bg-red-50/20' : ''}`}>
                      <td className="px-5 py-3 font-bold text-slate-700">{r.bucket}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{r.count}</td>
                      <td className="px-5 py-3 text-right text-slate-500">{r.pctCount}%</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-700">{inr(r.amount)}</td>
                      <td className="px-5 py-3 text-right text-slate-500 font-semibold">{r.pctAmount}%</td>
                      <td className="px-5 py-3 w-40">
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className={`h-2 rounded-full ${r.bucket.includes('NPA') || r.bucket.includes('180') ? 'bg-red-500' : r.bucket.includes('61') ? 'bg-red-400' : r.bucket.includes('31') ? 'bg-orange-400' : r.bucket.includes('1–30') ? 'bg-yellow-400' : 'bg-emerald-500'}`}
                            style={{ width: `${r.pctAmount}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold text-xs">
                    <td className="px-5 py-3">TOTAL</td>
                    <td className="px-5 py-3 text-right">{agingData.reduce((s, r) => s + r.count, 0)}</td>
                    <td className="px-5 py-3 text-right">100%</td>
                    <td className="px-5 py-3 text-right font-mono">{inr(agingData.reduce((s, r) => s + r.amount, 0))}</td>
                    <td className="px-5 py-3 text-right">100%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: RBI COMPLIANCE ── */}
        {activeTab === 'rbi' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">RBI Compliance Board Pack</h2>
              <button onClick={() => {
                const totalDisb = portfolio.reduce((s, p) => s + p.loan_amount, 0)
                const totalColl = portfolio.reduce((s, p) => s + p.total_collected, 0)
                const avgTicket = activePortfolio.length ? Math.round(totalDisb / portfolio.length) : 0
                let csv = `RBI COMPLIANCE REPORT,Generated ${todayISO()}\n`
                csv += `Total Loan Accounts,${portfolio.length}\nActive Borrowers,${activePortfolio.length}\n`
                csv += `Gross Loan Portfolio (GLP),${glp}\nAvg Ticket Size,${avgTicket}\n`
                csv += `Total Disbursed,${totalDisb}\nTotal Collected,${totalColl}\n`
                csv += `Gross NPA Amount,${npaAmt}\nGross NPA %,${glp ? ((npaAmt / glp) * 100).toFixed(2) : '0.00'}%\n`
                csv += `PAR 30+ Amount,${par30Amt}\nPAR 30+ %,${glp ? ((par30Amt / glp) * 100).toFixed(2) : '0.00'}%\n`
                downloadCSV(csv, `RBI_Compliance_${todayISO()}.csv`)
              }} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            {(() => {
              const totalDisb = portfolio.reduce((s, p) => s + p.loan_amount, 0)
              const totalColl = portfolio.reduce((s, p) => s + p.total_collected, 0)
              const avgTicket = activePortfolio.length ? Math.round(totalDisb / portfolio.length) : 0
              const npaRatio = glp ? ((npaAmt / glp) * 100).toFixed(2) : '0.00'
              const par30Ratio = glp ? ((par30Amt / glp) * 100).toFixed(2) : '0.00'
              const metrics = [
                { label: 'Total Loan Accounts', value: portfolio.length.toString() },
                { label: 'Active Borrowers', value: activePortfolio.length.toString() },
                { label: 'Gross Loan Portfolio (GLP)', value: inr(glp) },
                { label: 'Average Ticket Size', value: inr(avgTicket) },
                { label: 'Total Disbursed', value: inr(totalDisb) },
                { label: 'Total Collected', value: inr(totalColl) },
                { label: 'Gross NPA Amount', value: inr(npaAmt) },
                { label: 'Gross NPA Ratio', value: npaRatio + '%' },
                { label: 'PAR 30+ Amount', value: inr(par30Amt) },
                { label: 'PAR 30+ Ratio', value: par30Ratio + '%' },
              ]
              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {metrics.map((m, i) => (
                    <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{m.label}</span>
                      <span className={`text-lg font-bold block mt-1 ${m.label.includes('NPA') || m.label.includes('PAR') ? 'text-red-600' : 'text-slate-800'}`}>{m.value}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
            <div className="bg-blue-50 border border-blue-200/50 p-5 rounded-xl text-blue-900 text-xs leading-relaxed space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-sm"><ShieldAlert className="w-4 h-4 text-blue-600" /> RBI / NBFC-MFI Regulatory Note</div>
              <p>Under RBI guidelines, installments unpaid for more than 90 days are classified as NPA. MFIs must maintain GLP with NPA ratio within regulatory thresholds. PAR (Portfolio at Risk) 30+ measures the value of loans where at least one installment is overdue by 30+ days as a percentage of GLP.</p>
            </div>
          </div>
        )}

        {/* ── TAB: FO COLLECTION EFFICIENCY ── */}
        {activeTab === 'fo_efficiency' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Field Officer (FO) Collection Efficiency Report</h2>
              <button
                onClick={() => exportToExcel(
                  fos.map(fo => {
                    const foLoans = portfolio.filter(p => p.fo === fo)
                    const demand = foLoans.reduce((s, p) => s + (p.loan_amount / (p.frequency === 'Weekly' ? 25 : 12)), 0)
                    const coll = foLoans.reduce((s, p) => s + p.total_collected, 0)
                    const eff = demand > 0 ? Math.min(100, Math.round((coll / demand) * 100)) : 100
                    return {
                      'Field Officer': fo || 'Unassigned',
                      'Active Loans': foLoans.length,
                      'Demand Amount (₹)': Math.round(demand),
                      'Collected Amount (₹)': Math.round(coll),
                      'Efficiency %': `${eff}%`,
                      'NPA Count': foLoans.filter(p => p.dpd >= 90).length,
                    }
                  }),
                  'FO_Collection_Efficiency'
                )}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition"
              >
                <Download className="w-3.5 h-3.5" /> Export Excel
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">
                    <th className="text-left px-5 py-3 font-semibold">Field Officer Name</th>
                    <th className="text-center px-5 py-3 font-semibold">Active Loans</th>
                    <th className="text-right px-5 py-3 font-semibold">Demand Amount</th>
                    <th className="text-right px-5 py-3 font-semibold">Collected Amount</th>
                    <th className="text-center px-5 py-3 font-semibold">Efficiency %</th>
                    <th className="text-center px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {fos.map(fo => {
                    const foLoans = portfolio.filter(p => p.fo === fo)
                    const demand = foLoans.reduce((s, p) => s + (p.loan_amount / (p.frequency === 'Weekly' ? 25 : 12)), 0)
                    const coll = foLoans.reduce((s, p) => s + p.total_collected, 0)
                    const eff = demand > 0 ? Math.min(100, Math.round((coll / demand) * 100)) : 100
                    return (
                      <tr key={fo} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-200">{fo || 'Unassigned'}</td>
                        <td className="px-5 py-3 text-center font-mono font-medium">{foLoans.length}</td>
                        <td className="px-5 py-3 text-right font-mono font-medium">{inr(demand)}</td>
                        <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600">{inr(coll)}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`font-black text-xs ${eff >= 95 ? 'text-emerald-600' : eff >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
                            {eff}%
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${eff >= 90 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {eff >= 90 ? 'High Performing' : 'Needs Follow-up'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}



        {/* ── TAB: RBI DNBS RETURNS ── */}
        {activeTab === 'dnbs_returns' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">RBI DNBS Regulatory Returns (DNBS-02 & DNBS-10)</h2>
                <p className="text-xs text-slate-500 mt-0.5">Quarterly Financial & Asset Quality Data Returns for RBI submission</p>
              </div>
              <button
                onClick={() => exportToExcel(
                  [
                    { Metric: 'Reporting Period', Value: todayISO() },
                    { Metric: 'Total Loan Accounts', Value: portfolio.length },
                    { Metric: 'Gross Loan Portfolio (GLP)', Value: glp },
                    { Metric: 'Standard Assets (0 DPD)', Value: portfolio.filter(p => p.dpd === 0).reduce((s, p) => s + p.outstanding, 0) },
                    { Metric: 'Sub-Standard Assets (31-90 DPD)', Value: par30Amt - npaAmt },
                    { Metric: 'Gross NPA Assets (90+ DPD)', Value: npaAmt },
                    { Metric: 'Gross NPA Ratio (%)', Value: `${glp ? ((npaAmt / glp) * 100).toFixed(2) : '0'}%` },
                    { Metric: 'Provisioning Coverage Ratio (PCR)', Value: '100%' },
                  ],
                  'RBI_DNBS_02_10_Return'
                )}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition"
              >
                <Download className="w-3.5 h-3.5" /> Download Official DNBS Return File
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-blue-600" /> DNBS-02 Quarterly Financial Return
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800"><span className="text-slate-500">Gross Loan Portfolio (GLP)</span><span className="font-mono font-bold text-slate-800 dark:text-slate-100">{inr(glp)}</span></div>
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800"><span className="text-slate-500">Total Borrowers Count</span><span className="font-mono font-bold text-slate-800 dark:text-slate-100">{activePortfolio.length}</span></div>
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800"><span className="text-slate-500">Average Disbursed Amount</span><span className="font-mono font-bold text-slate-800 dark:text-slate-100">{inr(portfolio.length ? portfolio.reduce((s, p) => s + p.loan_amount, 0) / portfolio.length : 0)}</span></div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> DNBS-10 Asset Classification & Provisioning
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800"><span className="text-slate-500">Standard Assets (Current)</span><span className="font-mono font-bold text-emerald-600">{inr(portfolio.filter(p => p.dpd === 0).reduce((s, p) => s + p.outstanding, 0))}</span></div>
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800"><span className="text-slate-500">SMA-1 / SMA-2 Assets (1-90 DPD)</span><span className="font-mono font-bold text-amber-600">{inr(par30Amt - npaAmt)}</span></div>
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800"><span className="text-slate-500">NPA Non-Performing Assets (90+ DPD)</span><span className="font-mono font-bold text-red-600">{inr(npaAmt)}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: TALLY / ACCOUNTING EXPORT ── */}
        {activeTab === 'tally_export' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Tally ERP / Prime Voucher Export</h2>
                <p className="text-xs text-slate-500 mt-0.5">Export payment and disbursement vouchers ready for Tally accounting import</p>
              </div>
              <button
                onClick={() => exportToExcel(
                  transactions.map(t => ({
                    'Voucher No': t.txn_id,
                    'Voucher Date': fdate(t.txn_date),
                    'Voucher Type': t.txn_type === 'PAYMENT' ? 'Receipt' : 'Payment',
                    'Debit Account': t.mode === 'Cash' ? 'Cash-in-Hand' : 'Bank Account',
                    'Credit Account': `Loan Account ${t.loan_account_no}`,
                    'Amount (₹)': t.amount,
                    'Narration': t.remarks || `${t.classification} for ${t.loan_account_no}`,
                  })),
                  'Tally_Accounting_Vouchers'
                )}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-500 transition"
              >
                <Download className="w-3.5 h-3.5" /> Export Tally Vouchers (Excel)
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase tracking-wide text-[10px]">
                    <th className="text-left px-5 py-3">Voucher No</th>
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Voucher Type</th>
                    <th className="text-left px-5 py-3">Loan Account</th>
                    <th className="text-right px-5 py-3">Amount (₹)</th>
                    <th className="text-left px-5 py-3">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transactions.slice(0, 15).map(t => (
                    <tr key={t.txn_id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-2.5 font-mono text-[11px] font-bold text-blue-600">{t.txn_id}</td>
                      <td className="px-5 py-2.5 text-slate-600">{fdate(t.txn_date)}</td>
                      <td className="px-5 py-2.5 font-semibold text-slate-700">{t.txn_type === 'PAYMENT' ? 'Receipt' : 'Payment'}</td>
                      <td className="px-5 py-2.5 font-mono text-slate-700">{t.loan_account_no}</td>
                      <td className="px-5 py-2.5 text-right font-mono font-bold text-emerald-600">{inr(t.amount)}</td>
                      <td className="px-5 py-2.5 text-slate-500">{t.mode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: VISUAL ANALYTICS ── */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <h2 className="text-sm font-bold text-slate-800">Visual Portfolio & Performance Analytics</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* DPD Bucket Distribution Chart */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">DPD Bucket Distribution (GLP)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agingData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(val: any) => [inr(val), 'Amount']} />
                      <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Branch Collection Efficiency Chart */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Branch Portfolio Value</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branches.map(b => {
                      const bLoans = portfolio.filter(p => p.branch === b)
                      return { branch: b || 'Head Office', GLP: bLoans.reduce((s, p) => s + p.outstanding, 0) }
                    })}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(val: any) => [inr(val), 'GLP']} />
                      <Bar dataKey="GLP" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
