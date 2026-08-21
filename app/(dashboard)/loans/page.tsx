'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPortfolio } from '@/lib/calculations'
import type { PortfolioRow } from '@/lib/types'
import { inr, fdate, statusColor, exportToExcel } from '@/lib/utils'
import { Search, PlusCircle, TrendingDown, Download } from 'lucide-react'
import { TableSkeleton } from '@/components/Skeleton'
import { cn } from '@/lib/utils'

export default function LoansPage() {
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const p = await getPortfolio()
        setPortfolio(p)
      } catch (err) {
        console.error('Loans load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
    const handler = () => {
      setLoading(true)
      getPortfolio().then(setPortfolio).catch(console.error).finally(() => setLoading(false))
    }
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [])

  const filtered = portfolio.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      p.loan_account_no?.toLowerCase().includes(q) ||
      p.member_name?.toLowerCase().includes(q) ||
      p.customer_id?.toLowerCase().includes(q) ||
      p.branch?.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter ||
      (statusFilter === 'CLOSED' && (p.status || '').startsWith('CLOS'))
    return matchSearch && matchStatus
  })

  const statusCounts = {
    ALL: portfolio.length,
    ACTIVE: portfolio.filter(p => p.status === 'ACTIVE').length,
    CLOSED: portfolio.filter(p => (p.status || '').startsWith('CLOS')).length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Loans</h1>
          <p className="text-slate-500 text-sm mt-0.5">{portfolio.length} total loan accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToExcel(
              portfolio.map(p => ({
                'Loan Account No': p.loan_account_no,
                'Customer ID': p.customer_id,
                'Member Name': p.member_name,
                'Branch Name': p.branch || '',
                'Field Officer': p.fo || '',
                'Loan Amount (₹)': p.loan_amount,
                'Total Collected (₹)': p.total_collected,
                'Outstanding Balance (₹)': p.outstanding,
                'DPD Days': p.dpd,
                'DPD Bucket': p.dpd_bucket,
                'Status': p.status,
              })),
              'Loans_Portfolio_Export'
            )}
            className="flex items-center gap-2 px-3.5 py-2.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold rounded-xl transition"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
          <Link href="/loans/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 hover:-translate-y-0.5">
            <PlusCircle className="w-4 h-4" />
            New Loan
          </Link>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by loan A/C, member name, branch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
          />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {(['ALL', 'ACTIVE', 'CLOSED'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                statusFilter === s ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              {s} <span className="opacity-60">({statusCounts[s]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Loan A/C</th>
                <th className="text-left px-5 py-3 font-semibold">Member</th>
                <th className="text-left px-5 py-3 font-semibold">Branch Name / FO</th>
                <th className="text-right px-5 py-3 font-semibold">Loan Amt</th>
                <th className="text-right px-5 py-3 font-semibold">Collected</th>
                <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                <th className="text-center px-5 py-3 font-semibold">DPD</th>
                <th className="text-center px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && (
                <tr>
                  <td colSpan={9} className="p-4">
                    <TableSkeleton rows={5} cols={8} />
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">No loans found</td></tr>
              )}
              {filtered.map(p => (
                <tr key={p.loan_account_no} className="tbl-row">
                  <td className="px-5 py-3 font-mono text-xs text-blue-600 font-semibold">
                    <Link href={`/loans/${p.loan_account_no}`} className="hover:underline">
                      {p.loan_account_no}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-800">
                      <Link href={`/members/${p.customer_id}`} className="text-blue-600 hover:underline">
                        {p.member_name}
                      </Link>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      <Link href={`/members/${p.customer_id}`} className="hover:underline">
                        {p.customer_id}
                      </Link>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{p.branch || '—'} / {p.fo || '—'}</td>
                  <td className="px-5 py-3 text-right font-medium text-slate-700">{inr(p.loan_amount)}</td>
                  <td className="px-5 py-3 text-right text-emerald-600 font-medium">{inr(p.total_collected)}</td>
                  <td className="px-5 py-3 text-right font-semibold">
                    <span className={p.outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                      {inr(p.outstanding)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={cn('font-bold text-xs', p.dpd > 90 ? 'text-red-600' : p.dpd > 30 ? 'text-orange-500' : p.dpd > 0 ? 'text-amber-500' : 'text-emerald-600')}>
                      {p.dpd || 0}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={cn('badge text-xs', statusColor(p.status))}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/loans/${p.loan_account_no}`}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/50">
            <p className="text-xs text-slate-400">Showing {filtered.length} of {portfolio.length} loans</p>
          </div>
        )}
      </div>
    </div>
  )
}
