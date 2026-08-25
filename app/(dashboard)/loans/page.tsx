'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getPortfolio } from '@/lib/calculations'
import { getAll, putOne } from '@/lib/supabase'
import type { PortfolioRow, Loan } from '@/lib/types'
import { inr, fdate, statusColor, exportToExcel } from '@/lib/utils'
import {
  Search, PlusCircle, Download, CheckSquare, Square,
  Building2, Users, AlertTriangle, ShieldAlert, ArrowRight,
  TrendingUp, CreditCard, Wallet, Percent, DollarSign, X
} from 'lucide-react'
import { TableSkeleton } from '@/components/Skeleton'
import { toast } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'

type LoanStatusFilter = 'ALL' | 'ACTIVE' | 'CLOSED' | 'OVERDUE' | 'NPA' | 'RESTRUCTURED'

export default function LoansPage() {
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LoanStatusFilter>('ALL')
  const [selectedBranch, setSelectedBranch] = useState('ALL')
  const [selectedFO, setSelectedFO] = useState('ALL')
  const [selectedProduct, setSelectedProduct] = useState('ALL')
  const [loading, setLoading] = useState(true)

  // Batch Multi-Select
  const [selectedLoanNos, setSelectedLoanNos] = useState<Set<string>>(new Set())
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [reassignFO, setReassignFO] = useState('')
  const [reassignBranch, setReassignBranch] = useState('')
  const [reassigning, setReassigning] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [p, l] = await Promise.all([
        getPortfolio(),
        getAll<Loan>('loans'),
      ])
      setPortfolio(p)
      setLoans(l)
    } catch (err) {
      console.error('Loans load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const handler = () => loadData()
    window.addEventListener('aa2_data_changed', handler)
    return () => window.removeEventListener('aa2_data_changed', handler)
  }, [])

  // Filter Dropdown Options
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

  const productOptions = useMemo(() => {
    const set = new Set<string>()
    loans.forEach(l => { if (l.product_type) set.add(l.product_type) })
    return Array.from(set).sort()
  }, [loans])

  // Map product type to portfolio rows
  const loanProductMap = useMemo(() => {
    const map = new Map<string, string>()
    loans.forEach(l => { map.set(l.loan_account_no, l.product_type || 'Individual Loan (IL)') })
    return map
  }, [loans])

  // Filtered Portfolio Data
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return portfolio.filter(p => {
      // Omni-search
      if (q) {
        const matchSearch =
          p.loan_account_no?.toLowerCase().includes(q) ||
          p.member_name?.toLowerCase().includes(q) ||
          p.customer_id?.toLowerCase().includes(q) ||
          p.branch?.toLowerCase().includes(q) ||
          p.fo?.toLowerCase().includes(q) ||
          (p.mobile || '').includes(q)
        if (!matchSearch) return false
      }

      // Branch Filter
      if (selectedBranch !== 'ALL' && (p.branch || 'Head Office') !== selectedBranch) return false

      // FO Filter
      if (selectedFO !== 'ALL' && (p.fo || '') !== selectedFO) return false

      // Product Filter
      const prod = loanProductMap.get(p.loan_account_no) || ''
      if (selectedProduct !== 'ALL' && prod !== selectedProduct) return false

      // Status Filter
      if (statusFilter === 'ACTIVE' && p.status !== 'ACTIVE') return false
      if (statusFilter === 'CLOSED' && !(p.status || '').startsWith('CLOS')) return false
      if (statusFilter === 'OVERDUE' && (p.status !== 'ACTIVE' || (p.dpd || 0) <= 0)) return false
      if (statusFilter === 'NPA' && (p.status !== 'ACTIVE' || !p.npa_flag)) return false
      if (statusFilter === 'RESTRUCTURED' && p.status !== 'RESTRUCTURED') return false

      return true
    })
  }, [portfolio, search, selectedBranch, selectedFO, selectedProduct, statusFilter, loanProductMap])

  // Top Metric Ribbon for Filtered Portfolio
  const metrics = useMemo(() => {
    const totalDisbursed = filtered.reduce((s, p) => s + (p.loan_amount || 0), 0)
    const active = filtered.filter(p => p.status === 'ACTIVE')
    const totalOutstanding = active.reduce((s, p) => s + (p.outstanding || 0), 0)
    const totalCollected = filtered.reduce((s, p) => s + (p.total_collected || 0), 0)
    const par30 = active.filter(p => (p.dpd || 0) >= 30).length
    const npaAmount = active.filter(p => p.npa_flag).reduce((s, p) => s + (p.outstanding || 0), 0)
    const grossNpa = totalOutstanding > 0 ? ((npaAmount / totalOutstanding) * 100).toFixed(2) : '0.00'

    return {
      totalDisbursed,
      totalOutstanding,
      totalCollected,
      par30,
      grossNpa,
      activeCount: active.length,
    }
  }, [filtered])

  // Multi-select actions
  const handleToggleSelectAll = () => {
    if (selectedLoanNos.size === filtered.length && filtered.length > 0) {
      setSelectedLoanNos(new Set())
    } else {
      setSelectedLoanNos(new Set(filtered.map(p => p.loan_account_no)))
    }
  }

  const handleToggleSelectOne = (loanNo: string) => {
    setSelectedLoanNos(prev => {
      const next = new Set(prev)
      if (next.has(loanNo)) next.delete(loanNo)
      else next.add(loanNo)
      return next
    })
  }

  const handleExportSelected = () => {
    const toExport = portfolio.filter(p => selectedLoanNos.has(p.loan_account_no))
    if (toExport.length === 0) return
    exportToExcel(
      toExport.map(p => ({
        'Loan Account No': p.loan_account_no,
        'Customer ID': p.customer_id,
        'Member Name': p.member_name,
        'Branch': p.branch || '',
        'Field Officer': p.fo || '',
        'Product': loanProductMap.get(p.loan_account_no) || '',
        'Sanction Amount (₹)': p.loan_amount,
        'Total Collected (₹)': p.total_collected,
        'Outstanding Balance (₹)': p.outstanding,
        'DPD': p.dpd,
        'DPD Bucket': p.dpd_bucket,
        'Status': p.status,
      })),
      `Selected_Loans_${toExport.length}`
    )
  }

  const handleBulkReassign = async () => {
    if (!reassignFO && !reassignBranch) {
      toast.error('Missing Input', 'Please specify a new Field Officer or Branch.')
      return
    }
    const ok = await confirmAction({
      title: 'Confirm Bulk Loan Reassignment',
      message: `Reassign ${selectedLoanNos.size} selected loan account(s) to FO: "${reassignFO || 'Unchanged'}" / Branch: "${reassignBranch || 'Unchanged'}"?`,
      confirmText: 'Yes, Reassign Loans',
      variant: 'info'
    })
    if (!ok) return

    setReassigning(true)
    try {
      const allLoans = await getAll<Loan>('loans')
      const targetLoans = allLoans.filter(l => selectedLoanNos.has(l.loan_account_no))

      for (const l of targetLoans) {
        const updated: Loan = {
          ...l,
          fo_name: reassignFO || l.fo_name,
          branch_code: reassignBranch || l.branch_code,
          updated_at: new Date().toISOString(),
        }
        await putOne('loans', updated, 'loan_account_no')
      }

      toast.success('Loans Reassigned', `Successfully updated ${targetLoans.length} loan accounts.`)
      setSelectedLoanNos(new Set())
      setShowReassignModal(false)
      loadData()
      window.dispatchEvent(new Event('aa2_data_changed'))
    } catch (err: any) {
      toast.error('Reassignment Failed', err.message || 'Could not update loans.')
    } finally {
      setReassigning(false)
    }
  }

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Loans Portfolio</h1>
          <p className="text-slate-500 text-xs mt-0.5">{portfolio.length} total loan facilities across {branchOptions.length} branches</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToExcel(
              portfolio.map(p => ({
                'Loan Account No': p.loan_account_no,
                'Customer ID': p.customer_id,
                'Member Name': p.member_name,
                'Branch': p.branch || '',
                'Field Officer': p.fo || '',
                'Product': loanProductMap.get(p.loan_account_no) || '',
                'Sanction Amount (₹)': p.loan_amount,
                'Total Collected (₹)': p.total_collected,
                'Outstanding Balance (₹)': p.outstanding,
                'DPD': p.dpd,
                'DPD Bucket': p.dpd_bucket,
                'Status': p.status,
              })),
              'Loans_Master_Portfolio'
            )}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" /> Export Excel
          </button>
          <Link
            href="/loans/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" /> + Sanction New Loan
          </Link>
        </div>
      </div>

      {/* Top Metric Summary Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Disbursed GLP</span>
          <span className="text-lg font-bold font-mono text-slate-800 mt-1 block">{inr(metrics.totalDisbursed)}</span>
          <span className="text-[10.5px] text-slate-400 mt-0.5 block">{filtered.length} total loans</span>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Outstanding</span>
          <span className="text-lg font-bold font-mono text-violet-700 mt-1 block">{inr(metrics.totalOutstanding)}</span>
          <span className="text-[10.5px] text-slate-400 mt-0.5 block">{metrics.activeCount} active facilities</span>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Collected</span>
          <span className="text-lg font-bold font-mono text-emerald-600 mt-1 block">{inr(metrics.totalCollected)}</span>
          <span className="text-[10.5px] text-slate-400 mt-0.5 block">Principal + Interest</span>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PAR 30+ Loans</span>
          <span className="text-lg font-bold font-mono text-amber-600 mt-1 block">{metrics.par30}</span>
          <span className="text-[10.5px] text-slate-400 mt-0.5 block">Overdue &gt; 30 Days</span>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs col-span-2 lg:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gross NPA Ratio</span>
          <span className="text-lg font-bold font-mono text-red-600 mt-1 block">{metrics.grossNpa}%</span>
          <span className="text-[10.5px] text-slate-400 mt-0.5 block">90+ DPD default risk</span>
        </div>
      </div>

      {/* Multi-Criteria Filters & Omni-Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
            {([
              { id: 'ALL', label: 'All Loans' },
              { id: 'ACTIVE', label: 'Active' },
              { id: 'CLOSED', label: 'Closed' },
              { id: 'OVERDUE', label: 'Overdue (DPD > 0)' },
              { id: 'NPA', label: 'NPA (90+ DPD)' },
              { id: 'RESTRUCTURED', label: 'Restructured' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
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

          {/* Field Officer Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-400">Officer:</span>
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

          {/* Product Scheme Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-400">Product:</span>
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Products ({productOptions.length})</option>
              {productOptions.map(prod => (
                <option key={prod} value={prod}>{prod}</option>
              ))}
            </select>
          </div>

          {(selectedBranch !== 'ALL' || selectedFO !== 'ALL' || selectedProduct !== 'ALL' || statusFilter !== 'ALL' || search) && (
            <button
              onClick={() => {
                setSelectedBranch('ALL')
                setSelectedFO('ALL')
                setSelectedProduct('ALL')
                setStatusFilter('ALL')
                setSearch('')
              }}
              className="text-blue-600 hover:underline font-bold text-[11px] ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Omni-Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Loan A/C (LN-XXXXX), Member Name, Member ID, Mobile number, or Branch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
      </div>

      {/* Sticky Batch Action Bar */}
      {selectedLoanNos.size > 0 && (
        <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs tab-transition">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-400" />
            <span className="font-bold">{selectedLoanNos.size} Loan Account(s) Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSelected}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition"
            >
              Export Selected
            </button>
            <button
              onClick={() => setShowReassignModal(true)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition"
            >
              Bulk Reassign FO/Branch
            </button>
            <button
              onClick={() => setSelectedLoanNos(new Set())}
              className="px-2 py-1 text-slate-400 hover:text-white transition"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Loans Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase tracking-wide text-[10px]">
                <th className="px-4 py-3 text-center w-10">
                  <button onClick={handleToggleSelectAll} className="p-0.5 text-slate-400 hover:text-slate-600">
                    {selectedLoanNos.size > 0 && selectedLoanNos.size === filtered.length
                      ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                      : <Square className="w-3.5 h-3.5" />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold">Account No.</th>
                <th className="text-left px-4 py-3 font-semibold">Borrower Name</th>
                <th className="text-left px-4 py-3 font-semibold">Product Scheme</th>
                <th className="text-right px-4 py-3 font-semibold">Sanction Amount</th>
                <th className="text-right px-4 py-3 font-semibold">Outstanding</th>
                <th className="text-center px-4 py-3 font-semibold">DPD / Risk</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && (
                <tr>
                  <td colSpan={9} className="p-4">
                    <TableSkeleton rows={6} cols={7} />
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-400">
                    No loan records match the selected filters.
                  </td>
                </tr>
              )}
              {filtered.map(p => {
                const isSelected = selectedLoanNos.has(p.loan_account_no)
                const product = loanProductMap.get(p.loan_account_no) || 'Individual Loan (IL)'

                return (
                  <tr key={p.loan_account_no} className={`hover:bg-slate-50/60 transition ${isSelected ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleToggleSelectOne(p.loan_account_no)} className="p-0.5 text-slate-400 hover:text-slate-600">
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-600 font-bold">
                      <Link href={`/loans/${p.loan_account_no}`} className="hover:underline">
                        {p.loan_account_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/members/${p.customer_id}`} className="font-bold text-slate-800 hover:underline block">
                        {p.member_name}
                      </Link>
                      <span className="text-[10px] text-slate-400 font-mono">{p.customer_id} · {p.branch || 'Head Office'}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-600">
                      {product}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                      {inr(p.loan_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">
                      {inr(p.outstanding)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(p.dpd || 0) > 0 ? (
                        <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          (p.dpd || 0) >= 90 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {p.dpd} DPD
                        </span>
                      ) : (
                        <span className="text-emerald-500 font-medium text-[11px]">Current</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/loans/${p.loan_account_no}`}
                        className="text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        Ledger <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Reassign Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 tab-transition">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">Bulk Reassign ({selectedLoanNos.size} Loans)</h3>
              <button onClick={() => setShowReassignModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">New Field Officer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={reassignFO}
                  onChange={e => setReassignFO(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">New Branch Name</label>
                <input
                  type="text"
                  placeholder="e.g. Haridwar"
                  value={reassignBranch}
                  onChange={e => setReassignBranch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowReassignModal(false)} className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold">Cancel</button>
              <button onClick={handleBulkReassign} disabled={reassigning} className="px-4 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {reassigning ? 'Updating...' : 'Save Reassignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
