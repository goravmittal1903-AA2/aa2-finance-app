'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getPortfolio } from '@/lib/calculations'
import { getAll } from '@/lib/supabase'
import type { Customer, PortfolioRow, Transaction, ScheduleRow, Loan } from '@/lib/types'
import { inr, fdate, todayISO, dpdBucket } from '@/lib/utils'
import {
  TrendingUp, Users, CreditCard, Wallet, AlertTriangle,
  ArrowUpRight, ArrowRight, RefreshCw, Building2, Activity,
  IndianRupee, Percent, ShieldAlert, PieChart as PieIcon,
  Filter, Calendar, ChevronRight, UserCheck, AlertCircle, ArrowUp, ArrowDown
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts'

const DPD_COLORS: Record<string, string> = {
  'Current': 'bg-emerald-500',
  '1–30 DPD': 'bg-amber-400',
  '31–60 DPD': 'bg-orange-500',
  '61–90 DPD': 'bg-red-500',
  '90+ (NPA)': 'bg-red-800',
  '180+ (Write-off risk)': 'bg-purple-900',
}

const PRODUCT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#64748b']

type DatePreset = 'ALL' | 'TODAY' | 'THIS_WEEK' | 'MTD' | 'QTD' | 'FY2627'
type ChartView = 'MONTHLY_BAR' | 'CUMULATIVE_AREA'

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')

  // Filter States
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL')
  const [selectedBranch, setSelectedBranch] = useState('ALL')
  const [selectedFO, setSelectedFO] = useState('ALL')
  const [chartView, setChartView] = useState<ChartView>('MONTHLY_BAR')

  async function load() {
    setLoading(true)
    try {
      const [p, c, t, s, l] = await Promise.all([
        getPortfolio(),
        getAll<Customer>('customers'),
        getAll<Transaction>('transactions'),
        getAll<ScheduleRow>('schedule'),
        getAll<Loan>('loans'),
      ])
      setPortfolio(p)
      setCustomers(c)
      setTransactions(t)
      setSchedule(s)
      setLoans(l)
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    } catch (err) {
      console.error('Dashboard load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [])

  // Extract Filter Options
  const branchOptions = useMemo(() => {
    const set = new Set<string>()
    portfolio.forEach(p => { if (p.branch) set.add(p.branch) })
    loans.forEach(l => { if (l.branch_code) set.add(l.branch_code) })
    return Array.from(set).sort()
  }, [portfolio, loans])

  const foOptions = useMemo(() => {
    const set = new Set<string>()
    portfolio.forEach(p => { if (p.fo) set.add(p.fo) })
    loans.forEach(l => { if (l.fo_name) set.add(l.fo_name) })
    return Array.from(set).sort()
  }, [portfolio, loans])

  // Apply Date & Branch / FO Filters
  const filteredPortfolio = useMemo(() => {
    const today = todayISO()
    const currentYear = today.slice(0, 4)
    const currentMonth = today.slice(0, 7)

    return portfolio.filter(p => {
      // Branch filter
      if (selectedBranch !== 'ALL' && (p.branch || 'Head Office') !== selectedBranch) return false
      // FO filter
      if (selectedFO !== 'ALL' && (p.fo || '') !== selectedFO) return false

      // Date preset filter based on disbursal
      const d = p.disb_date || ''
      if (datePreset === 'TODAY' && d !== today) return false
      if (datePreset === 'MTD' && !d.startsWith(currentMonth)) return false
      if (datePreset === 'FY2627' && !(d >= '2026-04-01' && d <= '2027-03-31')) return false
      if (datePreset === 'THIS_WEEK') {
        const now = new Date()
        const firstDay = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().slice(0, 10)
        if (d < firstDay) return false
      }
      if (datePreset === 'QTD') {
        const m = parseInt(today.slice(5, 7), 10)
        const qStartMonth = (Math.floor((m - 1) / 3) * 3 + 1).toString().padStart(2, '0')
        const qStart = `${currentYear}-${qStartMonth}-01`
        if (d < qStart) return false
      }

      return true
    })
  }, [portfolio, selectedBranch, selectedFO, datePreset])

  const filteredTransactions = useMemo(() => {
    const today = todayISO()
    const currentMonth = today.slice(0, 7)

    return transactions.filter(t => {
      if (t.voided) return false
      const matchedLoan = portfolio.find(p => p.loan_account_no === t.loan_account_no)
      if (selectedBranch !== 'ALL' && matchedLoan && (matchedLoan.branch || 'Head Office') !== selectedBranch) return false
      if (selectedFO !== 'ALL' && matchedLoan && (matchedLoan.fo || '') !== selectedFO) return false

      const d = t.txn_date || ''
      if (datePreset === 'TODAY' && d !== today) return false
      if (datePreset === 'MTD' && !d.startsWith(currentMonth)) return false
      if (datePreset === 'FY2627' && !(d >= '2026-04-01' && d <= '2027-03-31')) return false

      return true
    })
  }, [transactions, portfolio, selectedBranch, selectedFO, datePreset])

  // Primary Computed Metrics
  const active = filteredPortfolio.filter(p => p.status === 'ACTIVE')
  const closed = filteredPortfolio.filter(p => (p.status || '').startsWith('CLOS'))
  const totalDisbursed = filteredPortfolio.reduce((s, p) => s + (p.loan_amount || 0), 0)
  const totalCollected = filteredPortfolio.reduce((s, p) => s + (p.total_collected || 0), 0)
  const outstanding = active.reduce((s, p) => s + (p.outstanding || 0), 0)
  const parLoans = active.filter(p => p.par_flag).length
  const npaLoans = active.filter(p => p.npa_flag)
  const npaAmount = npaLoans.reduce((s, p) => s + (p.outstanding || 0), 0)
  const collectionEfficiency = totalDisbursed > 0 ? Math.round((totalCollected / totalDisbursed) * 100) : 0
  const grossNpaRatio = outstanding > 0 ? ((npaAmount / outstanding) * 100).toFixed(2) : '0.00'

  // Today Live Demand & Collection Pulse
  const todayMetrics = useMemo(() => {
    const today = todayISO()
    const activeLoanNos = new Set(portfolio.filter(p => p.status === 'ACTIVE').map(p => p.loan_account_no))

    // Today Due Installments
    const todayDues = schedule.filter(s => s.due_date === today && activeLoanNos.has(s.loan_account_no))
    const todayDemandAmount = todayDues.reduce((sum, s) => sum + (s.emi_due || 0), 0)
    const todayDemandCount = todayDues.length

    // Today Payments Collected
    const todayPayments = transactions.filter(t => t.txn_date === today && t.txn_type === 'PAYMENT' && !t.voided)
    const todayCollectedAmount = todayPayments.reduce((sum, t) => sum + (t.amount || 0), 0)
    const todayCollectedCount = todayPayments.length

    // Overdue Arrears Collected Today
    const todayArrearsCollected = todayPayments.filter(t => {
      const p = portfolio.find(item => item.loan_account_no === t.loan_account_no)
      return p && (p.dpd || 0) > 0
    }).reduce((sum, t) => sum + (t.amount || 0), 0)

    const todayEfficiency = todayDemandAmount > 0
      ? Math.min(100, Math.round((todayCollectedAmount / todayDemandAmount) * 100))
      : (todayCollectedAmount > 0 ? 100 : 0)

    const todayRemainingGap = Math.max(0, todayDemandAmount - todayCollectedAmount)

    return {
      demandAmount: todayDemandAmount,
      demandCount: todayDemandCount,
      collectedAmount: todayCollectedAmount,
      collectedCount: todayCollectedCount,
      arrearsCollected: todayArrearsCollected,
      efficiency: todayEfficiency,
      remainingGap: todayRemainingGap,
    }
  }, [schedule, transactions, portfolio])

  // Month-over-Month (MoM) Growth Calculations
  const momGrowth = useMemo(() => {
    const today = todayISO()
    const currentMonth = today.slice(0, 7)
    const prevDate = new Date()
    prevDate.setMonth(prevDate.getMonth() - 1)
    const prevMonth = prevDate.toISOString().slice(0, 7)

    const currentMonthDisbursed = portfolio.filter(p => (p.disb_date || '').startsWith(currentMonth)).reduce((s, p) => s + (p.loan_amount || 0), 0)
    const prevMonthDisbursed = portfolio.filter(p => (p.disb_date || '').startsWith(prevMonth)).reduce((s, p) => s + (p.loan_amount || 0), 0)
    const disbGrowth = prevMonthDisbursed > 0 ? Math.round(((currentMonthDisbursed - prevMonthDisbursed) / prevMonthDisbursed) * 100) : 0

    const currentMonthCollected = transactions.filter(t => (t.txn_date || '').startsWith(currentMonth) && t.txn_type === 'PAYMENT' && !t.voided).reduce((s, t) => s + (t.amount || 0), 0)
    const prevMonthCollected = transactions.filter(t => (t.txn_date || '').startsWith(prevMonth) && t.txn_type === 'PAYMENT' && !t.voided).reduce((s, t) => s + (t.amount || 0), 0)
    const collGrowth = prevMonthCollected > 0 ? Math.round(((currentMonthCollected - prevMonthCollected) / prevMonthCollected) * 100) : 0

    const currentNewMembers = customers.filter(c => (c.created_at || '').startsWith(currentMonth)).length

    return {
      disbGrowth,
      collGrowth,
      currentNewMembers,
    }
  }, [portfolio, transactions, customers])

  // Early Warning Signals (EWS) & Risk Matrix
  const ewsMatrix = useMemo(() => {
    const fidLoanNos = new Set(
      schedule
        .filter(s => s.installment_no === 1 && (s.status === 'Overdue' || (s.dpd && s.dpd > 0)))
        .map(s => s.loan_account_no)
    )
    const fidLoans = active.filter(p => fidLoanNos.has(p.loan_account_no))

    const sma0 = active.filter(p => (p.dpd || 0) >= 1 && (p.dpd || 0) <= 30)
    const sma1 = active.filter(p => (p.dpd || 0) >= 31 && (p.dpd || 0) <= 60)
    const sma2 = active.filter(p => (p.dpd || 0) >= 61 && (p.dpd || 0) <= 89)

    return {
      fid: fidLoans,
      sma0,
      sma1,
      sma2,
    }
  }, [schedule, active])

  // Product Mix Breakdown (Donut Chart)
  const productMix = useMemo(() => {
    const loanMap = new Map(loans.map(l => [l.loan_account_no, l.product_type]))
    const map: Record<string, { count: number; amount: number }> = {}
    filteredPortfolio.forEach(p => {
      const prod = loanMap.get(p.loan_account_no) || 'Individual Loan (IL)'
      map[prod] = map[prod] || { count: 0, amount: 0 }
      map[prod].count++
      map[prod].amount += p.loan_amount || 0
    })
    return Object.entries(map).map(([name, v]) => ({
      name,
      count: v.count,
      value: Math.round(v.amount / 1000),
      rawAmount: v.amount,
    }))
  }, [filteredPortfolio, loans])

  // Monthly Trends & Cumulative Runway
  const trendData = useMemo(() => {
    const map: Record<string, { disbursed: number; collected: number; count: number }> = {}
    portfolio.forEach(p => {
      const m = (p.disb_date || '').slice(0, 7)
      if (!m) return
      map[m] = map[m] || { disbursed: 0, collected: 0, count: 0 }
      map[m].disbursed += p.loan_amount || 0
      map[m].count++
    })

    transactions.forEach(t => {
      if (t.voided || t.txn_type !== 'PAYMENT') return
      const m = (t.txn_date || '').slice(0, 7)
      if (!m) return
      map[m] = map[m] || { disbursed: 0, collected: 0, count: 0 }
      map[m].collected += t.amount || 0
    })

    let cumulativeGLP = 0
    let cumulativeBorrowers = 0

    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([month, v]) => {
        cumulativeGLP += v.disbursed - v.collected
        cumulativeBorrowers += v.count
        return {
          month: month.slice(5) + '/' + month.slice(2, 4),
          disbursed: Math.round(v.disbursed / 1000),
          collected: Math.round(v.collected / 1000),
          glpRunway: Math.max(0, Math.round(cumulativeGLP / 1000)),
          borrowers: cumulativeBorrowers,
        }
      })
  }, [portfolio, transactions])

  // DPD Bucket Breakdown
  const bucketBreakdown = useMemo(() => {
    const map: Record<string, { count: number; amount: number }> = {}
    active.forEach(p => {
      const b = p.dpd_bucket || dpdBucket(p.dpd || 0)
      map[b] = map[b] || { count: 0, amount: 0 }
      map[b].count++
      map[b].amount += p.outstanding || 0
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [active])

  // Branch Summary
  const byBranch = useMemo(() => {
    const map: Record<string, { loan: number; outstanding: number; collected: number; count: number; npa: number }> = {}
    filteredPortfolio.forEach(p => {
      const b = p.branch || 'Head Office'
      map[b] = map[b] || { loan: 0, outstanding: 0, collected: 0, count: 0, npa: 0 }
      map[b].loan += p.loan_amount || 0
      map[b].outstanding += p.outstanding || 0
      map[b].collected += p.total_collected || 0
      map[b].count++
      if (p.npa_flag) map[b].npa++
    })
    return Object.entries(map).sort((a, b) => b[1].loan - a[1].loan)
  }, [filteredPortfolio])

  // Recent Payments
  const recentPayments = useMemo(() =>
    filteredTransactions
      .filter(t => t.txn_type === 'PAYMENT' && !t.voided)
      .sort((a, b) => (b.txn_date || '').localeCompare(a.txn_date || '') || (b.txn_id || 0) - (a.txn_id || 0))
      .slice(0, 8),
    [filteredTransactions]
  )

  // At-Risk Loans (DPD > 30)
  const atRisk = useMemo(() =>
    active
      .filter(p => (p.dpd || 0) >= 30)
      .sort((a, b) => (b.dpd || 0) - (a.dpd || 0))
      .slice(0, 8),
    [active]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="w-14 h-14 rounded-full border-4 border-blue-100" />
            <div className="w-14 h-14 rounded-full border-4 border-t-blue-600 border-r-blue-600 border-b-transparent border-l-transparent absolute inset-0 animate-spin" />
          </div>
          <p className="text-slate-500 font-medium text-xs tracking-wide">Loading portfolio intelligence…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">

      {/* Top Header & Global Filter Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Portfolio Dashboard</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Live intelligence · Last sync: {lastUpdated} · {active.length} active loans across {byBranch.length} operating branches
            </p>
          </div>

          {/* Date Range Preset Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200/70 text-xs">
            {(['ALL', 'TODAY', 'THIS_WEEK', 'MTD', 'QTD', 'FY2627'] as DatePreset[]).map(preset => (
              <button
                key={preset}
                onClick={() => setDatePreset(preset)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  datePreset === preset
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {preset === 'ALL' ? 'All Time'
                  : preset === 'TODAY' ? 'Today'
                  : preset === 'THIS_WEEK' ? 'This Week'
                  : preset === 'MTD' ? 'Month (MTD)'
                  : preset === 'QTD' ? 'Quarter (QTD)'
                  : 'FY 2026-27'}
              </button>
            ))}
          </div>
        </div>

        {/* Branch & Field Officer Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
            <Filter className="w-3.5 h-3.5 text-blue-500" /> Filter View:
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-400">Branch:</span>
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Branches ({branchOptions.length})</option>
              {branchOptions.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-400">Field Officer:</span>
            <select
              value={selectedFO}
              onChange={e => setSelectedFO(e.target.value)}
              className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Officers ({foOptions.length})</option>
              {foOptions.map(fo => (
                <option key={fo} value={fo}>{fo}</option>
              ))}
            </select>
          </div>

          {(selectedBranch !== 'ALL' || selectedFO !== 'ALL' || datePreset !== 'ALL') && (
            <button
              onClick={() => {
                setSelectedBranch('ALL')
                setSelectedFO('ALL')
                setDatePreset('ALL')
              }}
              className="text-blue-600 hover:underline font-bold text-[11px] ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Today Live Demand & Collection Pulse Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white rounded-2xl p-5 shadow-lg border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="font-bold text-sm tracking-wide text-slate-100">Today&apos;s Collection Pulse</h3>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
              LIVE
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Due Target: <strong className="text-slate-200">{inr(todayMetrics.demandAmount)}</strong> across {todayMetrics.demandCount} installments
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/40">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today&apos;s Demand</span>
            <span className="text-xl font-bold font-mono text-white mt-1 block">{inr(todayMetrics.demandAmount)}</span>
            <span className="text-[10.5px] text-slate-400 mt-0.5 block">{todayMetrics.demandCount} installments scheduled</span>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/40">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Collected Today</span>
            <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">{inr(todayMetrics.collectedAmount)}</span>
            <span className="text-[10.5px] text-slate-400 mt-0.5 block">{todayMetrics.collectedCount} receipts posted</span>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/40">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Overdue Arrears Recovered</span>
            <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">{inr(todayMetrics.arrearsCollected)}</span>
            <span className="text-[10.5px] text-slate-400 mt-0.5 block">Delinquent collections</span>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/40">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Day&apos;s Target Gap</span>
            <span className={`text-xl font-bold font-mono mt-1 block ${todayMetrics.remainingGap === 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
              {inr(todayMetrics.remainingGap)}
            </span>
            <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, todayMetrics.efficiency)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Cards with MoM Growth Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Gross Loan Portfolio',
            value: inr(totalDisbursed),
            sub: `${filteredPortfolio.length} total loans · ${closed.length} closed`,
            growth: momGrowth.disbGrowth >= 0 ? `+${momGrowth.disbGrowth}% MoM` : `${momGrowth.disbGrowth}% MoM`,
            isPositive: momGrowth.disbGrowth >= 0,
            icon: CreditCard,
            gradient: 'from-blue-600 to-blue-700',
            iconBg: 'bg-blue-500/30',
          },
          {
            label: 'Outstanding Principal',
            value: inr(outstanding),
            sub: `Active ledger balance across ${active.length} loans`,
            growth: `${active.length} active`,
            isPositive: true,
            icon: Wallet,
            gradient: 'from-violet-600 to-violet-700',
            iconBg: 'bg-violet-500/30',
          },
          {
            label: 'Total Collected',
            value: inr(totalCollected),
            sub: `${collectionEfficiency}% overall collection efficiency`,
            growth: momGrowth.collGrowth >= 0 ? `+${momGrowth.collGrowth}% MoM` : `${momGrowth.collGrowth}% MoM`,
            isPositive: momGrowth.collGrowth >= 0,
            icon: TrendingUp,
            gradient: 'from-emerald-600 to-emerald-700',
            iconBg: 'bg-emerald-500/30',
          },
          {
            label: 'Total Borrowers',
            value: customers.length.toString(),
            sub: `${active.length} with active facilities`,
            growth: `+${momGrowth.currentNewMembers} this month`,
            isPositive: true,
            icon: Users,
            gradient: 'from-amber-600 to-orange-600',
            iconBg: 'bg-amber-400/30',
          },
        ].map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-5 text-white shadow-md`}>
              <div className={`absolute right-4 top-4 w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">{card.label}</p>
              <p className="text-2xl font-black mt-2 leading-tight font-mono">{card.value}</p>
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 rounded-md bg-white/20 font-bold text-[10px] flex items-center gap-1">
                  {card.isPositive ? <ArrowUp className="w-3 h-3 text-emerald-300" /> : <ArrowDown className="w-3 h-3 text-red-300" />}
                  {card.growth}
                </span>
                <span className="text-white/60 text-[11px] truncate">{card.sub}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Risk & Asset Quality Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">PAR 30+ Loans</p>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-black text-amber-600 mt-2 font-mono">{parLoans}</p>
          <p className="text-xs text-slate-400 mt-1">Portfolio at risk (30+ DPD)</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">NPA Accounts</p>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-3xl font-black text-red-600 mt-2 font-mono">{npaLoans.length}</p>
          <p className="text-xs text-slate-400 mt-1">{inr(npaAmount)} at default risk</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross NPA Ratio</p>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-3xl font-black text-red-600 mt-2 font-mono">{grossNpaRatio}%</p>
          <p className="text-xs text-slate-400 mt-1">Against active portfolio</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Collection Ratio</p>
            <Percent className="w-4 h-4 text-emerald-500" />
          </div>
          <p className={`text-3xl font-black mt-2 font-mono ${collectionEfficiency >= 90 ? 'text-emerald-600' : collectionEfficiency >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
            {collectionEfficiency}%
          </p>
          <p className="text-xs text-slate-400 mt-1">Collected vs total sanctioned</p>
        </div>
      </div>

      {/* Early Warning Signals (EWS) Matrix */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-800">Early Warning Signals (EWS) & Risk Migration</h3>
          </div>
          <span className="text-xs text-slate-400">Proactive delinquency detection</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase">First Installment Default (FID)</span>
              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[9px]">CRITICAL</span>
            </div>
            <p className="text-xl font-black text-red-600 font-mono">{ewsMatrix.fid.length}</p>
            <p className="text-[10.5px] text-slate-400">Missed EMI #1 (High fraud risk)</p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase">SMA-0 (1–30 DPD)</span>
              <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 font-bold text-[9px]">WATCH</span>
            </div>
            <p className="text-xl font-black text-slate-800 font-mono">{ewsMatrix.sma0.length}</p>
            <p className="text-[10.5px] text-slate-400">Early stage overdue accounts</p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase">SMA-1 (31–60 DPD)</span>
              <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 font-bold text-[9px]">ELEVATED</span>
            </div>
            <p className="text-xl font-black text-orange-600 font-mono">{ewsMatrix.sma1.length}</p>
            <p className="text-[10.5px] text-slate-400">High priority recovery bucket</p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase">SMA-2 (61–89 DPD)</span>
              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[9px]">PRE-NPA</span>
            </div>
            <p className="text-xl font-black text-red-700 font-mono">{ewsMatrix.sma2.length}</p>
            <p className="text-[10.5px] text-slate-400">At risk of sliding to NPA</p>
          </div>
        </div>
      </div>

      {/* Visual Analytics: Monthly Trend & Product Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Trend Chart (Toggleable Bar / Area) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {chartView === 'MONTHLY_BAR' ? 'Monthly Disbursement vs Collection' : 'Cumulative GLP Runway & Portfolio Growth'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">₹ values in thousands (K)</p>
            </div>

            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setChartView('MONTHLY_BAR')}
                className={`px-2.5 py-1 rounded-md transition ${chartView === 'MONTHLY_BAR' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
              >
                Disbursement Trend
              </button>
              <button
                onClick={() => setChartView('CUMULATIVE_AREA')}
                className={`px-2.5 py-1 rounded-md transition ${chartView === 'CUMULATIVE_AREA' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
              >
                GLP Runway
              </button>
            </div>
          </div>

          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              {chartView === 'MONTHLY_BAR' ? (
                <BarChart data={trendData} barSize={20} barGap={4}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}K`} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => [`₹${Number(value)}K`, name === 'disbursed' ? 'Disbursed' : 'Collected']}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                  />
                  <Bar dataKey="disbursed" fill="#3b82f6" radius={[6, 6, 0, 0]} name="disbursed" />
                  <Bar dataKey="collected" fill="#10b981" radius={[6, 6, 0, 0]} name="collected" />
                </BarChart>
              ) : (
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="glpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}K`} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [`₹${Number(value)}K`, 'Cumulative Net GLP']}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="glpRunway" stroke="#8b5cf6" strokeWidth={2.5} fillOpacity={1} fill="url(#glpGrad)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm">No transaction trend data</div>
          )}

          <div className="flex items-center gap-4 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" /> Disbursed</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Collected</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-purple-500 inline-block" /> Net Carrying GLP</span>
          </div>
        </div>

        {/* Product Mix Donut Chart */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Product Mix & Concentration</h3>
            <PieIcon className="w-4 h-4 text-slate-400" />
          </div>

          {productMix.length > 0 ? (
            <div className="space-y-3">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={productMix}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {productMix.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => [`₹${Number(value)}K`, name]}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-1.5 text-xs">
                {productMix.map((p, idx) => (
                  <div key={p.name} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-600 truncate max-w-[150px]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PRODUCT_COLORS[idx % PRODUCT_COLORS.length] }} />
                      {p.name}
                    </span>
                    <span className="font-mono text-slate-700 font-bold">{inr(p.rawAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm">No product data</div>
          )}
        </div>

      </div>

      {/* Portfolio Aging & Branch Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Portfolio Aging Bar */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Portfolio Aging (DPD Buckets)</h3>
            <p className="text-xs text-slate-400 mt-0.5">{active.length} active borrowing accounts</p>
          </div>

          <div className="space-y-3">
            {bucketBreakdown.length === 0 ? (
              <p className="text-slate-300 text-sm text-center py-8">No active loans</p>
            ) : (
              bucketBreakdown.map(([bucket, { count, amount }]) => {
                const pct = active.length ? Math.round((count / active.length) * 100) : 0
                const barColor = DPD_COLORS[bucket] || 'bg-slate-400'
                return (
                  <div key={bucket} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-semibold">{bucket}</span>
                      <span className="text-slate-500 font-mono">{count} · {inr(amount)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Branch Summary Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-slate-800">Branch Performance Breakdown</h3>
            </div>
            <Link href="/reports" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1">
              Full Reports <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase tracking-wide text-[10px]">
                  <th className="text-left px-5 py-3 font-semibold">Branch</th>
                  <th className="text-right px-5 py-3 font-semibold">Loans</th>
                  <th className="text-right px-5 py-3 font-semibold">Disbursed</th>
                  <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                  <th className="text-right px-5 py-3 font-semibold">NPA Accounts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byBranch.map(([branch, v], i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3 font-bold text-slate-700">{branch}</td>
                    <td className="px-5 py-3 text-right text-slate-500 font-mono">{v.count}</td>
                    <td className="px-5 py-3 text-right text-slate-600 font-mono">{inr(v.loan)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-amber-700 font-mono">{inr(v.outstanding)}</td>
                    <td className="px-5 py-3 text-right font-mono">
                      {v.npa > 0
                        ? <span className="text-red-600 font-bold px-2 py-0.5 bg-red-50 rounded-md">{v.npa}</span>
                        : <span className="text-emerald-500">—</span>}
                    </td>
                  </tr>
                ))}
                {byBranch.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-300">No loan data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Recent Collections & Delinquent Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Collections */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-800">Recent Collections Stream</h3>
            </div>
            <Link href="/collections" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1">
              Collections Hub <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentPayments.length === 0 && (
              <p className="text-slate-300 text-sm text-center py-8">No payments recorded</p>
            )}
            {recentPayments.map((txn, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate font-mono">{txn.loan_account_no}</p>
                  <p className="text-[10.5px] text-slate-400 mt-0.5">{fdate(txn.txn_date)} · {txn.mode || 'Cash'}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-sm font-black text-emerald-600 font-mono">{inr(txn.amount)}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{txn.reference_no || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* At-Risk Delinquency Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-800">High Risk Delinquent Accounts</h3>
            </div>
            <Link href="/reports" className="text-xs text-red-600 hover:underline font-semibold flex items-center gap-1">
              View DPD Aging <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase tracking-wide text-[10px]">
                  <th className="text-left px-5 py-3 font-semibold">Account</th>
                  <th className="text-left px-5 py-3 font-semibold">Member</th>
                  <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                  <th className="text-center px-5 py-3 font-semibold">DPD</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {atRisk.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3 font-mono text-[10.5px] text-blue-600 font-bold">
                      <Link href={`/loans/${p.loan_account_no}`} className="hover:underline">
                        {p.loan_account_no}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-bold text-slate-700 truncate max-w-[120px]">
                      <Link href={`/members/${p.customer_id}`} className="hover:underline text-slate-800">
                        {p.member_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-amber-700 font-mono">{inr(p.outstanding)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`font-black font-mono text-xs px-2 py-0.5 rounded-full ${
                        (p.dpd || 0) >= 90 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {p.dpd} DPD
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/loans/${p.loan_account_no}`}
                        className="text-[10.5px] text-blue-600 hover:underline font-bold inline-flex items-center gap-1"
                      >
                        Inspect <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {atRisk.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-300">No overdue accounts exceeding 30 DPD</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  )
}
