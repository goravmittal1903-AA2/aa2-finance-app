'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getPortfolio } from '@/lib/calculations'
import { getAll } from '@/lib/supabase'
import type { Customer, PortfolioRow, Transaction } from '@/lib/types'
import { inr, fdate, dpdBucket } from '@/lib/utils'
import {
  TrendingUp, Users, CreditCard, Wallet, AlertTriangle, CheckCircle,
  XCircle, ArrowUpRight, ArrowRight, RefreshCw, Building2, Activity,
  IndianRupee, Percent, Clock, ShieldAlert
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

const DPD_COLORS: Record<string, string> = {
  'Current': 'bg-emerald-500',
  '1–30 DPD': 'bg-yellow-400',
  '31–60 DPD': 'bg-orange-500',
  '61–90 DPD': 'bg-red-500',
  '90+ (NPA)': 'bg-red-800',
  '180+ (Write-off risk)': 'bg-purple-900',
}

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [p, c, t] = await Promise.all([
        getPortfolio(),
        getAll<Customer>('customers'),
        getAll<Transaction>('transactions'),
      ])
      setPortfolio(p)
      setCustomers(c)
      setTransactions(t)
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

  // ─── Computed KPIs ───────────────────────────────────────────────────────────
  const active = portfolio.filter(p => p.status === 'ACTIVE')
  const closed = portfolio.filter(p => (p.status || '').startsWith('CLOS'))
  const totalDisbursed = portfolio.reduce((s, p) => s + (p.loan_amount || 0), 0)
  const totalCollected = portfolio.reduce((s, p) => s + (p.total_collected || 0), 0)
  const outstanding = active.reduce((s, p) => s + (p.outstanding || 0), 0)
  const parLoans = active.filter(p => p.par_flag).length
  const npaLoans = active.filter(p => p.npa_flag)
  const npaAmount = npaLoans.reduce((s, p) => s + (p.outstanding || 0), 0)
  const collectionEfficiency = totalDisbursed > 0 ? Math.round((totalCollected / totalDisbursed) * 100) : 0

  // ─── Monthly trend (last 6 months) ──────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const map: Record<string, { disbursed: number; collected: number }> = {}
    portfolio.forEach(p => {
      const m = (p.disb_date || '').slice(0, 7)
      if (!m) return
      map[m] = map[m] || { disbursed: 0, collected: 0 }
      map[m].disbursed += p.loan_amount || 0
      map[m].collected += p.total_collected || 0
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([month, v]) => ({
      month: month.slice(5) + '/' + month.slice(2, 4),
      disbursed: Math.round(v.disbursed / 1000),
      collected: Math.round(v.collected / 1000),
    }))
  }, [portfolio])

  // ─── DPD bucket breakdown ────────────────────────────────────────────────────
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

  // ─── Branch summary ──────────────────────────────────────────────────────────
  const byBranch = useMemo(() => {
    const map: Record<string, { loan: number; outstanding: number; collected: number; count: number; npa: number }> = {}
    portfolio.forEach(p => {
      const b = p.branch || 'Head Office'
      map[b] = map[b] || { loan: 0, outstanding: 0, collected: 0, count: 0, npa: 0 }
      map[b].loan += p.loan_amount || 0
      map[b].outstanding += p.outstanding || 0
      map[b].collected += p.total_collected || 0
      map[b].count++
      if (p.npa_flag) map[b].npa++
    })
    return Object.entries(map).sort((a, b) => b[1].loan - a[1].loan)
  }, [portfolio])

  // ─── Recent payments (last 10) ──────────────────────────────────────────────
  const recentPayments = useMemo(() =>
    transactions
      .filter(t => t.txn_type === 'PAYMENT' && !t.voided)
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date) || (b.txn_id || 0) - (a.txn_id || 0))
      .slice(0, 8),
    [transactions]
  )

  // ─── At-risk loans (DPD > 30) ────────────────────────────────────────────────
  const atRisk = active
    .filter(p => (p.dpd || 0) >= 30)
    .sort((a, b) => (b.dpd || 0) - (a.dpd || 0))
    .slice(0, 6)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="w-16 h-16 rounded-full border-4 border-blue-100" />
            <div className="w-16 h-16 rounded-full border-4 border-t-blue-600 border-r-blue-600 border-b-transparent border-l-transparent absolute inset-0 animate-spin" />
          </div>
          <p className="text-slate-500 font-medium">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Portfolio Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Last updated: {lastUpdated} &nbsp;·&nbsp; {active.length} active loans across {byBranch.length} branches
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 rounded-xl text-xs font-semibold transition shadow-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* ── Primary KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Gross Loan Portfolio',
            value: inr(totalDisbursed),
            sub: `${portfolio.length} total loans · ${closed.length} closed`,
            icon: CreditCard,
            gradient: 'from-blue-600 to-blue-700',
            iconBg: 'bg-blue-500/30',
          },
          {
            label: 'Outstanding Principal',
            value: inr(outstanding),
            sub: `Across ${active.length} active accounts`,
            icon: Wallet,
            gradient: 'from-violet-600 to-violet-700',
            iconBg: 'bg-violet-500/30',
          },
          {
            label: 'Total Collected',
            value: inr(totalCollected),
            sub: `${collectionEfficiency}% collection efficiency`,
            icon: TrendingUp,
            gradient: 'from-emerald-600 to-emerald-700',
            iconBg: 'bg-emerald-500/30',
          },
          {
            label: 'Total Members',
            value: customers.length.toString(),
            sub: `${active.length} with active loans`,
            icon: Users,
            gradient: 'from-amber-500 to-orange-600',
            iconBg: 'bg-amber-400/30',
          },
        ].map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-5 text-white shadow-lg`}>
              <div className={`absolute right-4 top-4 w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">{card.label}</p>
              <p className="text-2xl font-black mt-2 leading-tight">{card.value}</p>
              <p className="text-xs text-white/60 mt-1">{card.sub}</p>
            </div>
          )
        })}
      </div>

      {/* ── Risk KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">PAR 30+ (Accounts)</p>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-black text-amber-600 mt-2">{parLoans}</p>
          <p className="text-xs text-slate-400 mt-1">Loans overdue 30+ days</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">NPA Accounts</p>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-3xl font-black text-red-600 mt-2">{npaLoans.length}</p>
          <p className="text-xs text-slate-400 mt-1">{inr(npaAmount)} at risk</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">NPA % (Amount)</p>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-3xl font-black text-red-600 mt-2">
            {outstanding > 0 ? ((npaAmount / outstanding) * 100).toFixed(2) : '0.00'}%
          </p>
          <p className="text-xs text-slate-400 mt-1">Gross NPA ratio</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Collection Eff.</p>
            <Percent className="w-4 h-4 text-emerald-500" />
          </div>
          <p className={`text-3xl font-black mt-2 ${collectionEfficiency >= 90 ? 'text-emerald-600' : collectionEfficiency >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
            {collectionEfficiency}%
          </p>
          <p className="text-xs text-slate-400 mt-1">Collected vs disbursed</p>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Monthly trend chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-slate-700">Monthly Disbursement vs Collection</h3>
              <p className="text-xs text-slate-400 mt-0.5">Last 6 months (₹ in thousands)</p>
            </div>
            <Activity className="w-4 h-4 text-slate-300" />
          </div>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTrend} barSize={18} barGap={4}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}K`} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [`₹${Number(value)}K`, name === 'disbursed' ? 'Disbursed' : 'Collected']}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', fontSize: 12 }}
                />
                <Bar dataKey="disbursed" fill="#3b82f6" radius={[6, 6, 0, 0]} name="disbursed" />
                <Bar dataKey="collected" fill="#10b981" radius={[6, 6, 0, 0]} name="collected" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm">No disbursement data yet</div>
          )}
          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Disbursed</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Collected</span>
          </div>
        </div>

        {/* DPD Breakdown */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 mb-1">Portfolio Aging (DPD)</h3>
          <p className="text-xs text-slate-400 mb-5">{active.length} active accounts</p>
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
                      <span className="text-slate-600 font-medium">{bucket}</span>
                      <span className="text-slate-500">{count} · {inr(amount)}</span>
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
      </div>

      {/* ── Branch Summary + Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Branch Summary Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-slate-700">Branch-wise Summary</h3>
            </div>
            <Link href="/reports" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1">
              Full MIS <ArrowRight className="w-3 h-3" />
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
                  <th className="text-right px-5 py-3 font-semibold">NPA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byBranch.map(([branch, v], i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3 font-semibold text-slate-700">{branch}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{v.count}</td>
                    <td className="px-5 py-3 text-right text-slate-600 font-mono">{inr(v.loan)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-amber-600 font-mono">{inr(v.outstanding)}</td>
                    <td className="px-5 py-3 text-right">
                      {v.npa > 0
                        ? <span className="text-red-600 font-bold">{v.npa}</span>
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

        {/* Recent Payments */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-700">Recent Collections</h3>
            </div>
            <Link href="/collections" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1">
              Collect <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentPayments.length === 0 && (
              <p className="text-slate-300 text-sm text-center py-8">No payments yet</p>
            )}
            {recentPayments.map((txn, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">{txn.loan_account_no}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{fdate(txn.txn_date)} · {txn.mode || 'Cash'}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-sm font-black text-emerald-600">{inr(txn.amount)}</p>
                  <p className="text-[10px] text-slate-400">{txn.reference_no || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── At-Risk Loans ── */}
      {atRisk.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 flex items-center justify-between bg-red-50/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-bold text-red-700">At-Risk Accounts (30+ DPD)</h3>
            </div>
            <Link href="/reports" className="text-xs text-red-600 hover:underline font-semibold flex items-center gap-1">
              Full DPD Report <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 uppercase tracking-wide text-[10px]">
                  <th className="text-left px-5 py-3 font-semibold">Loan Account</th>
                  <th className="text-left px-5 py-3 font-semibold">Member</th>
                  <th className="text-left px-5 py-3 font-semibold">Branch / FO</th>
                  <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                  <th className="text-center px-5 py-3 font-semibold">DPD</th>
                  <th className="text-center px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {atRisk.map((p, i) => (
                  <tr key={i} className="hover:bg-red-50/30 transition">
                    <td className="px-5 py-3 font-mono text-[10px] text-blue-600 font-bold">{p.loan_account_no}</td>
                    <td className="px-5 py-3 font-semibold text-slate-700">{p.member_name}</td>
                    <td className="px-5 py-3 text-slate-500">{p.branch || '—'} / {p.fo || '—'}</td>
                    <td className="px-5 py-3 text-right font-bold text-amber-700 font-mono">{inr(p.outstanding)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`font-black text-sm ${(p.dpd || 0) >= 90 ? 'text-red-700' : (p.dpd || 0) >= 60 ? 'text-red-500' : 'text-amber-600'}`}>
                        {p.dpd}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${(p.dpd || 0) >= 90 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {(p.dpd || 0) >= 90 ? 'NPA' : 'PAR'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/loans/${p.loan_account_no}`}
                        className="text-[10px] text-blue-600 hover:underline font-bold flex items-center gap-1 justify-end">
                        View <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
